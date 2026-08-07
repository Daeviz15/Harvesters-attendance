-- Prevent stale attendance follow-ups after an event's schedule is edited.
-- A follow-up is eligible only when the ended session still matches the event's
-- current occurrence window for that scheduled start/end.

BEGIN;

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
        ON profile_row.role = 'worker'
        AND (event_row.department_id IS NULL OR profile_row.department_id = event_row.department_id)
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
        ON profile_row.role = 'worker'
        AND (event_row.department_id IS NULL OR profile_row.department_id = event_row.department_id)
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
        ARRAY(
            SELECT leader_email
            FROM (
                SELECT LOWER(admin_user.email) AS leader_email
                FROM public.profiles admin_profile
                JOIN auth.users admin_user ON admin_user.id = admin_profile.id
                WHERE admin_profile.role IN ('admin', 'super_admin')
                    AND admin_user.email IS NOT NULL
                    AND admin_user.email_confirmed_at IS NOT NULL

                UNION

                SELECT LOWER(head_user.email) AS leader_email
                FROM public.departments department_row
                JOIN auth.users head_user ON head_user.id = department_row.head_user_id
                WHERE department_row.id = recipient.department_id
                    AND head_user.email IS NOT NULL
                    AND head_user.email_confirmed_at IS NOT NULL
            ) leaders
            WHERE leader_email <> LOWER(recipient.recipient_email)
            ORDER BY leader_email
        ),
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

GRANT EXECUTE ON FUNCTION public.enqueue_due_email_notifications(
    TIMESTAMP WITH TIME ZONE, INTEGER, INTEGER, INTEGER
) TO service_role;

COMMIT;
