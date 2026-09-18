-- 0017_fix_phone_claim_normalization.sql
-- Fix Jordan phone normalization, idempotent phone claims, and atomic onboarding profile completion

-- ============================================================================
-- 1. FIX CANONICAL PHONE NORMALIZATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.normalize_phone(p_country_code text, p_phone text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  country_digits text := regexp_replace(COALESCE(p_country_code, ''), '[^0-9]', '', 'g');
  local_digits text := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
BEGIN
  -- Strip repeated country prefix (e.g. user typed +962 078... or +962 +962 78...)
  IF country_digits <> '' THEN
    WHILE local_digits LIKE country_digits || '%' LOOP
      local_digits := substr(local_digits, length(country_digits) + 1);
    END LOOP;
  END IF;

  -- Strip all leading zeros
  local_digits := regexp_replace(local_digits, '^0+', '');

  -- Validate prefixes: Jordan (+962) must be 77, 78, 79 followed by 7 digits (9 digits total)
  IF country_digits = '962' AND local_digits !~ '^(77|78|79)[0-9]{7}$' THEN
    RAISE EXCEPTION 'PHONE_INVALID';
  END IF;

  -- Palestine (+970) must be 56 or 59 followed by 7 digits (9 digits total)
  IF country_digits = '970' AND local_digits !~ '^(56|59)[0-9]{7}$' THEN
    RAISE EXCEPTION 'PHONE_INVALID';
  END IF;

  -- Other country codes must have at least 7 digits
  IF country_digits NOT IN ('962', '970') AND length(local_digits) < 7 THEN
    RAISE EXCEPTION 'PHONE_INVALID';
  END IF;

  RETURN country_digits || local_digits;
END;
$$;

-- ============================================================================
-- 2. FIX claim_phone RPC: IDEMPOTENCY, NO-CRASH RETRIES, AND ATOMIC PROFILE UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_phone(
  p_country_code text,
  p_phone text,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_complete_onboarding boolean DEFAULT true
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE
  country_digits text := regexp_replace(COALESCE(p_country_code, ''), '[^0-9]', '', 'g');
  normalized text;
  local_phone text;
  user_existing_claim text;
  claim_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Canonical normalization using normalize_phone
  normalized := public.normalize_phone(p_country_code, p_phone);
  local_phone := substr(normalized, length(country_digits) + 1);

  -- Concurrency control: acquire advisory lock on normalized phone number
  PERFORM pg_advisory_xact_lock(hashtext(normalized));

  -- Check if current authenticated user already has a registered claim
  SELECT normalized_phone INTO user_existing_claim
  FROM public.phone_claims
  WHERE user_id = auth.uid();

  IF user_existing_claim IS NOT NULL THEN
    -- If user is re-claiming the EXACT same phone, proceed idempotently
    IF user_existing_claim = normalized THEN
      NULL; -- Same phone: idempotent pass
    ELSE
      -- User is updating to a different phone number: ensure new phone has not reached 2-account limit
      SELECT count(*) INTO claim_count
      FROM public.phone_claims
      WHERE normalized_phone = normalized
        AND user_id <> auth.uid();

      IF claim_count >= 2 THEN
        RAISE EXCEPTION 'PHONE_ACCOUNT_LIMIT';
      END IF;

      -- Update existing user claim to new normalized phone
      UPDATE public.phone_claims
      SET normalized_phone = normalized,
          created_at = now()
      WHERE user_id = auth.uid();
    END IF;
  ELSE
    -- Brand new claim: enforce account limit of 2
    SELECT count(*) INTO claim_count
    FROM public.phone_claims
    WHERE normalized_phone = normalized;

    IF claim_count >= 2 THEN
      RAISE EXCEPTION 'PHONE_ACCOUNT_LIMIT';
    END IF;

    -- Insert new claim
    INSERT INTO public.phone_claims (normalized_phone, user_id)
    VALUES (normalized, auth.uid());
  END IF;

  -- Atomically update or insert profile in this trusted security-definer transaction
  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    country_code,
    phone,
    avatar_url,
    onboarding_completed
  ) VALUES (
    auth.uid(),
    NULLIF(trim(p_first_name), ''),
    NULLIF(trim(p_last_name), ''),
    COALESCE(NULLIF(trim(p_country_code), ''), '+962'),
    local_phone,
    p_avatar_url,
    COALESCE(p_complete_onboarding, true)
  )
  ON CONFLICT (id) DO UPDATE SET
    first_name = COALESCE(NULLIF(trim(EXCLUDED.first_name), ''), public.profiles.first_name),
    last_name = COALESCE(NULLIF(trim(EXCLUDED.last_name), ''), public.profiles.last_name),
    country_code = COALESCE(NULLIF(trim(EXCLUDED.country_code), ''), public.profiles.country_code),
    phone = EXCLUDED.phone,
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    onboarding_completed = CASE
      WHEN p_complete_onboarding THEN true
      ELSE public.profiles.onboarding_completed
    END;
END;
$$;

-- ============================================================================
-- 3. PERMISSIONS: ENSURE AUTHENTICATED CAN EXECUTE TRIGGER FUNCTIONS ON PROFILES
-- ============================================================================

-- PostgreSQL trigger execution requires the caller performing INSERT/UPDATE to have EXECUTE privilege.
-- These functions return 'trigger' so PostgREST never exposes them as RPC endpoints.
GRANT EXECUTE ON FUNCTION public.enforce_profile_canonical_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_credits_and_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_phone(text, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text, text) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

