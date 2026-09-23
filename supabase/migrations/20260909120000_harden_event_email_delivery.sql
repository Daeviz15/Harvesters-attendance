-- Phase 1: make automatic event email delivery fail closed and recipient-safe.
-- This migration deliberately disables existing event automation. Each event must
-- be reviewed and explicitly re-enabled after the controlled canary tests pass.

BEGIN;

UPDATE public.events
SET email_notifications_enabled = FALSE
WHERE email_notifications_enabled IS TRUE;

UPDATE public.email_notification_jobs
SET
    status = 'cancelled',
    locked_at = NULL,
    locked_by = NULL,
    last_error = 'Cancelled by the event-email safety rollout; re-enqueue after audience review'
WHERE notification_type IN ('event_reminder', 'attendance_follow_up')
    AND status IN ('pending', 'retry');

UPDATE public.email_notification_jobs
SET cc_emails = '{}'::TEXT[]
WHERE notification_type = 'attendance_follow_up'
    AND status <> 'sent'
    AND CARDINALITY(COALESCE(cc_emails, '{}'::TEXT[])) > 0;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_event_email_recipient_currently_eligible(
    p_event_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
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
            AND (
                event_row.email_target_worker_ids IS NULL
                OR CARDINALITY(event_row.email_target_worker_ids) = 0
                OR profile_row.id = ANY(event_row.email_target_worker_ids)
            )
            AND (
                (
                    event_row.department_id IS NOT NULL
                    AND profile_row.department_id = event_row.department_id
                    AND EXISTS (
                        SELECT 1
                        FROM public.departments department_row
                        WHERE department_row.id = event_row.department_id
                            AND department_row.is_active IS TRUE
                    )
                )
                OR (
                    event_row.department_id IS NULL
                    AND event_row.team_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1
                        FROM public.departments department_row
                        WHERE department_row.id = profile_row.department_id
                            AND department_row.team_id = event_row.team_id
                            AND department_row.is_active IS TRUE
                    )
                )
                OR (event_row.department_id IS NULL AND event_row.team_id IS NULL)
            )
    );
$$;

REVOKE ALL ON FUNCTION private.is_event_email_recipient_currently_eligible(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enqueue_due_email_notifications(
    p_reference_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    p_reminder_lead_minutes INTEGER DEFAULT 30,
    p_followup_delay_minutes INTEGER DEFAULT 60,
    p_max_lateness_minutes INTEGER DEFAULT 1440
)
RETURNS TABLE (reminder_jobs_created INTEGER, followup_jobs_created INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    scheduler_time TIMESTAMP WITH TIME ZONE := DATE_TRUNC('minute', p_reference_time);
    reminder_lead INTERVAL;
    followup_delay INTERVAL;
    max_lateness INTERVAL;
BEGIN
    IF p_reminder_lead_minutes NOT BETWEEN 1 AND 1440
        OR p_followup_delay_minutes NOT BETWEEN 1 AND 1440
        OR p_max_lateness_minutes NOT BETWEEN 1 AND 1440 THEN
        RAISE EXCEPTION 'Notification timing values must be between 1 and 1440 minutes';
    END IF;

    reminder_lead := MAKE_INTERVAL(mins => p_reminder_lead_minutes);
    followup_delay := MAKE_INTERVAL(mins => p_followup_delay_minutes);
    max_lateness := MAKE_INTERVAL(mins => p_max_lateness_minutes);

    IF NOT pg_try_advisory_xact_lock(hashtext('email-notification-enqueue')) THEN
        reminder_jobs_created := 0;
        followup_jobs_created := 0;
        RETURN NEXT;
        RETURN;
    END IF;

    INSERT INTO public.event_occurrence_recipients (
        occurrence_key,
        event_id,
        user_id,
        recipient_email,
        first_name,
        department_id,
        department_name
    )
    SELECT
        occurrence.occurrence_key,
        event_row.id,
        profile_row.id,
        LOWER(auth_user.email),
        COALESCE(NULLIF(TRIM(profile_row.first_name), ''), 'there'),
        profile_row.department_id,
        profile_row.department
    FROM public.events event_row
    CROSS JOIN LATERAL public.event_occurrence_window(
        event_row,
        scheduler_time + reminder_lead
    ) occurrence
    JOIN public.profiles profile_row
        ON profile_row.is_active IS TRUE
        AND (
            (
                event_row.department_id IS NOT NULL
                AND profile_row.department_id = event_row.department_id
                AND EXISTS (
                    SELECT 1
                    FROM public.departments scoped_department
                    WHERE scoped_department.id = event_row.department_id
                        AND scoped_department.is_active IS TRUE
                )
            )
            OR (
                event_row.department_id IS NULL
                AND event_row.team_id IS NOT NULL
                AND profile_row.department_id IN (
                    SELECT scoped_department.id
                    FROM public.departments scoped_department
                    WHERE scoped_department.team_id = event_row.team_id
                        AND scoped_department.is_active IS TRUE
                )
            )
            OR (
                event_row.department_id IS NULL
                AND event_row.team_id IS NULL
            )
        )
        AND profile_row.email_notifications_enabled = TRUE
    JOIN auth.users auth_user ON auth_user.id = profile_row.id
    WHERE event_row.email_notifications_enabled = TRUE
        AND (
            event_row.email_target_worker_ids IS NULL
            OR CARDINALITY(event_row.email_target_worker_ids) = 0
            OR profile_row.id = ANY(event_row.email_target_worker_ids)
        )
        AND occurrence.scheduled_start_at > scheduler_time
        AND occurrence.scheduled_start_at <= scheduler_time + reminder_lead
        AND auth_user.email IS NOT NULL
        AND auth_user.email_confirmed_at IS NOT NULL
        AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= scheduler_time)
        AND LOWER(auth_user.email) NOT LIKE 'worker.%@harvestersng.org'
    ON CONFLICT (occurrence_key, user_id) DO NOTHING;

    INSERT INTO public.event_occurrence_recipients (
        occurrence_key,
        event_id,
        user_id,
        recipient_email,
        first_name,
        department_id,
        department_name
    )
    SELECT
        session_row.occurrence_key,
        event_row.id,
        profile_row.id,
        LOWER(auth_user.email),
        COALESCE(NULLIF(TRIM(profile_row.first_name), ''), 'there'),
        profile_row.department_id,
        profile_row.department
    FROM public.attendance_sessions session_row
    JOIN public.events event_row ON event_row.id = session_row.event_id
    JOIN public.profiles profile_row
        ON profile_row.is_active IS TRUE
        AND (
            (
                event_row.department_id IS NOT NULL
                AND profile_row.department_id = event_row.department_id
                AND EXISTS (
                    SELECT 1
                    FROM public.departments scoped_department
                    WHERE scoped_department.id = event_row.department_id
                        AND scoped_department.is_active IS TRUE
                )
            )
            OR (
                event_row.department_id IS NULL
                AND event_row.team_id IS NOT NULL
                AND profile_row.department_id IN (
                    SELECT scoped_department.id
                    FROM public.departments scoped_department
                    WHERE scoped_department.team_id = event_row.team_id
                        AND scoped_department.is_active IS TRUE
                )
            )
            OR (
                event_row.department_id IS NULL
                AND event_row.team_id IS NULL
            )
        )
        AND profile_row.email_notifications_enabled = TRUE
    JOIN auth.users auth_user ON auth_user.id = profile_row.id
    WHERE event_row.email_notifications_enabled = TRUE
        AND (
            event_row.email_target_worker_ids IS NULL
            OR CARDINALITY(event_row.email_target_worker_ids) = 0
            OR profile_row.id = ANY(event_row.email_target_worker_ids)
        )
        AND session_row.started_by_mode = 'auto'
        AND session_row.occurrence_key IS NOT NULL
        AND session_row.scheduled_start_at IS NOT NULL
        AND session_row.scheduled_end_at IS NOT NULL
        AND session_row.scheduled_start_at <= scheduler_time
        AND session_row.scheduled_end_at + followup_delay + max_lateness >= scheduler_time
        AND EXISTS (
            SELECT 1
            FROM public.event_occurrence_window(event_row, session_row.scheduled_start_at) occurrence
            WHERE occurrence.occurrence_key = session_row.occurrence_key
                AND occurrence.scheduled_start_at = session_row.scheduled_start_at
                AND occurrence.scheduled_end_at = session_row.scheduled_end_at
        )
        AND auth_user.email IS NOT NULL
        AND auth_user.email_confirmed_at IS NOT NULL
        AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= scheduler_time)
        AND LOWER(auth_user.email) NOT LIKE 'worker.%@harvestersng.org'
    ON CONFLICT (occurrence_key, user_id) DO NOTHING;

    INSERT INTO public.email_notification_jobs (
        notification_type,
        event_id,
        occurrence_key,
        recipient_user_id,
        recipient_email,
        recipient_first_name,
        event_title,
        event_start_at,
        event_end_at,
        event_timezone,
        location_name,
        department_name,
        reminder_lead_minutes,
        due_at,
        next_attempt_at
    )
    SELECT
        'event_reminder',
        event_row.id,
        occurrence.occurrence_key,
        recipient.user_id,
        recipient.recipient_email,
        recipient.first_name,
        event_row.title,
        occurrence.scheduled_start_at,
        occurrence.scheduled_end_at,
        event_row.timezone,
        (
            SELECT STRING_AGG(location_row.name, ', ' ORDER BY location_row.name)
            FROM public.locations location_row
            WHERE location_row.id = ANY(COALESCE(event_row.location_ids, '{}'::UUID[]))
        ),
        recipient.department_name,
        p_reminder_lead_minutes,
        occurrence.scheduled_start_at - reminder_lead,
        scheduler_time
    FROM public.events event_row
    CROSS JOIN LATERAL public.event_occurrence_window(
        event_row,
        scheduler_time + reminder_lead
    ) occurrence
    JOIN public.event_occurrence_recipients recipient
        ON recipient.event_id = event_row.id
        AND recipient.occurrence_key = occurrence.occurrence_key
    WHERE event_row.email_notifications_enabled = TRUE
        AND (
            event_row.email_target_worker_ids IS NULL
            OR CARDINALITY(event_row.email_target_worker_ids) = 0
            OR recipient.user_id = ANY(event_row.email_target_worker_ids)
        )
        AND occurrence.scheduled_start_at > scheduler_time
        AND occurrence.scheduled_start_at <= scheduler_time + reminder_lead
    ON CONFLICT (notification_type, occurrence_key, recipient_user_id) DO NOTHING;

    GET DIAGNOSTICS reminder_jobs_created = ROW_COUNT;

    INSERT INTO public.email_notification_jobs (
        notification_type,
        event_id,
        session_id,
        occurrence_key,
        recipient_user_id,
        recipient_email,
        recipient_first_name,
        cc_emails,
        event_title,
        event_start_at,
        event_end_at,
        event_timezone,
        location_name,
        department_name,
        due_at,
        next_attempt_at
    )
    SELECT
        'attendance_follow_up',
        event_row.id,
        session_row.id,
        session_row.occurrence_key,
        recipient.user_id,
        recipient.recipient_email,
        recipient.first_name,
        '{}'::TEXT[],
        event_row.title,
        session_row.scheduled_start_at,
        session_row.scheduled_end_at,
        event_row.timezone,
        (
            SELECT STRING_AGG(location_row.name, ', ' ORDER BY location_row.name)
            FROM public.locations location_row
            WHERE location_row.id = ANY(COALESCE(event_row.location_ids, '{}'::UUID[]))
        ),
        recipient.department_name,
        session_row.scheduled_end_at + followup_delay,
        scheduler_time
    FROM public.attendance_sessions session_row
    JOIN public.events event_row ON event_row.id = session_row.event_id
    JOIN public.event_occurrence_recipients recipient
        ON recipient.event_id = event_row.id
        AND recipient.occurrence_key = session_row.occurrence_key
    WHERE event_row.email_notifications_enabled = TRUE
        AND (
            event_row.email_target_worker_ids IS NULL
            OR CARDINALITY(event_row.email_target_worker_ids) = 0
            OR recipient.user_id = ANY(event_row.email_target_worker_ids)
        )
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
        AND NOT EXISTS (
            SELECT 1
            FROM public.attendance_logs attendance_log
            WHERE attendance_log.session_id = session_row.id
                AND attendance_log.user_id = recipient.user_id
        )
        AND NOT EXISTS (
            SELECT 1
            FROM public.leave_requests leave_request
            WHERE leave_request.user_id = recipient.user_id
                AND leave_request.status = 'approved'
                AND (session_row.scheduled_start_at AT TIME ZONE event_row.timezone)::DATE
                    BETWEEN leave_request.start_date AND leave_request.end_date
        )
    ON CONFLICT (notification_type, occurrence_key, recipient_user_id) DO NOTHING;

    GET DIAGNOSTICS followup_jobs_created = ROW_COUNT;

    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_due_email_notifications(
    TIMESTAMP WITH TIME ZONE, INTEGER, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_due_email_notifications(
    TIMESTAMP WITH TIME ZONE, INTEGER, INTEGER, INTEGER
) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_email_notification_jobs(
    p_worker_id UUID,
    p_batch_size INTEGER DEFAULT 20,
    p_lock_timeout_minutes INTEGER DEFAULT 10,
    p_notification_types TEXT[] DEFAULT NULL
)
RETURNS SETOF public.email_notification_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    IF p_batch_size NOT BETWEEN 1 AND 50
        OR p_lock_timeout_minutes NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION 'Invalid email job claim parameters';
    END IF;

    IF p_notification_types IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM UNNEST(p_notification_types) AS requested(notification_type)
            WHERE requested.notification_type NOT IN ('welcome', 'event_reminder', 'attendance_follow_up')
        ) THEN
        RAISE EXCEPTION 'Invalid email notification type filter';
    END IF;

    -- Refresh queued addresses from Auth immediately before eligibility checks.
    -- This avoids delivery to an address that was replaced after the job was queued.
    UPDATE public.email_notification_jobs job
    SET recipient_email = LOWER(auth_user.email)
    FROM auth.users auth_user
    WHERE job.recipient_user_id = auth_user.id
        AND job.status IN ('pending', 'retry')
        AND job.notification_type IN ('event_reminder', 'attendance_follow_up')
        AND job.recipient_email IS DISTINCT FROM LOWER(auth_user.email)
        AND (
            p_notification_types IS NULL
            OR job.notification_type = ANY(p_notification_types)
        );

    UPDATE public.email_notification_jobs
    SET
        status = 'retry',
        locked_at = NULL,
        locked_by = NULL,
        next_attempt_at = NOW(),
        last_error = COALESCE(last_error, 'Processing lock expired before completion')
    WHERE status = 'processing'
        AND locked_at < NOW() - MAKE_INTERVAL(mins => p_lock_timeout_minutes)
        AND attempt_count < max_attempts
        AND (
            p_notification_types IS NULL
            OR notification_type = ANY(p_notification_types)
        );

    UPDATE public.email_notification_jobs
    SET
        status = 'failed',
        locked_at = NULL,
        locked_by = NULL,
        last_error = COALESCE(last_error, 'Maximum delivery attempts exhausted')
    WHERE status = 'processing'
        AND locked_at < NOW() - MAKE_INTERVAL(mins => p_lock_timeout_minutes)
        AND attempt_count >= max_attempts
        AND (
            p_notification_types IS NULL
            OR notification_type = ANY(p_notification_types)
        );

    UPDATE public.email_notification_jobs job
    SET
        status = 'cancelled',
        locked_at = NULL,
        locked_by = NULL,
        last_error = CASE
            WHEN NOT EXISTS (
                SELECT 1
                FROM public.events event_row
                WHERE event_row.id = job.event_id
                    AND event_row.email_notifications_enabled = TRUE
            ) THEN 'Event email automation was disabled before delivery'
            WHEN NOT private.is_event_email_recipient_currently_eligible(job.event_id, job.recipient_user_id) THEN 'Recipient is inactive, unavailable, opted out, or outside the event audience'
            WHEN job.notification_type = 'event_reminder'
                AND job.event_start_at <= NOW()
                THEN 'Reminder expired before delivery'
            WHEN job.notification_type = 'event_reminder'
                THEN 'Event occurrence changed before delivery'
            WHEN job.notification_type = 'attendance_follow_up'
                AND NOT EXISTS (
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
                ) THEN 'Event occurrence changed before delivery'
            WHEN EXISTS (
                SELECT 1
                FROM public.attendance_logs attendance_log
                WHERE attendance_log.session_id = job.session_id
                    AND attendance_log.user_id = job.recipient_user_id
            ) THEN 'Attendance was recorded before delivery'
            ELSE 'Approved leave was recorded before delivery'
        END
    WHERE job.status IN ('pending', 'retry')
        AND job.notification_type IN ('event_reminder', 'attendance_follow_up')
        AND (
            p_notification_types IS NULL
            OR job.notification_type = ANY(p_notification_types)
        )
        AND (
            NOT EXISTS (
                SELECT 1
                FROM public.events event_row
                WHERE event_row.id = job.event_id
                    AND event_row.email_notifications_enabled = TRUE
            )
            OR NOT private.is_event_email_recipient_currently_eligible(job.event_id, job.recipient_user_id)
            OR (
                job.notification_type = 'event_reminder'
                AND (
                    job.event_start_at <= NOW()
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
                )
            )
            OR (
                job.notification_type = 'attendance_follow_up'
                AND (
                    NOT EXISTS (
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
                    OR EXISTS (
                        SELECT 1
                        FROM public.attendance_logs attendance_log
                        WHERE attendance_log.session_id = job.session_id
                            AND attendance_log.user_id = job.recipient_user_id
                    )
                    OR EXISTS (
                        SELECT 1
                        FROM public.leave_requests leave_request
                        WHERE leave_request.user_id = job.recipient_user_id
                            AND leave_request.status = 'approved'
                            AND (job.event_start_at AT TIME ZONE job.event_timezone)::DATE
                                BETWEEN leave_request.start_date AND leave_request.end_date
                    )
                )
            )
        );

    RETURN QUERY
    WITH claimable AS (
        SELECT job.id
        FROM public.email_notification_jobs job
        WHERE job.status IN ('pending', 'retry')
            AND job.next_attempt_at <= NOW()
            AND job.due_at <= NOW()
            AND job.attempt_count < job.max_attempts
            AND (
                p_notification_types IS NULL
                OR job.notification_type = ANY(p_notification_types)
            )
        ORDER BY
            CASE job.notification_type
                WHEN 'event_reminder' THEN 0
                WHEN 'attendance_follow_up' THEN 1
                ELSE 2
            END,
            job.due_at,
            job.next_attempt_at,
            job.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT p_batch_size
    )
    UPDATE public.email_notification_jobs job
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

REVOKE ALL ON FUNCTION public.claim_email_notification_jobs(UUID, INTEGER, INTEGER, TEXT[])
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_email_notification_jobs(UUID, INTEGER, INTEGER, TEXT[])
TO service_role;

COMMIT;
