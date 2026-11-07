-- Retain support evidence independently of the bell's per-recipient read state.
-- Apply before deploying the matching assistance history UI.
BEGIN;

-- A referenced worker, event, or session must be retained rather than silently
-- cascading away complaint evidence. Use deactivation for these parent records.
ALTER TABLE public.check_in_assistance_requests
  DROP CONSTRAINT check_in_assistance_requests_session_id_fkey,
  DROP CONSTRAINT check_in_assistance_requests_event_id_fkey,
  DROP CONSTRAINT check_in_assistance_requests_user_id_fkey,
  ADD CONSTRAINT check_in_assistance_requests_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.attendance_sessions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT check_in_assistance_requests_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT,
  ADD CONSTRAINT check_in_assistance_requests_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

REVOKE DELETE, TRUNCATE ON public.check_in_assistance_requests FROM service_role;

CREATE INDEX idx_check_in_assistance_status_created
  ON public.check_in_assistance_requests (status, created_at DESC, id DESC);
CREATE INDEX idx_check_in_assistance_session
  ON public.check_in_assistance_requests (session_id);
CREATE INDEX idx_check_in_assistance_event
  ON public.check_in_assistance_requests (event_id);

CREATE TABLE public.check_in_assistance_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.check_in_assistance_requests(id) ON DELETE RESTRICT,
  -- Snapshot the actor name; the historical actor ID deliberately has no FK so
  -- deleting an unrelated reviewer cannot mutate the recorded evidence.
  actor_user_id UUID,
  actor_name TEXT NOT NULL,
  previous_status TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed', 'expired')),
  note TEXT,
  is_baseline BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_check_in_assistance_activity_request
  ON public.check_in_assistance_activity (request_id, created_at, id);
ALTER TABLE public.check_in_assistance_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.check_in_assistance_activity FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.check_in_assistance_activity TO service_role;

-- Existing rows are a baseline, not a reconstructed history of earlier edits.
INSERT INTO public.check_in_assistance_activity
  (request_id, actor_user_id, actor_name, status, note, is_baseline)
SELECT id, NULL, 'Existing record', status, resolution_note, TRUE
FROM public.check_in_assistance_requests;

CREATE FUNCTION private.protect_assistance_history()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '42501',
    MESSAGE = 'Complaint history is retained as evidence and cannot be deleted or rewritten.';
END;
$$;
CREATE TRIGGER protect_assistance_requests_deletion
  BEFORE DELETE OR TRUNCATE ON public.check_in_assistance_requests
  FOR EACH STATEMENT EXECUTE FUNCTION private.protect_assistance_history();
CREATE TRIGGER protect_assistance_activity_changes
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.check_in_assistance_activity
  FOR EACH STATEMENT EXECUTE FUNCTION private.protect_assistance_history();

CREATE FUNCTION private.record_assistance_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor_id UUID;
  actor_display_name TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('resolved', 'dismissed', 'expired') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'A closed complaint cannot be reopened or have its outcome replaced.';
    END IF;
    IF ROW(NEW.id, NEW.session_id, NEW.event_id, NEW.user_id, NEW.worker_message,
           NEW.reported_status, NEW.reported_accuracy_meters, NEW.nearest_distance_meters,
           NEW.position_timestamp, NEW.created_at)
      IS DISTINCT FROM
       ROW(OLD.id, OLD.session_id, OLD.event_id, OLD.user_id, OLD.worker_message,
           OLD.reported_status, OLD.reported_accuracy_meters, OLD.nearest_distance_meters,
           OLD.position_timestamp, OLD.created_at) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The original complaint cannot be rewritten.';
    END IF;
    IF ROW(NEW.status, NEW.resolution_note, NEW.acknowledged_by, NEW.resolved_by)
      IS NOT DISTINCT FROM ROW(OLD.status, OLD.resolution_note, OLD.acknowledged_by, OLD.resolved_by) THEN
      RETURN NEW;
    END IF;
  END IF;

  actor_id := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.user_id
    WHEN NEW.status = 'expired' AND NEW.status IS DISTINCT FROM OLD.status THEN NULL
    ELSE COALESCE(auth.uid(), CASE WHEN NEW.status IN ('resolved', 'dismissed')
      THEN NEW.resolved_by ELSE NEW.acknowledged_by END)
  END;
  SELECT NULLIF(BTRIM(CONCAT_WS(' ', first_name, last_name)), '')
    INTO actor_display_name FROM public.profiles WHERE id = actor_id;
  INSERT INTO public.check_in_assistance_activity
    (request_id, actor_user_id, actor_name, previous_status, status, note)
  VALUES (NEW.id, actor_id, COALESCE(actor_display_name, 'System'),
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status, CASE WHEN TG_OP = 'INSERT' THEN NEW.worker_message ELSE NEW.resolution_note END);
  RETURN NEW;
END;
$$;
CREATE TRIGGER record_assistance_activity
  AFTER INSERT OR UPDATE ON public.check_in_assistance_requests
  FOR EACH ROW EXECUTE FUNCTION private.record_assistance_activity();

ALTER TABLE public.admin_notifications ADD COLUMN assistance_request_id UUID
  REFERENCES public.check_in_assistance_requests(id) ON DELETE RESTRICT;
CREATE INDEX idx_admin_notifications_assistance_unread
  ON public.admin_notifications (assistance_request_id, recipient_user_id) WHERE read_at IS NULL;
UPDATE public.admin_notifications notification_row
SET assistance_request_id = request_row.id
FROM public.check_in_assistance_requests request_row
WHERE notification_row.event_type = 'check_in_assistance_requested'
  AND notification_row.dedupe_key = 'check_in_assistance_requested:' || request_row.id::TEXT;

CREATE FUNCTION private.link_assistance_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE request_status TEXT;
BEGIN
  IF NEW.event_type = 'check_in_assistance_requested' THEN
    IF NEW.dedupe_key !~ '^check_in_assistance_requested:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'An assistance notification must identify its report.';
    END IF;
    SELECT id, status INTO NEW.assistance_request_id, request_status
    FROM public.check_in_assistance_requests
    WHERE id = SPLIT_PART(NEW.dedupe_key, ':', 2)::UUID;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'The assistance notification report does not exist.';
    END IF;
    IF request_status IN ('resolved', 'dismissed', 'expired') THEN
      NEW.read_at := COALESCE(NEW.read_at, NOW());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER link_assistance_notification
  BEFORE INSERT ON public.admin_notifications
  FOR EACH ROW EXECUTE FUNCTION private.link_assistance_notification();

CREATE FUNCTION private.read_closed_assistance_notifications()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status IN ('resolved', 'dismissed', 'expired') THEN
    UPDATE public.admin_notifications SET read_at = NOW()
    WHERE assistance_request_id = NEW.id AND read_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER read_closed_assistance_notifications
  AFTER UPDATE OF status ON public.check_in_assistance_requests
  FOR EACH ROW EXECUTE FUNCTION private.read_closed_assistance_notifications();
UPDATE public.admin_notifications notification_row SET read_at = NOW()
FROM public.check_in_assistance_requests request_row
WHERE notification_row.assistance_request_id = request_row.id
  AND notification_row.read_at IS NULL
  AND request_row.status IN ('resolved', 'dismissed', 'expired');

CREATE FUNCTION private.is_assistance_administrator()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles profile_row
    WHERE profile_row.id = auth.uid() AND profile_row.is_active IS TRUE
      AND profile_row.role::TEXT <> 'reports_admin'
      AND (profile_row.role::TEXT IN ('admin', 'super_admin', 'team_admin')
        OR EXISTS (SELECT 1 FROM public.departments department_row
          WHERE department_row.head_user_id = profile_row.id AND department_row.is_active IS TRUE))
  );
$$;

-- Lock each request before changing it, enforce current scope in the database,
-- and preserve previous notes through the activity trigger.
CREATE OR REPLACE FUNCTION public.update_check_in_assistance_request(
  p_request_id UUID, p_status TEXT, p_resolution_note TEXT DEFAULT NULL
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  target public.check_in_assistance_requests%ROWTYPE;
  clean_note TEXT := NULLIF(BTRIM(p_resolution_note), '');
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_assistance_administrator() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrative assistance access is not permitted.';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('acknowledged', 'resolved', 'dismissed', 'note')
    OR CHAR_LENGTH(clean_note) > 500
    OR (p_status IN ('resolved', 'dismissed', 'note') AND COALESCE(CHAR_LENGTH(clean_note), 0) < 2) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid action and note are required.';
  END IF;
  SELECT * INTO target FROM public.check_in_assistance_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Assistance request not found.';
  END IF;
  IF NOT private.can_manage_check_in_assistance_user(target.user_id, auth.uid()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This request is outside your administrative scope.';
  END IF;
  IF target.status IN ('resolved', 'dismissed', 'expired') AND p_status <> 'note' THEN
    RETURN target.status;
  END IF;
  UPDATE public.check_in_assistance_requests
  SET status = CASE WHEN p_status = 'note' THEN target.status ELSE p_status END,
    acknowledged_by = COALESCE(target.acknowledged_by, auth.uid()),
    acknowledged_at = COALESCE(target.acknowledged_at, NOW()),
    resolved_by = CASE WHEN p_status IN ('resolved', 'dismissed') THEN auth.uid() ELSE target.resolved_by END,
    resolved_at = CASE WHEN p_status IN ('resolved', 'dismissed') THEN NOW() ELSE target.resolved_at END,
    resolution_note = COALESCE(clean_note, target.resolution_note)
  WHERE id = target.id;
  RETURN CASE WHEN p_status = 'note' THEN target.status ELSE p_status END;
END;
$$;

CREATE FUNCTION public.mark_my_assistance_notifications_read(p_request_ids UUID[])
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE affected_count INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_assistance_administrator() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrative assistance access is not permitted.';
  END IF;
  IF p_request_ids IS NULL OR CARDINALITY(p_request_ids) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Provide between 1 and 100 request IDs.';
  END IF;
  UPDATE public.admin_notifications notification_row SET read_at = NOW()
  WHERE notification_row.recipient_user_id = auth.uid() AND notification_row.read_at IS NULL
    AND notification_row.assistance_request_id = ANY(p_request_ids)
    AND EXISTS (SELECT 1 FROM public.check_in_assistance_requests request_row
      WHERE request_row.id = notification_row.assistance_request_id
        AND private.can_manage_check_in_assistance_user(request_row.user_id, auth.uid()));
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$;

CREATE FUNCTION public.get_check_in_assistance_page(
  p_status TEXT DEFAULT 'unresolved', p_page INTEGER DEFAULT 1,
  p_limit INTEGER DEFAULT 25, p_request_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_assistance_administrator() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrative assistance access is not permitted.';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('unresolved', 'resolved', 'closed', 'all')
    OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid assistance history filter or page.';
  END IF;
  WITH visible AS MATERIALIZED (
    SELECT request_row.id, request_row.status, request_row.created_at
    FROM public.check_in_assistance_requests request_row
    WHERE private.can_manage_check_in_assistance_user(request_row.user_id, auth.uid())
  ), counts AS (
    SELECT COUNT(*)::INTEGER AS all_count,
      COUNT(*) FILTER (WHERE status IN ('open', 'acknowledged', 'expired'))::INTEGER AS unresolved,
      COUNT(*) FILTER (WHERE status IN ('open', 'acknowledged'))::INTEGER AS active,
      COUNT(*) FILTER (WHERE status = 'resolved')::INTEGER AS resolved,
      COUNT(*) FILTER (WHERE status = 'dismissed')::INTEGER AS closed FROM visible
  ), filtered AS (
    SELECT * FROM visible WHERE (p_request_id IS NULL OR id = p_request_id)
      AND (p_status = 'all'
        OR (p_status = 'unresolved' AND status IN ('open', 'acknowledged', 'expired'))
        OR (p_status = 'resolved' AND status = 'resolved')
        OR (p_status = 'closed' AND status = 'dismissed'))
  ), pagination AS (
    SELECT COUNT(*)::INTEGER AS total,
      LEAST(p_page, GREATEST(1, CEIL(COUNT(*)::NUMERIC / p_limit)::INTEGER)) AS page FROM filtered
  ), selected AS (
    SELECT id FROM filtered ORDER BY created_at DESC, id DESC
    LIMIT p_limit OFFSET (SELECT (page - 1) * p_limit FROM pagination)
  ), rows AS (
    SELECT request_row.id, request_row.session_id, request_row.event_id,
      event_row.title AS event_title, request_row.user_id,
      CONCAT_WS(' ', COALESCE(NULLIF(BTRIM(worker_profile.first_name), ''), 'Worker'),
        NULLIF(BTRIM(worker_profile.last_name), '')) AS worker_name,
      worker_profile.worker_id AS worker_code,
      COALESCE(NULLIF(BTRIM(department_row.name), ''), NULLIF(BTRIM(worker_profile.department), '')) AS department_name,
      request_row.reported_status, request_row.reported_accuracy_meters,
      location_row.name AS nearest_location_name, request_row.nearest_distance_meters,
      request_row.worker_message, request_row.status, request_row.created_at,
      request_row.acknowledged_at, request_row.resolved_at, request_row.resolution_note,
      COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
        'id', activity.id, 'actor_name', activity.actor_name, 'status', activity.status,
        'note', activity.note, 'is_baseline', activity.is_baseline, 'created_at', activity.created_at
      ) ORDER BY activity.created_at, activity.id)
        FROM public.check_in_assistance_activity activity WHERE activity.request_id = request_row.id), '[]'::JSONB) AS activity
    FROM selected JOIN public.check_in_assistance_requests request_row USING (id)
    JOIN public.events event_row ON event_row.id = request_row.event_id
    JOIN public.profiles worker_profile ON worker_profile.id = request_row.user_id
    LEFT JOIN public.departments department_row ON department_row.id = worker_profile.department_id
    LEFT JOIN public.locations location_row ON location_row.id = request_row.nearest_location_id
  )
  SELECT JSONB_BUILD_OBJECT(
    'requests', COALESCE((SELECT JSONB_AGG(TO_JSONB(rows) ORDER BY created_at DESC, id DESC) FROM rows), '[]'::JSONB),
    'counts', (SELECT JSONB_BUILD_OBJECT('all', all_count, 'unresolved', unresolved, 'active', active,
      'resolved', resolved, 'closed', closed) FROM counts),
    'total', pagination.total, 'page', pagination.page, 'pageSize', p_limit
  ) INTO result FROM pagination;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION private.protect_assistance_history(),
  private.record_assistance_activity(), private.link_assistance_notification(),
  private.read_closed_assistance_notifications(), private.is_assistance_administrator()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_my_assistance_notifications_read(UUID[]),
  public.get_check_in_assistance_page(TEXT, INTEGER, INTEGER, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_my_assistance_notifications_read(UUID[]),
  public.get_check_in_assistance_page(TEXT, INTEGER, INTEGER, UUID) TO authenticated;

COMMIT;
