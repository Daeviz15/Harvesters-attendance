-- ================================================================================
-- WORKER BIRTHDAY FILTER SUPPORT
--
-- Adds generated month/day columns so birthday filters can stay server-side and
-- index-backed without exposing full-date calculations to application code.
-- ================================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS birthday_month SMALLINT
    GENERATED ALWAYS AS (EXTRACT(MONTH FROM date_of_birth)::SMALLINT) STORED,
ADD COLUMN IF NOT EXISTS birthday_day SMALLINT
    GENERATED ALWAYS AS (EXTRACT(DAY FROM date_of_birth)::SMALLINT) STORED;

CREATE INDEX IF NOT EXISTS idx_profiles_active_birthday_month_day
ON public.profiles (birthday_month, birthday_day, created_at DESC)
WHERE is_active = TRUE AND date_of_birth IS NOT NULL;
