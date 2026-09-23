-- Phase 2: privacy-preserving leadership attendance summaries.
--
-- Summary delivery is isolated from the worker notification outbox. The roster
-- is captured when an automatic session starts, summaries contain counts only,
-- and every recipient's current leadership scope is revalidated before claim.

BEGIN;

-- Remove historical routing metadata that is no longer used, then enforce the
-- Phase 1 invariant at the database boundary as well as in application code.
UPDATE public.email_notification_jobs
SET cc_emails = '{}'::TEXT[]
WHERE notification_type = 'attendance_follow_up'
    AND CARDINALITY(COALESCE(cc_emails, '{}'::TEXT[])) > 0;

ALTER TABLE public.email_notification_jobs
DROP CONSTRAINT IF EXISTS email_notification_jobs_followups_no_cc;

ALTER TABLE public.email_notification_jobs
ADD CONSTRAINT email_notification_jobs_followups_no_cc
CHECK (
    notification_type <> 'attendance_follow_up'
    OR CARDINALITY(cc_emails) = 0
);

CREATE TABLE public.event_email_occurrence_roster (
    occurrence_key TEXT NOT NULL,
    session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    department_name TEXT,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    team_name TEXT,
    captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (occurrence_key, user_id),
    CONSTRAINT event_email_occurrence_roster_session_occurrence_unique
        UNIQUE (session_id, user_id)
);

CREATE INDEX idx_event_email_occurrence_roster_event
ON public.event_email_occurrence_roster (event_id, occurrence_key);

CREATE INDEX idx_event_email_occurrence_roster_department
ON public.event_email_occurrence_roster (occurrence_key, department_id)
WHERE department_id IS NOT NULL;

CREATE INDEX idx_event_email_occurrence_roster_team
ON public.event_email_occurrence_roster (occurrence_key, team_id)
WHERE team_id IS NOT NULL;

ALTER TABLE public.event_email_occurrence_roster ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_email_occurrence_roster FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_email_occurrence_roster TO service_role;

CREATE TABLE public.attendance_summary_email_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
    occurrence_key TEXT NOT NULL,
    recipient_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    recipient_first_name TEXT NOT NULL,
    summary_scope_type TEXT NOT NULL
        CONSTRAINT attendance_summary_email_jobs_scope_type_check
        CHECK (summary_scope_type IN ('department', 'team', 'global')),
    summary_scope_id UUID,
    summary_scope_name TEXT NOT NULL,
    expected_count INTEGER NOT NULL CHECK (expected_count >= 0),
    checked_in_count INTEGER NOT NULL CHECK (checked_in_count >= 0),
    approved_leave_count INTEGER NOT NULL CHECK (approved_leave_count >= 0),
    missed_count INTEGER NOT NULL CHECK (missed_count >= 0),
    event_title TEXT NOT NULL,
    event_start_at TIMESTAMP WITH TIME ZONE NOT NULL,
    event_end_at TIMESTAMP WITH TIME ZONE NOT NULL,
    event_timezone TEXT NOT NULL,
    location_name TEXT,
    due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CONSTRAINT attendance_summary_email_jobs_status_check
        CHECK (status IN ('pending', 'processing', 'retry', 'sent', 'failed', 'cancelled')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
    next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMP WITH TIME ZONE,
    locked_by UUID,
    provider_message_id TEXT,
    last_error TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT attendance_summary_email_jobs_scope_id_check CHECK (
        (summary_scope_type = 'global' AND summary_scope_id IS NULL)
        OR (summary_scope_type IN ('department', 'team') AND summary_scope_id IS NOT NULL)
    ),
    CONSTRAINT attendance_summary_email_jobs_counts_check CHECK (
        checked_in_count + approved_leave_count + missed_count = expected_count
    ),
    CONSTRAINT attendance_summary_email_jobs_one_per_leader
        UNIQUE (occurrence_key, recipient_user_id)
);

CREATE INDEX idx_attendance_summary_email_jobs_claim
ON public.attendance_summary_email_jobs (status, next_attempt_at, due_at)
WHERE status IN ('pending', 'retry');

CREATE INDEX idx_attendance_summary_email_jobs_stale_locks
ON public.attendance_summary_email_jobs (locked_at)
WHERE status = 'processing';

CREATE INDEX idx_attendance_summary_email_jobs_session
ON public.attendance_summary_email_jobs (session_id);

ALTER TABLE public.attendance_summary_email_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.attendance_summary_email_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendance_summary_email_jobs TO service_role;

CREATE INDEX IF NOT EXISTS idx_attendance_logs_session_user
ON public.attendance_logs (session_id, user_id);

CREATE INDEX IF NOT EXISTS idx_leave_requests_approved_user_dates
ON public.leave_requests (user_id, start_date, end_date)
WHERE status = 'approved';

CREATE OR REPLACE FUNCTION private.capture_event_email_roster(
    p_session public.attendance_sessions
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    inserted_count INTEGER := 0;
BEGIN
    IF p_session.started_by_mode <> 'auto'
        OR p_session.occurrence_key IS NULL
        OR p_session.scheduled_start_at IS NULL
        OR p_session.scheduled_end_at IS NULL THEN
        RETURN 0;
    END IF;

    INSERT INTO public.event_email_occurrence_roster (
        occurrence_key,
        session_id,
        event_id,
        user_id,
        department_id,
        department_name,
        team_id,
        team_name
    )
    SELECT
        p_session.occurrence_key,
        p_session.id,
        event_row.id,
        profile_row.id,
        profile_row.department_id,
        COALESCE(NULLIF(TRIM(department_row.name), ''), NULLIF(TRIM(profile_row.department), '')),
        COALESCE(department_row.team_id, profile_row.team_id),
        COALESCE(NULLIF(TRIM(team_row.name), ''), NULLIF(TRIM(profile_row.team), ''))
    FROM public.events event_row
    JOIN public.profiles profile_row ON profile_row.is_active IS TRUE
    LEFT JOIN public.departments department_row ON department_row.id = profile_row.department_id
    LEFT JOIN public.teams team_row
        ON team_row.id = COALESCE(department_row.team_id, profile_row.team_id)
    WHERE event_row.id = p_session.event_id
        AND event_row.email_notifications_enabled IS TRUE
        AND (
            event_row.email_target_worker_ids IS NULL
            OR CARDINALITY(event_row.email_target_worker_ids) = 0
            OR profile_row.id = ANY(event_row.email_target_worker_ids)
        )
        AND (
            (
                event_row.department_id IS NOT NULL
                AND profile_row.department_id = event_row.department_id
                AND department_row.is_active IS TRUE
            )
            OR (
                event_row.department_id IS NULL
                AND event_row.team_id IS NOT NULL
                AND department_row.team_id = event_row.team_id
                AND department_row.is_active IS TRUE
            )
            OR (event_row.department_id IS NULL AND event_row.team_id IS NULL)
        )
    ON CONFLICT (occurrence_key, user_id) DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION private.capture_event_email_roster_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM private.capture_event_email_roster(NEW);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_event_email_roster_on_session
ON public.attendance_sessions;

CREATE TRIGGER capture_event_email_roster_on_session
AFTER INSERT ON public.attendance_sessions
FOR EACH ROW
EXECUTE FUNCTION private.capture_event_email_roster_trigger();

CREATE OR REPLACE FUNCTION private.touch_attendance_summary_email_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER touch_attendance_summary_email_job_updated_at
BEFORE UPDATE ON public.attendance_summary_email_jobs
FOR EACH ROW
EXECUTE FUNCTION private.touch_attendance_summary_email_job();

CREATE OR REPLACE FUNCTION private.is_attendance_summary_recipient_currently_eligible(
    p_event_id UUID,
    p_occurrence_key TEXT,
    p_user_id UUID,
    p_scope_type TEXT,
    p_scope_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.events event_row
        JOIN public.profiles profile_row ON profile_row.id = p_user_id
        JOIN auth.users auth_user ON auth_user.id = profile_row.id
        WHERE event_row.id = p_event_id
            AND event_row.email_notifications_enabled IS TRUE
            AND profile_row.is_active IS TRUE
            AND profile_row.email_notifications_enabled IS TRUE
            AND auth_user.email IS NOT NULL
            AND auth_user.email_confirmed_at IS NOT NULL
            AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= NOW())
            AND LOWER(auth_user.email) NOT LIKE 'worker.%@harvestersng.org'
            AND EXISTS (
                SELECT 1
                FROM public.event_email_occurrence_roster roster_row
                WHERE roster_row.event_id = p_event_id
                    AND roster_row.occurrence_key = p_occurrence_key
                    AND (
                        p_scope_type = 'global'
                        OR (p_scope_type = 'team' AND roster_row.team_id = p_scope_id)
                        OR (p_scope_type = 'department' AND roster_row.department_id = p_scope_id)
                    )
            )
            AND (
                (
                    p_scope_type = 'global'
                    AND p_scope_id IS NULL
                    AND profile_row.role::TEXT IN ('admin', 'super_admin')
                )
                OR (
                    p_scope_type = 'team'
                    AND p_scope_id IS NOT NULL
                    AND profile_row.role::TEXT = 'team_admin'
                    AND EXISTS (
                        SELECT 1
                        FROM public.teams team_row
                        WHERE team_row.id = p_scope_id
                            AND team_row.is_active IS TRUE
                    )
                    AND (
                        profile_row.team_id = p_scope_id
                        OR EXISTS (
                            SELECT 1
                            FROM public.team_admin_assignments assignment_row
                            WHERE assignment_row.user_id = profile_row.id
                                AND assignment_row.team_id = p_scope_id
                        )
                    )
                )
                OR (
                    p_scope_type = 'department'
                    AND p_scope_id IS NOT NULL
                    AND profile_row.role::TEXT <> 'reports_admin'
                    AND EXISTS (
                        SELECT 1
                        FROM public.departments department_row
                        WHERE department_row.id = p_scope_id
                            AND department_row.is_active IS TRUE
                            AND department_row.head_user_id = profile_row.id
                    )
                )
            )
    );
$$;

CREATE OR REPLACE FUNCTION public.enqueue_due_attendance_summaries(
    p_reference_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    p_followup_delay_minutes INTEGER DEFAULT 60,
    p_max_lateness_minutes INTEGER DEFAULT 1440
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    scheduler_time TIMESTAMP WITH TIME ZONE := DATE_TRUNC('minute', p_reference_time);
    followup_delay INTERVAL;
    max_lateness INTERVAL;
    due_session public.attendance_sessions%ROWTYPE;
    inserted_count INTEGER := 0;
BEGIN
    IF p_followup_delay_minutes NOT BETWEEN 1 AND 1440
        OR p_max_lateness_minutes NOT BETWEEN 1 AND 1440 THEN
        RAISE EXCEPTION 'Summary timing values must be between 1 and 1440 minutes';
    END IF;

    followup_delay := MAKE_INTERVAL(mins => p_followup_delay_minutes);
    max_lateness := MAKE_INTERVAL(mins => p_max_lateness_minutes);

    IF NOT pg_try_advisory_xact_lock(hashtext('attendance-summary-enqueue')) THEN
        RETURN 0;
    END IF;

    -- The trigger is the normal snapshot path. This fallback covers a session
    -- created immediately before this migration or while automation was disabled.
    FOR due_session IN
        SELECT session_row.*
        FROM public.attendance_sessions session_row
        JOIN public.events event_row ON event_row.id = session_row.event_id
        WHERE event_row.email_notifications_enabled IS TRUE
            AND session_row.started_by_mode = 'auto'
            AND session_row.status = 'ended'
            AND session_row.occurrence_key IS NOT NULL
            AND session_row.scheduled_start_at IS NOT NULL
            AND session_row.scheduled_end_at IS NOT NULL
            AND session_row.scheduled_end_at + followup_delay <= scheduler_time
            AND session_row.scheduled_end_at + followup_delay > scheduler_time - max_lateness
            AND EXISTS (
                SELECT 1
                FROM public.event_occurrence_window(event_row, session_row.scheduled_start_at) occurrence
                WHERE occurrence.occurrence_key = session_row.occurrence_key
                    AND occurrence.scheduled_start_at = session_row.scheduled_start_at
                    AND occurrence.scheduled_end_at = session_row.scheduled_end_at
            )
    LOOP
        PERFORM private.capture_event_email_roster(due_session);
    END LOOP;

    WITH due_sessions AS (
        SELECT
            session_row.id AS session_id,
            session_row.event_id,
            session_row.occurrence_key,
            session_row.scheduled_start_at,
            session_row.scheduled_end_at,
            event_row.title AS event_title,
            event_row.timezone AS event_timezone,
            session_row.scheduled_end_at + followup_delay AS due_at,
            (
                SELECT STRING_AGG(location_row.name, ', ' ORDER BY location_row.name)
                FROM public.locations location_row
                WHERE location_row.id = ANY(COALESCE(event_row.location_ids, '{}'::UUID[]))
            ) AS location_name
        FROM public.attendance_sessions session_row
        JOIN public.events event_row ON event_row.id = session_row.event_id
        WHERE event_row.email_notifications_enabled IS TRUE
            AND session_row.started_by_mode = 'auto'
            AND session_row.status = 'ended'
            AND session_row.occurrence_key IS NOT NULL
            AND session_row.scheduled_start_at IS NOT NULL
            AND session_row.scheduled_end_at IS NOT NULL
            AND session_row.scheduled_end_at + followup_delay <= scheduler_time
            AND session_row.scheduled_end_at + followup_delay > scheduler_time - max_lateness
            AND EXISTS (
                SELECT 1
                FROM public.event_occurrence_window(event_row, session_row.scheduled_start_at) occurrence
                WHERE occurrence.occurrence_key = session_row.occurrence_key
                    AND occurrence.scheduled_start_at = session_row.scheduled_start_at
                    AND occurrence.scheduled_end_at = session_row.scheduled_end_at
            )
    ),
    classified_roster AS (
        SELECT
            due.session_id,
            due.event_id,
            due.occurrence_key,
            roster_row.user_id,
            roster_row.department_id,
            roster_row.department_name,
            roster_row.team_id,
            roster_row.team_name,
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM public.attendance_logs attendance_log
                    WHERE attendance_log.session_id = due.session_id
                        AND attendance_log.user_id = roster_row.user_id
                ) THEN 'checked_in'
                WHEN EXISTS (
                    SELECT 1
                    FROM public.leave_requests leave_request
                    WHERE leave_request.user_id = roster_row.user_id
                        AND leave_request.status = 'approved'
                        AND (due.scheduled_start_at AT TIME ZONE due.event_timezone)::DATE
                            BETWEEN leave_request.start_date AND leave_request.end_date
                ) THEN 'approved_leave'
                ELSE 'missed'
            END AS attendance_result
        FROM due_sessions due
        JOIN public.event_email_occurrence_roster roster_row
            ON roster_row.session_id = due.session_id
            AND roster_row.event_id = due.event_id
            AND roster_row.occurrence_key = due.occurrence_key
    ),
    department_counts AS (
        SELECT
            classified.session_id,
            classified.department_id AS scope_id,
            COALESCE(MAX(classified.department_name), 'Assigned Department') AS scope_name,
            COUNT(*)::INTEGER AS expected_count,
            COUNT(*) FILTER (WHERE classified.attendance_result = 'checked_in')::INTEGER AS checked_in_count,
            COUNT(*) FILTER (WHERE classified.attendance_result = 'approved_leave')::INTEGER AS approved_leave_count,
            COUNT(*) FILTER (WHERE classified.attendance_result = 'missed')::INTEGER AS missed_count
        FROM classified_roster classified
        WHERE classified.department_id IS NOT NULL
        GROUP BY classified.session_id, classified.department_id
    ),
    team_counts AS (
        SELECT
            classified.session_id,
            classified.team_id AS scope_id,
            COALESCE(MAX(classified.team_name), 'Assigned Team') AS scope_name,
            COUNT(*)::INTEGER AS expected_count,
            COUNT(*) FILTER (WHERE classified.attendance_result = 'checked_in')::INTEGER AS checked_in_count,
            COUNT(*) FILTER (WHERE classified.attendance_result = 'approved_leave')::INTEGER AS approved_leave_count,
            COUNT(*) FILTER (WHERE classified.attendance_result = 'missed')::INTEGER AS missed_count
        FROM classified_roster classified
        WHERE classified.team_id IS NOT NULL
        GROUP BY classified.session_id, classified.team_id
    ),
    global_counts AS (
        SELECT
            classified.session_id,
            NULL::UUID AS scope_id,
            'All Teams'::TEXT AS scope_name,
            COUNT(*)::INTEGER AS expected_count,
            COUNT(*) FILTER (WHERE classified.attendance_result = 'checked_in')::INTEGER AS checked_in_count,
            COUNT(*) FILTER (WHERE classified.attendance_result = 'approved_leave')::INTEGER AS approved_leave_count,
            COUNT(*) FILTER (WHERE classified.attendance_result = 'missed')::INTEGER AS missed_count
        FROM classified_roster classified
        GROUP BY classified.session_id
    ),
    eligible_leaders AS (
        SELECT
            profile_row.id,
            profile_row.role::TEXT AS role,
            profile_row.team_id,
            LOWER(auth_user.email) AS email,
            COALESCE(NULLIF(TRIM(profile_row.first_name), ''), 'there') AS first_name
        FROM public.profiles profile_row
        JOIN auth.users auth_user ON auth_user.id = profile_row.id
        WHERE profile_row.is_active IS TRUE
            AND profile_row.email_notifications_enabled IS TRUE
            AND auth_user.email IS NOT NULL
            AND auth_user.email_confirmed_at IS NOT NULL
            AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= scheduler_time)
            AND LOWER(auth_user.email) NOT LIKE 'worker.%@harvestersng.org'
    ),
    team_leader_assignments AS (
        SELECT assignment_row.team_id, assignment_row.user_id
        FROM public.team_admin_assignments assignment_row

        UNION

        SELECT profile_row.team_id, profile_row.id
        FROM public.profiles profile_row
        WHERE profile_row.role::TEXT = 'team_admin'
            AND profile_row.team_id IS NOT NULL
    ),
    leader_candidates AS (
        SELECT
            due.*,
            leader.id AS recipient_user_id,
            leader.email AS recipient_email,
            leader.first_name AS recipient_first_name,
            'department'::TEXT AS summary_scope_type,
            counts.scope_id AS summary_scope_id,
            counts.scope_name AS summary_scope_name,
            counts.expected_count,
            counts.checked_in_count,
            counts.approved_leave_count,
            counts.missed_count,
            3 AS scope_priority
        FROM department_counts counts
        JOIN due_sessions due ON due.session_id = counts.session_id
        JOIN public.departments department_row
            ON department_row.id = counts.scope_id
            AND department_row.is_active IS TRUE
        JOIN eligible_leaders leader ON leader.id = department_row.head_user_id
        WHERE leader.role <> 'reports_admin'

        UNION ALL

        SELECT
            due.*,
            leader.id,
            leader.email,
            leader.first_name,
            'team'::TEXT,
            counts.scope_id,
            counts.scope_name,
            counts.expected_count,
            counts.checked_in_count,
            counts.approved_leave_count,
            counts.missed_count,
            2 AS scope_priority
        FROM team_counts counts
        JOIN due_sessions due ON due.session_id = counts.session_id
        JOIN public.teams team_row
            ON team_row.id = counts.scope_id
            AND team_row.is_active IS TRUE
        JOIN team_leader_assignments assignment_row ON assignment_row.team_id = counts.scope_id
        JOIN eligible_leaders leader
            ON leader.id = assignment_row.user_id
            AND leader.role = 'team_admin'

        UNION ALL

        SELECT
            due.*,
            leader.id,
            leader.email,
            leader.first_name,
            'global'::TEXT,
            counts.scope_id,
            counts.scope_name,
            counts.expected_count,
            counts.checked_in_count,
            counts.approved_leave_count,
            counts.missed_count,
            1 AS scope_priority
        FROM global_counts counts
        JOIN due_sessions due ON due.session_id = counts.session_id
        CROSS JOIN eligible_leaders leader
        WHERE leader.role IN ('admin', 'super_admin')
    ),
    selected_leaders AS (
        SELECT candidate.*
        FROM (
            SELECT
                candidate_row.*,
                ROW_NUMBER() OVER (
                    PARTITION BY candidate_row.occurrence_key, candidate_row.recipient_user_id
                    ORDER BY candidate_row.scope_priority, candidate_row.summary_scope_name
                ) AS recipient_rank
            FROM leader_candidates candidate_row
        ) candidate
        WHERE candidate.recipient_rank = 1
    )
    INSERT INTO public.attendance_summary_email_jobs (
        event_id,
        session_id,
        occurrence_key,
        recipient_user_id,
        recipient_email,
        recipient_first_name,
        summary_scope_type,
        summary_scope_id,
        summary_scope_name,
        expected_count,
        checked_in_count,
        approved_leave_count,
        missed_count,
        event_title,
        event_start_at,
        event_end_at,
        event_timezone,
        location_name,
        due_at,
        next_attempt_at
    )
    SELECT
        selected.event_id,
        selected.session_id,
        selected.occurrence_key,
        selected.recipient_user_id,
        selected.recipient_email,
        selected.recipient_first_name,
        selected.summary_scope_type,
        selected.summary_scope_id,
        selected.summary_scope_name,
        selected.expected_count,
        selected.checked_in_count,
        selected.approved_leave_count,
        selected.missed_count,
        selected.event_title,
        selected.scheduled_start_at,
        selected.scheduled_end_at,
        selected.event_timezone,
        selected.location_name,
        selected.due_at,
        scheduler_time
    FROM selected_leaders selected
    ON CONFLICT (occurrence_key, recipient_user_id) DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_attendance_summary_email_jobs(
    p_worker_id UUID,
    p_batch_size INTEGER DEFAULT 5,
    p_lock_timeout_minutes INTEGER DEFAULT 10
)
RETURNS SETOF public.attendance_summary_email_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_batch_size NOT BETWEEN 1 AND 25
        OR p_lock_timeout_minutes NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION 'Invalid attendance summary claim parameters';
    END IF;

    UPDATE public.attendance_summary_email_jobs job
    SET recipient_email = LOWER(auth_user.email)
    FROM auth.users auth_user
    WHERE job.recipient_user_id = auth_user.id
        AND job.status IN ('pending', 'retry')
        AND job.recipient_email IS DISTINCT FROM LOWER(auth_user.email);

    UPDATE public.attendance_summary_email_jobs
    SET
        status = 'retry',
        locked_at = NULL,
        locked_by = NULL,
        next_attempt_at = NOW(),
        last_error = COALESCE(last_error, 'Processing lock expired before completion')
    WHERE status = 'processing'
        AND locked_at < NOW() - MAKE_INTERVAL(mins => p_lock_timeout_minutes)
        AND attempt_count < max_attempts;

    UPDATE public.attendance_summary_email_jobs
    SET
        status = 'failed',
        locked_at = NULL,
        locked_by = NULL,
        last_error = COALESCE(last_error, 'Maximum delivery attempts exhausted')
    WHERE status = 'processing'
        AND locked_at < NOW() - MAKE_INTERVAL(mins => p_lock_timeout_minutes)
        AND attempt_count >= max_attempts;

    UPDATE public.attendance_summary_email_jobs job
    SET
        status = 'cancelled',
        locked_at = NULL,
        locked_by = NULL,
        last_error = CASE
            WHEN NOT EXISTS (
                SELECT 1
                FROM public.events event_row
                WHERE event_row.id = job.event_id
                    AND event_row.email_notifications_enabled IS TRUE
            ) THEN 'Event email automation was disabled before summary delivery'
            WHEN NOT private.is_attendance_summary_recipient_currently_eligible(
                job.event_id,
                job.occurrence_key,
                job.recipient_user_id,
                job.summary_scope_type,
                job.summary_scope_id
            ) THEN 'Recipient is inactive, unavailable, opted out, or no longer leads this scope'
            ELSE 'Event occurrence changed before summary delivery'
        END
    WHERE job.status IN ('pending', 'retry')
        AND (
            NOT EXISTS (
                SELECT 1
                FROM public.events event_row
                WHERE event_row.id = job.event_id
                    AND event_row.email_notifications_enabled IS TRUE
            )
            OR NOT private.is_attendance_summary_recipient_currently_eligible(
                job.event_id,
                job.occurrence_key,
                job.recipient_user_id,
                job.summary_scope_type,
                job.summary_scope_id
            )
            OR NOT EXISTS (
                SELECT 1
                FROM public.events event_row
                CROSS JOIN LATERAL public.event_occurrence_window(
                    event_row,
                    job.event_start_at
                ) occurrence
                WHERE event_row.id = job.event_id
                    AND occurrence.occurrence_key = job.occurrence_key
                    AND occurrence.scheduled_start_at = job.event_start_at
                    AND occurrence.scheduled_end_at = job.event_end_at
            )
        );

    RETURN QUERY
    WITH claimable AS (
        SELECT job.id
        FROM public.attendance_summary_email_jobs job
        WHERE job.status IN ('pending', 'retry')
            AND job.next_attempt_at <= NOW()
            AND job.due_at <= NOW()
            AND job.attempt_count < job.max_attempts
        ORDER BY job.due_at, job.next_attempt_at, job.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT p_batch_size
    )
    UPDATE public.attendance_summary_email_jobs job
    SET
        status = 'processing',
        attempt_count = job.attempt_count + 1,
        locked_at = NOW(),
        locked_by = p_worker_id,
        last_error = NULL
    FROM claimable
    WHERE job.id = claimable.id
    RETURNING job.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_attendance_summary_email_sent(
    p_job_id UUID,
    p_worker_id UUID,
    p_provider_message_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.attendance_summary_email_jobs
    SET
        status = 'sent',
        sent_at = NOW(),
        provider_message_id = LEFT(p_provider_message_id, 500),
        locked_at = NULL,
        locked_by = NULL,
        last_error = NULL
    WHERE id = p_job_id
        AND status = 'processing'
        AND locked_by = p_worker_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attendance summary job is not owned by this processor';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_attendance_summary_email_failed(
    p_job_id UUID,
    p_worker_id UUID,
    p_error TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.attendance_summary_email_jobs
    SET
        status = CASE WHEN attempt_count >= max_attempts THEN 'failed' ELSE 'retry' END,
        next_attempt_at = CASE
            WHEN attempt_count >= max_attempts THEN next_attempt_at
            ELSE NOW() + MAKE_INTERVAL(
                mins => LEAST(60, POWER(2, GREATEST(attempt_count - 1, 0))::INTEGER)
            )
        END,
        locked_at = NULL,
        locked_by = NULL,
        last_error = LEFT(COALESCE(NULLIF(p_error, ''), 'Unknown summary delivery failure'), 2000)
    WHERE id = p_job_id
        AND status = 'processing'
        AND locked_by = p_worker_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attendance summary job is not owned by this processor';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_attendance_summary_email_job(
    p_job_id UUID,
    p_worker_id UUID,
    p_error TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.attendance_summary_email_jobs
    SET
        status = 'cancelled',
        locked_at = NULL,
        locked_by = NULL,
        last_error = LEFT(COALESCE(NULLIF(p_error, ''), 'Summary job cancelled before delivery'), 2000)
    WHERE id = p_job_id
        AND status = 'processing'
        AND locked_by = p_worker_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attendance summary job is not owned by this processor';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.capture_event_email_roster(public.attendance_sessions)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.capture_event_email_roster_trigger()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.touch_attendance_summary_email_job()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.is_attendance_summary_recipient_currently_eligible(UUID, TEXT, UUID, TEXT, UUID)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.enqueue_due_attendance_summaries(TIMESTAMP WITH TIME ZONE, INTEGER, INTEGER)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_attendance_summary_email_jobs(UUID, INTEGER, INTEGER)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_attendance_summary_email_sent(UUID, UUID, TEXT)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_attendance_summary_email_failed(UUID, UUID, TEXT)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_attendance_summary_email_job(UUID, UUID, TEXT)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_due_attendance_summaries(TIMESTAMP WITH TIME ZONE, INTEGER, INTEGER)
TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_attendance_summary_email_jobs(UUID, INTEGER, INTEGER)
TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_attendance_summary_email_sent(UUID, UUID, TEXT)
TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_attendance_summary_email_failed(UUID, UUID, TEXT)
TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_attendance_summary_email_job(UUID, UUID, TEXT)
TO service_role;

COMMIT;
