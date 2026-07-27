-- =============================================
-- Attendance Analytics RPC Function
-- =============================================
-- This function performs all attendance analytics
-- aggregation server-side in PostgreSQL for maximum
-- efficiency, scalability, and security.
--
-- Run this SQL in your Supabase SQL Editor.
-- =============================================

CREATE OR REPLACE FUNCTION get_attendance_analytics()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
    v_total_check_ins BIGINT;
    v_self_gps_check_ins BIGINT;
    v_proxy_check_ins BIGINT;
    v_gps_rate_percent INTEGER;
    v_active_sessions_count BIGINT;
    v_total_workers_count BIGINT;
    v_ministry_turnout JSON;
    v_top_departments JSON;
    v_latest_session_summary JSON;
    v_attendance_trends JSON;
BEGIN
    -- Verify the caller is an admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Forbidden: Admin access required';
    END IF;

    -- Total check-ins, GPS vs proxy counts (single table scan)
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE is_manual = false),
        COUNT(*) FILTER (WHERE is_manual = true)
    INTO v_total_check_ins, v_self_gps_check_ins, v_proxy_check_ins
    FROM attendance_logs;

    -- GPS rate percentage
    IF v_total_check_ins > 0 THEN
        v_gps_rate_percent := ROUND((v_self_gps_check_ins::NUMERIC / v_total_check_ins) * 100);
    ELSE
        v_gps_rate_percent := 0;
    END IF;

    -- Active sessions count
    SELECT COUNT(*)
    INTO v_active_sessions_count
    FROM attendance_sessions
    WHERE status = 'active';

    -- Total workers count
    SELECT COUNT(*)
    INTO v_total_workers_count
    FROM profiles;

    -- Ministry turnout breakdown (GROUP BY in SQL)
    SELECT COALESCE(json_agg(
        json_build_object(
            'team', team_name,
            'count', team_count,
            'percentage', CASE
                WHEN v_total_check_ins > 0
                THEN ROUND((team_count::NUMERIC / v_total_check_ins) * 100)
                ELSE 0
            END
        )
        ORDER BY team_count DESC
    ), '[]'::json)
    INTO v_ministry_turnout
    FROM (
        SELECT
            UPPER(TRIM(COALESCE(team, 'GENERAL'))) AS team_name,
            COUNT(*) AS team_count
        FROM attendance_logs
        GROUP BY UPPER(TRIM(COALESCE(team, 'GENERAL')))
    ) ministry_stats;

    -- Top 5 departments by attendance volume
    SELECT COALESCE(json_agg(
        json_build_object(
            'department', dept_name,
            'team', team_name,
            'count', dept_count
        )
    ), '[]'::json)
    INTO v_top_departments
    FROM (
        SELECT
            COALESCE(department, 'General') AS dept_name,
            UPPER(TRIM(COALESCE(team, 'GENERAL'))) AS team_name,
            COUNT(*) AS dept_count
        FROM attendance_logs
        GROUP BY COALESCE(department, 'General'), UPPER(TRIM(COALESCE(team, 'GENERAL')))
        ORDER BY dept_count DESC
        LIMIT 5
    ) dept_stats;

    -- Latest session summary
    SELECT json_build_object(
        'title', COALESCE(e.title, 'Service Event'),
        'date', s.start_time,
        'totalCheckedIn', (
            SELECT COUNT(*)
            FROM attendance_logs al
            WHERE al.session_id = s.id
        )
    )
    INTO v_latest_session_summary
    FROM attendance_sessions s
    LEFT JOIN events e ON e.id = s.event_id
    ORDER BY s.start_time DESC
    LIMIT 1;

    -- Attendance trends (last 10 sessions)
    SELECT COALESCE(json_agg(
        json_build_object(
            'session_date', TO_CHAR(s.start_time, 'Mon DD'),
            'title', COALESCE(e.title, 'Service'),
            'attendance', (
                SELECT COUNT(*)
                FROM attendance_logs al
                WHERE al.session_id = s.id
            )
        )
        ORDER BY s.start_time ASC
    ), '[]'::json)
    INTO v_attendance_trends
    FROM (
        SELECT id, start_time, event_id
        FROM attendance_sessions
        ORDER BY start_time DESC
        LIMIT 10
    ) s
    LEFT JOIN events e ON e.id = s.event_id;

    -- Build final result
    result := json_build_object(
        'totalCheckIns', v_total_check_ins,
        'selfGpsCheckIns', v_self_gps_check_ins,
        'proxyCheckIns', v_proxy_check_ins,
        'gpsRatePercent', v_gps_rate_percent,
        'activeSessionsCount', v_active_sessions_count,
        'totalWorkersCount', v_total_workers_count,
        'ministryTurnout', v_ministry_turnout,
        'topDepartments', v_top_departments,
        'latestSessionSummary', v_latest_session_summary,
        'attendanceTrends', v_attendance_trends
    );

    RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
-- (the function itself checks for admin role internally)
GRANT EXECUTE ON FUNCTION get_attendance_analytics() TO authenticated;
