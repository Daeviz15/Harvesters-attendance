-- Production-safe worker removal support.
--
-- We intentionally soft-remove workers instead of deleting rows so attendance,
-- leave requests, reports, and audit trails remain intact.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS removed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_active_created_at
ON public.profiles (is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_removed_by
ON public.profiles (removed_by)
WHERE removed_by IS NOT NULL;

COMMENT ON COLUMN public.profiles.is_active
IS 'False when a profile is soft-removed from active app usage.';

COMMENT ON COLUMN public.profiles.removed_at
IS 'Timestamp when the profile was soft-removed. Historical records remain intact.';

COMMENT ON COLUMN public.profiles.removed_by
IS 'Admin profile that soft-removed this worker profile.';

CREATE OR REPLACE FUNCTION public.prevent_inactive_event_recipient()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles profile_row
        WHERE profile_row.id = NEW.user_id
            AND profile_row.is_active = TRUE
    ) THEN
        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_inactive_event_recipient_insert ON public.event_occurrence_recipients;
CREATE TRIGGER prevent_inactive_event_recipient_insert
BEFORE INSERT ON public.event_occurrence_recipients
FOR EACH ROW
EXECUTE FUNCTION public.prevent_inactive_event_recipient();

CREATE OR REPLACE FUNCTION public.prevent_inactive_email_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles profile_row
        WHERE profile_row.id = NEW.recipient_user_id
            AND profile_row.is_active = TRUE
    ) THEN
        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_inactive_email_job_insert ON public.email_notification_jobs;
CREATE TRIGGER prevent_inactive_email_job_insert
BEFORE INSERT ON public.email_notification_jobs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_inactive_email_job();

CREATE OR REPLACE FUNCTION public.cancel_removed_worker_email_work()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
        DELETE FROM public.event_occurrence_recipients
        WHERE user_id = NEW.id;

        UPDATE public.email_notification_jobs
        SET
            status = 'cancelled',
            locked_at = NULL,
            locked_by = NULL,
            last_error = COALESCE(last_error, 'Worker profile was removed before delivery'),
            updated_at = NOW()
        WHERE recipient_user_id = NEW.id
            AND status IN ('pending', 'retry', 'processing');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cancel_removed_worker_email_work_update ON public.profiles;
CREATE TRIGGER cancel_removed_worker_email_work_update
AFTER UPDATE OF is_active ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.cancel_removed_worker_email_work();
