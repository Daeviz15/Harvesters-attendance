-- ==================================================================================
-- TEAM ADMIN SESSION RPC SCOPE
--
-- Allows Team Admins / Department Heads to manually start and end sessions only for
-- events inside their scoped team/departments. Avoids broadening public.is_admin().
-- ==================================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.start_attendance_session(
    event_uuid UUID,
    actor_uuid UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    selected_event public.events%ROWTYPE;
    active_session_id UUID;
    created_session_id UUID;
    window_record RECORD;
    schedule_duration INTERVAL;
    caller_uuid UUID := auth.uid();
BEGIN
    IF caller_uuid IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Authentication is required to begin sessions';
    END IF;

    IF actor_uuid IS NOT NULL AND actor_uuid <> caller_uuid THEN
        RAISE EXCEPTION 'Unauthorized: Session actor does not match authenticated user';
    END IF;

    SELECT * INTO selected_event
    FROM public.events
    WHERE id = event_uuid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found';
    END IF;

    IF NOT (
        public.is_super_admin()
        OR selected_event.created_by = caller_uuid
        OR (
            selected_event.department_id IS NOT NULL
            AND selected_event.department_id IN (
                SELECT managed.department_id
                FROM public.get_managed_department_ids() managed
            )
        )
        OR (
            selected_event.team_id IS NOT NULL
            AND selected_event.team_id IN (
                SELECT managed.team_id
                FROM public.get_managed_team_ids() managed
            )
        )
    ) THEN
        RAISE EXCEPTION 'Unauthorized: You cannot begin sessions for this event';
    END IF;

    SELECT id INTO active_session_id
    FROM public.attendance_sessions
    WHERE event_id = event_uuid AND status = 'active'
    LIMIT 1;

    IF active_session_id IS NOT NULL THEN
        RETURN active_session_id;
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
        caller_uuid,
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

CREATE OR REPLACE FUNCTION public.end_attendance_session(
    session_uuid UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    session_event RECORD;
    caller_uuid UUID := auth.uid();
BEGIN
    IF caller_uuid IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Authentication is required to end sessions';
    END IF;

    SELECT
        session_row.id,
        event_row.created_by,
        event_row.department_id,
        event_row.team_id
    INTO session_event
    FROM public.attendance_sessions session_row
    JOIN public.events event_row ON event_row.id = session_row.event_id
    WHERE session_row.id = session_uuid
        AND session_row.status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found or already ended';
    END IF;

    IF NOT (
        public.is_super_admin()
        OR session_event.created_by = caller_uuid
        OR (
            session_event.department_id IS NOT NULL
            AND session_event.department_id IN (
                SELECT managed.department_id
                FROM public.get_managed_department_ids() managed
            )
        )
        OR (
            session_event.team_id IS NOT NULL
            AND session_event.team_id IN (
                SELECT managed.team_id
                FROM public.get_managed_team_ids() managed
            )
        )
    ) THEN
        RAISE EXCEPTION 'Unauthorized: You cannot end this session';
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

REVOKE ALL ON FUNCTION public.start_attendance_session(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_attendance_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_attendance_session(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.end_attendance_session(UUID) TO authenticated, service_role;

COMMIT;
