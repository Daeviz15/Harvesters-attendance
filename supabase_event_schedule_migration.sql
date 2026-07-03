-- ==============================================================================
-- EVENT SCHEDULING MIGRATION
-- Run this in the Supabase SQL Editor before using the upgraded Events screen.
-- It is safe to re-run because every schema change uses IF NOT EXISTS.
-- ==============================================================================

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS recurrence_day TEXT,
ADD COLUMN IF NOT EXISTS schedule_frequency TEXT NOT NULL DEFAULT 'weekly',
ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS start_time TIME WITHOUT TIME ZONE NOT NULL DEFAULT '09:00',
ADD COLUMN IF NOT EXISTS end_time TIME WITHOUT TIME ZONE NOT NULL DEFAULT '11:00',
ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
ADD COLUMN IF NOT EXISTS recurrence_month INTEGER,
ADD COLUMN IF NOT EXISTS recurrence_month_day INTEGER,
ADD COLUMN IF NOT EXISTS recurrence_rule TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_schedule_frequency_check;

ALTER TABLE public.events
ADD CONSTRAINT events_schedule_frequency_check
CHECK (schedule_frequency IN ('once', 'daily', 'weekly', 'monthly', 'yearly'));

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_recurrence_month_check;

ALTER TABLE public.events
ADD CONSTRAINT events_recurrence_month_check
CHECK (recurrence_month IS NULL OR recurrence_month BETWEEN 1 AND 12);

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_recurrence_month_day_check;

ALTER TABLE public.events
ADD CONSTRAINT events_recurrence_month_day_check
CHECK (recurrence_month_day IS NULL OR recurrence_month_day BETWEEN 1 AND 31);

UPDATE public.events
SET
    schedule_frequency = CASE
        WHEN schedule_frequency IS NOT NULL THEN schedule_frequency
        WHEN recurrence_day IS NULL THEN 'once'
        ELSE 'weekly'
    END,
    start_time = COALESCE(start_time, TIME '09:00'),
    end_time = CASE
        WHEN end_time IS NULL OR end_time <= start_time THEN (COALESCE(start_time, TIME '09:00') + INTERVAL '2 hours')::TIME
        ELSE end_time
    END,
    timezone = COALESCE(NULLIF(timezone, ''), 'Africa/Lagos'),
    recurrence_month = CASE
        WHEN schedule_frequency = 'yearly' THEN COALESCE(recurrence_month, EXTRACT(MONTH FROM start_date)::INTEGER)
        ELSE recurrence_month
    END,
    recurrence_month_day = CASE
        WHEN schedule_frequency IN ('monthly', 'yearly') THEN COALESCE(recurrence_month_day, EXTRACT(DAY FROM start_date)::INTEGER)
        ELSE recurrence_month_day
    END,
    recurrence_rule = CASE recurrence_day
        WHEN 'Sunday' THEN 'FREQ=WEEKLY;INTERVAL=1;BYDAY=SU'
        WHEN 'Monday' THEN 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO'
        WHEN 'Tuesday' THEN 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU'
        WHEN 'Wednesday' THEN 'FREQ=WEEKLY;INTERVAL=1;BYDAY=WE'
        WHEN 'Thursday' THEN 'FREQ=WEEKLY;INTERVAL=1;BYDAY=TH'
        WHEN 'Friday' THEN 'FREQ=WEEKLY;INTERVAL=1;BYDAY=FR'
        WHEN 'Saturday' THEN 'FREQ=WEEKLY;INTERVAL=1;BYDAY=SA'
        ELSE recurrence_rule
    END
WHERE schedule_frequency IS NULL
    OR start_time IS NULL
    OR end_time IS NULL
    OR timezone IS NULL
    OR (schedule_frequency = 'yearly' AND recurrence_month IS NULL)
    OR (schedule_frequency IN ('monthly', 'yearly') AND recurrence_month_day IS NULL)
    OR recurrence_rule IS NULL;

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_valid_time_range_check;

ALTER TABLE public.events
ADD CONSTRAINT events_valid_time_range_check
CHECK (end_time > start_time);

CREATE INDEX IF NOT EXISTS idx_events_schedule
ON public.events (schedule_frequency, start_date, start_time, end_time);

CREATE OR REPLACE FUNCTION public.set_events_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_events_updated_at ON public.events;

CREATE TRIGGER set_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.set_events_updated_at();
