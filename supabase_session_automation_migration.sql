-- ================================================================================
-- AUTOMATED ATTENDANCE SESSION SCHEDULER
-- Run this after supabase_event_schedule_migration.sql.
--
-- What it does:
-- 1. Adds automation metadata to attendance_sessions.
-- 2. Creates idempotent database functions for manual and automatic starts.
-- 3. Updates session ending so manual and automatic endings share one path.
-- 4. Schedules a Supabase Cron job to start/end sessions every minute.
-- ================================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE public.attendance_sessions REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
            AND schemaname = 'public'
            AND tablename = 'attendance_sessions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_sessions;
    END IF;
END;
$$;

ALTER TABLE public.attendance_sessions
ALTER COLUMN created_by DROP NOT NULL,
ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS scheduled_end_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS occurrence_key TEXT,
ADD COLUMN IF NOT EXISTS started_by_mode TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS ended_by_mode TEXT,
ADD COLUMN IF NOT EXISTS auto_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS auto_ended_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.attendance_sessions
DROP CONSTRAINT IF EXISTS attendance_sessions_started_by_mode_check;

ALTER TABLE public.attendance_sessions
ADD CONSTRAINT attendance_sessions_started_by_mode_check
CHECK (started_by_mode IN ('manual', 'auto'));

ALTER TABLE public.attendance_sessions
DROP CONSTRAINT IF EXISTS attendance_sessions_ended_by_mode_check;

ALTER TABLE public.attendance_sessions
ADD CONSTRAINT attendance_sessions_ended_by_mode_check
CHECK (ended_by_mode IS NULL OR ended_by_mode IN ('manual', 'auto'));

ALTER TABLE public.attendance_sessions
DROP CONSTRAINT IF EXISTS attendance_sessions_manual_created_by_check;

ALTER TABLE public.attendance_sessions
ADD CONSTRAINT attendance_sessions_manual_created_by_check
CHECK (started_by_mode = 'auto' OR created_by IS NOT NULL);

ALTER TABLE public.attendance_sessions
DROP CONSTRAINT IF EXISTS attendance_sessions_scheduled_range_check;

ALTER TABLE public.attendance_sessions
ADD CONSTRAINT attendance_sessions_scheduled_range_check
CHECK (scheduled_start_at IS NULL OR scheduled_end_at IS NULL OR scheduled_end_at > scheduled_start_at);

CREATE UNIQUE INDEX IF NOT EXISTS one_session_per_event_occurrence
ON public.attendance_sessions (event_id, occurrence_key)
WHERE occurrence_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_auto_end
ON public.attendance_sessions (status, scheduled_end_at)
WHERE scheduled_end_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.event_occurrence_window(
    event_row public.events,
    reference_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    scheduled_start_at TIMESTAMP WITH TIME ZONE,
    scheduled_end_at TIMESTAMP WITH TIME ZONE,
    occurrence_key TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    local_timestamp TIMESTAMP WITHOUT TIME ZONE;
    local_date DATE;
    local_day_name TEXT;
    occurrence_matches BOOLEAN := FALSE;
    occurrence_start TIMESTAMP WITHOUT TIME ZONE;
    occurrence_end TIMESTAMP WITHOUT TIME ZONE;
BEGIN
    local_timestamp := reference_time AT TIME ZONE COALESCE(NULLIF(event_row.timezone, ''), 'Africa/Lagos');
    local_date := local_timestamp::DATE;
    local_day_name := TRIM(TO_CHAR(local_date, 'Day'));

    IF local_date < event_row.start_date THEN
        RETURN;
    END IF;

    occurrence_matches := CASE event_row.schedule_frequency
        WHEN 'once' THEN local_date = event_row.start_date
        WHEN 'daily' THEN TRUE
        WHEN 'weekly' THEN event_row.recurrence_day = local_day_name
        WHEN 'monthly' THEN event_row.recurrence_month_day = EXTRACT(DAY FROM local_date)::INTEGER
        WHEN 'yearly' THEN event_row.recurrence_month = EXTRACT(MONTH FROM local_date)::INTEGER
            AND event_row.recurrence_month_day = EXTRACT(DAY FROM local_date)::INTEGER
        ELSE FALSE
    END;

    IF NOT occurrence_matches THEN
        RETURN;
    END IF;

    occurrence_start := local_date::TIMESTAMP + event_row.start_time;
    occurrence_end := local_date::TIMESTAMP + event_row.end_time;

    scheduled_start_at := occurrence_start AT TIME ZONE COALESCE(NULLIF(event_row.timezone, ''), 'Africa/Lagos');
    scheduled_end_at := occurrence_end AT TIME ZONE COALESCE(NULLIF(event_row.timezone, ''), 'Africa/Lagos');

    IF reference_time >= scheduled_end_at THEN
        RETURN;
    END IF;

    occurrence_key := event_row.id::TEXT || ':' || TO_CHAR(scheduled_start_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI');
    RETURN NEXT;
END;
$$;

DROP FUNCTION IF EXISTS public.start_attendance_session(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.start_attendance_session(
    event_uuid UUID,
    actor_uuid UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    selected_event public.events%ROWTYPE;
    active_session_id UUID;
    created_session_id UUID;
    window_record RECORD;
    schedule_duration INTERVAL;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can begin sessions';
    END IF;

    SELECT id INTO active_session_id
    FROM public.attendance_sessions
    WHERE event_id = event_uuid AND status = 'active'
    LIMIT 1;

    IF active_session_id IS NOT NULL THEN
        RETURN active_session_id;
    END IF;

    SELECT * INTO selected_event
    FROM public.events
    WHERE id = event_uuid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found';
    END IF;

    SELECT * INTO window_record
    FROM public.event_occurrence_window(selected_event, NOW())
    LIMIT 1;

    IF window_record.scheduled_start_at IS NULL THEN
        schedule_duration := selected_event.end_time - selected_event.start_time;
        window_record.scheduled_start_at := NOW();
        window_record.scheduled_end_at := NOW() + schedule_duration;
        window_record.occurrence_key := selected_event.id::TEXT || ':manual:' || TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI');
    END IF;

    INSERT INTO public.attendance_sessions (
        event_id,
        created_by,
        status,
        start_time,
        scheduled_start_at,
        scheduled_end_at,
        occurrence_key,
        started_by_mode,
        auto_started_at
    )
    SELECT
        selected_event.id,
        actor_uuid,
        'active',
        NOW(),
        window_record.scheduled_start_at,
        window_record.scheduled_end_at,
        window_record.occurrence_key,
        'manual',
        NULL
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.attendance_sessions
        WHERE event_id = selected_event.id AND status = 'active'
    )
    ON CONFLICT (event_id, occurrence_key) WHERE occurrence_key IS NOT NULL DO NOTHING
    RETURNING id INTO created_session_id;

    IF created_session_id IS NOT NULL THEN
        RETURN created_session_id;
    END IF;

    SELECT id INTO active_session_id
    FROM public.attendance_sessions
    WHERE event_id = selected_event.id
        AND status = 'active'
    ORDER BY start_time DESC
    LIMIT 1;

    IF active_session_id IS NULL THEN
        RAISE EXCEPTION 'This event occurrence already has a session and cannot be started again';
    END IF;

    RETURN active_session_id;
END;
$$;

DROP FUNCTION IF EXISTS public.end_attendance_session(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.end_attendance_session(
    session_uuid UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can end sessions';
    END IF;

    UPDATE public.attendance_sessions
    SET
        status = 'ended',
        end_time = NOW(),
        ended_by_mode = 'manual'
    WHERE id = session_uuid AND status = 'active';

    UPDATE public.attendance_logs
    SET status = 'auto_completed', check_out_time = NOW()
    WHERE session_id = session_uuid AND status = 'active';
END;
$$;

CREATE OR REPLACE FUNCTION public.run_attendance_session_scheduler(
    reference_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (started_count INTEGER, ended_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    due_event RECORD;
    new_session_id UUID;
BEGIN
    started_count := 0;
    ended_count := 0;

    IF NOT pg_try_advisory_xact_lock(hashtext('attendance-session-scheduler')) THEN
        RETURN NEXT;
        RETURN;
    END IF;

    WITH ended_sessions AS (
        UPDATE public.attendance_sessions
        SET
            status = 'ended',
            end_time = reference_time,
            ended_by_mode = 'auto',
            auto_ended_at = reference_time
        WHERE status = 'active'
            AND scheduled_end_at IS NOT NULL
            AND scheduled_end_at <= reference_time
        RETURNING id
    ), checked_out_logs AS (
        UPDATE public.attendance_logs
        SET status = 'auto_completed', check_out_time = reference_time
        WHERE status = 'active'
            AND session_id IN (SELECT id FROM ended_sessions)
        RETURNING id
    )
    SELECT COUNT(*)::INTEGER INTO ended_count
    FROM ended_sessions;

    FOR due_event IN
        SELECT e.id, occurrence.scheduled_start_at, occurrence.scheduled_end_at, occurrence.occurrence_key
        FROM public.events e
        CROSS JOIN LATERAL public.event_occurrence_window(e, reference_time) occurrence
        WHERE reference_time >= occurrence.scheduled_start_at
            AND reference_time < occurrence.scheduled_end_at
    LOOP
        new_session_id := NULL;

        INSERT INTO public.attendance_sessions (
            event_id,
            created_by,
            status,
            start_time,
            scheduled_start_at,
            scheduled_end_at,
            occurrence_key,
            started_by_mode,
            auto_started_at
        )
        SELECT
            due_event.id,
            NULL,
            'active',
            reference_time,
            due_event.scheduled_start_at,
            due_event.scheduled_end_at,
            due_event.occurrence_key,
            'auto',
            reference_time
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.attendance_sessions
            WHERE event_id = due_event.id AND status = 'active'
        )
        ON CONFLICT (event_id, occurrence_key) WHERE occurrence_key IS NOT NULL DO NOTHING
        RETURNING id INTO new_session_id;

        IF new_session_id IS NOT NULL THEN
            started_count := started_count + 1;
        END IF;
    END LOOP;

    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.event_occurrence_window(public.events, TIMESTAMP WITH TIME ZONE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_attendance_session_scheduler(TIMESTAMP WITH TIME ZONE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_attendance_session(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_attendance_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_attendance_session(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_attendance_session(UUID) TO authenticated;

DO $$
BEGIN
    PERFORM cron.unschedule('attendance-session-automation');
EXCEPTION
    WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
    'attendance-session-automation',
    '* * * * *',
    $$SELECT * FROM public.run_attendance_session_scheduler();$$
);

