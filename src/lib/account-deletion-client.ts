// src/lib/account-deletion-client.ts
// Client-side helper for account deletion in "قدّ التحدي"

import { supabase } from "@/integrations/supabase/client";

export interface DeleteAccountResponse {
  success: boolean;
  message: string;
}

/**
 * Requests server-side account deletion for the currently authenticated user.
 * Sends the user's Supabase JWT in the Authorization header.
 * The server derives user identity directly from the verified token.
 */
export async function executeAccountDeletion(): Promise<DeleteAccountResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("يجب تسجيل الدخول أولاً لتأكيد حذف الحساب.");
  }

  const response = await fetch("/api/account/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg =
      data.error || "تعذر إتمام طلب حذف الحساب حالياً. يرجى المحاولة لاحقاً.";
    throw new Error(errorMsg);
  }

  // Clear client session and local state
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn("[AccountDeletion] Error during client signOut:", err);
  }

  if (typeof window !== "undefined") {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // Ignore storage clear errors
    }
  }

  return {
    success: true,
    message: data.message || "تم حذف الحساب بنجاح",
  };
}
