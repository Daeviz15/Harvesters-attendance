-- Support email notifications (instant start reminder and ended follow-up) for manual & instant sessions.
--
-- This migration extends the email delivery pipeline to support manual / quick-start sessions:
-- 1. Captures roster on manual session start into event_email_occurrence_roster and event_occurrence_recipients.
-- 2. Provides public.enqueue_instant_session_reminders for instant start notification delivery.
-- 3. Enables follow-up emails for manual and instant sessions upon ending, timed from actual or scheduled end.
-- 4. Updates claim filters so manual sessions and zero-lead instant reminders are not cancelled during claim.

BEGIN;

-- 1. Update private.capture_event_email_roster to allow manual sessions
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
    IF p_session.started_by_mode NOT IN ('auto', 'manual')
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

-- 2. New procedure: enqueue_instant_session_reminders
CREATE OR REPLACE FUNCTION public.enqueue_instant_session_reminders(
    p_session_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    session_row public.attendance_sessions%ROWTYPE;
    event_row public.events%ROWTYPE;
    inserted_count INTEGER := 0;
BEGIN
    SELECT * INTO session_row
    FROM public.attendance_sessions
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    SELECT * INTO event_row
    FROM public.events
    WHERE id = session_row.event_id;

    IF NOT FOUND OR event_row.email_notifications_enabled IS NOT TRUE THEN
        RETURN 0;
    END IF;

    -- Ensure recipients are captured in event_occurrence_recipients
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
    FROM public.profiles profile_row
    JOIN auth.users auth_user ON auth_user.id = profile_row.id
    WHERE profile_row.is_active IS TRUE
        AND profile_row.email_notifications_enabled = TRUE
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
        AND (
            event_row.email_target_worker_ids IS NULL
            OR CARDINALITY(event_row.email_target_worker_ids) = 0
            OR profile_row.id = ANY(event_row.email_target_worker_ids)
        )
        AND auth_user.email IS NOT NULL
        AND auth_user.email_confirmed_at IS NOT NULL
        AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= NOW())
        AND LOWER(auth_user.email) NOT LIKE 'worker.%@harvestersng.org'
    ON CONFLICT (occurrence_key, user_id) DO NOTHING;

    -- Enqueue reminder job with reminder_lead_minutes = 0, due immediately
    INSERT INTO public.email_notification_jobs (
        notification_type,
        event_id,
        session_id,
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
        session_row.id,
        session_row.occurrence_key,
        recipient.user_id,
        recipient.recipient_email,
        recipient.first_name,
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
        0,
        NOW(),
        NOW()
    FROM public.event_occurrence_recipients recipient
    WHERE recipient.event_id = event_row.id
        AND recipient.occurrence_key = session_row.occurrence_key
        AND (
            event_row.email_target_worker_ids IS NULL
            OR CARDINALITY(event_row.email_target_worker_ids) = 0
            OR recipient.user_id = ANY(event_row.email_target_worker_ids)
        )
        AND NOT private.is_user_on_approved_leave(
            recipient.user_id,
            session_row.scheduled_start_at,
            event_row.timezone
        )
    ON CONFLICT (notification_type, occurrence_key, recipient_user_id) DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_instant_session_reminders(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_instant_session_reminders(UUID) TO authenticated, service_role;

-- 3. Update public.enqueue_due_email_notifications to allow manual and instant sessions
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

    -- Standard scheduled reminder window recipient capture
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

    -- Session-time recipient capture (supports both auto and manual sessions)
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
        AND session_row.started_by_mode IN ('auto', 'manual')
        AND session_row.occurrence_key IS NOT NULL
        AND session_row.scheduled_start_at IS NOT NULL
        AND session_row.scheduled_end_at IS NOT NULL
        AND session_row.scheduled_start_at <= scheduler_time
        AND COALESCE(session_row.end_time, session_row.scheduled_end_at) + followup_delay + max_lateness >= scheduler_time
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
        AND auth_user.email IS NOT NULL
        AND auth_user.email_confirmed_at IS NOT NULL
        AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= scheduler_time)
        AND LOWER(auth_user.email) NOT LIKE 'worker.%@harvestersng.org'
    ON CONFLICT (occurrence_key, user_id) DO NOTHING;

    -- Standard scheduled reminder job creation
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

    -- Attendance follow-up job creation (supports both auto and manual sessions)
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
        COALESCE(session_row.end_time, session_row.scheduled_end_at) + followup_delay,
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

-- 4. Update public.enqueue_due_returned_early_followups to allow manual sessions
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
        COALESCE(session_row.end_time, session_row.scheduled_end_at) + followup_delay,
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
                AND leave_request.returned_early_at <= session_row.scheduled_start_at
                AND (session_row.scheduled_start_at AT TIME ZONE event_row.timezone)::DATE
                    BETWEEN leave_request.start_date AND leave_request.end_date
        )
    ON CONFLICT (notification_type, occurrence_key, recipient_user_id) DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_due_returned_early_followups(
    TIMESTAMP WITH TIME ZONE, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_due_returned_early_followups(
    TIMESTAMP WITH TIME ZONE, INTEGER, INTEGER
) TO service_role;

-- 5. Update public.enqueue_due_attendance_summaries to allow manual sessions
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
                WHEN private.is_user_on_approved_leave(
                    roster_row.user_id,
                    due.scheduled_start_at,
                    due.event_timezone
                ) THEN 'approved_leave'
                ELSE 'missed'
            END AS worker_status
        FROM due_sessions due
        JOIN public.event_email_occurrence_roster roster_row
            ON roster_row.session_id = due.session_id
            AND roster_row.occurrence_key = due.occurrence_key
    ),
    candidate_recipients AS (
        SELECT
            due.event_id,
            due.session_id,
            due.occurrence_key,
            due.event_title,
            due.scheduled_start_at AS event_start_at,
            due.scheduled_end_at AS event_end_at,
            due.event_timezone,
            due.location_name,
            due.due_at,
            profile_row.id AS recipient_user_id,
            LOWER(auth_user.email) AS recipient_email,
            COALESCE(NULLIF(TRIM(profile_row.first_name), ''), 'there') AS recipient_first_name,
            'department'::TEXT AS summary_scope_type,
            department_row.id AS summary_scope_id,
            department_row.name AS summary_scope_name
        FROM due_sessions due
        JOIN public.departments department_row ON department_row.is_active IS TRUE
        JOIN public.profiles profile_row
            ON profile_row.id = department_row.head_user_id
            AND profile_row.is_active IS TRUE
            AND profile_row.email_notifications_enabled IS TRUE
        JOIN auth.users auth_user ON auth_user.id = profile_row.id
        WHERE auth_user.email IS NOT NULL
            AND auth_user.email_confirmed_at IS NOT NULL
            AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= scheduler_time)
            AND LOWER(auth_user.email) NOT LIKE 'worker.%@harvestersng.org'
            AND EXISTS (
                SELECT 1
                FROM classified_roster worker_scope
                WHERE worker_scope.session_id = due.session_id
                    AND worker_scope.department_id = department_row.id
            )

        UNION ALL

        SELECT
            due.event_id,
            due.session_id,
            due.occurrence_key,
            due.event_title,
            due.scheduled_start_at AS event_start_at,
            due.scheduled_end_at AS event_end_at,
            due.event_timezone,
            due.location_name,
            due.due_at,
            profile_row.id AS recipient_user_id,
            LOWER(auth_user.email) AS recipient_email,
            COALESCE(NULLIF(TRIM(profile_row.first_name), ''), 'there') AS recipient_first_name,
            'team'::TEXT AS summary_scope_type,
            team_row.id AS summary_scope_id,
            team_row.name AS summary_scope_name
        FROM due_sessions due
        JOIN public.team_leaders team_leader_row ON team_leader_row.is_active IS TRUE
        JOIN public.teams team_row
            ON team_row.id = team_leader_row.team_id
            AND team_row.is_active IS TRUE
        JOIN public.profiles profile_row
            ON profile_row.id = team_leader_row.user_id
            AND profile_row.is_active IS TRUE
            AND profile_row.email_notifications_enabled IS TRUE
        JOIN auth.users auth_user ON auth_user.id = profile_row.id
        WHERE auth_user.email IS NOT NULL
            AND auth_user.email_confirmed_at IS NOT NULL
            AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= scheduler_time)
            AND LOWER(auth_user.email) NOT LIKE 'worker.%@harvestersng.org'
            AND EXISTS (
                SELECT 1
                FROM classified_roster worker_scope
                WHERE worker_scope.session_id = due.session_id
                    AND worker_scope.team_id = team_row.id
            )

        UNION ALL

        SELECT
            due.event_id,
            due.session_id,
            due.occurrence_key,
            due.event_title,
            due.scheduled_start_at AS event_start_at,
            due.scheduled_end_at AS event_end_at,
            due.event_timezone,
            due.location_name,
            due.due_at,
            profile_row.id AS recipient_user_id,
            LOWER(auth_user.email) AS recipient_email,
            COALESCE(NULLIF(TRIM(profile_row.first_name), ''), 'there') AS recipient_first_name,
            'global'::TEXT AS summary_scope_type,
            NULL::UUID AS summary_scope_id,
            'All Departments'::TEXT AS summary_scope_name
        FROM due_sessions due
        JOIN public.profiles profile_row
            ON profile_row.role IN ('admin', 'super_admin')
            AND profile_row.is_active IS TRUE
            AND profile_row.email_notifications_enabled IS TRUE
        JOIN auth.users auth_user ON auth_user.id = profile_row.id
        WHERE auth_user.email IS NOT NULL
            AND auth_user.email_confirmed_at IS NOT NULL
            AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= scheduler_time)
            AND LOWER(auth_user.email) NOT LIKE 'worker.%@harvestersng.org'
            AND EXISTS (
                SELECT 1
                FROM classified_roster worker_scope
                WHERE worker_scope.session_id = due.session_id
            )
    ),
    prioritized_recipients AS (
        SELECT DISTINCT ON (candidates.occurrence_key, candidates.recipient_user_id)
            candidates.*
        FROM candidate_recipients candidates
        ORDER BY
            candidates.occurrence_key,
            candidates.recipient_user_id,
            CASE candidates.summary_scope_type
                WHEN 'department' THEN 1
                WHEN 'team' THEN 2
                ELSE 3
            END
    ),
    aggregated_recipients AS (
        SELECT
            recipients.event_id,
            recipients.session_id,
            recipients.occurrence_key,
            recipients.recipient_user_id,
            recipients.recipient_email,
            recipients.recipient_first_name,
            recipients.summary_scope_type,
            recipients.summary_scope_id,
            recipients.summary_scope_name,
            COUNT(classified.user_id)::INTEGER AS expected_count,
            COUNT(classified.user_id) FILTER (WHERE classified.worker_status = 'checked_in')::INTEGER AS checked_in_count,
            COUNT(classified.user_id) FILTER (WHERE classified.worker_status = 'approved_leave')::INTEGER AS approved_leave_count,
            COUNT(classified.user_id) FILTER (WHERE classified.worker_status = 'missed')::INTEGER AS missed_count,
            recipients.event_title,
            recipients.event_start_at,
            recipients.event_end_at,
            recipients.event_timezone,
            recipients.location_name,
            recipients.due_at,
            scheduler_time AS next_attempt_at
        FROM prioritized_recipients recipients
        JOIN classified_roster classified
            ON classified.session_id = recipients.session_id
            AND (
                (recipients.summary_scope_type = 'department' AND classified.department_id = recipients.summary_scope_id)
                OR (recipients.summary_scope_type = 'team' AND classified.team_id = recipients.summary_scope_id)
                OR (recipients.summary_scope_type = 'global')
            )
        GROUP BY
            recipients.event_id,
            recipients.session_id,
            recipients.occurrence_key,
            recipients.recipient_user_id,
            recipients.recipient_email,
            recipients.recipient_first_name,
            recipients.summary_scope_type,
            recipients.summary_scope_id,
            recipients.summary_scope_name,
            recipients.event_title,
            recipients.event_start_at,
            recipients.event_end_at,
            recipients.event_timezone,
            recipients.location_name,
            recipients.due_at
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
        agg.event_id,
        agg.session_id,
        agg.occurrence_key,
        agg.recipient_user_id,
        agg.recipient_email,
        agg.recipient_first_name,
        agg.summary_scope_type,
        agg.summary_scope_id,
        agg.summary_scope_name,
        agg.expected_count,
        agg.checked_in_count,
        agg.approved_leave_count,
        agg.missed_count,
        agg.event_title,
        agg.event_start_at,
        agg.event_end_at,
        agg.event_timezone,
        agg.location_name,
        agg.due_at,
        agg.next_attempt_at
    FROM aggregated_recipients agg
    WHERE agg.expected_count > 0
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

-- 6. Update public.claim_email_notification_jobs to prevent cancelling manual session jobs
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
                AND job.reminder_lead_minutes > 0
                AND job.event_start_at <= NOW()
                THEN 'Reminder expired before delivery'
            WHEN job.notification_type = 'event_reminder'
                AND (
                    job.reminder_lead_minutes > 0
                    OR NOT EXISTS (
                        SELECT 1
                        FROM public.attendance_sessions session_row
                        WHERE session_row.id = job.session_id
                            AND session_row.started_by_mode = 'manual'
                    )
                )
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
            WHEN job.notification_type = 'attendance_follow_up'
                AND NOT EXISTS (
                    SELECT 1
                    FROM public.attendance_sessions session_row
                    WHERE session_row.id = job.session_id
                        AND session_row.started_by_mode = 'manual'
                )
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
                    OR (job.reminder_lead_minutes > 0 AND job.event_start_at <= NOW())
                    OR (
                        (
                            job.reminder_lead_minutes > 0
                            OR NOT EXISTS (
                                SELECT 1
                                FROM public.attendance_sessions session_row
                                WHERE session_row.id = job.session_id
                                    AND session_row.started_by_mode = 'manual'
                            )
                        )
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
                        )
                    )
                )
            )
            OR (
                job.notification_type = 'attendance_follow_up'
                AND (
                    (
                        NOT EXISTS (
                            SELECT 1
                            FROM public.attendance_sessions session_row
                            WHERE session_row.id = job.session_id
                                AND session_row.started_by_mode = 'manual'
                        )
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
                        )
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
        SELECT id
        FROM public.email_notification_jobs
        WHERE status IN ('pending', 'retry')
            AND next_attempt_at <= NOW()
            AND due_at <= NOW()
            AND (
                p_notification_types IS NULL
                OR notification_type = ANY(p_notification_types)
            )
        ORDER BY due_at ASC, created_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.email_notification_jobs job
    SET
        status = 'processing',
        locked_at = NOW(),
        locked_by = p_worker_id,
        attempt_count = job.attempt_count + 1,
        next_attempt_at = NOW() + MAKE_INTERVAL(mins => p_lock_timeout_minutes)
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
