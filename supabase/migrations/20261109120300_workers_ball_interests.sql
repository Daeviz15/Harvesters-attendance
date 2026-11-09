-- Workers' Ball — "Stay Connected" is now optional and includes interests.
--
-- People first choose whether they'd like to connect. "Not now" saves occupation = NULL.
-- interests  the hobbies picked (football, music, reading, ...), for quick filtering.
--            Free-text extras stay inside occupation->>'otherInterests'.

ALTER TABLE workers_ball_registrations
    ADD COLUMN IF NOT EXISTS interests text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_wab_interests
    ON workers_ball_registrations USING gin (interests);
