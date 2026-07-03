-- ================================================================================
-- MANAGED DEPARTMENTS
-- Run this before using the Admin Departments page.
--
-- What it does:
-- 1. Creates a departments table managed by admins.
-- 2. Adds a department_id foreign key to profiles while preserving profiles.department.
-- 3. Seeds the current hard-coded department list.
-- 4. Enables RLS so workers can read active departments and only admins can manage them.
-- ================================================================================

CREATE TABLE IF NOT EXISTS public.departments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    head_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.departments
ADD COLUMN IF NOT EXISTS head_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS departments_name_lower_unique
ON public.departments (LOWER(name));

CREATE UNIQUE INDEX IF NOT EXISTS departments_one_head_per_worker
ON public.departments (head_user_id)
WHERE head_user_id IS NOT NULL;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.touch_departments_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_departments_updated_at ON public.departments;
CREATE TRIGGER touch_departments_updated_at
BEFORE UPDATE ON public.departments
FOR EACH ROW
EXECUTE FUNCTION public.touch_departments_updated_at();

INSERT INTO public.departments (name)
VALUES
    ('Ushering'),
    ('Choir / Music'),
    ('Media / AV'),
    ('Protocol'),
    ('Children''s Church'),
    ('Security'),
    ('Technical'),
    ('Hospitality'),
    ('Sanitation'),
    ('Parking'),
    ('Prayer'),
    ('Follow-Up / Counseling')
ON CONFLICT DO NOTHING;

UPDATE public.profiles p
SET
    department_id = d.id,
    department = d.name
FROM public.departments d
WHERE p.department_id IS NULL
    AND LOWER(TRIM(SPLIT_PART(COALESCE(p.department, ''), ',', 1))) = LOWER(d.name);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view active departments" ON public.departments;
CREATE POLICY "Authenticated users can view active departments"
ON public.departments
FOR SELECT
TO authenticated
USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "Admins can manage departments" ON public.departments;
CREATE POLICY "Admins can manage departments"
ON public.departments
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_departments_active_name
ON public.departments (is_active, name);

CREATE INDEX IF NOT EXISTS idx_profiles_department_id
ON public.profiles (department_id);

CREATE INDEX IF NOT EXISTS idx_departments_head_user_id
ON public.departments (head_user_id)
WHERE head_user_id IS NOT NULL;
