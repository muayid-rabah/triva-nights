-- Safe repair for projects where 0000/0001 were run manually and stopped on
-- an "already exists" error. It is intentionally idempotent: run it once in
-- the Supabase SQL editor to restore the phone RPC and comments API.

ALTER TABLE public.profiles ALTER COLUMN games_left SET DEFAULT 2;
ALTER TABLE public.profiles ALTER COLUMN country_code SET DEFAULT '+962';

CREATE TABLE IF NOT EXISTS public.phone_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_phone text NOT NULL,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS phone_claims_phone_idx ON public.phone_claims (normalized_phone);
GRANT ALL ON public.phone_claims TO service_role;
ALTER TABLE public.phone_claims ENABLE ROW LEVEL SECURITY;

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
GRANT EXECUTE ON FUNCTION public.normalize_phone(text, text), public.claim_phone(text, text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 3 AND 320),
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_public_feed_idx ON public.comments (created_at DESC) WHERE hidden = false;
GRANT SELECT ON public.comments TO anon, authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "visible comments read" ON public.comments;
CREATE POLICY "visible comments read" ON public.comments FOR SELECT TO anon, authenticated USING (hidden = false);

CREATE OR REPLACE FUNCTION public.submit_comment(p_body text)
RETURNS public.comments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  clean_body text := trim(regexp_replace(COALESCE(p_body, ''), '\s+', ' ', 'g'));
  result public.comments;
  name_text text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF char_length(clean_body) < 3 OR char_length(clean_body) > 320 THEN RAISE EXCEPTION 'COMMENT_LENGTH'; END IF;
  IF lower(clean_body) ~ '(fuck|shit|شرموط|قحبة|خرا|طيز)' THEN RAISE EXCEPTION 'COMMENT_BLOCKED'; END IF;
  SELECT trim(concat_ws(' ', first_name, last_name)) INTO name_text FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.comments (user_id, display_name, body)
  VALUES (auth.uid(), COALESCE(NULLIF(name_text, ''), 'لاعب طقّها'), clean_body)
  RETURNING * INTO result;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_comment(text) TO authenticated;

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (first_name, last_name, birth_date, avatar_url) ON public.profiles TO authenticated;
