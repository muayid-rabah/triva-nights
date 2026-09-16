-- Repairs the game-credit endpoint for Supabase projects where an earlier
-- migration stopped after an "already exists" error. Safe to run repeatedly.

CREATE OR REPLACE FUNCTION public.consume_game_credit()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  remaining integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND phone IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PHONE_REQUIRED';
  END IF;

  UPDATE public.profiles
  SET games_left = games_left - 1
  WHERE id = auth.uid() AND games_left > 0
  RETURNING games_left INTO remaining;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_GAMES_LEFT';
  END IF;

  RETURN remaining;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_game_credit() TO authenticated;
NOTIFY pgrst, 'reload schema';
