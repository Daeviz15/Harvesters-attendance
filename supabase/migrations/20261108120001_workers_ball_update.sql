-- Workers' Ball 2026 — form v2 schema update
-- • Replace full date_of_birth with birthday_month + birthday_day (no year)
-- • Remove is_attending (all workers attend; everyone gets a gate pass)
-- • Add attending_with_partner and dietary_needs
-- • Shorten registration_id to max 6 chars (re-check column still fits)

ALTER TABLE workers_ball_registrations
    DROP COLUMN IF EXISTS is_attending,
    DROP COLUMN IF EXISTS date_of_birth,
    ADD COLUMN IF NOT EXISTS birthday_month smallint CHECK (birthday_month BETWEEN 1 AND 12),
    ADD COLUMN IF NOT EXISTS birthday_day   smallint CHECK (birthday_day   BETWEEN 1 AND 31),
    ADD COLUMN IF NOT EXISTS attending_with_partner boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS dietary_needs  text;

-- attendance_code is non-null for all registrations now (all attendees)
-- Make it NOT NULL (safe to run only after backfilling any existing rows)
-- ALTER TABLE workers_ball_registrations ALTER COLUMN attendance_code SET NOT NULL;
