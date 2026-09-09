-- Account protection, play credits and community comments for Qaddha.

ALTER TABLE public.profiles ALTER COLUMN games_left SET DEFAULT 2;
ALTER TABLE public.profiles ALTER COLUMN country_code SET DEFAULT '+962';
UPDATE public.profiles SET games_left = 2 WHERE games_left < 2;

CREATE TABLE public.phone_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_phone text NOT NULL,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX phone_claims_phone_idx ON public.phone_claims (normalized_phone);
GRANT ALL ON public.phone_claims TO service_role;
ALTER TABLE public.phone_claims ENABLE ROW LEVEL SECURITY;

-- The sign-up trigger claims the phone before the account can be used. A phone
-- may be associated with no more than two accounts.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  raw_phone text := trim(COALESCE(NEW.raw_user_meta_data->>'phone', ''));
  raw_country text := COALESCE(NULLIF(NEW.raw_user_meta_data->>'country_code', ''), '+962');
  normalized text;
BEGIN
  IF raw_phone <> '' THEN
    normalized := regexp_replace(raw_country || raw_phone, '[^0-9]', '', 'g');
    IF length(normalized) < 8 THEN
      RAISE EXCEPTION 'PHONE_INVALID';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext(normalized));
    IF (SELECT count(*) FROM public.phone_claims WHERE normalized_phone = normalized) >= 2 THEN
      RAISE EXCEPTION 'PHONE_ACCOUNT_LIMIT';
    END IF;
    INSERT INTO public.phone_claims (normalized_phone, user_id) VALUES (normalized, NEW.id);
  END IF;

  INSERT INTO public.profiles (id, first_name, last_name, avatar_url, country_code, phone, games_left)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', split_part(COALESCE(NEW.raw_user_meta_data->>'full_name',''), ' ', 1)),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.raw_user_meta_data->>'avatar_url',
    raw_country,
    NULLIF(raw_phone, ''),
    2
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Social sign-in users can claim their required phone once, under the same cap.
CREATE OR REPLACE FUNCTION public.claim_phone(p_country_code text, p_phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  normalized text := regexp_replace(COALESCE(p_country_code, '') || COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  existing_phone text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF length(normalized) < 8 THEN RAISE EXCEPTION 'PHONE_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(normalized));
  SELECT phone INTO existing_phone FROM public.profiles WHERE id = auth.uid();
  IF existing_phone IS NOT NULL THEN RAISE EXCEPTION 'PHONE_LOCKED'; END IF;
  IF (SELECT count(*) FROM public.phone_claims WHERE normalized_phone = normalized) >= 2 THEN
    RAISE EXCEPTION 'PHONE_ACCOUNT_LIMIT';
  END IF;
  INSERT INTO public.phone_claims (normalized_phone, user_id) VALUES (normalized, auth.uid());
  UPDATE public.profiles SET country_code = p_country_code, phone = trim(p_phone) WHERE id = auth.uid();
END;
$$;

-- Credit is consumed atomically only when a game starts.
CREATE OR REPLACE FUNCTION public.consume_game_credit()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE remaining integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND phone IS NOT NULL) THEN
    RAISE EXCEPTION 'PHONE_REQUIRED';
  END IF;
  UPDATE public.profiles
  SET games_left = games_left - 1
  WHERE id = auth.uid() AND games_left > 0
  RETURNING games_left INTO remaining;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_GAMES_LEFT'; END IF;
  RETURN remaining;
END;
$$;

-- Sensitive credit and phone fields are never client-writable.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (first_name, last_name, birth_date, avatar_url) ON public.profiles TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_phone(text, text), public.consume_game_credit() TO authenticated;

CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 3 AND 320),
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_public_feed_idx ON public.comments (created_at DESC) WHERE hidden = false;
GRANT SELECT ON public.comments TO anon, authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visible comments read" ON public.comments FOR SELECT TO anon, authenticated USING (hidden = false);

CREATE OR REPLACE FUNCTION public.submit_comment(p_body text)
RETURNS public.comments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  clean_body text := trim(regexp_replace(COALESCE(p_body, ''), '\s+', ' ', 'g'));
  searchable text;
  result public.comments;
  name_text text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF char_length(clean_body) < 3 OR char_length(clean_body) > 320 THEN RAISE EXCEPTION 'COMMENT_LENGTH'; END IF;
  searchable := lower(translate(clean_body, 'ًٌٍَُِّْـ', ''));
  IF searchable ~ '(شرموط|قحب|منيوك|عرص|خرا|طيز|ابن[[:space:]]*كلب|يلعن)' THEN
    RAISE EXCEPTION 'COMMENT_BLOCKED';
  END IF;
  SELECT trim(concat_ws(' ', first_name, last_name)) INTO name_text FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.comments (user_id, display_name, body)
  VALUES (auth.uid(), COALESCE(NULLIF(name_text, ''), 'لاعب قدّها'), clean_body)
  RETURNING * INTO result;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_comment(text) TO authenticated;
