-- MIGRATION 0019: FIX MULTIPLAYER ROOM SYNC & ELIMINATE RECURSIVE RLS
-- Architecture:
-- 1. Eliminate recursive RLS on public.room_players by introducing a SECURITY DEFINER helper public.is_room_member(p_room_id uuid).
-- 2. Audit and rewrite room_players and rooms policies to safely allow host and guest to read participants without self-referential RLS recursion.
-- 3. Provide canonical secure RPC public.get_multiplayer_room_state(p_room_id uuid) for unified, authoritative room-state fetching.
-- 4. Strictly enforce zero secret answer leakage and authorized room membership.

-- Step 1: Safe Membership Verification Helper (SECURITY DEFINER to prevent RLS recursion)
CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id = p_room_id AND r.host_id = v_uid
  ) OR EXISTS (
    SELECT 1 FROM public.room_players rp
    WHERE rp.room_id = p_room_id AND rp.user_id = v_uid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_room_member(uuid) TO authenticated;

-- Step 2: Fix RLS policies on public.rooms
DROP POLICY IF EXISTS "rooms_select_policy" ON public.rooms;
CREATE POLICY "rooms_select_policy" ON public.rooms
  FOR SELECT TO authenticated
  USING (
    host_id = auth.uid()
    OR public.is_room_member(id)
  );

DROP POLICY IF EXISTS "rooms_update_policy" ON public.rooms;
CREATE POLICY "rooms_update_policy" ON public.rooms
  FOR UPDATE TO authenticated
  USING (
    host_id = auth.uid()
    OR public.is_room_member(id)
  );

-- Step 3: Fix RLS policies on public.room_players (Removing recursive query on room_players)
DROP POLICY IF EXISTS "room_players_select_policy" ON public.room_players;
CREATE POLICY "room_players_select_policy" ON public.room_players
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_room_member(room_id)
  );

DROP POLICY IF EXISTS "room_players_delete_policy" ON public.room_players;
CREATE POLICY "room_players_delete_policy" ON public.room_players
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_room_member(room_id)
  );

-- Step 4: Canonical Secure RPC: get_multiplayer_room_state
-- Returns safe room details and players ordered by player_index ASC.
-- Rejects unauthenticated callers and callers not in the room.
CREATE OR REPLACE FUNCTION public.get_multiplayer_room_state(
  p_room_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_room public.rooms%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: يجب تسجيل الدخول للوصول إلى الغرفة';
  END IF;

  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: الغرفة غير موجودة';
  END IF;

  -- Caller must be host or a member of room_players for this room
  IF v_room.host_id <> v_user_id AND NOT EXISTS (
    SELECT 1 FROM public.room_players
    WHERE room_id = p_room_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'NOT_IN_ROOM: غير مصرح لك بالوصول إلى بيانات هذه الغرفة';
  END IF;

  RETURN public._format_room_json(v_room);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_multiplayer_room_state(uuid) TO authenticated;

