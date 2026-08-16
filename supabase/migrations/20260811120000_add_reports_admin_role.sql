-- Adds the reports-only administrative role.
--
-- This is intentionally small and idempotent. Some environments may use a
-- Postgres enum for profile roles while older ones may store role as text.
-- The guarded ALTER TYPE keeps both shapes safe.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'reports_admin';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_reports_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles profile_row
    WHERE profile_row.id = auth.uid()
      AND profile_row.is_active IS DISTINCT FROM FALSE
      AND profile_row.role::text = 'reports_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_reports_admin_department_ids()
RETURNS TABLE (department_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT department_row.id
  FROM public.profiles profile_row
  JOIN public.departments department_row
    ON department_row.team_id = profile_row.team_id
  WHERE profile_row.id = auth.uid()
    AND profile_row.is_active IS DISTINCT FROM FALSE
    AND profile_row.role::text = 'reports_admin'
    AND profile_row.team_id IS NOT NULL
    AND department_row.is_active = TRUE

  UNION

  SELECT department_row.id
  FROM public.profiles profile_row
  JOIN public.departments department_row
    ON department_row.id = profile_row.department_id
  WHERE profile_row.id = auth.uid()
    AND profile_row.is_active IS DISTINCT FROM FALSE
    AND profile_row.role::text = 'reports_admin'
    AND profile_row.team_id IS NULL
    AND profile_row.department_id IS NOT NULL
    AND department_row.is_active = TRUE;
$$;

CREATE OR REPLACE FUNCTION public.get_reports_admin_team_ids()
RETURNS TABLE (team_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT profile_row.team_id
  FROM public.profiles profile_row
  JOIN public.teams team_row ON team_row.id = profile_row.team_id
  WHERE profile_row.id = auth.uid()
    AND profile_row.is_active IS DISTINCT FROM FALSE
    AND profile_row.role::text = 'reports_admin'
    AND profile_row.team_id IS NOT NULL
    AND team_row.is_active = TRUE;
$$;

CREATE OR REPLACE FUNCTION public.has_global_reports_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles profile_row
      WHERE profile_row.id = auth.uid()
        AND profile_row.is_active IS DISTINCT FROM FALSE
        AND profile_row.role::text = 'reports_admin'
        AND profile_row.team_id IS NULL
        AND profile_row.department_id IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_reports_for_user(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT public.has_global_reports_access()
    OR EXISTS (
      SELECT 1
      FROM public.profiles profile_row
      WHERE profile_row.id = p_user_id
        AND profile_row.department_id IN (
          SELECT scoped.department_id
          FROM public.get_reports_admin_department_ids() scoped
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_reports_for_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT public.has_global_reports_access()
    OR EXISTS (
      SELECT 1
      FROM public.events event_row
      WHERE event_row.id = p_event_id
        AND (
          event_row.department_id IN (
            SELECT scoped.department_id
            FROM public.get_reports_admin_department_ids() scoped
          )
          OR event_row.team_id IN (
            SELECT scoped.team_id
            FROM public.get_reports_admin_team_ids() scoped
          )
        )
    );
$$;

CREATE INDEX IF NOT EXISTS idx_attendance_logs_user_id
ON public.attendance_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_event_id
ON public.attendance_sessions (event_id)
WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_department_id
ON public.events (department_id)
WHERE department_id IS NOT NULL;

DROP POLICY IF EXISTS "profiles_reports_admin_select" ON public.profiles;
CREATE POLICY "profiles_reports_admin_select"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  (SELECT public.has_global_reports_access())
  OR id = (SELECT auth.uid())
  OR department_id IN (
    SELECT scoped.department_id
    FROM public.get_reports_admin_department_ids() scoped
  )
);

DROP POLICY IF EXISTS "attendance_logs_reports_admin_select" ON public.attendance_logs;
CREATE POLICY "attendance_logs_reports_admin_select"
ON public.attendance_logs
FOR SELECT
TO authenticated
USING ((SELECT public.can_read_reports_for_user(user_id)));

DROP POLICY IF EXISTS "attendance_sessions_reports_admin_select" ON public.attendance_sessions;
CREATE POLICY "attendance_sessions_reports_admin_select"
ON public.attendance_sessions
FOR SELECT
TO authenticated
USING (
  (SELECT public.has_global_reports_access())
  OR public.can_read_reports_for_event(event_id)
);

DROP POLICY IF EXISTS "events_reports_admin_select" ON public.events;
CREATE POLICY "events_reports_admin_select"
ON public.events
FOR SELECT
TO authenticated
USING (
  (SELECT public.has_global_reports_access())
  OR department_id IN (
    SELECT scoped.department_id
    FROM public.get_reports_admin_department_ids() scoped
  )
  OR team_id IN (
    SELECT scoped.team_id
    FROM public.get_reports_admin_team_ids() scoped
  )
);

REVOKE ALL ON FUNCTION public.is_reports_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_reports_admin_department_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_reports_admin_team_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_global_reports_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_reports_for_user(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_reports_for_event(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_reports_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_reports_admin_department_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_reports_admin_team_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_global_reports_access() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_reports_for_user(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_reports_for_event(UUID) TO authenticated, service_role;
