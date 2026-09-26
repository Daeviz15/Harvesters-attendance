-- Production location-confirmation controls.
--
-- A browser reports both a coordinate and its estimated accuracy. Accuracy is
-- a quality measurement, not an entitlement to expand a venue's boundary.
-- Each branch therefore has a bounded quality threshold and a small,
-- deliberately configured tolerance for normal GPS drift.

BEGIN;

ALTER TABLE public.locations
    ADD COLUMN IF NOT EXISTS max_check_in_accuracy_meters DOUBLE PRECISION NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS check_in_distance_buffer_meters DOUBLE PRECISION NOT NULL DEFAULT 25;

ALTER TABLE public.locations
    DROP CONSTRAINT IF EXISTS locations_max_check_in_accuracy_meters_check,
    ADD CONSTRAINT locations_max_check_in_accuracy_meters_check
        CHECK (max_check_in_accuracy_meters BETWEEN 10 AND 250),
    DROP CONSTRAINT IF EXISTS locations_check_in_distance_buffer_meters_check,
    ADD CONSTRAINT locations_check_in_distance_buffer_meters_check
        CHECK (check_in_distance_buffer_meters BETWEEN 0 AND 50);

COMMENT ON COLUMN public.locations.max_check_in_accuracy_meters IS
    'Maximum browser-reported GPS accuracy in metres accepted for worker self check-in.';
COMMENT ON COLUMN public.locations.check_in_distance_buffer_meters IS
    'Small, administrator-calibrated GPS tolerance added to the physical check-in radius.';

-- Preserve the diagnostic evidence used for a successful self check-in. These
-- fields remain nullable so historical records and expressly manual
-- administrator-assisted entries are not retroactively invalidated.
ALTER TABLE public.attendance_logs
    ADD COLUMN IF NOT EXISTS check_in_accuracy_meters DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS check_in_position_timestamp TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.attendance_logs
    DROP CONSTRAINT IF EXISTS attendance_logs_check_in_accuracy_meters_check,
    ADD CONSTRAINT attendance_logs_check_in_accuracy_meters_check
        CHECK (
            check_in_accuracy_meters IS NULL
            OR (check_in_accuracy_meters >= 0 AND check_in_accuracy_meters <= 10000)
        );

COMMENT ON COLUMN public.attendance_logs.check_in_accuracy_meters IS
    'Browser-reported horizontal accuracy for an automated self check-in, in metres.';
COMMENT ON COLUMN public.attendance_logs.check_in_position_timestamp IS
    'Timestamp supplied by the browser for a successful self check-in location reading.';

-- Location configuration changes the real-world authorization boundary. The
-- UI already limits this page to a super administrator; make the database
-- policy match so a direct REST request cannot bypass that gate.
DROP POLICY IF EXISTS "Anyone can view active locations" ON public.locations;
DROP POLICY IF EXISTS "Admins can insert locations" ON public.locations;
DROP POLICY IF EXISTS "Admins can update locations" ON public.locations;
DROP POLICY IF EXISTS "Admins can delete locations" ON public.locations;
DROP POLICY IF EXISTS "locations_active_select" ON public.locations;
DROP POLICY IF EXISTS "locations_super_admin_manage" ON public.locations;

CREATE POLICY "locations_active_select"
ON public.locations
FOR SELECT
TO authenticated
USING (
    is_active IS TRUE
    OR (
        (SELECT public.is_super_admin())
        AND EXISTS (
            SELECT 1
            FROM public.profiles profile_row
            WHERE profile_row.id = (SELECT auth.uid())
                AND profile_row.is_active IS DISTINCT FROM FALSE
        )
    )
);

CREATE POLICY "locations_super_admin_manage"
ON public.locations
FOR ALL
TO authenticated
USING (
    (SELECT public.is_super_admin())
    AND EXISTS (
        SELECT 1
        FROM public.profiles profile_row
        WHERE profile_row.id = (SELECT auth.uid())
            AND profile_row.is_active IS DISTINCT FROM FALSE
    )
)
WITH CHECK (
    (SELECT public.is_super_admin())
    AND EXISTS (
        SELECT 1
        FROM public.profiles profile_row
        WHERE profile_row.id = (SELECT auth.uid())
            AND profile_row.is_active IS DISTINCT FROM FALSE
    )
);

COMMIT;
