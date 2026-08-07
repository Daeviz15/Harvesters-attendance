-- Keep the email outbox claim API unambiguous for Supabase RPC callers.
-- The four-argument version supports notification-type filtering.

BEGIN;

DROP FUNCTION IF EXISTS public.claim_email_notification_jobs(UUID, INTEGER, INTEGER);

COMMIT;
