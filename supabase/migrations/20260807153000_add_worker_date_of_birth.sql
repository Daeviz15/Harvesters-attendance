-- Add worker birthday support.
-- Stored as a DATE, not text, for validation, sorting, and future birthday reporting.

BEGIN;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS date_of_birth DATE;

COMMENT ON COLUMN public.profiles.date_of_birth
IS 'Worker date of birth collected during onboarding/profile completion. Access is controlled through existing profiles RLS and server-side RBAC.';

COMMIT;
