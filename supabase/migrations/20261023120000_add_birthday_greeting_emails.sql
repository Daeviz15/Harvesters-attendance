-- Automatic "Happy Birthday" emails.
--
-- The existing once-a-minute email processor calls claim_due_birthday_emails().
-- One row per worker per birthday date guarantees each worker gets at most one
-- greeting a year, even if the scheduler runs many times that day.
-- All functions are service-role only; workers cannot read this table.

BEGIN;

CREATE TABLE IF NOT EXISTS public.birthday_email_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    birthday_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    locked_by UUID,
    provider_message_id TEXT,
    last_error TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT birthday_email_jobs_one_per_birthday UNIQUE (user_id, birthday_date)
);

CREATE INDEX IF NOT EXISTS idx_birthday_email_jobs_claimable
ON public.birthday_email_jobs (birthday_date, next_attempt_at)
WHERE status = 'pending';

ALTER TABLE public.birthday_email_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.birthday_email_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.birthday_email_jobs TO service_role;

-- Queue today's birthdays (Africa/Lagos), then claim a batch for delivery.
-- 29 February birthdays are celebrated on 28 February in non-leap years.
CREATE OR REPLACE FUNCTION public.claim_due_birthday_emails(
    p_worker_id UUID,
    p_batch_size INTEGER DEFAULT 10,
    p_lock_timeout_minutes INTEGER DEFAULT 10,
    p_send_from_hour INTEGER DEFAULT 7
)
RETURNS TABLE (
    job_id UUID,
    recipient_email TEXT,
    first_name TEXT,
    last_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    local_now TIMESTAMP := NOW() AT TIME ZONE 'Africa/Lagos';
    today DATE := (NOW() AT TIME ZONE 'Africa/Lagos')::DATE;
BEGIN
    IF p_worker_id IS NULL
        OR p_batch_size NOT BETWEEN 1 AND 50
        OR p_lock_timeout_minutes NOT BETWEEN 1 AND 60
        OR p_send_from_hour NOT BETWEEN 0 AND 23 THEN
        RAISE EXCEPTION 'Invalid birthday email claim parameters';
    END IF;

    -- Never send a belated greeting for a previous day.
    UPDATE public.birthday_email_jobs
    SET status = 'cancelled',
        locked_at = NULL,
        locked_by = NULL,
        last_error = COALESCE(last_error, 'Birthday passed before delivery'),
        updated_at = NOW()
    WHERE status IN ('pending', 'processing')
        AND birthday_date < today;

    IF EXTRACT(HOUR FROM local_now)::INTEGER < p_send_from_hour THEN
        RETURN;
    END IF;

    INSERT INTO public.birthday_email_jobs (user_id, birthday_date)
    SELECT profile_row.id, today
    FROM public.profiles profile_row
    JOIN auth.users auth_user ON auth_user.id = profile_row.id
    WHERE profile_row.is_active IS TRUE
        AND profile_row.date_of_birth IS NOT NULL
        AND profile_row.email_notifications_enabled IS DISTINCT FROM FALSE
        AND auth_user.email IS NOT NULL
        AND private.birthday_anniversary(
            EXTRACT(YEAR FROM today)::INTEGER,
            EXTRACT(MONTH FROM profile_row.date_of_birth)::INTEGER,
            EXTRACT(DAY FROM profile_row.date_of_birth)::INTEGER
        ) = today
    ON CONFLICT ON CONSTRAINT birthday_email_jobs_one_per_birthday DO NOTHING;

    -- Release jobs whose sender crashed mid-delivery.
    UPDATE public.birthday_email_jobs
    SET status = CASE WHEN attempt_count >= max_attempts THEN 'failed' ELSE 'pending' END,
        locked_at = NULL,
        locked_by = NULL,
        last_error = COALESCE(last_error, 'Processing lock expired before completion'),
        updated_at = NOW()
    WHERE status = 'processing'
        AND locked_at < NOW() - MAKE_INTERVAL(mins => p_lock_timeout_minutes);

    RETURN QUERY
    WITH claimable AS (
        SELECT job.id
        FROM public.birthday_email_jobs job
        WHERE job.status = 'pending'
            AND job.birthday_date = today
            AND job.next_attempt_at <= NOW()
            AND job.attempt_count < job.max_attempts
        ORDER BY job.created_at
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
        UPDATE public.birthday_email_jobs job
        SET status = 'processing',
            locked_at = NOW(),
            locked_by = p_worker_id,
            attempt_count = job.attempt_count + 1,
            updated_at = NOW()
        FROM claimable
        WHERE job.id = claimable.id
        RETURNING job.id, job.user_id
    )
    SELECT
        claimed.id,
        LOWER(auth_user.email)::TEXT,
        COALESCE(NULLIF(BTRIM(profile_row.first_name), ''), 'Friend')::TEXT,
        COALESCE(NULLIF(BTRIM(profile_row.last_name), ''), '')::TEXT
    FROM claimed
    JOIN public.profiles profile_row ON profile_row.id = claimed.user_id
    JOIN auth.users auth_user ON auth_user.id = claimed.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_birthday_email_sent(
    p_job_id UUID,
    p_worker_id UUID,
    p_provider_message_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    UPDATE public.birthday_email_jobs
    SET status = 'sent',
        sent_at = NOW(),
        provider_message_id = LEFT(p_provider_message_id, 512),
        locked_at = NULL,
        locked_by = NULL,
        last_error = NULL,
        updated_at = NOW()
    WHERE id = p_job_id
        AND locked_by = p_worker_id
        AND status = 'processing';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Birthday email job is not held by this processor';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_birthday_email_failed(
    p_job_id UUID,
    p_worker_id UUID,
    p_error TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    UPDATE public.birthday_email_jobs
    SET status = CASE WHEN attempt_count >= max_attempts THEN 'failed' ELSE 'pending' END,
        next_attempt_at = NOW() + MAKE_INTERVAL(mins => 5 * attempt_count),
        locked_at = NULL,
        locked_by = NULL,
        last_error = LEFT(COALESCE(p_error, 'Unknown delivery failure'), 1000),
        updated_at = NOW()
    WHERE id = p_job_id
        AND locked_by = p_worker_id
        AND status = 'processing';
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_birthday_email(
    p_job_id UUID,
    p_worker_id UUID,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    UPDATE public.birthday_email_jobs
    SET status = 'cancelled',
        locked_at = NULL,
        locked_by = NULL,
        last_error = LEFT(COALESCE(p_reason, 'Cancelled'), 1000),
        updated_at = NOW()
    WHERE id = p_job_id
        AND locked_by = p_worker_id
        AND status = 'processing';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_birthday_emails(UUID, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_birthday_email_sent(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_birthday_email_failed(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_birthday_email(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_due_birthday_emails(UUID, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_birthday_email_sent(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_birthday_email_failed(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_birthday_email(UUID, UUID, TEXT) TO service_role;

COMMIT;
