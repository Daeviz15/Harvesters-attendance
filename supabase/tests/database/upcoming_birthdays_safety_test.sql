-- Pure TAP regression checks for scoped, privacy-preserving birthday announcements.
BEGIN;

SELECT '1..15';

WITH function_definitions AS (
    SELECT
        PG_GET_FUNCTIONDEF(
            'public.get_upcoming_birthdays(boolean,integer,integer)'::REGPROCEDURE
        ) AS birthday_definition
),
checks(test_number, passed, description) AS (
    SELECT check_rows.*
    FROM function_definitions definitions
    CROSS JOIN LATERAL (
        VALUES
            (1, TO_REGPROCEDURE(
                    'public.get_upcoming_birthdays(boolean,integer,integer)'
                ) IS NOT NULL, 'scoped upcoming birthday RPC exists'),
            (2, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_proc procedure_row
                    JOIN pg_catalog.pg_namespace namespace_row
                        ON namespace_row.oid = procedure_row.pronamespace
                    WHERE namespace_row.nspname = 'public'
                        AND procedure_row.proname = 'get_upcoming_birthdays'
                        AND procedure_row.prosecdef
                        AND procedure_row.proconfig @> ARRAY['search_path=""']::TEXT[]
                ), 'birthday RPC pins an empty search path'),
            (3, definitions.birthday_definition ILIKE '%auth.uid()%'
                    AND definitions.birthday_definition ILIKE '%is_active IS DISTINCT FROM FALSE%',
                'birthday RPC requires an authenticated active profile'),
            (4, definitions.birthday_definition ILIKE '%target_profile.department_id = caller_profile.department_id%'
                    AND definitions.birthday_definition ILIKE '%target_profile.id <> caller_id%',
                'worker view is limited to colleagues in the same canonical department'),
            (5, definitions.birthday_definition ILIKE '%managed_department.head_user_id = caller_id%',
                'department-head birthday visibility is department scoped'),
            (6, definitions.birthday_definition ILIKE '%team_admin_assignments%'
                    AND definitions.birthday_definition ILIKE '%managed_department.team_id%',
                'team-admin birthday visibility is team scoped'),
            (7, definitions.birthday_definition ILIKE '%IN (''admin'', ''super_admin'')%',
                'global administrators receive global birthday visibility'),
            (8, definitions.birthday_definition ILIKE '%role::TEXT = ''reports_admin''%'
                    AND definitions.birthday_definition ILIKE '%RETURN;%',
                'reports-only admin mode does not disclose birthday announcements'),
            (9, PG_GET_FUNCTION_RESULT(
                    'public.get_upcoming_birthdays(boolean,integer,integer)'::REGPROCEDURE
                ) NOT ILIKE '%date_of_birth%'
                    AND PG_GET_FUNCTION_RESULT(
                        'public.get_upcoming_birthdays(boolean,integer,integer)'::REGPROCEDURE
                    ) ILIKE '%birthday_month%'
                    AND PG_GET_FUNCTION_RESULT(
                        'public.get_upcoming_birthdays(boolean,integer,integer)'::REGPROCEDURE
                    ) ILIKE '%birthday_day%',
                'RPC output exposes month and day without returning birth year'),
            (10, definitions.birthday_definition ILIKE '%p_days_ahead NOT BETWEEN 0 AND 366%'
                    AND definitions.birthday_definition ILIKE '%p_limit NOT BETWEEN 1 AND 25%',
                'birthday query bounds are validated server-side'),
            (11, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_indexes index_row
                    WHERE index_row.schemaname = 'public'
                        AND index_row.tablename = 'profiles'
                        AND index_row.indexname = 'idx_profiles_active_birthday_month_day'
                ), 'birthday lookup columns are backed by an active-profile index'),
            (12, NOT HAS_FUNCTION_PRIVILEGE(
                    'anon', 'public.get_upcoming_birthdays(boolean,integer,integer)', 'EXECUTE'
                ), 'anonymous callers cannot fetch birthday announcements'),
            (13, HAS_FUNCTION_PRIVILEGE(
                    'authenticated', 'public.get_upcoming_birthdays(boolean,integer,integer)', 'EXECUTE'
                ), 'authenticated users can invoke the scope-enforcing birthday RPC'),
            (14, NOT HAS_SCHEMA_PRIVILEGE('anon', 'private', 'USAGE')
                    AND NOT HAS_SCHEMA_PRIVILEGE('authenticated', 'private', 'USAGE'),
                'application roles cannot access the private anniversary helper'),
            (15, definitions.birthday_definition ILIKE '%AT TIME ZONE ''Africa/Lagos''%',
                'birthday ordering uses the application business timezone')
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
