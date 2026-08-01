-- ==============================================================================
-- EVENT DEPARTMENT SCOPING & AUTHORIZATION MIGRATION
-- Run this script in the Supabase SQL Editor.
-- Safe to re-run (all schema changes use IF NOT EXISTS / DROP IF EXISTS).
-- ==============================================================================

-- 1. Add department_id and created_by columns to events table
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Performance Index for fast department & creator filtering
CREATE INDEX IF NOT EXISTS idx_events_dept_created 
ON public.events (department_id, created_by);

-- 3. Update existing events without a created_by/department_id to NULL (Global Events)
-- Global events without department_id are accessible to Super Admins and visible to workers.

-- ==============================================================================
-- 4. FIX: Update Events RLS Policy to allow Department Heads to manage events
-- The original policy uses is_admin() which only checks role='admin'.
-- Department Heads have role='worker' but are identified via departments.head_user_id.
-- We replace it with is_admin_or_dept_head() which was created in the RBAC migration.
-- ==============================================================================

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Admins can manage events" ON public.events;

-- Create a new policy that allows both Super Admins AND Department Heads
CREATE POLICY "Admins and Dept Heads can manage events"
ON public.events FOR ALL TO authenticated
USING ( public.is_admin_or_dept_head() )
WITH CHECK ( public.is_admin_or_dept_head() );

-- ==============================================================================
-- 5. FIX: Update Session RPC Functions to allow Department Heads to start & end sessions
-- The stored procedures start_attendance_session and end_attendance_session previously checked
-- public.is_admin() (role='admin'). We update them to use public.is_admin_or_dept_head().
-- ==============================================================================

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
    IF NOT public.is_admin_or_dept_head() THEN
        RAISE EXCEPTION 'Unauthorized: Only admins or department heads can begin sessions';
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
        NOW()
    RETURNING id INTO created_session_id;

    RETURN created_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_attendance_session(
    session_uuid UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin_or_dept_head() THEN
        RAISE EXCEPTION 'Unauthorized: Only admins or department heads can end sessions';
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
