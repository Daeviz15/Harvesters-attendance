-- Workers' Ball 2026 (LUMINA) registration and check-in table
-- Stores all event registrations and tracks gate-pass check-ins on event day.

CREATE TABLE IF NOT EXISTS workers_ball_registrations (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Human-readable registration reference (e.g. WAB26-A3X7K)
    registration_id      text        UNIQUE NOT NULL,
    -- Linked to an existing worker profile if the email/phone matched one
    user_id              uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    email                text        NOT NULL,
    phone                text        NOT NULL,
    first_name           text        NOT NULL,
    last_name            text        NOT NULL DEFAULT '',
    date_of_birth        date,
    department           text        NOT NULL,
    department_id        uuid        REFERENCES departments(id) ON DELETE SET NULL,
    team                 text,
    is_attending         boolean     NOT NULL DEFAULT true,
    expectations         text        NOT NULL,
    wants_to_present     boolean     NOT NULL DEFAULT false,
    presentation_details text,
    -- 5-digit numeric backup check-in code (NULL when is_attending = false)
    attendance_code      char(5)     UNIQUE,
    -- UUID used to construct the scannable QR URL
    qr_token             uuid        UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    -- Check-in tracking
    is_checked_in        boolean     NOT NULL DEFAULT false,
    checked_in_at        timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workers_ball_registrations ENABLE ROW LEVEL SECURITY;
-- All access is performed through service-role server actions; no public policies.

CREATE INDEX IF NOT EXISTS idx_wab_email
    ON workers_ball_registrations (lower(email));
CREATE INDEX IF NOT EXISTS idx_wab_phone
    ON workers_ball_registrations (phone);
CREATE INDEX IF NOT EXISTS idx_wab_qr_token
    ON workers_ball_registrations (qr_token);
CREATE INDEX IF NOT EXISTS idx_wab_attendance_code
    ON workers_ball_registrations (attendance_code)
    WHERE attendance_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wab_user_id
    ON workers_ball_registrations (user_id)
    WHERE user_id IS NOT NULL;
