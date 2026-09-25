-- Reactivate the protected email processor after recipient scoping,
-- delivery idempotency, and leadership summary hardening have been deployed.
--
-- The application-level EMAIL_AUTOMATION_ENABLED switch remains the delivery
-- kill switch. This migration only schedules the authenticated processor call.

BEGIN;

DO $activation$
DECLARE
    processor_base_url TEXT;
    processor_cron_secret TEXT;
    existing_job_id BIGINT;
    scheduled_job_id BIGINT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron'
    ) THEN
        RAISE EXCEPTION 'The pg_cron extension must be enabled before email scheduling';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_net'
    ) THEN
        RAISE EXCEPTION 'The pg_net extension must be enabled before email scheduling';
    END IF;

    IF TO_REGPROCEDURE('public.invoke_email_notification_processor()') IS NULL THEN
        RAISE EXCEPTION 'The protected email processor invocation function is missing';
    END IF;

    IF HAS_FUNCTION_PRIVILEGE(
        'anon',
        'public.invoke_email_notification_processor()',
        'EXECUTE'
    ) OR HAS_FUNCTION_PRIVILEGE(
        'authenticated',
        'public.invoke_email_notification_processor()',
        'EXECUTE'
    ) OR HAS_FUNCTION_PRIVILEGE(
        'service_role',
        'public.invoke_email_notification_processor()',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'The email processor invocation function is exposed to an application role';
    END IF;

    SELECT decrypted_secret
    INTO processor_base_url
    FROM vault.decrypted_secrets
    WHERE name = 'email_processor_base_url'
    ORDER BY updated_at DESC
    LIMIT 1;

    SELECT decrypted_secret
    INTO processor_cron_secret
    FROM vault.decrypted_secrets
    WHERE name = 'email_cron_secret'
    ORDER BY updated_at DESC
    LIMIT 1;

    IF processor_base_url IS NULL
        OR RTRIM(processor_base_url, '/') <> 'https://www.globeattendance.org' THEN
        RAISE EXCEPTION 'Vault email_processor_base_url must be the canonical production origin';
    END IF;

    IF processor_cron_secret IS NULL
        OR LENGTH(processor_cron_secret) NOT BETWEEN 32 AND 256
        OR processor_cron_secret !~ '^[[:graph:]]+$' THEN
        RAISE EXCEPTION 'Vault email_cron_secret is missing or invalid';
    END IF;

    FOR existing_job_id IN
        SELECT jobid
        FROM cron.job
        WHERE jobname = 'email-notification-processor'
    LOOP
        PERFORM cron.unschedule(existing_job_id);
    END LOOP;

    SELECT cron.schedule(
        'email-notification-processor',
        '* * * * *',
        'SELECT public.invoke_email_notification_processor();'
    )
    INTO scheduled_job_id;

    IF scheduled_job_id IS NULL THEN
        RAISE EXCEPTION 'Email notification processor cron could not be scheduled';
    END IF;
END;
$activation$;

COMMIT;
