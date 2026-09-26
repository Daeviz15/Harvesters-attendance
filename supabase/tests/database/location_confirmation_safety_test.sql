-- Pure TAP regression checks for location-confirmation hardening.
BEGIN;

SELECT '1..12';

WITH checks(test_number, passed, description) AS (
    VALUES
        (1, EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
                AND table_name = 'locations'
                AND column_name = 'max_check_in_accuracy_meters'
                AND is_nullable = 'NO'
        ), 'locations require a maximum GPS accuracy threshold'),
        (2, EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
                AND table_name = 'locations'
                AND column_name = 'check_in_distance_buffer_meters'
                AND is_nullable = 'NO'
        ), 'locations require a bounded GPS drift buffer'),
        (3, EXISTS (
            SELECT 1
            FROM pg_catalog.pg_constraint constraint_row
            WHERE constraint_row.conname = 'locations_max_check_in_accuracy_meters_check'
                AND constraint_row.convalidated
        ), 'GPS quality threshold has a validated database constraint'),
        (4, EXISTS (
            SELECT 1
            FROM pg_catalog.pg_constraint constraint_row
            WHERE constraint_row.conname = 'locations_check_in_distance_buffer_meters_check'
                AND constraint_row.convalidated
        ), 'GPS drift buffer has a validated database constraint'),
        (5, EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
                AND table_name = 'attendance_logs'
                AND column_name = 'check_in_accuracy_meters'
        ), 'successful self check-ins retain GPS accuracy evidence'),
        (6, EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
                AND table_name = 'attendance_logs'
                AND column_name = 'check_in_position_timestamp'
        ), 'successful self check-ins retain position timestamp evidence'),
        (7, EXISTS (
            SELECT 1
            FROM pg_catalog.pg_constraint constraint_row
            WHERE constraint_row.conname = 'attendance_logs_check_in_accuracy_meters_check'
                AND constraint_row.convalidated
        ), 'recorded GPS accuracy has a validated database constraint'),
        (8, EXISTS (
            SELECT 1
            FROM pg_catalog.pg_policies policy_row
            WHERE policy_row.schemaname = 'public'
                AND policy_row.tablename = 'locations'
                AND policy_row.policyname = 'locations_active_select'
                AND policy_row.cmd = 'SELECT'
                AND policy_row.roles @> ARRAY['authenticated']::NAME[]
        ), 'authenticated workers can read active check-in locations'),
        (9, EXISTS (
            SELECT 1
            FROM pg_catalog.pg_policies policy_row
            WHERE policy_row.schemaname = 'public'
                AND policy_row.tablename = 'locations'
                AND policy_row.policyname = 'locations_super_admin_manage'
                AND policy_row.cmd = 'ALL'
                AND policy_row.roles @> ARRAY['authenticated']::NAME[]
                AND policy_row.qual ILIKE '%is_super_admin%'
                AND policy_row.with_check ILIKE '%is_super_admin%'
        ), 'only super administrators can alter check-in location policy'),
        (10, NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_policies policy_row
            WHERE policy_row.schemaname = 'public'
                AND policy_row.tablename = 'locations'
                AND policy_row.policyname IN (
                    'Admins can insert locations',
                    'Admins can update locations',
                    'Admins can delete locations'
                )
        ), 'legacy broad location-management policies are removed'),
        (11, (SELECT relrowsecurity
            FROM pg_catalog.pg_class class_row
            JOIN pg_catalog.pg_namespace namespace_row
                ON namespace_row.oid = class_row.relnamespace
            WHERE namespace_row.nspname = 'public'
                AND class_row.relname = 'locations'
        ), 'locations remain protected by row-level security'),
        (12, (SELECT COUNT(*)
            FROM public.locations
            WHERE max_check_in_accuracy_meters NOT BETWEEN 10 AND 250
                OR check_in_distance_buffer_meters NOT BETWEEN 0 AND 50
        ) = 0, 'all existing location settings fit the safe configured bounds')
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
