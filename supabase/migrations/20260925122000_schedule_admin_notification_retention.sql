-- Bound notification storage independently of web requests. Read records are
-- retained from the time they were read; unread alerts are kept substantially
-- longer so an administrator returning after an absence can still review them.

BEGIN;

CREATE OR REPLACE FUNCTION public.prune_admin_notifications(
    p_read_retention_days INTEGER DEFAULT 90,
    p_unread_retention_days INTEGER DEFAULT 365
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    IF p_read_retention_days NOT BETWEEN 30 AND 730
        OR p_unread_retention_days NOT BETWEEN 90 AND 1460
        OR p_unread_retention_days < p_read_retention_days THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Invalid notification retention policy.';
    END IF;

    DELETE FROM public.admin_notifications notification_row
    WHERE (
            notification_row.read_at IS NOT NULL
            AND notification_row.read_at < NOW() - MAKE_INTERVAL(days => p_read_retention_days)
        )
        OR (
            notification_row.read_at IS NULL
            AND notification_row.created_at < NOW() - MAKE_INTERVAL(days => p_unread_retention_days)
        );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_admin_notifications(INTEGER, INTEGER)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_admin_notifications(INTEGER, INTEGER)
TO service_role;

DO $$
DECLARE
    existing_job_id BIGINT;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_extension extension_row
        WHERE extension_row.extname = 'pg_cron'
    ) THEN
        FOR existing_job_id IN
            SELECT jobid
            FROM cron.job
            WHERE jobname = 'admin-notification-retention'
        LOOP
            PERFORM cron.unschedule(existing_job_id);
        END LOOP;

        PERFORM cron.schedule(
            'admin-notification-retention',
            '17 2 * * *',
            'SELECT public.prune_admin_notifications(90, 365);'
        );
    END IF;
END $$;

COMMIT;
