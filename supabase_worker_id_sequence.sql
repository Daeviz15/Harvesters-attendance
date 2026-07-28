-- =============================================
-- Migration: Production-Grade Team Sequential Worker ID Generator
-- Run this in your Supabase SQL Editor.
-- =============================================

-- Ensure worker_id is indexed for lightning-fast prefix search & uniqueness
CREATE INDEX IF NOT EXISTS idx_profiles_worker_id ON public.profiles(worker_id);

CREATE OR REPLACE FUNCTION generate_next_worker_id(p_team text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_team_code text;
    v_year_code text;
    v_prefix text;
    v_next_seq integer;
    v_new_worker_id text;
BEGIN
    -- Normalize team name to 3-letter team code
    v_team_code := CASE UPPER(TRIM(COALESCE(p_team, 'GENERAL')))
        WHEN 'ATTRACTION' THEN 'ATR'
        WHEN 'ATTRACT' THEN 'ATR'
        WHEN 'MEMBERSHIP' THEN 'MEM'
        WHEN 'MEMBER' THEN 'MEM'
        WHEN 'MATURITY' THEN 'MAT'
        WHEN 'MINISTRY' THEN 'MIN'
        WHEN 'MISSIONS' THEN 'MIS'
        WHEN 'MISSION' THEN 'MIS'
        WHEN 'ADMINISTRATION' THEN 'ADM'
        WHEN 'ADMIN' THEN 'ADM'
        WHEN 'NEXTGEN' THEN 'NXT'
        WHEN 'NEXT GEN' THEN 'NXT'
        WHEN 'PROGRAMS' THEN 'PRG'
        ELSE 'ADM'
    END;

    -- Get current 2-digit year (e.g., '26' for 2026)
    v_year_code := TO_CHAR(CURRENT_DATE, 'YY');
    
    -- Format: GLOBE/{TEAM}/{YY}/
    v_prefix := 'GLOBE/' || v_team_code || '/' || v_year_code || '/';

    -- Find current max sequence for this exact prefix
    SELECT COALESCE(
        MAX(
            CASE 
                WHEN LENGTH(worker_id) >= LENGTH(v_prefix) + 4 AND SUBSTRING(worker_id FROM LENGTH(v_prefix) + 1) ~ '^\d+$'
                THEN SUBSTRING(worker_id FROM LENGTH(v_prefix) + 1)::integer
                ELSE 0
            END
        ), 0) + 1
    INTO v_next_seq
    FROM public.profiles
    WHERE worker_id LIKE v_prefix || '%';

    -- Format to 4-digit zero padded (e.g., 0001, 0002)
    v_new_worker_id := v_prefix || LPAD(v_next_seq::text, 4, '0');

    RETURN v_new_worker_id;
END;
$$;
