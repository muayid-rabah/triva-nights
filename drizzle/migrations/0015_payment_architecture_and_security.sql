-- 0015_payment_architecture_and_security.sql
-- Complete Payment Architecture, Credit Protection, and Idempotent Purchase Verification

-- ============================================================================
-- 1. CONVERT LEGACY 'monthly' PACKAGE TO FINITE CONSUMABLE 'vip' PACKAGE
-- ============================================================================

UPDATE public.packages
SET slug = 'vip',
    name = 'باقة VIP',
    games_count = 12,
    price = 24.99,
    description = '١٢ لعبة كاملة للموسم والقعدات الأسبوعية مع فئات متجددة',
    badge = 'الأفضل قيمة'
WHERE slug = 'monthly';

-- ============================================================================
-- 2. EVOLVE public.purchases SCHEMA
-- ============================================================================

-- Add provider, transaction, and verification columns if they do not exist
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'paddle',
  ADD COLUMN IF NOT EXISTS provider_transaction_id text NULL,
  ADD COLUMN IF NOT EXISTS provider_product_id text NULL,
  ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz NULL;

-- Backfill any existing purchases to 'completed' with default credits if not set
UPDATE public.purchases
SET status = 'completed',
    verified_at = COALESCE(verified_at, created_at)
WHERE status = 'pending' AND created_at < now() - interval '1 hour';

-- Ensure status is constrained to valid states
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchases_status_check'
  ) THEN
    ALTER TABLE public.purchases
      ADD CONSTRAINT purchases_status_check
      CHECK (status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded'));
  END IF;
END $$;

-- Idempotency constraint: unique provider transaction id per provider
CREATE UNIQUE INDEX IF NOT EXISTS purchases_provider_tx_idx
  ON public.purchases (provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

-- Index for user purchase lookups
CREATE INDEX IF NOT EXISTS purchases_user_id_idx
  ON public.purchases (user_id, created_at DESC);

-- ============================================================================
-- 3. HARDEN RLS POLICIES ON public.purchases
-- ============================================================================

-- Drop insecure client-side insert policy
DROP POLICY IF EXISTS "own purchases insert" ON public.purchases;
DROP POLICY IF EXISTS "own purchases update" ON public.purchases;
DROP POLICY IF EXISTS "own purchases delete" ON public.purchases;

-- Revoke direct mutation permissions from regular clients
REVOKE INSERT, UPDATE, DELETE ON public.purchases FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;

-- Ensure users can ONLY read their own purchase history
DROP POLICY IF EXISTS "own purchases select" ON public.purchases;
CREATE POLICY "own purchases select" ON public.purchases
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- 4. HARDEN public.profiles: PREVENT ARBITRARY CLIENT MODIFICATION OF CREDITS/BALANCE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_profile_credits_and_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
BEGIN
  -- If games_left or balance is being modified
  IF (NEW.games_left IS DISTINCT FROM OLD.games_left OR NEW.balance IS DISTINCT FROM OLD.balance) THEN
    -- Only permit changes if authorized by a trusted server function via transaction-local setting
    IF current_setting('app.allow_credit_modification', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'CREDITS_READONLY: games_left and balance cannot be modified directly by client updates';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_credits_and_balance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_protect_profile_credits ON public.profiles;
CREATE TRIGGER tr_protect_profile_credits
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_credits_and_balance();

-- ============================================================================
-- 5. UPDATE public.consume_game_credit() WITH LOCAL AUTHORIZATION FLAG
-- ============================================================================

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

  -- Authorize credit change locally for this transaction
  PERFORM set_config('app.allow_credit_modification', 'true', true);

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

-- ============================================================================
-- 6. ATOMIC & IDEMPOTENT PURCHASE COMPLETION OPERATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.complete_verified_purchase(
  p_user_id uuid,
  p_package_id uuid,
  p_provider text,
  p_provider_transaction_id text,
  p_provider_product_id text,
  p_amount numeric,
  p_currency text,
  p_credits_override integer DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pkg record;
  v_credits integer;
  v_existing_purchase record;
  v_new_games_left integer;
  v_purchase_id uuid;
BEGIN
  -- 1. Validate package existence (checks by id, or by slug with fallback for 'monthly' -> 'vip')
  SELECT * INTO v_pkg FROM public.packages WHERE id = p_package_id;
  IF NOT FOUND THEN
    SELECT * INTO v_pkg FROM public.packages WHERE slug = p_package_id::text;
    IF NOT FOUND THEN
      IF p_package_id::text = 'monthly' THEN
        SELECT * INTO v_pkg FROM public.packages WHERE slug = 'vip';
      END IF;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'PACKAGE_NOT_FOUND: %', p_package_id;
      END IF;
    END IF;
  END IF;

  v_credits := COALESCE(p_credits_override, v_pkg.games_count);

  -- 2. Idempotency Check: Has this provider transaction already been recorded?
  IF p_provider_transaction_id IS NOT NULL THEN
    SELECT * INTO v_existing_purchase
    FROM public.purchases
    WHERE provider = p_provider AND provider_transaction_id = p_provider_transaction_id;

    IF FOUND AND v_existing_purchase.status = 'completed' THEN
      -- Already completed! Return existing details without double-crediting
      SELECT games_left INTO v_new_games_left FROM public.profiles WHERE id = p_user_id;
      RETURN jsonb_build_object(
        'success', true,
        'already_processed', true,
        'purchase_id', v_existing_purchase.id,
        'games_left', v_new_games_left,
        'credits_granted', 0
      );
    END IF;
  END IF;

  -- 3. Authorize credit modification locally for this transaction
  PERFORM set_config('app.allow_credit_modification', 'true', true);

  -- 4. Atomically increment profiles.games_left
  UPDATE public.profiles
  SET games_left = games_left + v_credits
  WHERE id = p_user_id
  RETURNING games_left INTO v_new_games_left;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_PROFILE_NOT_FOUND: %', p_user_id;
  END IF;

  -- 5. Record or update purchase record
  IF v_existing_purchase.id IS NOT NULL THEN
    UPDATE public.purchases
    SET status = 'completed',
        credits = v_credits,
        amount = p_amount,
        currency = p_currency,
        provider_product_id = p_provider_product_id,
        verified_at = now()
    WHERE id = v_existing_purchase.id
    RETURNING id INTO v_purchase_id;
  ELSE
    INSERT INTO public.purchases (
      user_id,
      package_id,
      provider,
      provider_transaction_id,
      provider_product_id,
      credits,
      amount,
      currency,
      status,
      created_at,
      verified_at
    ) VALUES (
      p_user_id,
      v_pkg.id,
      p_provider,
      p_provider_transaction_id,
      p_provider_product_id,
      v_credits,
      p_amount,
      p_currency,
      'completed',
      now(),
      now()
    )
    RETURNING id INTO v_purchase_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'already_processed', false,
    'purchase_id', v_purchase_id,
    'games_left', v_new_games_left,
    'credits_granted', v_credits
  );
END;
$$;

-- Revoke execute from normal users; only server/service_role can complete purchases
REVOKE ALL ON FUNCTION public.complete_verified_purchase(uuid, uuid, text, text, text, numeric, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_verified_purchase(uuid, uuid, text, text, text, numeric, text, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
