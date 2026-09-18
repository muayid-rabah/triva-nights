-- 0014_harden_profile_email.sql
-- Security hardening: enforce public.profiles.email as a read-only mirror of auth.users.email

-- 1. Ensure email column exists
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email text NULL;

-- 2. Backfill email from auth.users where ID matches
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS DISTINCT FROM u.email);

-- 3. Function to enforce canonical email on public.profiles
CREATE OR REPLACE FUNCTION public.enforce_profile_canonical_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE
  canonical_email text;
BEGIN
  -- Retrieve canonical email directly from auth.users
  SELECT email INTO canonical_email FROM auth.users WHERE id = NEW.id;

  -- If an update attempts to forge or change email to anything other than the canonical email, reject it
  IF TG_OP = 'UPDATE' AND NEW.email IS DISTINCT FROM OLD.email AND NEW.email IS DISTINCT FROM canonical_email THEN
    RAISE EXCEPTION 'EMAIL_READONLY: profiles.email is a read-only mirror of auth.users.email';
  END IF;

  -- Enforce canonical email value
  NEW.email := canonical_email;
  RETURN NEW;
END;
$$;

-- Restrict function execution permissions
REVOKE ALL ON FUNCTION public.enforce_profile_canonical_email() FROM PUBLIC, anon, authenticated;

-- 4. Create enforcement trigger on public.profiles
DROP TRIGGER IF EXISTS tr_enforce_profile_canonical_email ON public.profiles;
CREATE TRIGGER tr_enforce_profile_canonical_email
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_canonical_email();

-- 5. Automatically propagate canonical email updates from auth.users to public.profiles
CREATE OR REPLACE FUNCTION public.sync_auth_user_email_to_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
    SET email = NEW.email
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_auth_user_email_to_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_sync_auth_user_email ON auth.users;
CREATE TRIGGER tr_sync_auth_user_email
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_auth_user_email_to_profile();

