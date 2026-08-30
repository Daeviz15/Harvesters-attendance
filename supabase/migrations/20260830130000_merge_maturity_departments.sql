-- ================================================================================
-- MERGE MATURITY TEAM DEPARTMENTS
--
-- Consolidates every active/inactive department under the MATURITY team into one
-- canonical department named "Maturity". This is intentionally implemented as a
-- transactional data migration and deactivates old department rows instead of
-- deleting them, preserving auditability and foreign-key safety.
-- ================================================================================

BEGIN;

DO $$
DECLARE
    maturity_team_id UUID;
    canonical_department_id UUID;
    obsolete_department_ids UUID[] := '{}';
    obsolete_department_names TEXT[] := '{}';
    affected_profiles INTEGER := 0;
    affected_events INTEGER := 0;
    affected_team_only_events INTEGER := 0;
    affected_logs INTEGER := 0;
    affected_recipients INTEGER := 0;
    affected_jobs INTEGER := 0;
    affected_feed_events INTEGER := 0;
    deactivated_departments INTEGER := 0;
BEGIN
    SELECT team_row.id
    INTO maturity_team_id
    FROM public.teams team_row
    WHERE LOWER(TRIM(team_row.name)) = 'maturity'
        OR UPPER(TRIM(team_row.code)) = 'MATURITY'
    ORDER BY
        CASE WHEN LOWER(TRIM(team_row.name)) = 'maturity' THEN 0 ELSE 1 END,
        team_row.created_at ASC
    LIMIT 1;

    IF maturity_team_id IS NULL THEN
        RAISE EXCEPTION 'Cannot merge Maturity departments because the MATURITY team does not exist.';
    END IF;

    LOCK TABLE public.departments IN SHARE ROW EXCLUSIVE MODE;
    LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;
    LOCK TABLE public.events IN SHARE ROW EXCLUSIVE MODE;

    SELECT department_row.id
    INTO canonical_department_id
    FROM public.departments department_row
    WHERE LOWER(TRIM(department_row.name)) = 'maturity'
        AND (
            department_row.team_id = maturity_team_id
            OR LOWER(TRIM(COALESCE(department_row.team, ''))) = 'maturity'
        )
    ORDER BY department_row.created_at ASC
    LIMIT 1;

    IF canonical_department_id IS NULL THEN
        IF EXISTS (
            SELECT 1
            FROM public.departments department_row
            WHERE LOWER(TRIM(department_row.name)) = 'maturity'
        ) THEN
            RAISE EXCEPTION 'A Maturity department exists outside the MATURITY team. Resolve that row before running this merge.';
        END IF;

        INSERT INTO public.departments (name, team, team_id, is_active, description)
        VALUES (
            'Maturity',
            'MATURITY',
            maturity_team_id,
            TRUE,
            'Canonical department for the MATURITY team after department consolidation.'
        )
        RETURNING id INTO canonical_department_id;
    ELSE
        UPDATE public.departments
        SET
            name = 'Maturity',
            team = 'MATURITY',
            team_id = maturity_team_id,
            is_active = TRUE,
            updated_at = NOW()
        WHERE id = canonical_department_id;
    END IF;

    SELECT
        COALESCE(ARRAY_AGG(department_row.id), '{}'),
        COALESCE(ARRAY_AGG(department_row.name), '{}')
    INTO obsolete_department_ids, obsolete_department_names
    FROM public.departments department_row
    WHERE department_row.id <> canonical_department_id
        AND (
            department_row.team_id = maturity_team_id
            OR LOWER(TRIM(COALESCE(department_row.team, ''))) = 'maturity'
        );

    UPDATE public.profiles profile_row
    SET
        department_id = canonical_department_id,
        department = 'Maturity',
        team_id = maturity_team_id,
        team = 'MATURITY',
        updated_at = NOW()
    WHERE profile_row.department_id = ANY(obsolete_department_ids)
        OR profile_row.department_id = canonical_department_id
        OR profile_row.team_id = maturity_team_id
        OR LOWER(TRIM(COALESCE(profile_row.team, ''))) = 'maturity'
        OR profile_row.department = ANY(obsolete_department_names);
    GET DIAGNOSTICS affected_profiles = ROW_COUNT;

    UPDATE public.events event_row
    SET
        department_id = canonical_department_id,
        team_id = maturity_team_id,
        updated_at = NOW()
    WHERE event_row.department_id = ANY(obsolete_department_ids)
        OR event_row.department_id = canonical_department_id;
    GET DIAGNOSTICS affected_events = ROW_COUNT;

    UPDATE public.events event_row
    SET
        team_id = maturity_team_id,
        updated_at = NOW()
    WHERE event_row.department_id IS NULL
        AND event_row.team_id = maturity_team_id;
    GET DIAGNOSTICS affected_team_only_events = ROW_COUNT;
    affected_events := affected_events + affected_team_only_events;

    UPDATE public.attendance_logs attendance_log
    SET
        department = 'Maturity',
        team = 'MATURITY'
    WHERE attendance_log.department = ANY(obsolete_department_names)
        OR attendance_log.department = 'Maturity'
        OR LOWER(TRIM(COALESCE(attendance_log.team, ''))) = 'maturity';
    GET DIAGNOSTICS affected_logs = ROW_COUNT;

    IF TO_REGCLASS('public.event_occurrence_recipients') IS NOT NULL THEN
        UPDATE public.event_occurrence_recipients recipient
        SET
            department_id = canonical_department_id,
            department_name = 'Maturity'
        WHERE recipient.department_id = ANY(obsolete_department_ids)
            OR recipient.department_id = canonical_department_id
            OR recipient.department_name = ANY(obsolete_department_names)
            OR recipient.department_name = 'Maturity';
        GET DIAGNOSTICS affected_recipients = ROW_COUNT;
    END IF;

    IF TO_REGCLASS('public.email_notification_jobs') IS NOT NULL THEN
        UPDATE public.email_notification_jobs notification_job
        SET
            department_name = 'Maturity',
            team_name = 'MATURITY'
        WHERE notification_job.department_name = ANY(obsolete_department_names)
            OR notification_job.department_name = 'Maturity'
            OR LOWER(TRIM(COALESCE(notification_job.team_name, ''))) = 'maturity';
        GET DIAGNOSTICS affected_jobs = ROW_COUNT;
    END IF;

    IF TO_REGCLASS('public.live_feed_events') IS NOT NULL THEN
        EXECUTE
            'UPDATE public.live_feed_events
             SET department = $1
             WHERE department = ANY($2)
                OR department = $1'
        USING 'Maturity', obsolete_department_names;
        GET DIAGNOSTICS affected_feed_events = ROW_COUNT;
    END IF;

    UPDATE public.departments department_row
    SET
        is_active = FALSE,
        head_user_id = NULL,
        updated_at = NOW()
    WHERE department_row.id = ANY(obsolete_department_ids);
    GET DIAGNOSTICS deactivated_departments = ROW_COUNT;

    RAISE NOTICE 'Maturity merge complete. canonical_department_id=%, obsolete_departments=%, profiles=%, events=%, attendance_logs=%, event_occurrence_recipients=%, email_jobs=%, live_feed_events=%, deactivated_departments=%',
        canonical_department_id,
        ARRAY_LENGTH(obsolete_department_ids, 1),
        affected_profiles,
        affected_events,
        affected_logs,
        affected_recipients,
        affected_jobs,
        affected_feed_events,
        deactivated_departments;
END $$;

COMMIT;
