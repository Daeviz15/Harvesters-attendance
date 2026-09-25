-- Pure TAP regression checks for scoped upcoming-event discovery.
BEGIN;

SELECT '1..13';

WITH function_definitions AS (
    SELECT PG_GET_FUNCTIONDEF(
        'public.get_my_next_event_occurrence(timestamp with time zone,integer)'::REGPROCEDURE
    ) AS upcoming_event_definition
),
checks(test_number, passed, description) AS (
    SELECT check_rows.*
    FROM function_definitions definitions
    CROSS JOIN LATERAL (
        VALUES
            (1, TO_REGPROCEDURE(
                    'public.get_my_next_event_occurrence(timestamp with time zone,integer)'
                ) IS NOT NULL, 'scoped upcoming-event RPC exists'),
            (2, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_proc procedure_row
                    JOIN pg_catalog.pg_namespace namespace_row
                        ON namespace_row.oid = procedure_row.pronamespace
                    WHERE namespace_row.nspname = 'public'
                        AND procedure_row.proname = 'get_my_next_event_occurrence'
                        AND procedure_row.prosecdef
                        AND procedure_row.proconfig @> ARRAY['search_path=""']::TEXT[]
                ), 'upcoming-event RPC pins an empty search path'),
            (3, definitions.upcoming_event_definition ILIKE '%auth.uid()%'
                    AND definitions.upcoming_event_definition ILIKE '%is_active IS DISTINCT FROM FALSE%',
                'upcoming-event RPC requires an authenticated active profile'),
            (4, definitions.upcoming_event_definition ILIKE '%p_horizon_days NOT BETWEEN 1 AND 366%',
                'event search horizon is bounded server-side'),
            (5, definitions.upcoming_event_definition ILIKE '%event_row.department_id IN%'
                    AND definitions.upcoming_event_definition ILIKE '%event_row.team_id IN%'
                    AND definitions.upcoming_event_definition ILIKE '%event_row.department_id IS NULL AND event_row.team_id IS NULL%',
                'department, team, and global event scopes are enforced'),
            (6, definitions.upcoming_event_definition ILIKE '%department_row.head_user_id = caller_id%'
                    AND definitions.upcoming_event_definition ILIKE '%event_row.created_by = caller_id%',
                'managed and creator event access mirrors active-session visibility'),
            (7, definitions.upcoming_event_definition ILIKE '%public.event_occurrence_window%'
                    AND definitions.upcoming_event_definition ILIKE '%pg_catalog.generate_series%',
                'canonical recurrence calculation is reused across the bounded horizon'),
            (8, definitions.upcoming_event_definition ILIKE '%scheduled_end_at > p_reference_time%'
                    AND definitions.upcoming_event_definition ILIKE '%is_in_progress%',
                'in-progress windows suppress later events until their scheduled end'),
            (9, definitions.upcoming_event_definition ILIKE '%ORDER BY candidate.scheduled_start_at%'
                    AND definitions.upcoming_event_definition ILIKE '%LIMIT 1%',
                'only the nearest eligible occurrence is returned'),
            (10, PG_GET_FUNCTION_RESULT(
                    'public.get_my_next_event_occurrence(timestamp with time zone,integer)'::REGPROCEDURE
                ) NOT ILIKE '%created_by%'
                    AND PG_GET_FUNCTION_RESULT(
                        'public.get_my_next_event_occurrence(timestamp with time zone,integer)'::REGPROCEDURE
                    ) NOT ILIKE '%department_id%',
                'RPC output omits internal authorization metadata'),
            (11, NOT HAS_FUNCTION_PRIVILEGE(
                    'anon',
                    'public.get_my_next_event_occurrence(timestamp with time zone,integer)',
                    'EXECUTE'
                ), 'anonymous callers cannot discover upcoming events'),
            (12, HAS_FUNCTION_PRIVILEGE(
                    'authenticated',
                    'public.get_my_next_event_occurrence(timestamp with time zone,integer)',
                    'EXECUTE'
                ), 'authenticated users can invoke the scope-enforcing RPC'),
            (13, EXISTS (
                    SELECT 1
                    FROM pg_catalog.pg_indexes index_row
                    WHERE index_row.schemaname = 'public'
                        AND index_row.tablename = 'events'
                        AND index_row.indexname = 'idx_events_created_by'
                ), 'creator-scoped event lookup is index-backed')
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
