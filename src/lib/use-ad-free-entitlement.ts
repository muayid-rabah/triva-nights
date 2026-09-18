// src/lib/use-ad-free-entitlement.ts
// React Query hook for determining verified database-backed Ad-Free subscription status

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface UserSubscriptionRecord {
  id: string;
  user_id: string;
  provider: "paddle" | "google_play";
  provider_subscription_id: string | null;
  provider_transaction_id: string | null;
  product_id: string;
  plan: "ad_free_monthly" | "ad_free_yearly";
  status: "active" | "trialing" | "past_due" | "paused" | "canceled" | "expired";
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useAdFreeEntitlement() {
  const { user, isLoading: authLoading } = useAuth();

  const query = useQuery({
    queryKey: ["ad-free-entitlement", user?.id],
    enabled: !authLoading && !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
    queryFn: async (): Promise<{
      isAdFree: boolean;
      subscription: UserSubscriptionRecord | null;
    }> => {
      if (!user) {
        return { isAdFree: false, subscription: null };
      }

      // Query user's subscription records from Supabase (protected by RLS)
      const { data, error } = await supabase
        .from("user_subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["active", "trialing", "canceled", "past_due"])
        .order("current_period_end", { ascending: false });

      if (error) {
        console.warn("[useAdFreeEntitlement] Query failed:", error.message);
        return { isAdFree: false, subscription: null };
      }

      const now = new Date();
      // Find valid subscription where end date is in the future or active
      const validSub = (data as UserSubscriptionRecord[] | null)?.find((sub) => {
        if (!sub.current_period_end) {
          return sub.status === "active" || sub.status === "trialing";
        }
        const periodEnd = new Date(sub.current_period_end);
        return periodEnd > now;
      });

      return {
        isAdFree: !!validSub,
        subscription: validSub || null,
      };
    },
  });

  return {
    isAdFree: query.data?.isAdFree ?? false,
    subscription: query.data?.subscription ?? null,
    isLoading: authLoading || query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
