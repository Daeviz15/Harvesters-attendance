-- Pure TAP regression checks for leave enforcement and audited early return.
BEGIN;

SELECT '1..22';

WITH function_definitions AS (
    SELECT
        PG_GET_FUNCTIONDEF(
            'private.is_user_on_approved_leave(uuid,timestamp with time zone,text)'::REGPROCEDURE
        ) AS leave_helper_definition,
        PG_GET_FUNCTIONDEF(
            'private.prevent_attendance_during_approved_leave()'::REGPROCEDURE
        ) AS attendance_guard_definition,
        PG_GET_FUNCTIONDEF(
            'private.prevent_overlapping_open_leave_requests()'::REGPROCEDURE
        ) AS overlap_guard_definition,
        PG_GET_FUNCTIONDEF(
            'public.end_my_leave_early(uuid,text)'::REGPROCEDURE
        ) AS early_return_definition,
        PG_GET_FUNCTIONDEF(
            'public.claim_email_notification_jobs(uuid,integer,integer,text[])'::REGPROCEDURE
        ) AS email_claim_definition,
        PG_GET_FUNCTIONDEF(
            'public.recalculate_pending_attendance_summary_counts(timestamp with time zone,integer)'::REGPROCEDURE
        ) AS summary_recalculation_definition
),
checks(test_number, passed, description) AS (
    SELECT check_rows.*
    FROM function_definitions definitions
    CROSS JOIN LATERAL (
        VALUES
            (1, EXISTS (
                    SELECT 1
                    FROM information_schema.columns column_row
                    WHERE column_row.table_schema = 'public'
                        AND column_row.table_name = 'leave_requests'
                        AND column_row.column_name = 'returned_early_at'
                        AND column_row.data_type = 'timestamp with time zone'
                ), 'leave requests retain an audited early-return timestamp'),
            (2, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_constraint constraint_row
                    WHERE constraint_row.conrelid = 'public.leave_requests'::REGCLASS
                        AND constraint_row.conname = 'leave_requests_return_note_length_check'
                        AND constraint_row.contype = 'c'
                ), 'return notes are length constrained by the database'),
            (3, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_indexes index_row
                    WHERE index_row.schemaname = 'public'
                        AND index_row.tablename = 'leave_requests'
                        AND index_row.indexname = 'idx_leave_requests_active_approved_lookup'
                ), 'active approved leave lookup is index-backed'),
            (4, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_trigger trigger_row
                    WHERE trigger_row.tgrelid = 'public.attendance_logs'::REGCLASS
                        AND trigger_row.tgname = 'prevent_attendance_during_approved_leave'
                        AND NOT trigger_row.tgisinternal
                        AND trigger_row.tgenabled <> 'D'
                ), 'attendance writes are protected by an enabled database trigger'),
            (5, definitions.attendance_guard_definition ILIKE '%LEAVE_ACTIVE%'
                    AND definitions.attendance_guard_definition ILIKE '%NOW()%'
                    AND definitions.attendance_guard_definition ILIKE '%requested_check_in_at%',
                'attendance guard checks both write time and supplied attendance time'),
            (6, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_trigger trigger_row
                    WHERE trigger_row.tgrelid = 'public.leave_requests'::REGCLASS
                        AND trigger_row.tgname = 'prevent_overlapping_open_leave_requests'
                        AND NOT trigger_row.tgisinternal
                        AND trigger_row.tgenabled <> 'D'
                ), 'overlapping open leave requests are database-guarded'),
            (7, definitions.overlap_guard_definition ILIKE '%pg_advisory_xact_lock%'
                    AND definitions.overlap_guard_definition ILIKE '%LEAVE_OVERLAP%',
                'overlap validation serializes concurrent writes per worker'),
            (8, definitions.leave_helper_definition ILIKE '%status = ''approved''%'
                    AND definitions.leave_helper_definition ILIKE '%returned_early_at%'
                    AND definitions.leave_helper_definition ILIKE '%AT TIME ZONE%',
                'shared leave evaluation is approval, early-return, and timezone aware'),
            (9, definitions.early_return_definition ILIKE '%auth.uid()%'
                    AND definitions.early_return_definition ILIKE '%FOR UPDATE%'
                    AND definitions.early_return_definition ILIKE '%target_request.user_id <> caller_id%',
                'early return locks the request and verifies authenticated ownership'),
            (10, definitions.early_return_definition ILIKE '%target_request.status <> ''approved''%'
                    AND definitions.early_return_definition ILIKE '%currently active leave%',
                'early return permits only a currently active approved leave'),
            (11, NOT HAS_FUNCTION_PRIVILEGE(
                    'anon', 'public.end_my_leave_early(uuid,text)', 'EXECUTE'
                ), 'anonymous callers cannot end leave'),
            (12, HAS_FUNCTION_PRIVILEGE(
                    'authenticated', 'public.end_my_leave_early(uuid,text)', 'EXECUTE'
                ), 'authenticated workers can invoke the ownership-enforcing transition'),
            (13, NOT HAS_TABLE_PRIVILEGE(
                    'authenticated', 'public.leave_requests', 'UPDATE'
                ), 'application users cannot bypass leave lifecycle RPCs with direct updates'),
            (14, NOT HAS_SCHEMA_PRIVILEGE('anon', 'private', 'USAGE')
                    AND NOT HAS_SCHEMA_PRIVILEGE('authenticated', 'private', 'USAGE'),
                'application roles cannot access private enforcement helpers'),
            (15, TO_REGPROCEDURE(
                    'public.enqueue_due_returned_early_followups(timestamp with time zone,integer,integer)'
                ) IS NOT NULL, 'early-return-aware supplemental follow-up enqueue exists'),
            (16, NOT HAS_FUNCTION_PRIVILEGE(
                    'authenticated',
                    'public.enqueue_due_returned_early_followups(timestamp with time zone,integer,integer)',
                    'EXECUTE'
                ), 'application users cannot enqueue automatic follow-ups'),
            (17, HAS_FUNCTION_PRIVILEGE(
                    'service_role',
                    'public.enqueue_due_returned_early_followups(timestamp with time zone,integer,integer)',
                    'EXECUTE'
                ), 'service role can enqueue early-return-aware follow-ups'),
            (18, definitions.email_claim_definition ILIKE '%private.is_user_on_approved_leave%'
                    AND definitions.email_claim_definition ILIKE '%FOR UPDATE SKIP LOCKED%',
                'email delivery revalidates leave and atomically claims work'),
            (19, TO_REGPROCEDURE(
                    'public.recalculate_pending_attendance_summary_counts(timestamp with time zone,integer)'
                ) IS NOT NULL, 'pending leadership summaries can be reclassified safely'),
            (20, definitions.summary_recalculation_definition ILIKE '%private.is_user_on_approved_leave%'
                    AND definitions.summary_recalculation_definition NOT ILIKE '%recipient_email%',
                'summary reclassification uses shared leave logic without worker email payloads'),
            (21, NOT HAS_FUNCTION_PRIVILEGE(
                    'authenticated',
                    'public.recalculate_pending_attendance_summary_counts(timestamp with time zone,integer)',
                    'EXECUTE'
                ), 'application users cannot alter pending leadership summary counts'),
            (22, HAS_FUNCTION_PRIVILEGE(
                    'service_role',
                    'public.recalculate_pending_attendance_summary_counts(timestamp with time zone,integer)',
                    'EXECUTE'
                ), 'service role can refresh pending leadership summary counts')
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
