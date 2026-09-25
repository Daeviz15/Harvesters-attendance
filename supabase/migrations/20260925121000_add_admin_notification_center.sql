-- Durable, scope-aware in-app notifications for administrators.
--
-- Notifications are fanned out per recipient at write time. This keeps reads
-- index-friendly, gives every administrator an independent read state, and
-- allows Realtime to enforce recipient isolation through RLS.

BEGIN;

CREATE TABLE public.admin_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id UUID NOT NULL
        REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL
        CONSTRAINT admin_notifications_event_type_check CHECK (
            event_type IN (
                'leave_requested',
                'leave_approved',
                'leave_rejected',
                'leave_returned_early',
                'worker_deactivated',
                'worker_reactivated'
            )
        ),
    actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    subject_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL
        CONSTRAINT admin_notifications_title_check CHECK (
            CHAR_LENGTH(BTRIM(title)) BETWEEN 1 AND 120
        ),
    message TEXT NOT NULL
        CONSTRAINT admin_notifications_message_check CHECK (
            CHAR_LENGTH(BTRIM(message)) BETWEEN 1 AND 500
        ),
    action_url TEXT NOT NULL
        CONSTRAINT admin_notifications_action_url_check CHECK (
            action_url ~ '^/admin(?:/|$)'
            AND action_url !~ '[[:cntrl:]]'
            AND CHAR_LENGTH(action_url) <= 300
        ),
    dedupe_key TEXT NOT NULL
        CONSTRAINT admin_notifications_dedupe_key_check CHECK (
            CHAR_LENGTH(BTRIM(dedupe_key)) BETWEEN 1 AND 250
        ),
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT admin_notifications_recipient_dedupe_unique
        UNIQUE (recipient_user_id, dedupe_key)
);

CREATE INDEX idx_admin_notifications_recipient_created
ON public.admin_notifications (recipient_user_id, created_at DESC, id DESC);

CREATE INDEX idx_admin_notifications_recipient_unread
ON public.admin_notifications (recipient_user_id, created_at DESC, id DESC)
WHERE read_at IS NULL;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_notifications TO service_role;

DROP POLICY IF EXISTS "administrators_select_own_notifications"
ON public.admin_notifications;

CREATE POLICY "administrators_select_own_notifications"
ON public.admin_notifications
FOR SELECT
TO authenticated
USING (recipient_user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION private.enqueue_scoped_admin_notification(
    p_subject_user_id UUID,
    p_actor_user_id UUID,
    p_event_type TEXT,
    p_title TEXT,
    p_message TEXT,
    p_action_url TEXT,
    p_dedupe_key TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    target_department_id UUID;
    target_team_id UUID;
    inserted_count INTEGER := 0;
BEGIN
    SELECT
        subject_profile.department_id,
        COALESCE(subject_profile.team_id, department_row.team_id)
    INTO target_department_id, target_team_id
    FROM public.profiles subject_profile
    LEFT JOIN public.departments department_row
        ON department_row.id = subject_profile.department_id
    WHERE subject_profile.id = p_subject_user_id;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    INSERT INTO public.admin_notifications (
        recipient_user_id,
        event_type,
        actor_user_id,
        subject_user_id,
        title,
        message,
        action_url,
        dedupe_key
    )
    SELECT
        recipient.id,
        p_event_type,
        p_actor_user_id,
        p_subject_user_id,
        BTRIM(p_title),
        BTRIM(p_message),
        p_action_url,
        p_dedupe_key
    FROM (
        -- Global administrators receive every important activity.
        SELECT profile_row.id
        FROM public.profiles profile_row
        WHERE profile_row.is_active IS TRUE
            AND profile_row.role::TEXT IN ('admin', 'super_admin')

        UNION

        -- Team administrators receive activity only for their managed team.
        SELECT profile_row.id
        FROM public.profiles profile_row
        WHERE target_team_id IS NOT NULL
            AND profile_row.is_active IS TRUE
            AND profile_row.role::TEXT = 'team_admin'
            AND (
                profile_row.team_id = target_team_id
                OR EXISTS (
                    SELECT 1
                    FROM public.team_admin_assignments assignment_row
                    WHERE assignment_row.user_id = profile_row.id
                        AND assignment_row.team_id = target_team_id
                )
            )

        UNION

        -- A department head receives activity only for their department.
        SELECT profile_row.id
        FROM public.departments department_row
        JOIN public.profiles profile_row
            ON profile_row.id = department_row.head_user_id
        WHERE target_department_id IS NOT NULL
            AND department_row.id = target_department_id
            AND department_row.is_active IS TRUE
            AND profile_row.is_active IS TRUE
            AND profile_row.role::TEXT <> 'reports_admin'
    ) recipient
    WHERE recipient.id IS DISTINCT FROM p_actor_user_id
    ON CONFLICT (recipient_user_id, dedupe_key) DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION private.notify_admins_of_leave_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    worker_name TEXT;
    actor_id UUID := auth.uid();
    notification_type TEXT;
    notification_title TEXT;
    notification_message TEXT;
    notification_action_url TEXT := '/admin/leave-requests';
    notification_dedupe_key TEXT;
BEGIN
    SELECT CONCAT_WS(
        ' ',
        COALESCE(NULLIF(BTRIM(profile_row.first_name), ''), 'Worker'),
        NULLIF(BTRIM(profile_row.last_name), '')
    )
    INTO worker_name
    FROM public.profiles profile_row
    WHERE profile_row.id = NEW.user_id;

    worker_name := COALESCE(NULLIF(worker_name, ''), 'A worker');

    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
        notification_type := 'leave_requested';
        notification_title := 'New leave request';
        notification_message := FORMAT(
            '%s requested leave from %s to %s.',
            worker_name,
            TO_CHAR(NEW.start_date, 'Mon FMDD, YYYY'),
            TO_CHAR(NEW.end_date, 'Mon FMDD, YYYY')
        );
        notification_action_url := '/admin/leave-requests?status=pending';
        notification_dedupe_key := 'leave_requested:' || NEW.id::TEXT;
    ELSIF TG_OP = 'UPDATE'
        AND OLD.returned_early_at IS NULL
        AND NEW.returned_early_at IS NOT NULL THEN
        notification_type := 'leave_returned_early';
        notification_title := 'Worker resumed duty early';
        notification_message := FORMAT(
            '%s ended approved leave early and is available for duty.',
            worker_name
        );
        notification_action_url := '/admin/leave-requests?status=approved';
        notification_dedupe_key := 'leave_returned_early:' || NEW.id::TEXT;
    ELSIF TG_OP = 'UPDATE'
        AND OLD.status IS DISTINCT FROM NEW.status
        AND NEW.status IN ('approved', 'rejected') THEN
        notification_type := CASE NEW.status
            WHEN 'approved' THEN 'leave_approved'
            ELSE 'leave_rejected'
        END;
        notification_title := CASE NEW.status
            WHEN 'approved' THEN 'Leave request approved'
            ELSE 'Leave request rejected'
        END;
        notification_message := FORMAT(
            '%s''s leave request was %s.',
            worker_name,
            NEW.status
        );
        notification_action_url := '/admin/leave-requests?status=' || NEW.status;
        notification_dedupe_key := 'leave_' || NEW.status || ':' || NEW.id::TEXT;
    ELSE
        RETURN NEW;
    END IF;

    PERFORM private.enqueue_scoped_admin_notification(
        NEW.user_id,
        actor_id,
        notification_type,
        notification_title,
        notification_message,
        notification_action_url,
        notification_dedupe_key
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_admins_of_leave_activity
ON public.leave_requests;

CREATE TRIGGER notify_admins_of_leave_activity
AFTER INSERT OR UPDATE OF status, returned_early_at
ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION private.notify_admins_of_leave_activity();

CREATE OR REPLACE FUNCTION private.notify_admins_of_worker_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    worker_name TEXT := CONCAT_WS(
        ' ',
        COALESCE(NULLIF(BTRIM(NEW.first_name), ''), 'Worker'),
        NULLIF(BTRIM(NEW.last_name), '')
    );
    notification_type TEXT;
    notification_title TEXT;
    notification_message TEXT;
    transition_key TEXT := gen_random_uuid()::TEXT;
BEGIN
    IF OLD.is_active IS NOT DISTINCT FROM NEW.is_active THEN
        RETURN NEW;
    END IF;

    IF NEW.is_active IS FALSE THEN
        notification_type := 'worker_deactivated';
        notification_title := 'Worker deactivated';
        notification_message := FORMAT('%s''s account was deactivated.', worker_name);
    ELSE
        notification_type := 'worker_reactivated';
        notification_title := 'Worker reactivated';
        notification_message := FORMAT('%s''s account was reactivated.', worker_name);
    END IF;

    PERFORM private.enqueue_scoped_admin_notification(
        NEW.id,
        auth.uid(),
        notification_type,
        notification_title,
        notification_message,
        '/admin/workers',
        notification_type || ':' || NEW.id::TEXT || ':' || transition_key
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_admins_of_worker_status_change
ON public.profiles;

CREATE TRIGGER notify_admins_of_worker_status_change
AFTER UPDATE OF is_active
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION private.notify_admins_of_worker_status_change();

CREATE OR REPLACE FUNCTION public.mark_my_admin_notifications_read(
    p_notification_ids UUID[] DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id UUID := auth.uid();
    updated_count INTEGER := 0;
BEGIN
    IF caller_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '28000',
            MESSAGE = 'Authentication required.';
    END IF;

    IF p_notification_ids IS NOT NULL
        AND CARDINALITY(p_notification_ids) > 50 THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'At most 50 notifications can be updated at once.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles profile_row
        WHERE profile_row.id = caller_id
            AND profile_row.is_active IS TRUE
            AND (
                profile_row.role::TEXT IN ('admin', 'super_admin', 'team_admin')
                OR EXISTS (
                    SELECT 1
                    FROM public.departments department_row
                    WHERE department_row.head_user_id = caller_id
                        AND department_row.is_active IS TRUE
                )
            )
            AND profile_row.role::TEXT <> 'reports_admin'
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Administrative notification access is not permitted.';
    END IF;

    UPDATE public.admin_notifications notification_row
    SET read_at = NOW()
    WHERE notification_row.recipient_user_id = caller_id
        AND notification_row.read_at IS NULL
        AND (
            p_notification_ids IS NULL
            OR notification_row.id = ANY(p_notification_ids)
        );

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.prune_admin_notifications(
    p_read_retention_days INTEGER DEFAULT 90,
    p_unread_retention_days INTEGER DEFAULT 365
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    IF p_read_retention_days NOT BETWEEN 30 AND 730
        OR p_unread_retention_days NOT BETWEEN 90 AND 1460
        OR p_unread_retention_days < p_read_retention_days THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Invalid notification retention policy.';
    END IF;

    DELETE FROM public.admin_notifications notification_row
    WHERE (
            notification_row.read_at IS NOT NULL
            AND notification_row.created_at < NOW() - MAKE_INTERVAL(days => p_read_retention_days)
        )
        OR (
            notification_row.read_at IS NULL
            AND notification_row.created_at < NOW() - MAKE_INTERVAL(days => p_unread_retention_days)
        );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- Realtime Postgres Changes still enforces the SELECT policy above. Adding the
-- table to the publication only makes eligible rows available to subscribers.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_publication publication_row
        WHERE publication_row.pubname = 'supabase_realtime'
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_publication_tables publication_table
        WHERE publication_table.pubname = 'supabase_realtime'
            AND publication_table.schemaname = 'public'
            AND publication_table.tablename = 'admin_notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime
        ADD TABLE public.admin_notifications;
    END IF;
END $$;

REVOKE ALL ON FUNCTION private.enqueue_scoped_admin_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.notify_admins_of_leave_activity()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.notify_admins_of_worker_status_change()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.mark_my_admin_notifications_read(UUID[])
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_my_admin_notifications_read(UUID[])
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.prune_admin_notifications(INTEGER, INTEGER)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_admin_notifications(INTEGER, INTEGER)
TO service_role;

COMMENT ON TABLE public.admin_notifications
IS 'Per-recipient, scope-enforced administrative activity notifications with independent read state.';

COMMIT;
