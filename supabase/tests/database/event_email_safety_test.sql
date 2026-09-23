-- Pure TAP output keeps this safety check runnable even when the optional
-- pgTAP extension has not been enabled on the hosted project.
BEGIN;

SELECT '1..13';

WITH function_definitions AS (
    SELECT
        CASE
            WHEN TO_REGPROCEDURE(
                'public.enqueue_due_email_notifications(timestamp with time zone,integer,integer,integer)'
            ) IS NULL THEN ''
            ELSE PG_GET_FUNCTIONDEF(
                'public.enqueue_due_email_notifications(timestamp with time zone,integer,integer,integer)'::REGPROCEDURE
            )
        END AS enqueue_definition,
        CASE
            WHEN TO_REGPROCEDURE(
                'public.claim_email_notification_jobs(uuid,integer,integer,text[])'
            ) IS NULL THEN ''
            ELSE PG_GET_FUNCTIONDEF(
                'public.claim_email_notification_jobs(uuid,integer,integer,text[])'::REGPROCEDURE
            )
        END AS claim_definition
),
checks(test_number, passed, description) AS (
    SELECT check_rows.*
    FROM function_definitions definitions
    CROSS JOIN LATERAL (
        VALUES
            (1, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_proc procedure_row
                    JOIN pg_catalog.pg_namespace namespace_row
                        ON namespace_row.oid = procedure_row.pronamespace
                    WHERE namespace_row.nspname = 'private'
                        AND procedure_row.proname = 'is_event_email_recipient_currently_eligible'
                        AND pg_catalog.pg_get_function_identity_arguments(procedure_row.oid) = 'p_event_id uuid, p_user_id uuid'
                ), 'private recipient eligibility helper exists'),
            (2, TO_REGPROCEDURE(
                    'public.enqueue_due_email_notifications(timestamp with time zone,integer,integer,integer)'
                ) IS NOT NULL, 'event email enqueue function exists'),
            (3, TO_REGPROCEDURE(
                    'public.claim_email_notification_jobs(uuid,integer,integer,text[])'
                ) IS NOT NULL, 'filtered email job claim function exists'),
            (4, EXISTS (
                    SELECT 1 FROM pg_catalog.pg_constraint constraint_row
                    WHERE constraint_row.conrelid = 'public.email_notification_jobs'::REGCLASS
                        AND constraint_row.contype = 'u'
                        AND constraint_row.conname = 'email_notification_jobs_one_per_worker'
                ), 'one logical notification job per worker and occurrence is database-enforced'),
            (5, definitions.enqueue_definition LIKE '%profile_row.is_active IS TRUE%',
                'enqueue explicitly requires active profiles'),
            (6, definitions.enqueue_definition NOT LIKE '%profile_row.role = ''worker''%',
                'enqueue does not exclude active admins from worker attendance mail'),
            (7, definitions.enqueue_definition NOT LIKE '%admin_profile.role IN%',
                'follow-up enqueue does not construct per-worker admin CC fan-out'),
            (8, definitions.enqueue_definition ILIKE '%''{}''::text[]%'
                    OR definitions.enqueue_definition ILIKE '%array[]::text[]%',
                'follow-up jobs store an empty CC list'),
            (9, definitions.claim_definition LIKE '%private.is_event_email_recipient_currently_eligible%',
                'claim revalidates the current event audience before delivery'),
            (10, NOT HAS_FUNCTION_PRIVILEGE(
                    'anon',
                    'public.claim_email_notification_jobs(uuid,integer,integer,text[])',
                    'EXECUTE'
                ), 'anonymous callers cannot claim email jobs'),
            (11, NOT HAS_FUNCTION_PRIVILEGE(
                    'authenticated',
                    'public.claim_email_notification_jobs(uuid,integer,integer,text[])',
                    'EXECUTE'
                ), 'authenticated application users cannot claim email jobs'),
            (12, HAS_FUNCTION_PRIVILEGE(
                    'service_role',
                    'public.claim_email_notification_jobs(uuid,integer,integer,text[])',
                    'EXECUTE'
                ), 'service role can claim email jobs'),
            (13, NOT HAS_SCHEMA_PRIVILEGE('anon', 'private', 'USAGE')
                    AND NOT HAS_SCHEMA_PRIVILEGE('authenticated', 'private', 'USAGE'),
                'application roles cannot access the private helper schema')
    ) AS check_rows(test_number, passed, description)
)
SELECT FORMAT(
    '%s %s - %s',
    CASE WHEN passed THEN 'ok' ELSE 'not ok' END,
    test_number,
    description
)
FROM checks
ORDER BY test_number;

ROLLBACK;
