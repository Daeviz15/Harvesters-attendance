-- 1. Create the live_feed_events table
CREATE TABLE live_feed_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    attendance_log_id UUID REFERENCES attendance_logs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    department TEXT NOT NULL,
    event_type TEXT CHECK (event_type IN ('Checked In', 'Checked Out')) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. Turn on RLS and create policy
ALTER TABLE live_feed_events ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated user to view the live feed
CREATE POLICY "Anyone can view live feed" 
ON live_feed_events FOR SELECT 
TO authenticated 
USING (true);

-- 3. Create the Trigger Function
CREATE OR REPLACE FUNCTION public.handle_attendance_event() 
RETURNS TRIGGER AS $$
DECLARE
    user_profile RECORD;
BEGIN
    -- Only trigger on 'active' (Check In) or 'completed' (Check Out)
    IF (TG_OP = 'INSERT' AND NEW.status = 'active') THEN
        -- Fetch profile data
        SELECT first_name, last_name, department INTO user_profile FROM public.profiles WHERE id = NEW.user_id;
        
        -- Insert into live_feed_events
        INSERT INTO public.live_feed_events (attendance_log_id, user_id, first_name, last_name, department, event_type)
        VALUES (NEW.id, NEW.user_id, COALESCE(user_profile.first_name, 'Unknown'), COALESCE(user_profile.last_name, ''), COALESCE(user_profile.department, 'Worker'), 'Checked In');
        
    ELSIF (TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status = 'completed') THEN
        -- Fetch profile data
        SELECT first_name, last_name, department INTO user_profile FROM public.profiles WHERE id = NEW.user_id;
        
        -- Insert into live_feed_events
        INSERT INTO public.live_feed_events (attendance_log_id, user_id, first_name, last_name, department, event_type)
        VALUES (NEW.id, NEW.user_id, COALESCE(user_profile.first_name, 'Unknown'), COALESCE(user_profile.last_name, ''), COALESCE(user_profile.department, 'Worker'), 'Checked Out');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Attach the Trigger
DROP TRIGGER IF EXISTS on_attendance_event ON attendance_logs;
CREATE TRIGGER on_attendance_event
    AFTER INSERT OR UPDATE ON attendance_logs
    FOR EACH ROW EXECUTE PROCEDURE public.handle_attendance_event();

-- 5. Enable Realtime on the tables
-- This adds the tables to the supabase_realtime publication
alter publication supabase_realtime add table live_feed_events;
alter publication supabase_realtime add table attendance_logs;
