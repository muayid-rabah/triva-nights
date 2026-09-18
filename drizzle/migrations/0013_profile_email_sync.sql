-- 0013_profile_email_sync.sql
-- Add email column to public.profiles and sync from auth.users

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email text NULL;

-- Backfill existing profiles from auth.users where email is present
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND u.email IS NOT NULL
  AND (p.email IS NULL OR p.email <> u.email);

-- Update handle_new_user() trigger function to also record NEW.email on new signups
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
  INSERT INTO public.profiles (id, email, first_name, last_name, avatar_url, country_code, phone, games_left)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', split_part(COALESCE(NEW.raw_user_meta_data->>'full_name',''), ' ', 1)),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.raw_user_meta_data->>'avatar_url',
    raw_country,
    NULLIF(raw_phone, ''),
    2
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(profiles.email, EXCLUDED.email)
    WHERE profiles.email IS NULL AND EXCLUDED.email IS NOT NULL;
  RETURN NEW;
END;
$$;

