-- Workers' Ball 2026 — attendee photo
-- Photo shown on the shareable "I will be attending" flyer.
-- Files live in the public `avatars` storage bucket under `<user_id|wab>/wab-<uuid>.jpg`.

ALTER TABLE workers_ball_registrations
    ADD COLUMN IF NOT EXISTS photo_url text;
