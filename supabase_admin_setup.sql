-- ==============================================================================
-- ADMIN PANEL & EVENT SESSIONS SCHEMA SETUP
-- Run this in your Supabase SQL Editor to upgrade the database.
-- ==============================================================================
-- 1. Create an optimized helper function for Admin checks
-- The STABLE keyword ensures this is only evaluated ONCE per query, not per-row,
-- which prevents massive performance bottlenecks when querying thousands of rows.
CREATE OR REPLACE FUNCTION public.is_admin() 
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- 2. Create the `events` table (Dynamic Events)
CREATE TABLE events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS for Events
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Everyone can read events
CREATE POLICY "Anyone can view events" 
ON events FOR SELECT TO authenticated USING (true);

-- Only admins can create, update, or delete events
CREATE POLICY "Admins can manage events" 
ON events FOR ALL TO authenticated 
USING ( public.is_admin() )
WITH CHECK ( public.is_admin() );


-- 2. Create the `attendance_sessions` table
CREATE TABLE attendance_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL,
    created_by UUID REFERENCES profiles(id) NOT NULL,
    status TEXT CHECK (status IN ('active', 'ended')) DEFAULT 'active' NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE
);

-- Guard to ensure an event can only have ONE active session at a time
CREATE UNIQUE INDEX one_active_session_per_event
ON attendance_sessions (event_id)
WHERE status = 'active';

-- Enable RLS for Sessions
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;

-- Everyone can read sessions (so workers know when check-in is active)
CREATE POLICY "Anyone can view sessions" 
ON attendance_sessions FOR SELECT TO authenticated USING (true);

-- Only admins can create/update sessions
CREATE POLICY "Admins can manage sessions" 
ON attendance_sessions FOR ALL TO authenticated 
USING ( public.is_admin() )
WITH CHECK ( public.is_admin() );


-- 3. Modify existing `attendance_logs` to link to sessions
ALTER TABLE attendance_logs 
ADD COLUMN session_id UUID REFERENCES attendance_sessions(id) ON DELETE CASCADE;

-- CRITICAL PERFORMANCE INDEX: Ensures auto-checkout is instantaneous 
-- even with millions of historical attendance logs.
CREATE INDEX idx_attendance_logs_session_id ON attendance_logs(session_id);

-- Drop the old constraint that limited 1 active session per user globally, 
-- because now users can have 1 active log *per session*.
DROP INDEX IF EXISTS one_active_session_per_user;

-- Create the new constraint: A user can only check in ONCE per session
CREATE UNIQUE INDEX one_checkin_per_user_per_session
ON attendance_logs (user_id, session_id)
WHERE status = 'active';


-- 5. Add Admin-Level RLS Policies to existing tables
-- Admins can read and update ALL attendance logs
CREATE POLICY "Admins can view all attendance"
ON attendance_logs FOR SELECT TO authenticated
USING ( public.is_admin() );

CREATE POLICY "Admins can update all attendance"
ON attendance_logs FOR UPDATE TO authenticated
USING ( public.is_admin() );

-- Admins can view and update ALL profiles
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT TO authenticated
USING ( public.is_admin() );

CREATE POLICY "Admins can update all profiles"
ON profiles FOR UPDATE TO authenticated
USING ( public.is_admin() );


-- 6. Automated Server-Side Auto-Checkout Function
-- This RPC is called by the Admin when they click "End Session"
CREATE OR REPLACE FUNCTION end_attendance_session(session_uuid UUID)
RETURNS void AS $$
BEGIN
    -- SECURITY CHECK: Ensure only admins can trigger this function
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can end sessions';
    END IF;

    -- 1. Mark the session as ended
    UPDATE attendance_sessions
    SET status = 'ended', end_time = NOW()
    WHERE id = session_uuid AND status = 'active';

    -- 2. Automatically check out all active workers in this session
    UPDATE attendance_logs
    SET status = 'auto_completed', check_out_time = NOW()
    WHERE session_id = session_uuid AND status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. Add to Realtime Publication
-- We need attendance_sessions to broadcast instantly to worker phones
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_sessions;


-- ==============================================================================
-- ADMIN PROMOTION SCRIPT (Run this manually whenever you need a new Admin)
-- ==============================================================================

-- HOW TO USE: Replace 'david@example.com' with the exact email address 
-- of the user you want to make an admin, then highlight and run this single block.

/*
UPDATE profiles
SET role = 'admin'
WHERE id = (
    SELECT id FROM auth.users WHERE email = 'david@example.com'
);
*/
