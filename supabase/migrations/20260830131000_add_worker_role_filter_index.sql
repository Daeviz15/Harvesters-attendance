-- ================================================================================
-- WORKER ROLE FILTER INDEX
--
-- Supports the Workers Directory role filter while preserving the existing
-- is_active + created_at pagination pattern.
-- ================================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_active_role_created_at
ON public.profiles (role, created_at DESC)
WHERE is_active = TRUE;
