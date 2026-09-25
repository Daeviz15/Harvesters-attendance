-- Pure TAP regression checks for the privacy-preserving leadership summary path.
BEGIN;

SELECT '1..18';

WITH function_definitions AS (
    SELECT
        PG_GET_FUNCTIONDEF(
            'public.enqueue_due_attendance_summaries(timestamp with time zone,integer,integer)'::REGPROCEDURE
        ) AS enqueue_definition,
        PG_GET_FUNCTIONDEF(
            'public.claim_attendance_summary_email_jobs(uuid,integer,integer)'::REGPROCEDURE
        ) AS claim_definition
),
checks(test_number, passed, description) AS (
    SELECT check_rows.*
    FROM function_definitions definitions
    CROSS JOIN LATERAL (
        VALUES
            (1, TO_REGCLASS('public.event_email_occurrence_roster') IS NOT NULL,
                'immutable event occurrence roster exists'),
            (2, TO_REGCLASS('public.attendance_summary_email_jobs') IS NOT NULL,
                'separate leadership summary outbox exists'),
            (3, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_class table_row
                    WHERE table_row.oid = 'public.event_email_occurrence_roster'::REGCLASS
                        AND table_row.relrowsecurity
                ), 'event occurrence roster has row-level security enabled'),
            (4, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_class table_row
                    WHERE table_row.oid = 'public.attendance_summary_email_jobs'::REGCLASS
                        AND table_row.relrowsecurity
                ), 'leadership summary outbox has row-level security enabled'),
            (5, NOT HAS_TABLE_PRIVILEGE('anon', 'public.event_email_occurrence_roster', 'SELECT')
                    AND NOT HAS_TABLE_PRIVILEGE('authenticated', 'public.event_email_occurrence_roster', 'SELECT'),
                'application roles cannot read occurrence roster PII'),
            (6, NOT HAS_TABLE_PRIVILEGE('anon', 'public.attendance_summary_email_jobs', 'SELECT')
                    AND NOT HAS_TABLE_PRIVILEGE('authenticated', 'public.attendance_summary_email_jobs', 'SELECT'),
                'application roles cannot read leadership outbox PII'),
            (7, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_constraint constraint_row
                    WHERE constraint_row.conrelid = 'public.attendance_summary_email_jobs'::REGCLASS
                        AND constraint_row.conname = 'attendance_summary_email_jobs_one_per_leader'
                        AND constraint_row.contype = 'u'
                ), 'one summary per leader and occurrence is database-enforced'),
            (8, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_constraint constraint_row
                    WHERE constraint_row.conrelid = 'public.attendance_summary_email_jobs'::REGCLASS
                        AND constraint_row.conname = 'attendance_summary_email_jobs_counts_check'
                        AND constraint_row.contype = 'c'
                ), 'summary counts must reconcile to the expected roster'),
            (9, NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns column_row
                    WHERE column_row.table_schema = 'public'
                        AND column_row.table_name = 'attendance_summary_email_jobs'
                        AND column_row.column_name IN ('cc_emails', 'worker_email', 'worker_name')
                ), 'summary outbox has no worker-recipient or CC payload columns'),
            (10, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_trigger trigger_row
                    WHERE trigger_row.tgrelid = 'public.attendance_sessions'::REGCLASS
                        AND trigger_row.tgname = 'capture_event_email_roster_on_session'
                        AND NOT trigger_row.tgisinternal
                        AND trigger_row.tgenabled <> 'D'
                ), 'automatic session creation captures its expected roster'),
            (11, definitions.enqueue_definition ILIKE '%COUNT(*) FILTER%'
                    AND definitions.enqueue_definition NOT ILIKE '%ARRAY_AGG(%'
                    AND definitions.enqueue_definition !~* 'STRING_AGG\s*\([^)]*(profile_row|auth_user)',
                'summary payload is aggregate counts rather than a worker list'),
            (12, definitions.enqueue_definition ILIKE '%leader.role <> ''reports_admin''%'
                    AND definitions.enqueue_definition ILIKE '%leader.role = ''team_admin''%'
                    AND definitions.enqueue_definition ILIKE '%leader.role IN (''admin'', ''super_admin'')%',
                'recipient hierarchy excludes reports-only admins and preserves scoped leadership'),
            (13, definitions.claim_definition ILIKE '%FOR UPDATE SKIP LOCKED%',
                'summary claims are atomic and horizontally safe'),
            (14, definitions.claim_definition ILIKE '%is_attendance_summary_recipient_currently_eligible%',
                'summary claim revalidates the current recipient and scope'),
            (15, NOT HAS_FUNCTION_PRIVILEGE(
                    'anon',
                    'public.claim_attendance_summary_email_jobs(uuid,integer,integer)',
                    'EXECUTE'
                ), 'anonymous callers cannot claim summary jobs'),
            (16, NOT HAS_FUNCTION_PRIVILEGE(
                    'authenticated',
                    'public.claim_attendance_summary_email_jobs(uuid,integer,integer)',
                    'EXECUTE'
                ), 'authenticated application users cannot claim summary jobs'),
            (17, HAS_FUNCTION_PRIVILEGE(
                    'service_role',
                    'public.claim_attendance_summary_email_jobs(uuid,integer,integer)',
                    'EXECUTE'
                ), 'service role can claim summary jobs'),
            (18, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_constraint constraint_row
                    WHERE constraint_row.conrelid = 'public.email_notification_jobs'::REGCLASS
                        AND constraint_row.conname = 'email_notification_jobs_followups_no_cc'
                        AND constraint_row.contype = 'c'
                ), 'worker follow-up CC prohibition is database-enforced')
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
