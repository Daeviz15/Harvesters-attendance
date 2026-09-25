-- Scoped upcoming-event discovery for the worker dashboard.
--
-- The RPC returns at most one current-or-future occurrence. Returning an
-- occurrence that is already in progress lets the application suppress the
-- following event until the current scheduled window has ended, even if the
-- session scheduler is briefly delayed.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_events_created_by
ON public.events (created_by)
WHERE created_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_my_next_event_occurrence(
    p_reference_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    p_horizon_days INTEGER DEFAULT 366
)
RETURNS TABLE (
    event_id UUID,
    event_title TEXT,
    scheduled_start_at TIMESTAMP WITH TIME ZONE,
    scheduled_end_at TIMESTAMP WITH TIME ZONE,
    occurrence_key TEXT,
    event_timezone TEXT,
    location_name TEXT,
    is_in_progress BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id UUID := auth.uid();
    caller_profile public.profiles%ROWTYPE;
BEGIN
    IF caller_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '28000',
            MESSAGE = 'Authentication required.';
    END IF;

    IF p_reference_time IS NULL OR p_horizon_days NOT BETWEEN 1 AND 366 THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Invalid upcoming-event query parameters.';
    END IF;

    SELECT profile_row.*
    INTO caller_profile
    FROM public.profiles profile_row
    WHERE profile_row.id = caller_id
        AND profile_row.is_active IS DISTINCT FROM FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'An active profile is required.';
    END IF;

    RETURN QUERY
    WITH caller_departments AS (
        SELECT caller_profile.department_id AS department_id
        WHERE caller_profile.department_id IS NOT NULL

        UNION

        SELECT department_row.id
        FROM public.departments department_row
        WHERE department_row.is_active IS TRUE
            AND (
                department_row.head_user_id = caller_id
                OR (
                    caller_profile.department IS NOT NULL
                    AND LOWER(BTRIM(department_row.name)) = LOWER(BTRIM(caller_profile.department))
                )
            )
    ),
    caller_teams AS (
        SELECT caller_profile.team_id AS team_id
        WHERE caller_profile.team_id IS NOT NULL

        UNION

        SELECT department_row.team_id
        FROM public.departments department_row
        JOIN caller_departments caller_department
            ON caller_department.department_id = department_row.id
        WHERE department_row.is_active IS TRUE
            AND department_row.team_id IS NOT NULL
    ),
    eligible_event_ids AS (
        SELECT event_row.id
        FROM public.events event_row
        WHERE event_row.created_by = caller_id
            OR (
                event_row.department_id IS NOT NULL
                AND event_row.department_id IN (
                    SELECT caller_department.department_id
                    FROM caller_departments caller_department
                )
            )
            OR (
                event_row.department_id IS NULL
                AND event_row.team_id IS NOT NULL
                AND event_row.team_id IN (
                    SELECT caller_team.team_id
                    FROM caller_teams caller_team
                )
            )
            OR (event_row.department_id IS NULL AND event_row.team_id IS NULL)
    ),
    candidate_occurrences AS (
        SELECT
            event_row.id AS event_id,
            event_row.title AS event_title,
            event_row.location_ids,
            occurrence.scheduled_start_at,
            occurrence.scheduled_end_at,
            occurrence.occurrence_key,
            COALESCE(NULLIF(event_row.timezone, ''), 'Africa/Lagos') AS event_timezone
        FROM public.events event_row
        JOIN eligible_event_ids eligible_event ON eligible_event.id = event_row.id
        CROSS JOIN LATERAL pg_catalog.generate_series(0, p_horizon_days) day_offset(day_number)
        CROSS JOIN LATERAL public.event_occurrence_window(
            event_row,
            (
                (
                    (p_reference_time AT TIME ZONE COALESCE(NULLIF(event_row.timezone, ''), 'Africa/Lagos'))::DATE
                    + day_offset.day_number
                )::TIMESTAMP
                AT TIME ZONE COALESCE(NULLIF(event_row.timezone, ''), 'Africa/Lagos')
            )
        ) occurrence
        WHERE occurrence.scheduled_end_at > p_reference_time
    ),
    selected_occurrence AS (
        SELECT candidate.*
        FROM candidate_occurrences candidate
        ORDER BY candidate.scheduled_start_at, candidate.event_id
        LIMIT 1
    )
    SELECT
        selected.event_id,
        selected.event_title,
        selected.scheduled_start_at,
        selected.scheduled_end_at,
        selected.occurrence_key,
        selected.event_timezone,
        location_summary.location_name,
        selected.scheduled_start_at <= p_reference_time
            AND selected.scheduled_end_at > p_reference_time AS is_in_progress
    FROM selected_occurrence selected
    LEFT JOIN LATERAL (
        SELECT STRING_AGG(location_row.name, ', ' ORDER BY location_row.name) AS location_name
        FROM public.locations location_row
        WHERE location_row.is_active IS TRUE
            AND location_row.id = ANY(COALESCE(selected.location_ids, '{}'::UUID[]))
    ) location_summary ON TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_next_event_occurrence(TIMESTAMP WITH TIME ZONE, INTEGER)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_next_event_occurrence(TIMESTAMP WITH TIME ZONE, INTEGER)
TO authenticated, service_role;

COMMIT;
