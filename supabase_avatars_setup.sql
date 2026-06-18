-- 1. Create a public storage bucket for avatars
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage RLS Policies
-- First, drop existing policies if any to prevent 'already exists' errors
DROP POLICY IF EXISTS "Avatar images are publicly accessible." ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload an avatar." ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update their own avatar." ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete their own avatar." ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatars." ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatars." ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatars." ON storage.objects;

-- Allow anyone to view avatars (public bucket)
CREATE POLICY "Avatar images are publicly accessible." 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'avatars' );

-- Allow authenticated users to upload their own avatar
CREATE POLICY "Users can upload their own avatars."
ON storage.objects FOR INSERT TO authenticated
WITH CHECK ( bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1] );

-- Allow users to update their own avatar
CREATE POLICY "Users can update their own avatars."
ON storage.objects FOR UPDATE TO authenticated
USING ( bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1] );

-- Allow users to delete their own avatar
CREATE POLICY "Users can delete their own avatars."
ON storage.objects FOR DELETE TO authenticated
USING ( bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1] );

-- 3. Add avatar_url to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 4. Add avatar_url to live_feed_events table
ALTER TABLE public.live_feed_events ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 5. Update the Handle Attendance Event Trigger to include avatar_url
CREATE OR REPLACE FUNCTION public.handle_attendance_event() 
RETURNS TRIGGER AS $$
DECLARE
    user_profile RECORD;
BEGIN
    -- Only trigger on 'active' (Check In) or 'completed' (Check Out)
    IF (TG_OP = 'INSERT' AND NEW.status = 'active') THEN
        -- Fetch profile data
        SELECT first_name, last_name, department, avatar_url INTO user_profile FROM public.profiles WHERE id = NEW.user_id;
        
        -- Insert into live_feed_events
        INSERT INTO public.live_feed_events (attendance_log_id, user_id, first_name, last_name, department, event_type, avatar_url)
        VALUES (NEW.id, NEW.user_id, COALESCE(user_profile.first_name, 'Unknown'), COALESCE(user_profile.last_name, ''), COALESCE(user_profile.department, 'Worker'), 'Checked In', user_profile.avatar_url);
        
    ELSIF (TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status = 'completed') THEN
        -- Fetch profile data
        SELECT first_name, last_name, department, avatar_url INTO user_profile FROM public.profiles WHERE id = NEW.user_id;
        
        -- Insert into live_feed_events
        INSERT INTO public.live_feed_events (attendance_log_id, user_id, first_name, last_name, department, event_type, avatar_url)
        VALUES (NEW.id, NEW.user_id, COALESCE(user_profile.first_name, 'Unknown'), COALESCE(user_profile.last_name, ''), COALESCE(user_profile.department, 'Worker'), 'Checked Out', user_profile.avatar_url);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
