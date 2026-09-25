-- Privacy-preserving upcoming birthday announcements.
--
-- The RPC deliberately omits date_of_birth and birth year. Worker mode is
-- limited to active colleagues in the caller's canonical department. Admin
-- mode independently revalidates global/team/department scope in Postgres.

BEGIN;

CREATE OR REPLACE FUNCTION private.birthday_anniversary(
    p_year INTEGER,
    p_month INTEGER,
    p_day INTEGER
)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
    SELECT pg_catalog.make_date(
        p_year,
        p_month,
        LEAST(
            p_day,
            EXTRACT(
                DAY FROM (
                    pg_catalog.make_date(p_year, p_month, 1)
                    + INTERVAL '1 month - 1 day'
                )
            )::INTEGER
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.get_upcoming_birthdays(
    p_admin_view BOOLEAN DEFAULT FALSE,
    p_days_ahead INTEGER DEFAULT 45,
    p_limit INTEGER DEFAULT 8
)
RETURNS TABLE (
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    department_name TEXT,
    birthday_month SMALLINT,
    birthday_day SMALLINT,
    next_birthday DATE,
    days_until INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id UUID := auth.uid();
    caller_profile public.profiles%ROWTYPE;
    reference_date DATE := (pg_catalog.now() AT TIME ZONE 'Africa/Lagos')::DATE;
    caller_is_scoped_admin BOOLEAN := FALSE;
BEGIN
    IF caller_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '28000',
            MESSAGE = 'Authentication required.';
    END IF;

    IF p_days_ahead NOT BETWEEN 0 AND 366 OR p_limit NOT BETWEEN 1 AND 25 THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Invalid birthday announcement parameters.';
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

    IF p_admin_view THEN
        -- Reports-only access remains limited to reporting surfaces. Those
        -- users can still see their department announcements in worker view.
        IF caller_profile.role::TEXT = 'reports_admin' THEN
            RETURN;
        END IF;

        caller_is_scoped_admin := caller_profile.role::TEXT IN ('admin', 'super_admin')
            OR (
                caller_profile.role::TEXT = 'team_admin'
                AND (
                    caller_profile.team_id IS NOT NULL
                    OR EXISTS (
                        SELECT 1
                        FROM public.team_admin_assignments assignment_row
                        JOIN public.teams team_row ON team_row.id = assignment_row.team_id
                        WHERE assignment_row.user_id = caller_id
                            AND team_row.is_active IS TRUE
                    )
                )
            )
            OR EXISTS (
                SELECT 1
                FROM public.departments department_row
                WHERE department_row.head_user_id = caller_id
                    AND department_row.is_active IS TRUE
            );

        IF NOT caller_is_scoped_admin THEN
            RAISE EXCEPTION USING
                ERRCODE = '42501',
                MESSAGE = 'Administrative birthday access is not permitted.';
        END IF;
    END IF;

    RETURN QUERY
    WITH calendar_dates AS (
        SELECT
            generated_day::DATE AS next_birthday,
            EXTRACT(MONTH FROM generated_day)::SMALLINT AS birthday_month,
            EXTRACT(DAY FROM generated_day)::SMALLINT AS birthday_day
        FROM pg_catalog.generate_series(
            reference_date::TIMESTAMP,
            (reference_date + p_days_ahead)::TIMESTAMP,
            INTERVAL '1 day'
        ) generated_day
    ),
    birthday_candidates AS (
        SELECT
            calendar_date.next_birthday,
            calendar_date.birthday_month,
            calendar_date.birthday_day
        FROM calendar_dates calendar_date

        UNION ALL

        -- Surface 29 February birthdays on 28 February in non-leap years.
        SELECT
            calendar_date.next_birthday,
            2::SMALLINT,
            29::SMALLINT
        FROM calendar_dates calendar_date
        WHERE calendar_date.birthday_month = 2
            AND calendar_date.birthday_day = 28
            AND private.birthday_anniversary(
                EXTRACT(YEAR FROM calendar_date.next_birthday)::INTEGER,
                2,
                29
            ) = calendar_date.next_birthday
    ),
    scoped_profiles AS (
        SELECT
            target_profile.id,
            COALESCE(NULLIF(BTRIM(target_profile.first_name), ''), 'Worker') AS first_name,
            COALESCE(NULLIF(BTRIM(target_profile.last_name), ''), '') AS last_name,
            target_profile.avatar_url,
            COALESCE(NULLIF(BTRIM(target_profile.department), ''), department_row.name, 'Unassigned')
                AS department_name,
            target_profile.birthday_month,
            target_profile.birthday_day,
            birthday_candidate.next_birthday
        FROM public.profiles target_profile
        JOIN birthday_candidates birthday_candidate
            ON birthday_candidate.birthday_month = target_profile.birthday_month
            AND birthday_candidate.birthday_day = target_profile.birthday_day
        LEFT JOIN public.departments department_row
            ON department_row.id = target_profile.department_id
        WHERE target_profile.is_active IS TRUE
            AND target_profile.date_of_birth IS NOT NULL
            AND target_profile.birthday_month IS NOT NULL
            AND target_profile.birthday_day IS NOT NULL
            AND (
                (
                    NOT p_admin_view
                    AND caller_profile.department_id IS NOT NULL
                    AND target_profile.department_id = caller_profile.department_id
                    AND target_profile.id <> caller_id
                )
                OR (
                    p_admin_view
                    AND (
                        caller_profile.role::TEXT IN ('admin', 'super_admin')
                        OR target_profile.department_id IN (
                            SELECT managed_department.id
                            FROM public.departments managed_department
                            WHERE managed_department.is_active IS TRUE
                                AND (
                                    managed_department.head_user_id = caller_id
                                    OR (
                                        caller_profile.role::TEXT = 'team_admin'
                                        AND (
                                            managed_department.team_id = caller_profile.team_id
                                            OR EXISTS (
                                                SELECT 1
                                                FROM public.team_admin_assignments assignment_row
                                                WHERE assignment_row.user_id = caller_id
                                                    AND assignment_row.team_id = managed_department.team_id
                                            )
                                        )
                                    )
                                )
                        )
                    )
                )
            )
    )
    SELECT
        scoped_profile.first_name,
        scoped_profile.last_name,
        scoped_profile.avatar_url,
        scoped_profile.department_name,
        scoped_profile.birthday_month,
        scoped_profile.birthday_day,
        scoped_profile.next_birthday,
        (scoped_profile.next_birthday - reference_date)::INTEGER AS days_until
    FROM scoped_profiles scoped_profile
    ORDER BY
        scoped_profile.next_birthday,
        scoped_profile.first_name,
        scoped_profile.last_name
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_upcoming_birthdays(BOOLEAN, INTEGER, INTEGER)
IS 'Returns announcement-safe upcoming birthdays scoped to the authenticated worker or administrator; never returns birth year or full date of birth.';

REVOKE ALL ON FUNCTION private.birthday_anniversary(INTEGER, INTEGER, INTEGER)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_upcoming_birthdays(BOOLEAN, INTEGER, INTEGER)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_upcoming_birthdays(BOOLEAN, INTEGER, INTEGER)
TO authenticated, service_role;

COMMIT;
