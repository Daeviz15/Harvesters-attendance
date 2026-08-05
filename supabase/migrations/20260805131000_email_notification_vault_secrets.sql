-- Provision the email processor's database-side configuration without placing
-- bearer credentials in source control, CLI output, or SQL history.

BEGIN;

DO $$
DECLARE
    processor_url_secret_id UUID;
    cron_secret_id UUID;
BEGIN
    SELECT id
    INTO processor_url_secret_id
    FROM vault.secrets
    WHERE name = 'email_processor_base_url';

    IF processor_url_secret_id IS NULL THEN
        PERFORM vault.create_secret(
            'https://www.globeattendance.org',
            'email_processor_base_url',
            'Canonical HTTPS origin for the protected email scheduler endpoint'
        );
    ELSE
        PERFORM vault.update_secret(
            processor_url_secret_id,
            'https://www.globeattendance.org',
            'email_processor_base_url',
            'Canonical HTTPS origin for the protected email scheduler endpoint'
        );
    END IF;

    SELECT id
    INTO cron_secret_id
    FROM vault.secrets
    WHERE name = 'email_cron_secret';

    IF cron_secret_id IS NULL THEN
        PERFORM vault.create_secret(
            encode(extensions.gen_random_bytes(32), 'hex'),
            'email_cron_secret',
            'Bearer credential shared only by Supabase Cron and the deployed scheduler route'
        );
    END IF;
END;
$$;

COMMIT;
