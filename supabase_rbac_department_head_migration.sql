-- ================================================================================
-- PRODUCTION-GRADE ROLE-BASED ACCESS CONTROL (RBAC) MIGRATION
-- Target Repository: Harvester Attendance App
-- Standards: OWASP Top 10 Authorization & NIST SP 800-162 ABAC
-- ================================================================================

-- 0. Safely append 'super_admin' to user_role ENUM if enum exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 1. Optimized Performance Indexes for Fast Department Filtering
CREATE INDEX IF NOT EXISTS idx_departments_head_user_id 
ON public.departments(head_user_id) 
WHERE head_user_id IS NOT NULL AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_profiles_department_id 
ON public.profiles(department_id) 
WHERE department_id IS NOT NULL;

-- 2. Helper Function: Get Array of Department IDs managed by current user
-- Marked STABLE SECURITY DEFINER for single-evaluation performance per query statement (eliminating N+1 row evaluation overhead)
CREATE OR REPLACE FUNCTION public.get_managed_department_ids()
RETURNS TABLE (department_id UUID) 
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id FROM public.departments 
  WHERE head_user_id = auth.uid() 
    AND is_active = TRUE;
$$;

-- 3. Helper Function: Is Current User a Department Head?
CREATE OR REPLACE FUNCTION public.is_dept_head()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.departments 
    WHERE head_user_id = auth.uid() 
      AND is_active = TRUE
  );
$$;

-- 4. Helper Function: Is Current User a Super Admin?
-- Casts role::text to safely support enum user_role without throwing PostgreSQL 22P02 type errors
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
      AND (role::text = 'admin' OR role::text = 'super_admin')
  );
$$;

-- 5. Helper Function: Master Admin Gatekeeper (Super Admin OR Department Head)
CREATE OR REPLACE FUNCTION public.is_admin_or_dept_head()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.is_super_admin() OR public.is_dept_head();
$$;

-- ================================================================================
-- RLS POLICIES FOR PROFILES
-- ================================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow Super Admins to view all profiles; Department Heads to view profiles in their managed department(s); Workers to view their own profile.
DROP POLICY IF EXISTS "profiles_select_rbac_policy" ON public.profiles;
CREATE POLICY "profiles_select_rbac_policy" ON public.profiles
FOR SELECT
USING (
  id = auth.uid() 
  OR public.is_super_admin() 
  OR department_id IN (SELECT department_id FROM public.get_managed_department_ids())
);

-- ================================================================================
-- RLS POLICIES FOR ATTENDANCE LOGS
-- ================================================================================
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_logs_select_rbac_policy" ON public.attendance_logs;
CREATE POLICY "attendance_logs_select_rbac_policy" ON public.attendance_logs
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_super_admin()
  OR user_id IN (
    SELECT id FROM public.profiles 
    WHERE department_id IN (SELECT department_id FROM public.get_managed_department_ids())
  )
);

-- Department Heads can insert check-in logs for workers in their managed department
DROP POLICY IF EXISTS "attendance_logs_insert_rbac_policy" ON public.attendance_logs;
CREATE POLICY "attendance_logs_insert_rbac_policy" ON public.attendance_logs
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  OR public.is_super_admin()
  OR user_id IN (
    SELECT id FROM public.profiles 
    WHERE department_id IN (SELECT department_id FROM public.get_managed_department_ids())
  )
);

-- Comments for documentation & auditing
COMMENT ON FUNCTION public.get_managed_department_ids() IS 'Returns department IDs managed by current user with STABLE execution performance.';
COMMENT ON FUNCTION public.is_super_admin() IS 'Evaluates if current user has unrestricted Super Admin privileges.';
