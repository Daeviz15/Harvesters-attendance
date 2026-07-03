-- ========================================================================================
-- Add head_user_id column to departments table
-- Run this in your Supabase SQL Editor
-- ========================================================================================

-- This column tracks which worker is the "head" of each department.
-- It references the profiles table so it's automatically cleaned up if a user is deleted.

ALTER TABLE public.departments
ADD COLUMN head_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Optional: Add an index for fast lookups
CREATE INDEX idx_departments_head_user_id ON public.departments(head_user_id);
