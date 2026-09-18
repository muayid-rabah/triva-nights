// src/lib/server-account-service.ts
// Server-side account deletion service for "قدّ التحدي" (NextAura Studios)
// Ensures secure, authorized deletion of user accounts and cascades to all associated data

import { getSupabaseAdminClient } from "./server-payment-service";

export interface AccountDeletionResult {
  success: boolean;
  message: string;
  userId: string;
  deletedAt: string;
}

/**
 * Permanently deletes a user account and safely cleans up dependencies.
 *
 * Requirements:
 * 1. Derives userId solely from verified server-side authentication session.
 * 2. Cleans up multiplayer room edge cases (expires hosted waiting/playing rooms).
 * 3. Handles guest participation in active games to avoid hung opponent games.
 * 4. Calls supabaseAdmin.auth.admin.deleteUser(userId), which cascades through all
 *    foreign keys referencing auth.users(id) ON DELETE CASCADE in PostgreSQL:
 *    - public.profiles
 *    - public.accounts
 *    - public.phone_claims
 *    - public.user_roles
 *    - public.games
 *    - public.comments
 *    - public.user_subscriptions
 *    - public.purchases
 *    - public.rooms
 *    - public.room_players
 */
export async function processAccountDeletion({
  userId,
}: {
  userId: string;
}): Promise<AccountDeletionResult> {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("INVALID_USER_ID: User ID is required for deletion");
  }

  const cleanUserId = userId.trim();
  const supabaseAdmin = getSupabaseAdminClient();

  // Step 1: Pre-cleanup multiplayer room states where the deleting user is host
  try {
    const { error: hostRoomsError } = await supabaseAdmin
      .from("rooms")
      .update({
        status: "expired",
        updated_at: new Date().toISOString(),
      })
      .eq("host_id", cleanUserId)
      .in("status", ["waiting", "ready", "playing"]);

    if (hostRoomsError) {
      console.warn("[AccountDeletion] Warning expiring hosted rooms:", hostRoomsError.message);
    }
  } catch (err) {
    console.warn("[AccountDeletion] Non-fatal error cleaning up hosted rooms:", err);
  }

  // Step 2: Handle rooms where user is a guest player in an active match
  try {
    const { data: guestPlayerRows, error: guestFetchError } = await supabaseAdmin
      .from("room_players")
      .select("room_id")
      .eq("user_id", cleanUserId)
      .eq("role", "guest");

    if (!guestFetchError && guestPlayerRows && guestPlayerRows.length > 0) {
      const activeRoomIds = guestPlayerRows.map((r: { room_id: string }) => r.room_id);
      const { error: updateGuestRoomsError } = await supabaseAdmin
        .from("rooms")
        .update({
          status: "finished",
          updated_at: new Date().toISOString(),
        })
        .in("id", activeRoomIds)
        .eq("status", "playing");

      if (updateGuestRoomsError) {
        console.warn(
          "[AccountDeletion] Warning updating guest rooms:",
          updateGuestRoomsError.message,
        );
      }
    }
  } catch (err) {
    console.warn("[AccountDeletion] Non-fatal error handling guest games:", err);
  }

  // Step 3: Delete user from Supabase Auth via Admin API
  // This triggers database cascades to profiles, accounts, phone_claims, games, subscriptions, etc.
  const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(cleanUserId);

  if (deleteUserError) {
    console.error("[AccountDeletion] Failed to delete auth user:", deleteUserError.message);
    throw new Error(`AUTH_DELETE_FAILED: ${deleteUserError.message}`);
  }

  return {
    success: true,
    message: "تم حذف الحساب وجميع البيانات المرتبطة به بنجاح",
    userId: cleanUserId,
    deletedAt: new Date().toISOString(),
  };
}
