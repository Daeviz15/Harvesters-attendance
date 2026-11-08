-- Add front_desk as a valid temporary role for Workers' Ball event-day check-in staff.
-- front_desk workers can access /workers-ball/checkin but not the admin panel.
-- After the event, admins reassign these profiles back to 'worker'.

DO $$
BEGIN
  -- Drop existing role check constraint if present so we can extend it
  BEGIN
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Re-add with front_desk included
  BEGIN
    ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('worker', 'admin', 'super_admin', 'team_admin', 'reports_admin', 'front_desk'));
  EXCEPTION WHEN OTHERS THEN
    -- Constraint may already be named differently or the column may be unconstrained — safe to continue
    NULL;
  END;
END $$;
