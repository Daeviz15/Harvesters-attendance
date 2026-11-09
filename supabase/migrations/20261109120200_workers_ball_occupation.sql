-- Workers' Ball — "What do you do currently?" replaces "expectations for the night"
--
-- occupation        full answers, e.g. {"stages":["employed","business"],"employed":{"role":"Accountant",...},...}
-- occupation_stages the stages picked, for quick filtering (employed, business, job_seeking,
--                   schooling, serving, retired, other)
-- wants_to_connect / wants_job_offers / open_to_mentoring  quick yes/no flags for follow-up lists

ALTER TABLE workers_ball_registrations
    ALTER COLUMN expectations DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS occupation         jsonb,
    ADD COLUMN IF NOT EXISTS occupation_stages  text[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS wants_to_connect   boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS wants_job_offers   boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS open_to_mentoring  boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_wab_occupation_stages
    ON workers_ball_registrations USING gin (occupation_stages);

CREATE INDEX IF NOT EXISTS idx_wab_wants_job_offers
    ON workers_ball_registrations (wants_job_offers)
    WHERE wants_job_offers;
