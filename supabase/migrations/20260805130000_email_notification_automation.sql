-- ==================================================================================
-- DURABLE EMAIL NOTIFICATION OUTBOX
-- Run after supabase_session_automation_migration.sql.
--
-- This migration:
-- 1. Captures the expected worker roster for every scheduled event occurrence.
-- 2. Enqueues reminder and missed-attendance messages exactly once per worker.
-- 3. Provides an atomic SKIP LOCKED claim API for horizontally scaled processors.
-- 4. Retries transient failures and recovers abandoned processing locks.
-- 5. Keeps recipient PII private behind service-role-only access.
-- ==================================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Existing events remain disabled to prevent an unexpected rollout blast. Admins
-- explicitly enable automation per event after reviewing its audience and timing.
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.event_occurrence_recipients (
    occurrence_key TEXT NOT NULL,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    first_name TEXT NOT NULL,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    department_name TEXT,
    captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (occurrence_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_occurrence_recipients_event
ON public.event_occurrence_recipients (event_id, occurrence_key);

CREATE TABLE IF NOT EXISTS public.email_notification_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_type TEXT NOT NULL
        CONSTRAINT email_notification_jobs_notification_type_check
        CHECK (notification_type IN ('welcome', 'event_reminder', 'attendance_follow_up')),
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
    occurrence_key TEXT NOT NULL,
    recipient_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    recipient_first_name TEXT NOT NULL,
    recipient_last_name TEXT,
    cc_emails TEXT[] NOT NULL DEFAULT '{}',
    worker_id TEXT,
    event_title TEXT,
    event_start_at TIMESTAMP WITH TIME ZONE,
    event_end_at TIMESTAMP WITH TIME ZONE,
    event_timezone TEXT,
    location_name TEXT,
    department_name TEXT,
    team_name TEXT,
    reminder_lead_minutes INTEGER CHECK (reminder_lead_minutes BETWEEN 1 AND 1440),
    due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CONSTRAINT email_notification_jobs_status_check
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
    CONSTRAINT email_notification_jobs_payload_check CHECK (
        (
            notification_type = 'welcome'
            AND event_id IS NULL
            AND worker_id IS NOT NULL
        ) OR (
            notification_type IN ('event_reminder', 'attendance_follow_up')
            AND event_id IS NOT NULL
            AND event_title IS NOT NULL
            AND event_start_at IS NOT NULL
            AND event_end_at IS NOT NULL
            AND event_timezone IS NOT NULL
            AND (
                notification_type <> 'event_reminder'
                OR reminder_lead_minutes IS NOT NULL
            )
        )
    ),
    CONSTRAINT email_notification_jobs_one_per_worker
        UNIQUE (notification_type, occurrence_key, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS idx_email_notification_jobs_claim
ON public.email_notification_jobs (status, next_attempt_at, due_at)
WHERE status IN ('pending', 'retry');

CREATE INDEX IF NOT EXISTS idx_email_notification_jobs_stale_locks
ON public.email_notification_jobs (locked_at)
WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_email_notification_jobs_session
ON public.email_notification_jobs (session_id)
WHERE session_id IS NOT NULL;

ALTER TABLE public.event_occurrence_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_notification_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_occurrence_recipients FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.email_notification_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_occurrence_recipients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_notification_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.touch_email_notification_job_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_email_notification_job_updated_at
ON public.email_notification_jobs;

CREATE TRIGGER touch_email_notification_job_updated_at
BEFORE UPDATE ON public.email_notification_jobs
FOR EACH ROW
EXECUTE FUNCTION public.touch_email_notification_job_updated_at();

REVOKE ALL ON FUNCTION public.touch_email_notification_job_updated_at()
FROM PUBLIC, anon, authenticated;

-- Welcome messages use the same durable outbox as scheduled notifications. The
-- function derives every recipient field from trusted database records so the
-- server action cannot enqueue a message to an arbitrary address.
CREATE OR REPLACE FUNCTION public.enqueue_welcome_email(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    queued_job_id UUID;
BEGIN
    INSERT INTO public.email_notification_jobs (
        notification_type,
        occurrence_key,
        recipient_user_id,
        recipient_email,
        recipient_first_name,
        recipient_last_name,
        worker_id,
        department_name,
        team_name,
        due_at,
        next_attempt_at
    )
    SELECT
        'welcome',
        'welcome:' || profile_row.id::TEXT || ':' || profile_row.worker_id,
        profile_row.id,
        LOWER(auth_user.email),
        COALESCE(NULLIF(TRIM(profile_row.first_name), ''), 'there'),
        NULLIF(TRIM(profile_row.last_name), ''),
        profile_row.worker_id,
        profile_row.department,
        profile_row.team,
        NOW(),
        NOW()
    FROM public.profiles profile_row
    JOIN auth.users auth_user ON auth_user.id = profile_row.id
    WHERE profile_row.id = p_user_id
        AND profile_row.onboarding_complete = TRUE
        AND profile_row.worker_id IS NOT NULL
        AND auth_user.email IS NOT NULL
        AND auth_user.email_confirmed_at IS NOT NULL
        AND LOWER(auth_user.email) NOT LIKE 'worker.%@harvestersng.org'
    ON CONFLICT (notification_type, occurrence_key, recipient_user_id)
    DO UPDATE SET recipient_user_id = EXCLUDED.recipient_user_id
    RETURNING id INTO queued_job_id;

    IF queued_job_id IS NULL THEN
        RAISE EXCEPTION 'A verified, fully onboarded worker is required';
    END IF;

    RETURN queued_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_welcome_email(UUID)
FROM PUBLIC, anon, authenticated;

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

    -- Capture recipients as soon as an event enters its reminder window. Calling the
    -- occurrence function at now + lead also handles events just after midnight.
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
        AND occurrence.scheduled_start_at > scheduler_time
        AND occurrence.scheduled_start_at <= scheduler_time + reminder_lead
        AND auth_user.email IS NOT NULL
        AND auth_user.email_confirmed_at IS NOT NULL
        AND LOWER(auth_user.email) NOT LIKE 'worker.%@harvestersng.org'
    ON CONFLICT (occurrence_key, user_id) DO NOTHING;

    -- Also capture a roster at session time. This covers events created inside the
    -- reminder window and transient scheduler outages before the event starts.
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
        AND session_row.started_by_mode = 'auto'
        AND session_row.occurrence_key IS NOT NULL
        AND session_row.scheduled_start_at IS NOT NULL
        AND session_row.scheduled_end_at IS NOT NULL
        AND session_row.scheduled_start_at <= scheduler_time
        AND session_row.scheduled_end_at + followup_delay + max_lateness >= scheduler_time
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
        AND session_row.started_by_mode = 'auto'
        AND session_row.status = 'ended'
        AND session_row.occurrence_key IS NOT NULL
        AND session_row.scheduled_start_at IS NOT NULL
        AND session_row.scheduled_end_at IS NOT NULL
        AND session_row.scheduled_end_at + followup_delay <= scheduler_time
        AND session_row.scheduled_end_at + followup_delay > scheduler_time - max_lateness
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

CREATE OR REPLACE FUNCTION public.claim_email_notification_jobs(
    p_worker_id UUID,
    p_batch_size INTEGER DEFAULT 20,
    p_lock_timeout_minutes INTEGER DEFAULT 10
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

    UPDATE public.email_notification_jobs
    SET
        status = 'retry',
        locked_at = NULL,
        locked_by = NULL,
        next_attempt_at = NOW(),
        last_error = COALESCE(last_error, 'Processing lock expired before completion')
    WHERE status = 'processing'
        AND locked_at < NOW() - MAKE_INTERVAL(mins => p_lock_timeout_minutes)
        AND attempt_count < max_attempts;

    UPDATE public.email_notification_jobs
    SET
        status = 'failed',
        locked_at = NULL,
        locked_by = NULL,
        last_error = COALESCE(last_error, 'Maximum delivery attempts exhausted')
    WHERE status = 'processing'
        AND locked_at < NOW() - MAKE_INTERVAL(mins => p_lock_timeout_minutes)
        AND attempt_count >= max_attempts;

    -- Revalidate mutable eligibility immediately before claiming. This prevents a
    -- queued message from being sent after an event is disabled, a worker opts out,
    -- attendance is corrected, leave is approved, or an occurrence is rescheduled.
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

CREATE OR REPLACE FUNCTION public.mark_email_notification_sent(
    p_job_id UUID,
    p_worker_id UUID,
    p_provider_message_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    UPDATE public.email_notification_jobs
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
        RAISE EXCEPTION 'Email job is not owned by this processor';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_email_notification_failed(
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
        status = CASE WHEN attempt_count >= max_attempts THEN 'failed' ELSE 'retry' END,
        next_attempt_at = CASE
            WHEN attempt_count >= max_attempts THEN next_attempt_at
            ELSE NOW() + MAKE_INTERVAL(
                mins => LEAST(60, POWER(2, GREATEST(attempt_count - 1, 0))::INTEGER)
            )
        END,
        locked_at = NULL,
        locked_by = NULL,
        last_error = LEFT(COALESCE(NULLIF(p_error, ''), 'Unknown delivery failure'), 2000)
    WHERE id = p_job_id
        AND status = 'processing'
        AND locked_by = p_worker_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Email job is not owned by this processor';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_due_email_notifications(
    TIMESTAMP WITH TIME ZONE, INTEGER, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_welcome_email(UUID)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_email_notification_jobs(UUID, INTEGER, INTEGER)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_email_notification_sent(UUID, UUID, TEXT)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_email_notification_failed(UUID, UUID, TEXT)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_due_email_notifications(
    TIMESTAMP WITH TIME ZONE, INTEGER, INTEGER, INTEGER
) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_welcome_email(UUID)
TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_email_notification_jobs(UUID, INTEGER, INTEGER)
TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_email_notification_sent(UUID, UUID, TEXT)
TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_email_notification_failed(UUID, UUID, TEXT)
TO service_role;

-- The HTTP caller is installed here but is not exposed to application users.
-- It reads the application URL and bearer secret from Supabase Vault at runtime.
CREATE OR REPLACE FUNCTION public.invoke_email_notification_processor()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    processor_url TEXT;
    processor_secret TEXT;
    request_id BIGINT;
BEGIN
    SELECT decrypted_secret INTO processor_url
    FROM vault.decrypted_secrets
    WHERE name = 'email_processor_base_url'
    ORDER BY updated_at DESC
    LIMIT 1;

    SELECT decrypted_secret INTO processor_secret
    FROM vault.decrypted_secrets
    WHERE name = 'email_cron_secret'
    ORDER BY updated_at DESC
    LIMIT 1;

    IF processor_url IS NULL
        OR processor_url !~ '^https://[^/]+/?$'
        OR processor_secret IS NULL
        OR LENGTH(processor_secret) NOT BETWEEN 32 AND 256
        OR processor_secret !~ '^[[:graph:]]+$' THEN
        RAISE EXCEPTION 'Email processor Vault secrets are missing or invalid';
    END IF;

    SELECT net.http_post(
        url := RTRIM(processor_url, '/') || '/api/internal/email-scheduler',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || processor_secret
        ),
        body := jsonb_build_object('invoked_at', NOW()),
        timeout_milliseconds := 55000
    ) INTO request_id;

    RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_email_notification_processor()
FROM PUBLIC, anon, authenticated, service_role;

-- Do not schedule the HTTP job until the two Vault secrets are configured.
-- Complete the commands in supabase_email_notification_cron_setup.sql after deployment.

COMMIT;
