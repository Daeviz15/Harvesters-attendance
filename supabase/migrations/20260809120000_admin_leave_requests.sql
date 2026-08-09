-- Admin leave request review foundation.
-- Safe to run against projects where leave_requests already exists.

CREATE TABLE IF NOT EXISTS public.leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    leave_type TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.leave_requests
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS review_note TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'leave_requests_status_check'
            AND conrelid = 'public.leave_requests'::regclass
    ) THEN
        ALTER TABLE public.leave_requests
            ADD CONSTRAINT leave_requests_status_check
            CHECK (status IN ('pending', 'approved', 'rejected'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'leave_requests_date_range_check'
            AND conrelid = 'public.leave_requests'::regclass
    ) THEN
        ALTER TABLE public.leave_requests
            ADD CONSTRAINT leave_requests_date_range_check
            CHECK (end_date >= start_date);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leave_requests_user_id
ON public.leave_requests (user_id);

CREATE INDEX IF NOT EXISTS idx_leave_requests_status_created_at
ON public.leave_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leave_requests_start_end
ON public.leave_requests (start_date, end_date);

CREATE OR REPLACE FUNCTION public.touch_leave_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_leave_requests_updated_at ON public.leave_requests;
CREATE TRIGGER touch_leave_requests_updated_at
BEFORE UPDATE ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.touch_leave_requests_updated_at();

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_leave_request(p_requester_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT
        public.is_super_admin()
        OR EXISTS (
            SELECT 1
            FROM public.profiles requester
            WHERE requester.id = p_requester_id
                AND (
                    requester.department_id IN (
                        SELECT managed.department_id
                        FROM public.get_managed_department_ids() managed
                    )
                    OR requester.team_id IN (
                        SELECT managed.team_id
                        FROM public.get_managed_team_ids() managed
                    )
                )
        );
$$;

CREATE OR REPLACE FUNCTION public.review_leave_request(
    p_leave_request_id UUID,
    p_status TEXT,
    p_review_note TEXT DEFAULT NULL
)
RETURNS public.leave_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    target_request public.leave_requests%ROWTYPE;
    updated_request public.leave_requests%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_status NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Invalid leave request status.';
    END IF;

    SELECT *
    INTO target_request
    FROM public.leave_requests
    WHERE id = p_leave_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Leave request not found.';
    END IF;

    IF NOT public.can_manage_leave_request(target_request.user_id) THEN
        RAISE EXCEPTION 'You are not allowed to review this leave request.';
    END IF;

    IF target_request.status <> 'pending' THEN
        RAISE EXCEPTION 'This leave request has already been reviewed.';
    END IF;

    UPDATE public.leave_requests
    SET
        status = p_status,
        reviewed_by = auth.uid(),
        reviewed_at = NOW(),
        review_note = NULLIF(BTRIM(COALESCE(p_review_note, '')), '')
    WHERE id = p_leave_request_id
    RETURNING * INTO updated_request;

    RETURN updated_request;
END;
$$;

DROP POLICY IF EXISTS "leave_requests_select_own_or_scoped_admin" ON public.leave_requests;
CREATE POLICY "leave_requests_select_own_or_scoped_admin"
ON public.leave_requests
FOR SELECT
TO authenticated
USING (
    (SELECT auth.uid()) = user_id
    OR public.can_manage_leave_request(user_id)
);

DROP POLICY IF EXISTS "leave_requests_insert_own" ON public.leave_requests;
CREATE POLICY "leave_requests_insert_own"
ON public.leave_requests
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "leave_requests_delete_none" ON public.leave_requests;
CREATE POLICY "leave_requests_delete_none"
ON public.leave_requests
FOR DELETE
TO authenticated
USING (FALSE);

-- Reviews are performed through server-side actions after RBAC checks.
-- Do not allow browser-authenticated clients to update arbitrary leave columns directly.
REVOKE UPDATE ON TABLE public.leave_requests FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.leave_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leave_requests TO service_role;
GRANT EXECUTE ON FUNCTION public.review_leave_request(UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.touch_leave_requests_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_leave_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_leave_request(UUID) TO authenticated;

COMMENT ON TABLE public.leave_requests
IS 'Worker/admin leave requests. Workers can create and view their own requests; admin review is scoped through server-side RBAC and RLS.';

COMMENT ON COLUMN public.leave_requests.reviewed_by
IS 'Admin profile that approved or rejected the request.';
