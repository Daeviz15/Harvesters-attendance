-- ================================================================================
-- WORKER TEAM FILTER + DEPARTMENT HEAD SUPPORT
--
-- Ensures production databases have the department head column/indexes required by
-- the Workers page and keeps team/department filtering backed by indexed columns.
-- ================================================================================

ALTER TABLE public.departments
ADD COLUMN IF NOT EXISTS head_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS departments_one_head_per_worker
ON public.departments (head_user_id)
WHERE head_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_departments_head_user_id
ON public.departments (head_user_id)
WHERE head_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_departments_team_id
ON public.departments (team_id)
WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_team_id
ON public.profiles (team_id)
WHERE team_id IS NOT NULL;
