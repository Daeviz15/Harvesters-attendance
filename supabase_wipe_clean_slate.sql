-- ==============================================================================
-- SUPABASE FRESH CLEAN SLATE RESET SCRIPT
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- Option A: Complete Database Clean Slate (Wipes ALL Users, Profiles & Testing Logs)
-- ------------------------------------------------------------------------------
-- Un-comment the block below if you want to wipe EVERYTHING (including all Admin accounts):

/*
BEGIN;

-- 1. Delete all attendance logs & sessions
TRUNCATE TABLE public.attendance_logs CASCADE;
TRUNCATE TABLE public.attendance_sessions CASCADE;

-- 2. Clear department heads references
UPDATE public.departments SET head_user_id = NULL;

-- 3. Delete leave requests if table exists
TRUNCATE TABLE public.leave_requests CASCADE;

-- 4. Delete all profiles
TRUNCATE TABLE public.profiles CASCADE;

-- 5. Wipe all users from Supabase Auth
DELETE FROM auth.users;

COMMIT;
*/


-- ------------------------------------------------------------------------------
-- Option B: Clean Slate EXCEPT Your Current Admin Account (RECOMMENDED)
-- ------------------------------------------------------------------------------
-- Keeps the current Admin account active so you don't get locked out or forced to re-register.
-- Replace 'admin@example.com' or keep role = 'admin' check below:

BEGIN;

-- 1. Clear all test attendance logs and sessions
TRUNCATE TABLE public.attendance_logs CASCADE;
TRUNCATE TABLE public.attendance_sessions CASCADE;

-- 2. Reset department heads
UPDATE public.departments SET head_user_id = NULL;

-- 3. Clear leave requests
TRUNCATE TABLE public.leave_requests CASCADE;

-- 4. Delete non-admin profiles
DELETE FROM public.profiles WHERE role != 'admin';

-- 5. Delete non-admin auth users from Supabase Auth
DELETE FROM auth.users WHERE id NOT IN (
    SELECT id FROM public.profiles WHERE role = 'admin'
);

COMMIT;
