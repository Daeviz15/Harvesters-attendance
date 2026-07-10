-- 1. Data Cleanup: De-duplicate existing usernames for onboarded users.
-- If two users share the same name (e.g., "segun"), this appends a unique 4-character 
-- suffix from their user ID to their name so the unique index can be created.
UPDATE public.profiles p1
SET first_name = p1.first_name || '_' || substr(p1.id::text, 1, 4)
WHERE p1.onboarding_complete = true
AND EXISTS (
    SELECT 1 
    FROM public.profiles p2 
    WHERE lower(p2.first_name) = lower(p1.first_name) 
    AND p2.onboarding_complete = true
    AND p1.id != p2.id
);

-- 2. Enforce globally unique usernames (first_name) for fully onboarded users.
-- Uses a partial index to prevent Google Sign-In or initial signups from crashing 
-- if a default first name happens to conflict with an existing username.

CREATE UNIQUE INDEX IF NOT EXISTS profiles_first_name_lower_unique 
ON public.profiles (lower(first_name)) 
WHERE onboarding_complete = true;
