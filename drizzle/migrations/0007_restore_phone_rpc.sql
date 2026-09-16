-- Run this file in the SQL editor of the SAME Supabase project configured in
-- VITE_SUPABASE_URL.  It only repairs the phone-claim endpoint and is safe to
-- run after an earlier migration stopped on an "already exists" message.

CREATE TABLE IF NOT EXISTS public.phone_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_phone text NOT NULL,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS phone_claims_phone_idx ON public.phone_claims (normalized_phone);
ALTER TABLE public.phone_claims ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_phone(p_country_code text, p_phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  country_digits text := regexp_replace(COALESCE(p_country_code, ''), '[^0-9]', '', 'g');
  local_phone text := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  normalized text;
  existing_phone text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF local_phone LIKE country_digits || '%' THEN local_phone := substr(local_phone, length(country_digits) + 1); END IF;
  local_phone := regexp_replace(local_phone, '^0', '');
  IF country_digits = '962' AND local_phone !~ '^7[0-9]{8}$' THEN RAISE EXCEPTION 'PHONE_INVALID'; END IF;
  IF country_digits = '970' AND local_phone !~ '^(56|59)[0-9]{7}$' THEN RAISE EXCEPTION 'PHONE_INVALID'; END IF;
  IF country_digits NOT IN ('962', '970') AND length(local_phone) < 7 THEN RAISE EXCEPTION 'PHONE_INVALID'; END IF;
  normalized := country_digits || local_phone;
  PERFORM pg_advisory_xact_lock(hashtext(normalized));
  SELECT phone INTO existing_phone FROM public.profiles WHERE id = auth.uid();
  IF existing_phone IS NOT NULL THEN RAISE EXCEPTION 'PHONE_LOCKED'; END IF;
  IF (SELECT count(*) FROM public.phone_claims WHERE normalized_phone = normalized) >= 2 THEN RAISE EXCEPTION 'PHONE_ACCOUNT_LIMIT'; END IF;
  INSERT INTO public.phone_claims (normalized_phone, user_id) VALUES (normalized, auth.uid());
  UPDATE public.profiles SET country_code = p_country_code, phone = local_phone WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_phone(text, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
