-- One phone must resolve to one canonical identifier whether a player enters
-- 079… / 791… / +962791… . This closes both false validation failures and
-- duplicate-account bypasses caused by formatting differences.
CREATE OR REPLACE FUNCTION public.normalize_phone(p_country_code text, p_phone text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  country_digits text := regexp_replace(COALESCE(p_country_code, ''), '[^0-9]', '', 'g');
  local_digits text := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF country_digits <> '' AND local_digits LIKE country_digits || '%' THEN
    local_digits := substr(local_digits, length(country_digits) + 1);
  END IF;
  local_digits := regexp_replace(local_digits, '^0', '');
  IF country_digits = '962' AND local_digits !~ '^7[0-9]{8}$' THEN RAISE EXCEPTION 'PHONE_INVALID'; END IF;
  IF country_digits = '970' AND local_digits !~ '^(56|59)[0-9]{7}$' THEN RAISE EXCEPTION 'PHONE_INVALID'; END IF;
  IF country_digits NOT IN ('962', '970') AND length(local_digits) < 7 THEN RAISE EXCEPTION 'PHONE_INVALID'; END IF;
  RETURN country_digits || local_digits;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  raw_phone text := trim(COALESCE(NEW.raw_user_meta_data->>'phone', ''));
  raw_country text := COALESCE(NULLIF(NEW.raw_user_meta_data->>'country_code', ''), '+962');
  normalized text;
BEGIN
  IF raw_phone <> '' THEN
    normalized := public.normalize_phone(raw_country, raw_phone);
    PERFORM pg_advisory_xact_lock(hashtext(normalized));
    IF (SELECT count(*) FROM public.phone_claims WHERE normalized_phone = normalized) >= 2 THEN RAISE EXCEPTION 'PHONE_ACCOUNT_LIMIT'; END IF;
    INSERT INTO public.phone_claims (normalized_phone, user_id) VALUES (normalized, NEW.id);
    raw_phone := regexp_replace(regexp_replace(raw_phone, '[^0-9]', '', 'g'), '^0', '');
  END IF;
  INSERT INTO public.profiles (id, first_name, last_name, avatar_url, country_code, phone, games_left)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'first_name', split_part(COALESCE(NEW.raw_user_meta_data->>'full_name',''), ' ', 1)), COALESCE(NEW.raw_user_meta_data->>'last_name', ''), NEW.raw_user_meta_data->>'avatar_url', raw_country, NULLIF(raw_phone, ''), 2)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_phone(p_country_code text, p_phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  normalized text := public.normalize_phone(p_country_code, p_phone);
  local_phone text := regexp_replace(regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g'), '^0', '');
  existing_phone text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(normalized));
  SELECT phone INTO existing_phone FROM public.profiles WHERE id = auth.uid();
  IF existing_phone IS NOT NULL THEN RAISE EXCEPTION 'PHONE_LOCKED'; END IF;
  IF (SELECT count(*) FROM public.phone_claims WHERE normalized_phone = normalized) >= 2 THEN RAISE EXCEPTION 'PHONE_ACCOUNT_LIMIT'; END IF;
  INSERT INTO public.phone_claims (normalized_phone, user_id) VALUES (normalized, auth.uid());
  UPDATE public.profiles SET country_code = p_country_code, phone = local_phone WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_phone(text, text) TO authenticated;
