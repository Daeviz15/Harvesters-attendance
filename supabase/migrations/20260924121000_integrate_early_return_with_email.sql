-- Makes automatic email delivery aware of audited early leave returns.
--
-- The existing enqueue function remains the primary path. A narrow supplemental
-- enqueue handles only workers whose approved leave ended early, while claim-
-- time validation remains the final delivery gate.

BEGIN;

CREATE OR REPLACE FUNCTION public.enqueue_due_returned_early_followups(
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
    inserted_count INTEGER := 0;
BEGIN
    IF p_followup_delay_minutes NOT BETWEEN 1 AND 1440
        OR p_max_lateness_minutes NOT BETWEEN 1 AND 1440 THEN
        RAISE EXCEPTION 'Follow-up timing values must be between 1 and 1440 minutes';
    END IF;

    followup_delay := MAKE_INTERVAL(mins => p_followup_delay_minutes);
    max_lateness := MAKE_INTERVAL(mins => p_max_lateness_minutes);

    IF NOT pg_try_advisory_xact_lock(hashtext('returned-early-followup-enqueue')) THEN
        RETURN 0;
    END IF;

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
    WHERE event_row.email_notifications_enabled IS TRUE
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
        AND EXISTS (
            SELECT 1
            FROM public.leave_requests leave_request
            WHERE leave_request.user_id = recipient.user_id
                AND leave_request.status = 'approved'
                AND leave_request.returned_early_at IS NOT NULL
                AND leave_request.returned_early_at <= session_row.scheduled_end_at
                AND (session_row.scheduled_end_at AT TIME ZONE event_row.timezone)::DATE
                    BETWEEN leave_request.start_date AND leave_request.end_date
        )
        AND NOT private.is_user_on_approved_leave(
            recipient.user_id,
            session_row.scheduled_end_at,
            event_row.timezone
        )
    ON CONFLICT (notification_type, occurrence_key, recipient_user_id) DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_email_notification_jobs(
    p_worker_id UUID,
    p_batch_size INTEGER DEFAULT 20,
    p_lock_timeout_minutes INTEGER DEFAULT 10,
    p_notification_types TEXT[] DEFAULT NULL
)
RETURNS SETOF public.email_notification_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
                    AND event_row.email_notifications_enabled IS TRUE
            ) THEN 'Event email automation was disabled before delivery'
            WHEN NOT private.is_event_email_recipient_currently_eligible(job.event_id, job.recipient_user_id)
                THEN 'Recipient is inactive, unavailable, opted out, or outside the event audience'
            WHEN job.notification_type = 'event_reminder'
                AND private.is_user_on_approved_leave(
                    job.recipient_user_id,
                    job.event_start_at,
                    job.event_timezone
                ) THEN 'Approved leave was active at the event start'
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
            ELSE 'Approved leave was active through the event end'
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
                    AND event_row.email_notifications_enabled IS TRUE
            )
            OR NOT private.is_event_email_recipient_currently_eligible(job.event_id, job.recipient_user_id)
            OR (
                job.notification_type = 'event_reminder'
                AND (
                    private.is_user_on_approved_leave(
                        job.recipient_user_id,
                        job.event_start_at,
                        job.event_timezone
                    )
                    OR job.event_start_at <= NOW()
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
                    OR private.is_user_on_approved_leave(
                        job.recipient_user_id,
                        job.event_end_at,
                        job.event_timezone
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

CREATE OR REPLACE FUNCTION public.recalculate_pending_attendance_summary_counts(
    p_reference_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    p_max_lateness_minutes INTEGER DEFAULT 1440
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    updated_count INTEGER := 0;
BEGIN
    IF p_max_lateness_minutes NOT BETWEEN 1 AND 1440 THEN
        RAISE EXCEPTION 'Summary maximum lateness must be between 1 and 1440 minutes';
    END IF;

    WITH classified AS (
        SELECT
            job.id AS job_id,
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM public.attendance_logs attendance_log
                    WHERE attendance_log.session_id = job.session_id
                        AND attendance_log.user_id = roster_row.user_id
                ) THEN 'checked_in'
                WHEN private.is_user_on_approved_leave(
                    roster_row.user_id,
                    job.event_end_at,
                    job.event_timezone
                ) THEN 'approved_leave'
                ELSE 'missed'
            END AS attendance_result
        FROM public.attendance_summary_email_jobs job
        JOIN public.event_email_occurrence_roster roster_row
            ON roster_row.session_id = job.session_id
            AND roster_row.event_id = job.event_id
            AND roster_row.occurrence_key = job.occurrence_key
        WHERE job.status IN ('pending', 'retry')
            AND job.due_at <= p_reference_time
            AND job.due_at > p_reference_time - MAKE_INTERVAL(mins => p_max_lateness_minutes)
            AND (
                job.summary_scope_type = 'global'
                OR (job.summary_scope_type = 'team' AND roster_row.team_id = job.summary_scope_id)
                OR (job.summary_scope_type = 'department' AND roster_row.department_id = job.summary_scope_id)
            )
    ),
    totals AS (
        SELECT
            classified.job_id,
            COUNT(*)::INTEGER AS expected_count,
            COUNT(*) FILTER (WHERE classified.attendance_result = 'checked_in')::INTEGER AS checked_in_count,
            COUNT(*) FILTER (WHERE classified.attendance_result = 'approved_leave')::INTEGER AS approved_leave_count,
            COUNT(*) FILTER (WHERE classified.attendance_result = 'missed')::INTEGER AS missed_count
        FROM classified
        GROUP BY classified.job_id
    )
    UPDATE public.attendance_summary_email_jobs job
    SET
        expected_count = totals.expected_count,
        checked_in_count = totals.checked_in_count,
        approved_leave_count = totals.approved_leave_count,
        missed_count = totals.missed_count
    FROM totals
    WHERE job.id = totals.job_id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_due_returned_early_followups(
    TIMESTAMP WITH TIME ZONE, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_email_notification_jobs(
    UUID, INTEGER, INTEGER, TEXT[]
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_pending_attendance_summary_counts(
    TIMESTAMP WITH TIME ZONE, INTEGER
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_due_returned_early_followups(
    TIMESTAMP WITH TIME ZONE, INTEGER, INTEGER
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_email_notification_jobs(
    UUID, INTEGER, INTEGER, TEXT[]
) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_pending_attendance_summary_counts(
    TIMESTAMP WITH TIME ZONE, INTEGER
) TO service_role;

COMMIT;
