-- ==================================================================================
-- EMAIL AUTOMATION SAFETY CONTROLS
--
-- Keeps automatic reminder/follow-up processing safely testable in production:
-- 1. Ensures event-level target-worker scoping exists in migrated databases.
-- 2. Allows processors to claim only specific notification types.
-- 3. Allows the application to explicitly cancel allowlist-blocked test jobs.
-- ==================================================================================

BEGIN;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS email_target_worker_ids UUID[] DEFAULT NULL;

COMMENT ON COLUMN public.events.email_target_worker_ids
IS 'If null or empty, automatic event emails go to all eligible workers. If populated, automatic emails only go to the specified worker IDs.';

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
            WHEN NOT EXISTS (
                SELECT 1
                FROM public.profiles profile_row
                WHERE profile_row.id = job.recipient_user_id
                    AND profile_row.email_notifications_enabled = TRUE
            ) THEN 'Recipient opted out before delivery'
            WHEN job.notification_type = 'event_reminder'
                AND job.event_start_at <= NOW()
                THEN 'Reminder expired before delivery'
            WHEN job.notification_type = 'event_reminder'
                THEN 'Event occurrence changed before delivery'
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
            OR NOT EXISTS (
                SELECT 1
                FROM public.profiles profile_row
                WHERE profile_row.id = job.recipient_user_id
                    AND profile_row.email_notifications_enabled = TRUE
            )
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
                    EXISTS (
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

CREATE OR REPLACE FUNCTION public.cancel_email_notification_job(
    p_job_id UUID,
    p_worker_id UUID,
    p_error TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    UPDATE public.email_notification_jobs
    SET
        status = 'cancelled',
        locked_at = NULL,
        locked_by = NULL,
        last_error = LEFT(COALESCE(NULLIF(p_error, ''), 'Email job cancelled before delivery'), 2000)
    WHERE id = p_job_id
        AND status = 'processing'
        AND locked_by = p_worker_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Email job is not owned by this processor';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_notification_jobs(UUID, INTEGER, INTEGER, TEXT[])
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_email_notification_job(UUID, UUID, TEXT)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_email_notification_jobs(UUID, INTEGER, INTEGER, TEXT[])
TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_email_notification_job(UUID, UUID, TEXT)
TO service_role;

COMMIT;
