-- ==================================================================================
-- EMAIL PROCESSOR CRON ACTIVATION
-- Run this only after:
-- 1. supabase_email_notification_automation.sql has completed successfully.
-- 2. The application containing /api/internal/email-scheduler is deployed publicly.
-- 3. EMAIL_CRON_SECRET is configured in that deployed application.
--
-- First create the two named values in the Supabase Vault dashboard. Do not paste
-- the bearer secret into SQL, where it may be retained in query history or logs.
-- This script validates the Vault configuration and is safe to rerun.
-- ==================================================================================

BEGIN;

DO $$
DECLARE
    processor_base_url TEXT;
    processor_cron_secret TEXT;
BEGIN
    SELECT decrypted_secret INTO processor_base_url
    FROM vault.decrypted_secrets
    WHERE name = 'email_processor_base_url'
    ORDER BY updated_at DESC
    LIMIT 1;

    SELECT decrypted_secret INTO processor_cron_secret
    FROM vault.decrypted_secrets
    WHERE name = 'email_cron_secret'
    ORDER BY updated_at DESC
    LIMIT 1;

    IF processor_base_url IS NULL
        OR processor_base_url !~ '^https://[^/]+/?$' THEN
        RAISE EXCEPTION 'Vault secret email_processor_base_url must be a deployed HTTPS origin';
    END IF;

    IF processor_cron_secret IS NULL
        OR LENGTH(processor_cron_secret) NOT BETWEEN 32 AND 256
        OR processor_cron_secret !~ '^[[:graph:]]+$' THEN
        RAISE EXCEPTION 'Vault secret email_cron_secret must contain 32-256 printable random characters without spaces';
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'email-notification-processor'
    ) THEN
        PERFORM cron.unschedule('email-notification-processor');
    END IF;
END;
$$;

SELECT cron.schedule(
    'email-notification-processor',
    '* * * * *',
    $$SELECT public.invoke_email_notification_processor();$$
);

COMMIT;
