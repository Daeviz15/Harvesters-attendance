-- Pure TAP output keeps this reconciliation check runnable even when the
-- optional pgTAP extension has not been enabled on the hosted project.
BEGIN;

SELECT '1..11';

WITH checks(test_number, passed, description) AS (
    VALUES
        (1, TO_REGPROCEDURE('public.is_reports_admin()') IS NOT NULL,
            'reports-admin helper exists'),
        (2, NOT EXISTS (
                SELECT 1 FROM pg_catalog.pg_type type_row
                WHERE type_row.typname = 'user_role' AND type_row.typtype = 'e'
            ) OR EXISTS (
                SELECT 1
                FROM pg_catalog.pg_type type_row
                JOIN pg_catalog.pg_enum enum_row ON enum_row.enumtypid = type_row.oid
                WHERE type_row.typname = 'user_role'
                    AND enum_row.enumlabel = 'reports_admin'
            ), 'reports_admin is available when profile roles use an enum'),
        (3, EXISTS (
                SELECT 1
                FROM pg_catalog.pg_attribute attribute_row
                WHERE attribute_row.attrelid = 'public.departments'::REGCLASS
                    AND attribute_row.attname = 'head_user_id'
                    AND attribute_row.attnum > 0
                    AND NOT attribute_row.attisdropped
            ), 'departments has head_user_id'),
        (4, EXISTS (
                SELECT 1
                FROM pg_catalog.pg_attribute attribute_row
                WHERE attribute_row.attrelid = 'public.profiles'::REGCLASS
                    AND attribute_row.attname = 'team_id'
                    AND attribute_row.attnum > 0
                    AND NOT attribute_row.attisdropped
            ), 'profiles has team_id'),
        (5, EXISTS (
                SELECT 1
                FROM pg_catalog.pg_attribute attribute_row
                WHERE attribute_row.attrelid = 'public.profiles'::REGCLASS
                    AND attribute_row.attname = 'birthday_month'
                    AND attribute_row.attnum > 0
                    AND NOT attribute_row.attisdropped
            ), 'profiles has generated birthday_month'),
        (6, EXISTS (
                SELECT 1
                FROM pg_catalog.pg_attribute attribute_row
                WHERE attribute_row.attrelid = 'public.profiles'::REGCLASS
                    AND attribute_row.attname = 'birthday_day'
                    AND attribute_row.attnum > 0
                    AND NOT attribute_row.attisdropped
            ), 'profiles has generated birthday_day'),
        (7, TO_REGCLASS('public.departments_one_head_per_worker') IS NOT NULL,
            'department head uniqueness index exists'),
        (8, TO_REGCLASS('public.idx_departments_team_id') IS NOT NULL,
            'department team filter index exists'),
        (9, TO_REGCLASS('public.idx_profiles_team_id') IS NOT NULL,
            'profile team filter index exists'),
        (10, TO_REGCLASS('public.idx_profiles_active_role_created_at') IS NOT NULL,
            'active profile role index exists'),
        (11, TO_REGCLASS('public.idx_profiles_active_birthday_month_day') IS NOT NULL,
            'active profile birthday index exists')
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
