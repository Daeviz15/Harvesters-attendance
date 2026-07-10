-- ========================================================================================
-- DATA MIGRATION: Team Hierarchy & Department Seeding
-- Run this in your Supabase SQL Editor
-- ========================================================================================

-- 1. Add `team` column to `departments` table
ALTER TABLE public.departments
ADD COLUMN IF NOT EXISTS team TEXT CHECK (team IN ('PROGRAMS', 'MINISTRY', 'MATURITY', 'MEMBERSHIP', 'MISSIONS', 'NEXT GEN') OR team IS NULL);

-- 2. Add `team` column to `profiles` table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS team TEXT CHECK (team IN ('PROGRAMS', 'MINISTRY', 'MATURITY', 'MEMBERSHIP', 'MISSIONS', 'NEXT GEN') OR team IS NULL);

-- 3. Add `team` column to `attendance_logs` table (for robust historical reporting)
ALTER TABLE public.attendance_logs
ADD COLUMN IF NOT EXISTS team TEXT CHECK (team IN ('PROGRAMS', 'MINISTRY', 'MATURITY', 'MEMBERSHIP', 'MISSIONS', 'NEXT GEN') OR team IS NULL);

-- 4. Detach existing workers from their current departments to prevent foreign key errors
UPDATE public.profiles
SET department_id = NULL, department = NULL;

-- 6. Drop the old global unique name constraint (if it exists) to allow same-named departments in different teams
DROP INDEX IF EXISTS departments_name_lower_unique;

-- 7. Create a new composite unique constraint on (lower(name), team)
CREATE UNIQUE INDEX IF NOT EXISTS departments_name_team_lower_unique ON public.departments (lower(name), team);

-- 8. Clear existing departments
DELETE FROM public.departments;

-- 9. Seed new departments categorized by team
INSERT INTO public.departments (name, team, is_active, description) VALUES
-- PROGRAMS
('Venue Management', 'PROGRAMS', true, null),
('Experience and Feedback', 'PROGRAMS', true, null),
('Crowd Control', 'PROGRAMS', true, null),
('Ushering', 'PROGRAMS', true, null),
('Choir', 'PROGRAMS', true, null),
('Service Programming', 'PROGRAMS', true, null),
('HIU', 'PROGRAMS', true, null),
('Traffic', 'PROGRAMS', true, null),
('Greeters', 'PROGRAMS', true, null),
('Quality Assurance', 'PROGRAMS', true, null),
('Content Creation', 'PROGRAMS', true, null),
('Protocol', 'PROGRAMS', true, null),
('Sound', 'PROGRAMS', true, null),
('Event Planning', 'PROGRAMS', true, null),
('General Service', 'PROGRAMS', true, null),
('Finance', 'PROGRAMS', true, null),
('Multi Media', 'PROGRAMS', true, null),
('Photography', 'PROGRAMS', true, null),
('Videography', 'PROGRAMS', true, null),

-- MINISTRY
('Leadership Training', 'MINISTRY', true, null),
('Workers Celebration', 'MINISTRY', true, null),
('Learning and Growth', 'MINISTRY', true, null),
('Workers Care', 'MINISTRY', true, null),
('Medical', 'MINISTRY', true, null),
('Career and Business', 'MINISTRY', true, null),
('Database Management', 'MINISTRY', true, null),
('Rec, Ass and Onboarding', 'MINISTRY', true, null),
('Ministry Outreach', 'MINISTRY', true, null),

-- MATURITY
('Intercessory', 'MATURITY', true, null),
('Prayer', 'MATURITY', true, null),
('Bible Study', 'MATURITY', true, null),
('Mid Week', 'MATURITY', true, null),
('Foundation', 'MATURITY', true, null),
('Book Club', 'MATURITY', true, null),
('Pastoral Care', 'MATURITY', true, null),
('Database', 'MATURITY', true, null),
('Assimilation', 'MATURITY', true, null),
('In service', 'MATURITY', true, null),

-- MEMBERSHIP
('Guest Welcome', 'MEMBERSHIP', true, null),
('Growth Track', 'MEMBERSHIP', true, null),
('Call Center', 'MEMBERSHIP', true, null),
('Data Management', 'MEMBERSHIP', true, null),
('Info Desk', 'MEMBERSHIP', true, null),
('Counseling', 'MEMBERSHIP', true, null),
('New Convert and Rededication', 'MEMBERSHIP', true, null),
('Ceremonies', 'MEMBERSHIP', true, null),
('Follow Up', 'MEMBERSHIP', true, null),
('Benevolence', 'MEMBERSHIP', true, null),

-- MISSIONS
('NLP', 'MISSIONS', true, null),
('Outreach', 'MISSIONS', true, null),
('Publicity', 'MISSIONS', true, null),
('HAEF', 'MISSIONS', true, null),
('Mobilisation', 'MISSIONS', true, null),
('Data Management', 'MISSIONS', true, null),
('Evangelism', 'MISSIONS', true, null),

-- NEXT GEN
('Kids Zone', 'NEXT GEN', true, null),
('Stir House', 'NEXT GEN', true, null);
