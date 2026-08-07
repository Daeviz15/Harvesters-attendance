-- ==================================================================================
-- TEAM ADMIN RBAC FOUNDATION
--
-- Adds stable team identities and Team Admin assignment support while preserving the
-- existing text-based `team` columns for backwards compatibility.
-- ==================================================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'team_admin';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS teams_name_lower_unique
ON public.teams (LOWER(name));

CREATE UNIQUE INDEX IF NOT EXISTS teams_code_upper_unique
ON public.teams (UPPER(code));

INSERT INTO public.teams (name, code)
VALUES
    ('PROGRAMS', 'PROGRAMS'),
    ('MINISTRY', 'MINISTRY'),
    ('MATURITY', 'MATURITY'),
    ('MEMBERSHIP', 'MEMBERSHIP'),
    ('MISSIONS', 'MISSIONS'),
    ('NEXT GEN', 'NEXTGEN')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_teams_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_teams_updated_at ON public.teams;
CREATE TRIGGER touch_teams_updated_at
BEFORE UPDATE ON public.teams
FOR EACH ROW
EXECUTE FUNCTION public.touch_teams_updated_at();

ALTER TABLE public.departments
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE RESTRICT;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

UPDATE public.departments department_row
SET team_id = team_row.id
FROM public.teams team_row
WHERE department_row.team_id IS NULL
    AND department_row.team IS NOT NULL
    AND LOWER(TRIM(department_row.team)) = LOWER(team_row.name);

UPDATE public.profiles profile_row
SET team_id = department_row.team_id
FROM public.departments department_row
WHERE profile_row.team_id IS NULL
    AND profile_row.department_id = department_row.id
    AND department_row.team_id IS NOT NULL;

UPDATE public.profiles profile_row
SET team_id = team_row.id
FROM public.teams team_row
WHERE profile_row.team_id IS NULL
    AND profile_row.team IS NOT NULL
    AND LOWER(TRIM(profile_row.team)) = LOWER(team_row.name);

UPDATE public.events event_row
SET team_id = department_row.team_id
FROM public.departments department_row
WHERE event_row.team_id IS NULL
    AND event_row.department_id = department_row.id
    AND department_row.team_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.team_admin_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, team_id)
);

-- Product decision: a Team Admin is scoped to one team at a time.
CREATE UNIQUE INDEX IF NOT EXISTS team_admin_assignments_one_team_per_user
ON public.team_admin_assignments (user_id);

CREATE INDEX IF NOT EXISTS idx_team_admin_assignments_team_id
ON public.team_admin_assignments (team_id);

CREATE INDEX IF NOT EXISTS idx_departments_team_id
ON public.departments (team_id)
WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_team_id
ON public.profiles (team_id)
WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_team_id
ON public.events (team_id)
WHERE team_id IS NOT NULL;

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_admin_assignments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_super_admin()
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
      AND profile_row.role::text IN ('admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.get_managed_team_ids()
RETURNS TABLE (team_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT assignment.team_id
  FROM public.team_admin_assignments assignment
  JOIN public.profiles profile_row ON profile_row.id = assignment.user_id
  JOIN public.teams team_row ON team_row.id = assignment.team_id
  WHERE assignment.user_id = auth.uid()
    AND profile_row.role::text = 'team_admin'
    AND team_row.is_active = TRUE

  UNION

  SELECT profile_row.team_id
  FROM public.profiles profile_row
  JOIN public.teams team_row ON team_row.id = profile_row.team_id
  WHERE profile_row.id = auth.uid()
    AND profile_row.role::text = 'team_admin'
    AND profile_row.team_id IS NOT NULL
    AND team_row.is_active = TRUE;
$$;

CREATE OR REPLACE FUNCTION public.is_team_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.get_managed_team_ids());
$$;

CREATE OR REPLACE FUNCTION public.get_managed_department_ids()
RETURNS TABLE (department_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT department_row.id
  FROM public.departments department_row
  WHERE department_row.is_active = TRUE
    AND (
      department_row.head_user_id = auth.uid()
      OR department_row.team_id IN (SELECT managed.team_id FROM public.get_managed_team_ids() managed)
    );
$$;

CREATE OR REPLACE FUNCTION public.is_dept_head()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.departments department_row
    WHERE department_row.head_user_id = auth.uid()
      AND department_row.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_dept_head()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT public.is_super_admin() OR public.is_team_admin() OR public.is_dept_head();
$$;

DROP POLICY IF EXISTS "teams_select_authenticated" ON public.teams;
CREATE POLICY "teams_select_authenticated"
ON public.teams
FOR SELECT
TO authenticated
USING (is_active = TRUE OR public.is_super_admin());

DROP POLICY IF EXISTS "teams_super_admin_manage" ON public.teams;
CREATE POLICY "teams_super_admin_manage"
ON public.teams
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "team_admin_assignments_select_own_or_super" ON public.team_admin_assignments;
CREATE POLICY "team_admin_assignments_select_own_or_super"
ON public.team_admin_assignments
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "team_admin_assignments_super_admin_manage" ON public.team_admin_assignments;
CREATE POLICY "team_admin_assignments_super_admin_manage"
ON public.team_admin_assignments
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

GRANT SELECT ON TABLE public.teams TO authenticated;
GRANT SELECT ON TABLE public.team_admin_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teams TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.team_admin_assignments TO service_role;

REVOKE ALL ON FUNCTION public.get_managed_team_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_team_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_managed_department_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_dept_head() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_or_dept_head() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_managed_team_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_team_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_managed_department_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_dept_head() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_dept_head() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

COMMENT ON TABLE public.teams IS 'Canonical teams used for scoped Team Admin authorization.';
COMMENT ON TABLE public.team_admin_assignments IS 'Maps Team Admin users to the single team they are allowed to manage.';
COMMENT ON FUNCTION public.get_managed_team_ids() IS 'Returns active team IDs managed by the current Team Admin.';
COMMENT ON FUNCTION public.get_managed_department_ids() IS 'Returns active departments managed by the current user as Team Admin or Department Head.';

COMMIT;
