-- Pure TAP regression checks for the scoped admin notification center.
BEGIN;

SELECT '1..20';

WITH definitions AS (
    SELECT
        PG_GET_FUNCTIONDEF(
            'private.enqueue_scoped_admin_notification(uuid,uuid,text,text,text,text,text)'::REGPROCEDURE
        ) AS enqueue_definition,
        PG_GET_FUNCTIONDEF(
            'public.mark_my_admin_notifications_read(uuid[])'::REGPROCEDURE
        ) AS mark_read_definition,
        PG_GET_FUNCTIONDEF(
            'private.notify_admins_of_leave_activity()'::REGPROCEDURE
        ) AS leave_trigger_definition
),
checks(test_number, passed, description) AS (
    SELECT check_rows.*
    FROM definitions function_definitions
    CROSS JOIN LATERAL (
        VALUES
            (1, TO_REGCLASS('public.admin_notifications') IS NOT NULL,
                'admin notification table exists'),
            (2, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_class table_row
                    WHERE table_row.oid = 'public.admin_notifications'::REGCLASS
                        AND table_row.relrowsecurity
                ), 'notification table has row-level security enabled'),
            (3, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_policies policy_row
                    WHERE policy_row.schemaname = 'public'
                        AND policy_row.tablename = 'admin_notifications'
                        AND policy_row.cmd = 'SELECT'
                        AND policy_row.qual ILIKE '%auth.uid()%'
                        AND policy_row.qual ILIKE '%recipient_user_id%'
                ), 'select policy restricts rows to their recipient'),
            (4, HAS_TABLE_PRIVILEGE('authenticated', 'public.admin_notifications', 'SELECT')
                    AND NOT HAS_TABLE_PRIVILEGE('authenticated', 'public.admin_notifications', 'INSERT')
                    AND NOT HAS_TABLE_PRIVILEGE('authenticated', 'public.admin_notifications', 'UPDATE')
                    AND NOT HAS_TABLE_PRIVILEGE('authenticated', 'public.admin_notifications', 'DELETE'),
                'authenticated clients have read-only table privileges'),
            (5, NOT HAS_TABLE_PRIVILEGE('anon', 'public.admin_notifications', 'SELECT'),
                'anonymous clients cannot read notifications'),
            (6, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_constraint constraint_row
                    WHERE constraint_row.conrelid = 'public.admin_notifications'::REGCLASS
                        AND constraint_row.conname = 'admin_notifications_recipient_dedupe_unique'
                ), 'recipient and event dedupe is database enforced'),
            (7, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_indexes index_row
                    WHERE index_row.schemaname = 'public'
                        AND index_row.tablename = 'admin_notifications'
                        AND index_row.indexname = 'idx_admin_notifications_recipient_unread'
                        AND index_row.indexdef ILIKE '%WHERE (read_at IS NULL)%'
                ), 'unread notification reads use a partial index'),
            (8, function_definitions.enqueue_definition ILIKE '%role::text IN (''admin'', ''super_admin'')%',
                'global administrators are derived server-side'),
            (9, function_definitions.enqueue_definition ILIKE '%team_admin_assignments%'
                    AND function_definitions.enqueue_definition ILIKE '%target_team_id%',
                'team administrators are limited to the subject team'),
            (10, function_definitions.enqueue_definition ILIKE '%head_user_id%'
                    AND function_definitions.enqueue_definition ILIKE '%target_department_id%',
                'department heads are limited to the subject department'),
            (11, function_definitions.enqueue_definition ILIKE '%role::text <> ''reports_admin''%',
                'reports-only administrators are excluded from operational alerts'),
            (12, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_trigger trigger_row
                    WHERE trigger_row.tgrelid = 'public.leave_requests'::REGCLASS
                        AND trigger_row.tgname = 'notify_admins_of_leave_activity'
                        AND NOT trigger_row.tgisinternal
                ), 'leave lifecycle notification trigger is installed'),
            (13, function_definitions.leave_trigger_definition ILIKE '%leave_requested%'
                    AND function_definitions.leave_trigger_definition ILIKE '%leave_approved%'
                    AND function_definitions.leave_trigger_definition ILIKE '%leave_rejected%'
                    AND function_definitions.leave_trigger_definition ILIKE '%leave_returned_early%',
                'leave trigger covers all important leave transitions'),
            (14, function_definitions.leave_trigger_definition NOT ILIKE '%NEW.reason%'
                    AND function_definitions.leave_trigger_definition NOT ILIKE '%NEW.return_note%',
                'notification messages do not copy private leave notes'),
            (15, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_trigger trigger_row
                    WHERE trigger_row.tgrelid = 'public.profiles'::REGCLASS
                        AND trigger_row.tgname = 'notify_admins_of_worker_status_change'
                        AND NOT trigger_row.tgisinternal
                ), 'worker activation notification trigger is installed'),
            (16, function_definitions.mark_read_definition ILIKE '%recipient_user_id = caller_id%'
                    AND function_definitions.mark_read_definition ILIKE '%cardinality(p_notification_ids) > 50%',
                'mark-read RPC enforces ownership and bounded batches'),
            (17, NOT HAS_FUNCTION_PRIVILEGE(
                    'anon', 'public.mark_my_admin_notifications_read(uuid[])', 'EXECUTE'
                ) AND HAS_FUNCTION_PRIVILEGE(
                    'authenticated', 'public.mark_my_admin_notifications_read(uuid[])', 'EXECUTE'
                ), 'mark-read RPC is authenticated-only'),
            (18, NOT HAS_FUNCTION_PRIVILEGE(
                    'authenticated', 'public.prune_admin_notifications(integer,integer)', 'EXECUTE'
                ) AND HAS_FUNCTION_PRIVILEGE(
                    'service_role', 'public.prune_admin_notifications(integer,integer)', 'EXECUTE'
                ), 'retention cleanup is service-role only'),
            (19, NOT HAS_SCHEMA_PRIVILEGE('anon', 'private', 'USAGE')
                    AND NOT HAS_SCHEMA_PRIVILEGE('authenticated', 'private', 'USAGE'),
                'application roles cannot call private notification helpers'),
            (20, NOT EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_publication publication_row
                    WHERE publication_row.pubname = 'supabase_realtime'
                ) OR EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_publication_tables publication_table
                    WHERE publication_table.pubname = 'supabase_realtime'
                        AND publication_table.schemaname = 'public'
                        AND publication_table.tablename = 'admin_notifications'
                ), 'notification inserts are published for RLS-filtered Realtime delivery')
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
