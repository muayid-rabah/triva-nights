-- 0016_ad_free_subscriptions.sql
-- Real Recurring Ad-Free Subscription Entitlements (Google Play & Paddle)
-- This migration creates the user_subscriptions table, strictly enforces RLS,
-- provides trusted entitlement verification functions, and ensures no interference with game credits.

-- ============================================================================
-- 1. CREATE public.user_subscriptions TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subscription_id text NULL,
  provider_transaction_id text NULL,
  product_id text NOT NULL,
  plan text NOT NULL,
  status text NOT NULL,
  current_period_start timestamptz NULL,
  current_period_end timestamptz NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_subscriptions_provider_check
    CHECK (provider IN ('paddle', 'google_play')),
  CONSTRAINT user_subscriptions_plan_check
    CHECK (plan IN ('ad_free_monthly', 'ad_free_yearly')),
  CONSTRAINT user_subscriptions_status_check
    CHECK (status IN ('active', 'trialing', 'past_due', 'paused', 'canceled', 'expired'))
);

-- ============================================================================
-- 2. CREATE INDEXES FOR FAST LOOKUP & UNIQUENESS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id
  ON public.user_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status_period
  ON public.user_subscriptions (user_id, status, current_period_end);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_subscriptions_provider_sub
  ON public.user_subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

-- ============================================================================
-- 3. ROW LEVEL SECURITY (READ-ONLY FOR USERS, MUTATION RESTRICTED TO SERVER)
-- ============================================================================

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users may view ONLY their own subscription records
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.user_subscriptions;
CREATE POLICY "Users can view their own subscriptions"
  ON public.user_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Explicitly revoke all direct client-side mutation privileges
-- (Normal authenticated clients CANNOT insert, update, or delete subscriptions)
REVOKE INSERT, UPDATE, DELETE ON public.user_subscriptions FROM authenticated, anon;

-- ============================================================================
-- 4. CENTRAL DATABASE ENTITLEMENT FUNCTION: has_active_ad_free()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_active_ad_free(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Entitlement is active if:
  -- 1. status is 'active' or 'trialing', AND (current_period_end is null OR current_period_end > now())
  -- 2. status is 'canceled' (cancelled auto-renew) BUT current_period_end > now() (graceful access until period end)
  -- 3. status is 'past_due' (grace period) BUT current_period_end > now()
  RETURN EXISTS (
    SELECT 1
    FROM public.user_subscriptions
    WHERE user_id = p_user_id
      AND (
        (status IN ('active', 'trialing') AND (current_period_end IS NULL OR current_period_end > now()))
        OR (status IN ('canceled', 'past_due') AND current_period_end > now())
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_active_ad_free(uuid) TO authenticated, service_role;

-- Convenience RPC for the authenticated user to query their own ad-free entitlement
CREATE OR REPLACE FUNCTION public.check_my_ad_free_status()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  RETURN public.has_active_ad_free(auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_my_ad_free_status() TO authenticated;

-- ============================================================================
-- 5. SERVER-AUTHORITATIVE SUBSCRIPTION UPSERT RPC: upsert_verified_subscription()
-- ============================================================================
-- Called ONLY by trusted server/service_role via webhooks or verified store responses.
-- Guaranteed NOT to touch profiles.games_left or balance.

CREATE OR REPLACE FUNCTION public.upsert_verified_subscription(
  p_user_id uuid,
  p_provider text,
  p_provider_subscription_id text,
  p_provider_transaction_id text,
  p_product_id text,
  p_plan text,
  p_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_canceled_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub_id uuid;
BEGIN
  -- Check for existing subscription record for this provider
  IF p_provider_subscription_id IS NOT NULL THEN
    SELECT id INTO v_sub_id
    FROM public.user_subscriptions
    WHERE provider = p_provider AND provider_subscription_id = p_provider_subscription_id
    LIMIT 1;
  END IF;

  IF v_sub_id IS NULL AND p_provider_transaction_id IS NOT NULL THEN
    SELECT id INTO v_sub_id
    FROM public.user_subscriptions
    WHERE provider = p_provider AND provider_transaction_id = p_provider_transaction_id
    LIMIT 1;
  END IF;

  IF v_sub_id IS NOT NULL THEN
    UPDATE public.user_subscriptions
    SET
      provider_subscription_id = COALESCE(p_provider_subscription_id, provider_subscription_id),
      provider_transaction_id = COALESCE(p_provider_transaction_id, provider_transaction_id),
      product_id = p_product_id,
      plan = p_plan,
      status = p_status,
      current_period_start = p_current_period_start,
      current_period_end = p_current_period_end,
      cancel_at_period_end = p_cancel_at_period_end,
      canceled_at = COALESCE(p_canceled_at, canceled_at),
      updated_at = now()
    WHERE id = v_sub_id;
  ELSE
    INSERT INTO public.user_subscriptions (
      user_id,
      provider,
      provider_subscription_id,
      provider_transaction_id,
      product_id,
      plan,
      status,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      canceled_at,
      created_at,
      updated_at
    ) VALUES (
      p_user_id,
      p_provider,
      p_provider_subscription_id,
      p_provider_transaction_id,
      p_product_id,
      p_plan,
      p_status,
      p_current_period_start,
      p_current_period_end,
      p_cancel_at_period_end,
      p_canceled_at,
      now(),
      now()
    )
    RETURNING id INTO v_sub_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_sub_id,
    'status', p_status,
    'is_ad_free', public.has_active_ad_free(p_user_id)
  );
END;
$$;

-- Allow only service_role (backend server) to execute upsert_verified_subscription
REVOKE EXECUTE ON FUNCTION public.upsert_verified_subscription(uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.upsert_verified_subscription(uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz) TO service_role;

