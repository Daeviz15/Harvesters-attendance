-- Approved leave enforcement and audited early return.
--
-- Leave approval and leave lifecycle are intentionally separate. An approved
-- request remains approved for audit purposes; returned_early_at records when
-- the worker made themselves available for attendance again.

BEGIN;

ALTER TABLE public.leave_requests
    ADD COLUMN IF NOT EXISTS returned_early_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS returned_early_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS return_note TEXT;

ALTER TABLE public.leave_requests
    DROP CONSTRAINT IF EXISTS leave_requests_return_note_length_check,
    DROP CONSTRAINT IF EXISTS leave_requests_early_return_consistency_check;

ALTER TABLE public.leave_requests
    ADD CONSTRAINT leave_requests_return_note_length_check
        CHECK (return_note IS NULL OR CHAR_LENGTH(return_note) <= 500),
    ADD CONSTRAINT leave_requests_early_return_consistency_check
        CHECK (
            (returned_early_at IS NULL AND returned_early_by IS NULL AND return_note IS NULL)
            OR returned_early_at IS NOT NULL
        );

CREATE INDEX IF NOT EXISTS idx_leave_requests_active_approved_lookup
ON public.leave_requests (user_id, start_date, end_date)
WHERE status = 'approved' AND returned_early_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leave_requests_open_user_dates
ON public.leave_requests (user_id, start_date, end_date)
WHERE status IN ('pending', 'approved') AND returned_early_at IS NULL;

COMMENT ON COLUMN public.leave_requests.returned_early_at
IS 'Immutable effective timestamp at which an approved leave was ended early.';

COMMENT ON COLUMN public.leave_requests.returned_early_by
IS 'Authenticated profile that ended the approved leave early.';

COMMENT ON COLUMN public.leave_requests.return_note
IS 'Optional worker-provided note explaining an early return; maximum 500 characters.';

CREATE OR REPLACE FUNCTION private.is_user_on_approved_leave(
    p_user_id UUID,
    p_at TIMESTAMP WITH TIME ZONE,
    p_timezone TEXT DEFAULT 'Africa/Lagos'
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.leave_requests leave_request
        WHERE leave_request.user_id = p_user_id
            AND leave_request.status = 'approved'
            AND (p_at AT TIME ZONE p_timezone)::DATE
                BETWEEN leave_request.start_date AND leave_request.end_date
            AND (
                leave_request.returned_early_at IS NULL
                OR leave_request.returned_early_at > p_at
            )
    );
$$;

CREATE OR REPLACE FUNCTION private.prevent_attendance_during_approved_leave()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    effective_timezone TEXT := 'Africa/Lagos';
    requested_check_in_at TIMESTAMP WITH TIME ZONE := COALESCE(NEW.check_in_time, NOW());
BEGIN
    IF NEW.session_id IS NOT NULL THEN
        SELECT COALESCE(NULLIF(event_row.timezone, ''), 'Africa/Lagos')
        INTO effective_timezone
        FROM public.attendance_sessions session_row
        LEFT JOIN public.events event_row ON event_row.id = session_row.event_id
        WHERE session_row.id = NEW.session_id;

        effective_timezone := COALESCE(effective_timezone, 'Africa/Lagos');
    END IF;

    -- Evaluate both the actual write time and the supplied check-in timestamp.
    -- This prevents a caller from bypassing leave enforcement by backdating or
    -- future-dating check_in_time in a direct Data API request.
    IF private.is_user_on_approved_leave(NEW.user_id, NOW(), effective_timezone)
        OR private.is_user_on_approved_leave(
            NEW.user_id,
            requested_check_in_at,
            effective_timezone
        ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'LEAVE_ACTIVE: Approved leave must be ended before check-in.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.prevent_overlapping_open_leave_requests()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.status NOT IN ('pending', 'approved')
        OR NEW.returned_early_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Serialize leave lifecycle writes per worker so concurrent submissions
    -- cannot both pass the overlap check.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(NEW.user_id::TEXT, 0)
    );

    IF EXISTS (
        SELECT 1
        FROM public.leave_requests existing_request
        WHERE existing_request.user_id = NEW.user_id
            AND existing_request.id <> NEW.id
            AND existing_request.status IN ('pending', 'approved')
            AND existing_request.returned_early_at IS NULL
            AND existing_request.start_date <= NEW.end_date
            AND existing_request.end_date >= NEW.start_date
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'LEAVE_OVERLAP: An open leave request already covers part of this date range.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_overlapping_open_leave_requests
ON public.leave_requests;

CREATE TRIGGER prevent_overlapping_open_leave_requests
BEFORE INSERT OR UPDATE OF user_id, start_date, end_date, status, returned_early_at
ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION private.prevent_overlapping_open_leave_requests();

DROP TRIGGER IF EXISTS prevent_attendance_during_approved_leave
ON public.attendance_logs;

CREATE TRIGGER prevent_attendance_during_approved_leave
BEFORE INSERT OR UPDATE OF user_id, session_id, check_in_time
ON public.attendance_logs
FOR EACH ROW
EXECUTE FUNCTION private.prevent_attendance_during_approved_leave();

CREATE OR REPLACE FUNCTION public.end_my_leave_early(
    p_leave_request_id UUID,
    p_return_note TEXT DEFAULT NULL
)
RETURNS TABLE (
    leave_request_id UUID,
    returned_early_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id UUID := auth.uid();
    target_request public.leave_requests%ROWTYPE;
    normalized_note TEXT := NULLIF(BTRIM(COALESCE(p_return_note, '')), '');
    effective_now TIMESTAMP WITH TIME ZONE := NOW();
    effective_date DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::DATE;
BEGIN
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF normalized_note IS NOT NULL AND CHAR_LENGTH(normalized_note) > 500 THEN
        RAISE EXCEPTION 'Return note cannot exceed 500 characters.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles profile_row
        WHERE profile_row.id = caller_id
            AND profile_row.is_active IS DISTINCT FROM FALSE
    ) THEN
        RAISE EXCEPTION 'Your account is inactive.';
    END IF;

    SELECT leave_request.*
    INTO target_request
    FROM public.leave_requests leave_request
    WHERE leave_request.id = p_leave_request_id
    FOR UPDATE;

    IF NOT FOUND OR target_request.user_id <> caller_id THEN
        RAISE EXCEPTION 'Leave request not found.';
    END IF;

    IF target_request.status <> 'approved' THEN
        RAISE EXCEPTION 'Only approved leave can be ended early.';
    END IF;

    IF target_request.returned_early_at IS NOT NULL THEN
        RAISE EXCEPTION 'This leave has already been ended early.';
    END IF;

    IF effective_date < target_request.start_date
        OR effective_date > target_request.end_date THEN
        RAISE EXCEPTION 'Only currently active leave can be ended early.';
    END IF;

    UPDATE public.leave_requests leave_request
    SET
        returned_early_at = effective_now,
        returned_early_by = caller_id,
        return_note = normalized_note
    WHERE leave_request.id = target_request.id;

    RETURN QUERY
    SELECT target_request.id, effective_now;
END;
$$;

-- Legacy policies may still exist from the initial schema. Direct table
-- updates remain disabled; controlled transitions happen only through RPCs.
DROP POLICY IF EXISTS "Admins can update all leave requests"
ON public.leave_requests;

REVOKE UPDATE ON TABLE public.leave_requests FROM authenticated;

REVOKE ALL ON FUNCTION private.is_user_on_approved_leave(UUID, TIMESTAMP WITH TIME ZONE, TEXT)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.prevent_attendance_during_approved_leave()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.prevent_overlapping_open_leave_requests()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.end_my_leave_early(UUID, TEXT)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_my_leave_early(UUID, TEXT)
TO authenticated;

COMMIT;
