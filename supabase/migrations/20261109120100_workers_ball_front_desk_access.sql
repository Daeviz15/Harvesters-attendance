-- Workers' Ball — front desk access + one-time ticket audit
--
-- Front desk access is a separate on/off permission, NOT a role change, so the
-- worker keeps their normal role, emails and dashboard. It does not expire on
-- its own (event dates can move); admins grant and remove it from /admin/front-desk.

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS wab_front_desk boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_wab_front_desk
    ON profiles (wab_front_desk)
    WHERE wab_front_desk;

-- Who admitted each ticket (a ticket can only be admitted once)
ALTER TABLE workers_ball_registrations
    ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Plus-ones are no longer allowed: everyone registers personally.
-- Existing rows keep their old value for the record; new rows default to false.
ALTER TABLE workers_ball_registrations
    ALTER COLUMN attending_with_partner SET DEFAULT false;

-- Anyone moved onto the old 'front_desk' role is put back to 'worker'
-- and given the new front desk permission instead.
UPDATE profiles
SET role = 'worker',
    wab_front_desk = true
WHERE role = 'front_desk';
