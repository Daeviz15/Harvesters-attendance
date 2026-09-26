-- Secure worker check-in assistance workflow.
--
-- A request is an auditable support signal, never an attendance record. Failed
-- coordinates are deliberately not stored: only coarse diagnostics needed to
-- troubleshoot device/location quality are retained. Administrator access is
-- re-evaluated against current department/team scope on every read and update.

BEGIN;

ALTER TABLE public.admin_notifications
    DROP CONSTRAINT IF EXISTS admin_notifications_event_type_check;

ALTER TABLE public.admin_notifications
    ADD CONSTRAINT admin_notifications_event_type_check CHECK (
        event_type IN (
            'leave_requested',
            'leave_approved',
            'leave_rejected',
            'leave_returned_early',
            'worker_deactivated',
            'worker_reactivated',
            'check_in_assistance_requested'
        )
    );

CREATE TABLE public.check_in_assistance_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL
        REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
    event_id UUID NOT NULL
        REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL
        REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_status TEXT NOT NULL
        CONSTRAINT check_in_assistance_reported_status_check CHECK (
            reported_status IN ('low_accuracy', 'not_confirmed', 'unavailable')
        ),
    reported_accuracy_meters DOUBLE PRECISION
        CONSTRAINT check_in_assistance_accuracy_check CHECK (
            reported_accuracy_meters IS NULL
            OR reported_accuracy_meters BETWEEN 0 AND 10000
        ),
    nearest_location_id UUID
        REFERENCES public.locations(id) ON DELETE SET NULL,
    nearest_distance_meters DOUBLE PRECISION
        CONSTRAINT check_in_assistance_distance_check CHECK (
            nearest_distance_meters IS NULL
            OR nearest_distance_meters BETWEEN 0 AND 1000000
        ),
    position_timestamp TIMESTAMP WITH TIME ZONE,
    worker_message TEXT
        CONSTRAINT check_in_assistance_worker_message_check CHECK (
            worker_message IS NULL
            OR CHAR_LENGTH(BTRIM(worker_message)) BETWEEN 1 AND 500
        ),
    status TEXT NOT NULL DEFAULT 'open'
        CONSTRAINT check_in_assistance_status_check CHECK (
            status IN ('open', 'acknowledged', 'resolved', 'dismissed', 'expired')
        ),
    acknowledged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_note TEXT
        CONSTRAINT check_in_assistance_resolution_note_check CHECK (
            resolution_note IS NULL
            OR CHAR_LENGTH(BTRIM(resolution_note)) BETWEEN 1 AND 500
        ),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX check_in_assistance_one_active_per_worker_session
ON public.check_in_assistance_requests (session_id, user_id)
WHERE status IN ('open', 'acknowledged');

CREATE INDEX idx_check_in_assistance_active_created
ON public.check_in_assistance_requests (created_at DESC, id DESC)
WHERE status IN ('open', 'acknowledged');

CREATE INDEX idx_check_in_assistance_user_created
ON public.check_in_assistance_requests (user_id, created_at DESC, id DESC);

ALTER TABLE public.check_in_assistance_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.check_in_assistance_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.check_in_assistance_requests TO service_role;

COMMENT ON TABLE public.check_in_assistance_requests IS
    'Auditable check-in support requests. Requests never create attendance or bypass location confirmation.';
COMMENT ON COLUMN public.check_in_assistance_requests.reported_accuracy_meters IS
    'Browser-reported horizontal accuracy only; failed latitude/longitude values are intentionally not retained.';

CREATE OR REPLACE FUNCTION private.can_manage_check_in_assistance_user(
    p_user_id UUID,
    p_actor_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH target_scope AS (
        SELECT
            target_profile.department_id,
            COALESCE(target_profile.team_id, target_department.team_id) AS team_id
        FROM public.profiles target_profile
        LEFT JOIN public.departments target_department
            ON target_department.id = target_profile.department_id
        WHERE target_profile.id = p_user_id
    )
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles actor_profile
        CROSS JOIN target_scope target
        WHERE actor_profile.id = p_actor_id
            AND actor_profile.is_active IS TRUE
            AND actor_profile.role::TEXT <> 'reports_admin'
            AND (
                actor_profile.role::TEXT IN ('admin', 'super_admin')
                OR (
                    target.team_id IS NOT NULL
                    AND actor_profile.role::TEXT = 'team_admin'
                    AND (
                        actor_profile.team_id = target.team_id
                        OR EXISTS (
                            SELECT 1
                            FROM public.team_admin_assignments assignment_row
                            WHERE assignment_row.user_id = actor_profile.id
                                AND assignment_row.team_id = target.team_id
                        )
                    )
                )
                OR (
                    target.department_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1
                        FROM public.departments department_row
                        WHERE department_row.id = target.department_id
                            AND department_row.is_active IS TRUE
                            AND department_row.head_user_id = actor_profile.id
                    )
                )
            )
    );
$$;

CREATE OR REPLACE FUNCTION private.touch_check_in_assistance_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER touch_check_in_assistance_request_updated_at
BEFORE UPDATE ON public.check_in_assistance_requests
FOR EACH ROW
EXECUTE FUNCTION private.touch_check_in_assistance_request();

CREATE OR REPLACE FUNCTION private.notify_admins_of_check_in_assistance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    worker_name TEXT;
    event_title TEXT;
    diagnostic_label TEXT;
BEGIN
    SELECT CONCAT_WS(
        ' ',
        COALESCE(NULLIF(BTRIM(profile_row.first_name), ''), 'Worker'),
        NULLIF(BTRIM(profile_row.last_name), '')
    )
    INTO worker_name
    FROM public.profiles profile_row
    WHERE profile_row.id = NEW.user_id;

    SELECT COALESCE(NULLIF(BTRIM(event_row.title), ''), 'the active event')
    INTO event_title
    FROM public.events event_row
    WHERE event_row.id = NEW.event_id;

    diagnostic_label := CASE NEW.reported_status
        WHEN 'low_accuracy' THEN 'their phone could not obtain an accurate location reading'
        WHEN 'not_confirmed' THEN 'their location could not be confirmed at the venue'
        ELSE 'location services were unavailable'
    END;

    PERFORM private.enqueue_scoped_admin_notification(
        NEW.user_id,
        NEW.user_id,
        'check_in_assistance_requested',
        'Check-in help requested',
        FORMAT(
            '%s needs help checking in for %s because %s.',
            COALESCE(NULLIF(worker_name, ''), 'A worker'),
            COALESCE(event_title, 'the active event'),
            diagnostic_label
        ),
        '/admin/check-in-assistance?request=' || NEW.id::TEXT,
        'check_in_assistance_requested:' || NEW.id::TEXT
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER notify_admins_of_check_in_assistance
AFTER INSERT ON public.check_in_assistance_requests
FOR EACH ROW
EXECUTE FUNCTION private.notify_admins_of_check_in_assistance();

CREATE OR REPLACE FUNCTION private.close_check_in_assistance_after_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.session_id IS NULL THEN
        RETURN NEW;
    END IF;

    UPDATE public.check_in_assistance_requests request_row
    SET
        status = 'resolved',
        resolved_by = NEW.checked_in_by,
        resolved_at = NOW(),
        resolution_note = CASE
            WHEN NEW.is_manual IS TRUE THEN 'Attendance was recorded by an administrator.'
            ELSE 'The worker completed self check-in.'
        END
    WHERE request_row.session_id = NEW.session_id
        AND request_row.user_id = NEW.user_id
        AND request_row.status IN ('open', 'acknowledged');

    RETURN NEW;
END;
$$;

CREATE TRIGGER close_check_in_assistance_after_attendance
AFTER INSERT ON public.attendance_logs
FOR EACH ROW
EXECUTE FUNCTION private.close_check_in_assistance_after_attendance();

CREATE OR REPLACE FUNCTION private.expire_check_in_assistance_after_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF OLD.status = 'active' AND NEW.status = 'ended' THEN
        UPDATE public.check_in_assistance_requests request_row
        SET
            status = 'expired',
            resolved_at = NOW(),
            resolution_note = 'The attendance session ended before the request was resolved.'
        WHERE request_row.session_id = NEW.id
            AND request_row.status IN ('open', 'acknowledged');
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER expire_check_in_assistance_after_session
AFTER UPDATE OF status ON public.attendance_sessions
FOR EACH ROW
EXECUTE FUNCTION private.expire_check_in_assistance_after_session();

CREATE OR REPLACE FUNCTION public.request_my_check_in_assistance(
    p_session_id UUID,
    p_reported_status TEXT,
    p_reported_accuracy_meters DOUBLE PRECISION DEFAULT NULL,
    p_nearest_location_id UUID DEFAULT NULL,
    p_nearest_distance_meters DOUBLE PRECISION DEFAULT NULL,
    p_position_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_worker_message TEXT DEFAULT NULL
)
RETURNS TABLE (request_id UUID, already_open BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id UUID := auth.uid();
    caller_profile public.profiles%ROWTYPE;
    caller_team_id UUID;
    selected_session RECORD;
    existing_request_id UUID;
    created_request_id UUID;
    local_event_date DATE;
    clean_message TEXT := NULLIF(BTRIM(p_worker_message), '');
BEGIN
    IF caller_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Authentication required.';
    END IF;

    IF p_reported_status NOT IN ('low_accuracy', 'not_confirmed', 'unavailable')
        OR (p_reported_accuracy_meters IS NOT NULL AND p_reported_accuracy_meters NOT BETWEEN 0 AND 10000)
        OR (p_nearest_distance_meters IS NOT NULL AND p_nearest_distance_meters NOT BETWEEN 0 AND 1000000)
        OR (clean_message IS NOT NULL AND CHAR_LENGTH(clean_message) > 500)
        OR (
            p_position_timestamp IS NOT NULL
            AND p_position_timestamp NOT BETWEEN NOW() - INTERVAL '10 minutes' AND NOW() + INTERVAL '2 minutes'
        ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid check-in assistance details.';
    END IF;

    SELECT profile_row.*
    INTO caller_profile
    FROM public.profiles profile_row
    WHERE profile_row.id = caller_id
        AND profile_row.is_active IS TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Your worker account is inactive.';
    END IF;

    SELECT COALESCE(caller_profile.team_id, department_row.team_id)
    INTO caller_team_id
    FROM public.departments department_row
    WHERE department_row.id = caller_profile.department_id;

    caller_team_id := COALESCE(caller_team_id, caller_profile.team_id);

    SELECT
        session_row.id,
        session_row.event_id,
        session_row.status,
        session_row.created_by,
        event_row.title,
        event_row.department_id,
        event_row.team_id,
        event_row.created_by AS event_created_by,
        event_row.location_ids,
        COALESCE(NULLIF(event_row.timezone, ''), 'Africa/Lagos') AS timezone
    INTO selected_session
    FROM public.attendance_sessions session_row
    JOIN public.events event_row ON event_row.id = session_row.event_id
    WHERE session_row.id = p_session_id
        AND session_row.status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'This attendance session is no longer active.';
    END IF;

    IF NOT (
        selected_session.department_id IS NULL AND selected_session.team_id IS NULL
        OR selected_session.created_by = caller_id
        OR selected_session.event_created_by = caller_id
        OR selected_session.department_id = caller_profile.department_id
        OR (
            selected_session.department_id IS NULL
            AND selected_session.team_id IS NOT NULL
            AND selected_session.team_id = caller_team_id
        )
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This event is outside your worker scope.';
    END IF;

    IF p_nearest_location_id IS NOT NULL AND NOT (
        p_nearest_location_id = ANY(COALESCE(selected_session.location_ids, '{}'::UUID[]))
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The reported location is not assigned to this event.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.attendance_logs attendance_row
        WHERE attendance_row.session_id = p_session_id
            AND attendance_row.user_id = caller_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Attendance has already been recorded for this event.';
    END IF;

    local_event_date := (NOW() AT TIME ZONE selected_session.timezone)::DATE;
    IF EXISTS (
        SELECT 1
        FROM public.leave_requests leave_row
        WHERE leave_row.user_id = caller_id
            AND leave_row.status = 'approved'
            AND leave_row.returned_early_at IS NULL
            AND local_event_date BETWEEN leave_row.start_date AND leave_row.end_date
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Resume duty before requesting check-in assistance.';
    END IF;

    SELECT request_row.id
    INTO existing_request_id
    FROM public.check_in_assistance_requests request_row
    WHERE request_row.session_id = p_session_id
        AND request_row.user_id = caller_id
        AND request_row.status IN ('open', 'acknowledged')
    LIMIT 1;

    IF existing_request_id IS NOT NULL THEN
        RETURN QUERY SELECT existing_request_id, TRUE;
        RETURN;
    END IF;

    IF (
        SELECT COUNT(*)
        FROM public.check_in_assistance_requests request_row
        WHERE request_row.user_id = caller_id
            AND request_row.created_at >= NOW() - INTERVAL '30 minutes'
    ) >= 3 THEN
        RAISE EXCEPTION USING ERRCODE = '42900', MESSAGE = 'Too many assistance requests. Please speak directly with an event leader.';
    END IF;

    BEGIN
        INSERT INTO public.check_in_assistance_requests (
            session_id,
            event_id,
            user_id,
            reported_status,
            reported_accuracy_meters,
            nearest_location_id,
            nearest_distance_meters,
            position_timestamp,
            worker_message
        ) VALUES (
            p_session_id,
            selected_session.event_id,
            caller_id,
            p_reported_status,
            p_reported_accuracy_meters,
            p_nearest_location_id,
            p_nearest_distance_meters,
            p_position_timestamp,
            clean_message
        )
        RETURNING id INTO created_request_id;
    EXCEPTION WHEN unique_violation THEN
        SELECT request_row.id
        INTO existing_request_id
        FROM public.check_in_assistance_requests request_row
        WHERE request_row.session_id = p_session_id
            AND request_row.user_id = caller_id
            AND request_row.status IN ('open', 'acknowledged')
        LIMIT 1;

        RETURN QUERY SELECT existing_request_id, TRUE;
        RETURN;
    END;

    RETURN QUERY SELECT created_request_id, FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_check_in_assistance_requests(
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    session_id UUID,
    event_id UUID,
    event_title TEXT,
    user_id UUID,
    worker_name TEXT,
    worker_code TEXT,
    department_name TEXT,
    reported_status TEXT,
    reported_accuracy_meters DOUBLE PRECISION,
    nearest_location_name TEXT,
    nearest_distance_meters DOUBLE PRECISION,
    worker_message TEXT,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_note TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id UUID := auth.uid();
BEGIN
    IF caller_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Authentication required.';
    END IF;

    IF p_limit NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Request limit must be between 1 and 100.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles profile_row
        WHERE profile_row.id = caller_id
            AND profile_row.is_active IS TRUE
            AND profile_row.role::TEXT <> 'reports_admin'
            AND (
                profile_row.role::TEXT IN ('admin', 'super_admin', 'team_admin')
                OR EXISTS (
                    SELECT 1
                    FROM public.departments department_row
                    WHERE department_row.head_user_id = caller_id
                        AND department_row.is_active IS TRUE
                )
            )
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrative assistance access is not permitted.';
    END IF;

    RETURN QUERY
    SELECT
        request_row.id,
        request_row.session_id,
        request_row.event_id,
        event_row.title,
        request_row.user_id,
        CONCAT_WS(
            ' ',
            COALESCE(NULLIF(BTRIM(worker_profile.first_name), ''), 'Worker'),
            NULLIF(BTRIM(worker_profile.last_name), '')
        ),
        worker_profile.worker_id,
        COALESCE(NULLIF(BTRIM(department_row.name), ''), NULLIF(BTRIM(worker_profile.department), '')),
        request_row.reported_status,
        request_row.reported_accuracy_meters,
        location_row.name,
        request_row.nearest_distance_meters,
        request_row.worker_message,
        request_row.status,
        request_row.created_at,
        request_row.acknowledged_at,
        request_row.resolved_at,
        request_row.resolution_note
    FROM public.check_in_assistance_requests request_row
    JOIN public.events event_row ON event_row.id = request_row.event_id
    JOIN public.profiles worker_profile ON worker_profile.id = request_row.user_id
    LEFT JOIN public.departments department_row ON department_row.id = worker_profile.department_id
    LEFT JOIN public.locations location_row ON location_row.id = request_row.nearest_location_id
    WHERE private.can_manage_check_in_assistance_user(request_row.user_id, caller_id)
    ORDER BY
        CASE request_row.status
            WHEN 'open' THEN 0
            WHEN 'acknowledged' THEN 1
            ELSE 2
        END,
        request_row.created_at DESC,
        request_row.id DESC
    LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_check_in_assistance_request(
    p_request_id UUID,
    p_status TEXT,
    p_resolution_note TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id UUID := auth.uid();
    target_request public.check_in_assistance_requests%ROWTYPE;
    clean_note TEXT := NULLIF(BTRIM(p_resolution_note), '');
    updated_status TEXT;
BEGIN
    IF caller_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Authentication required.';
    END IF;

    IF p_status NOT IN ('acknowledged', 'resolved', 'dismissed')
        OR (clean_note IS NOT NULL AND CHAR_LENGTH(clean_note) > 500)
        OR (p_status IN ('resolved', 'dismissed') AND COALESCE(CHAR_LENGTH(clean_note), 0) < 3) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid status and resolution note are required.';
    END IF;

    SELECT request_row.*
    INTO target_request
    FROM public.check_in_assistance_requests request_row
    WHERE request_row.id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Assistance request not found.';
    END IF;

    IF NOT private.can_manage_check_in_assistance_user(target_request.user_id, caller_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This assistance request is outside your administrative scope.';
    END IF;

    IF target_request.status IN ('resolved', 'dismissed', 'expired') THEN
        RETURN target_request.status;
    END IF;

    UPDATE public.check_in_assistance_requests request_row
    SET
        status = p_status,
        acknowledged_by = CASE
            WHEN request_row.acknowledged_by IS NULL THEN caller_id
            ELSE request_row.acknowledged_by
        END,
        acknowledged_at = COALESCE(request_row.acknowledged_at, NOW()),
        resolved_by = CASE WHEN p_status IN ('resolved', 'dismissed') THEN caller_id ELSE NULL END,
        resolved_at = CASE WHEN p_status IN ('resolved', 'dismissed') THEN NOW() ELSE NULL END,
        resolution_note = CASE WHEN p_status IN ('resolved', 'dismissed') THEN clean_note ELSE NULL END
    WHERE request_row.id = p_request_id
        AND request_row.status IN ('open', 'acknowledged')
    RETURNING request_row.status INTO updated_status;

    RETURN COALESCE(updated_status, target_request.status);
END;
$$;

REVOKE ALL ON FUNCTION private.can_manage_check_in_assistance_user(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.touch_check_in_assistance_request()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.notify_admins_of_check_in_assistance()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.close_check_in_assistance_after_attendance()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.expire_check_in_assistance_after_session()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.request_my_check_in_assistance(UUID, TEXT, DOUBLE PRECISION, UUID, DOUBLE PRECISION, TIMESTAMP WITH TIME ZONE, TEXT)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_check_in_assistance_requests(INTEGER)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_check_in_assistance_request(UUID, TEXT, TEXT)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.request_my_check_in_assistance(UUID, TEXT, DOUBLE PRECISION, UUID, DOUBLE PRECISION, TIMESTAMP WITH TIME ZONE, TEXT)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_check_in_assistance_requests(INTEGER)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_check_in_assistance_request(UUID, TEXT, TEXT)
TO authenticated, service_role;

COMMIT;
