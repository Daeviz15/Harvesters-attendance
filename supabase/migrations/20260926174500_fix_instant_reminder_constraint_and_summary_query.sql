-- Fix check constraint on email_notification_jobs to allow 0 for instant reminders,
-- and restore exact team_admin_assignments query in enqueue_due_attendance_summaries.

BEGIN;

-- 1. Allow reminder_lead_minutes = 0 for instant start event notifications
ALTER TABLE public.email_notification_jobs
DROP CONSTRAINT IF EXISTS email_notification_jobs_reminder_lead_minutes_check;

ALTER TABLE public.email_notification_jobs
ADD CONSTRAINT email_notification_jobs_reminder_lead_minutes_check
CHECK (reminder_lead_minutes IS NULL OR reminder_lead_minutes BETWEEN 0 AND 1440);

-- 2. Restore exact enqueue_due_attendance_summaries with manual & auto support
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

    FOR due_session IN
        SELECT session_row.*
        FROM public.attendance_sessions session_row
        JOIN public.events event_row ON event_row.id = session_row.event_id
        WHERE event_row.email_notifications_enabled IS TRUE
            AND session_row.started_by_mode IN ('auto', 'manual')
            AND session_row.status = 'ended'
            AND session_row.occurrence_key IS NOT NULL
            AND session_row.scheduled_start_at IS NOT NULL
            AND session_row.scheduled_end_at IS NOT NULL
            AND COALESCE(session_row.end_time, session_row.scheduled_end_at) + followup_delay <= scheduler_time
            AND COALESCE(session_row.end_time, session_row.scheduled_end_at) + followup_delay > scheduler_time - max_lateness
            AND (
                session_row.started_by_mode = 'manual'
                OR EXISTS (
                    SELECT 1
                    FROM public.event_occurrence_window(event_row, session_row.scheduled_start_at) occurrence
                    WHERE occurrence.occurrence_key = session_row.occurrence_key
                        AND occurrence.scheduled_start_at = session_row.scheduled_start_at
                        AND occurrence.scheduled_end_at = session_row.scheduled_end_at
                )
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
            COALESCE(session_row.end_time, session_row.scheduled_end_at) + followup_delay AS due_at,
            (
                SELECT STRING_AGG(location_row.name, ', ' ORDER BY location_row.name)
                FROM public.locations location_row
                WHERE location_row.id = ANY(COALESCE(event_row.location_ids, '{}'::UUID[]))
            ) AS location_name
        FROM public.attendance_sessions session_row
        JOIN public.events event_row ON event_row.id = session_row.event_id
        WHERE event_row.email_notifications_enabled IS TRUE
            AND session_row.started_by_mode IN ('auto', 'manual')
            AND session_row.status = 'ended'
            AND session_row.occurrence_key IS NOT NULL
            AND session_row.scheduled_start_at IS NOT NULL
            AND session_row.scheduled_end_at IS NOT NULL
            AND COALESCE(session_row.end_time, session_row.scheduled_end_at) + followup_delay <= scheduler_time
            AND COALESCE(session_row.end_time, session_row.scheduled_end_at) + followup_delay > scheduler_time - max_lateness
            AND (
                session_row.started_by_mode = 'manual'
                OR EXISTS (
                    SELECT 1
                    FROM public.event_occurrence_window(event_row, session_row.scheduled_start_at) occurrence
                    WHERE occurrence.occurrence_key = session_row.occurrence_key
                        AND occurrence.scheduled_start_at = session_row.scheduled_start_at
                        AND occurrence.scheduled_end_at = session_row.scheduled_end_at
                )
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
    WHERE selected.expected_count > 0
    ON CONFLICT (occurrence_key, recipient_user_id) DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_due_attendance_summaries(
    TIMESTAMP WITH TIME ZONE, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_due_attendance_summaries(
    TIMESTAMP WITH TIME ZONE, INTEGER, INTEGER
) TO service_role;

COMMIT;
