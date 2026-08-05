-- Emergency safety pause: stop automatic processing while recipient scoping and
-- delivery idempotency are being corrected. Safe when the job does not exist.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM cron.job
        WHERE jobname = 'email-notification-processor'
    ) THEN
        PERFORM cron.unschedule('email-notification-processor');
    END IF;
END;
$$;
