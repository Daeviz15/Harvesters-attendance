-- ==============================================================================
-- MULTI-BRANCH LOCATIONS SCHEMA SETUP
-- Run this in your Supabase SQL Editor to upgrade the database.
-- ==============================================================================

-- 1. Create the locations table
CREATE TABLE IF NOT EXISTS locations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius DOUBLE PRECISION NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. Insert the default branch (Headquarters) using existing environment coordinates
-- This ensures the app doesn't break for existing users while the admin sets up other branches.
INSERT INTO locations (name, latitude, longitude, radius, is_active)
VALUES (
    'Headquarters', 
    6.436922040008514, 
    3.5185624946131786, 
    100, 
    true
)
ON CONFLICT DO NOTHING;

-- 3. Enable Row Level Security
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies

-- Policy 1: Everyone (authenticated workers) can view active locations
-- This allows the dashboard to fetch locations for calculating check-in distances.
CREATE POLICY "Anyone can view active locations"
ON locations FOR SELECT
TO authenticated
USING (is_active = true OR public.is_admin());

-- Policy 2: Admins can manage locations
CREATE POLICY "Admins can insert locations"
ON locations FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update locations"
ON locations FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete locations"
ON locations FOR DELETE
TO authenticated
USING (public.is_admin());
