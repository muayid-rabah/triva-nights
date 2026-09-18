-- 0012_mandatory_onboarding.sql
-- Mandatory one-time onboarding state and future phone verification support.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;

-- Backfill existing profiles that already have full information:
-- (non-empty first_name, non-empty phone, non-empty country_code)
UPDATE public.profiles
SET onboarding_completed = true
WHERE (first_name IS NOT NULL AND trim(first_name) <> '')
  AND (phone IS NOT NULL AND trim(phone) <> '')
  AND (country_code IS NOT NULL AND trim(country_code) <> '');

