-- Workers' Ball 2026 — one seat per person
-- Stops the same email, phone number or worker account from registering twice,
-- even if two submissions arrive at the same moment (e.g. a double tap).
--
-- If this fails with "could not create unique index", duplicates already exist.
-- Find them with:
--   SELECT lower(email), count(*) FROM workers_ball_registrations GROUP BY 1 HAVING count(*) > 1;
--   SELECT phone, count(*) FROM workers_ball_registrations GROUP BY 1 HAVING count(*) > 1;
--   SELECT user_id, count(*) FROM workers_ball_registrations WHERE user_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
-- and remove the extra rows before running this again.
-- The app checks for these index names, so keep the "wab_one_seat_per_" prefix.

CREATE UNIQUE INDEX IF NOT EXISTS wab_one_seat_per_email
    ON workers_ball_registrations (lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS wab_one_seat_per_phone
    ON workers_ball_registrations (phone);

CREATE UNIQUE INDEX IF NOT EXISTS wab_one_seat_per_user
    ON workers_ball_registrations (user_id)
    WHERE user_id IS NOT NULL;
