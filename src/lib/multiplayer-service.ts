import { supabase } from "@/integrations/supabase/client";
import type { GameState, HelpKey } from "./game-types";

export type RoomStatus = "waiting" | "ready" | "playing" | "finished" | "expired";
export type PlayerRole = "host" | "guest";

export interface RoomRecord {
  id: string;
  code: string;
  game_slug: string;
  host_id: string;
  host_name: string;
  status: RoomStatus;
  max_players: number;
  current_turn: 0 | 1;
  session_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RoomPlayerRecord {
  id: string;
  user_id: string;
  player_name: string;
  role: PlayerRole;
  player_index: 0 | 1;
  joined_at: string;
  last_active_at: string;
}

export interface MultiplayerRoomState {
  room: RoomRecord;
  players: RoomPlayerRecord[];
}

export function parseRpcError(error: {
  message?: string;
  details?: string;
  hint?: string;
}): string {
  const msg = error.message || "";
  if (msg.includes("ROOM_FULL") || msg.includes("الغرفة مكتملة")) {
    return "الغرفة مكتملة";
  }
  if (msg.includes("ROOM_NOT_FOUND")) {
    return "الكود غير صحيح أو الغرفة غير موجودة";
  }
  if (msg.includes("ROOM_EXPIRED")) {
    return "انتهت صلاحية الغرفة";
  }
  if (msg.includes("ROOM_ALREADY_PLAYING")) {
    return "بدأت اللعبة بالفعل في هذه الغرفة";
  }
  if (msg.includes("NOT_YOUR_TURN")) {
    return "ليس دورك لاختيار السؤال أو استخدام المساعدة";
  }
  if (msg.includes("QUESTION_ALREADY_USED")) {
    return "هذا السؤال تمت الإجابة عليه مسبقاً";
  }
  if (msg.includes("NOT_ENOUGH_PLAYERS")) {
    return "يجب وجود لاعبين اثنين بالضبط لبدء التحدي";
  }
  if (msg.includes("AUTH_REQUIRED")) {
    return "يجب تسجيل الدخول أولاً للمشاركة";
  }
  if (msg.includes("NOT_HOST")) {
    return "فقط المضيف يمكنه بدء اللعبة";
  }
  if (msg.includes('relation "public.rooms" does not exist') || msg.includes("PGRST202")) {
    return "يرجى تطبيق ترقية قاعدة البيانات 0018_multiplayer_rooms.sql في Supabase أولاً";
  }
  return msg || "حدث خطأ أثناء معالجة طلب الغرفة";
}

/**
 * Creates a new 2-player multiplayer room on the database with a 6-digit numeric code.
 */
export async function createRoom(
  gameSlug: string,
  hostName: string,
): Promise<{ data: MultiplayerRoomState | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc("create_multiplayer_room", {
      p_game_slug: gameSlug,
      p_host_name: hostName.trim() || "المضيف",
      p_max_players: 2,
    });

    if (error) {
      return { data: null, error: parseRpcError(error) };
    }

    return { data: data as unknown as MultiplayerRoomState, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "تعذر إنشاء الغرفة";
    return { data: null, error: parseRpcError({ message }) };
  }
}

/**
 * Joins an existing room by its 6-digit code (Strictly 2 players maximum).
 */
export async function joinRoom(
  code: string,
  playerName: string,
): Promise<{ data: MultiplayerRoomState | null; error: string | null }> {
  try {
    const cleanCode = code.replace(/\s+/g, "").trim().toUpperCase();
    if (!cleanCode || cleanCode.length !== 6) {
      return { data: null, error: "كود الغرفة يتكون من ٦ أرقام" };
    }

    const { data, error } = await supabase.rpc("join_multiplayer_room", {
      p_code: cleanCode,
      p_player_name: playerName.trim() || "لاعب",
    });

    if (error) {
      return { data: null, error: parseRpcError(error) };
    }

    return { data: data as unknown as MultiplayerRoomState, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "تعذر الانضمام إلى الغرفة";
    return { data: null, error: parseRpcError({ message }) };
  }
}

/**
 * Starts the authoritative multiplayer game (Host only, strictly 2 players required).
 * Zero-trust: The client only sends optional categorySlugs or questionIds.
 * The server selects questions, hides answers in private room_questions, and builds the safe session.
 */
export async function startRoom(
  roomId: string,
  sessionData: Record<string, unknown> | GameState = {},
  categorySlugs?: string[],
  questionIds?: string[],
): Promise<{ data: MultiplayerRoomState | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc("start_multiplayer_game", {
      p_room_id: roomId,
      p_session_data: sessionData,
      p_category_slugs: categorySlugs && categorySlugs.length > 0 ? categorySlugs : null,
      p_question_ids: questionIds && questionIds.length > 0 ? questionIds : null,
    });

    if (error) {
      return { data: null, error: parseRpcError(error) };
    }

    return { data: data as unknown as MultiplayerRoomState, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "تعذر بدء اللعبة";
    return { data: null, error: parseRpcError({ message }) };
  }
}

/**
 * Submits an atomic, server-validated multiplayer game action.
 */
export async function submitMultiplayerAction(
  roomId: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<{ data: MultiplayerRoomState | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc("submit_multiplayer_action", {
      p_room_id: roomId,
      p_action: action,
      p_payload: payload,
    });

    if (error) {
      return { data: null, error: parseRpcError(error) };
    }

    return { data: data as unknown as MultiplayerRoomState, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "تعذر تنفيذ الإجراء";
    return { data: null, error: parseRpcError({ message }) };
  }
}

/**
 * Selects an active question for both devices.
 */
export async function selectMultiplayerQuestion(roomId: string, questionId: string) {
  return submitMultiplayerAction(roomId, "select_question", { question_id: questionId });
}

/**
 * Reveals the answer of the active question on both devices.
 */
export async function revealMultiplayerAnswer(roomId: string) {
  return submitMultiplayerAction(roomId, "reveal_answer");
}

/**
 * Closes the active question modal without scoring.
 */
export async function closeMultiplayerQuestion(roomId: string) {
  return submitMultiplayerAction(roomId, "close_question");
}

export interface AnswerResolutionOptions {
  selectedAnswer?: string;
  judgeTeam?: 0 | 1 | null;
  team?: 0 | 1 | null;
}

/**
 * Records answer, adds points atomically, advances turn, and marks question used.
 * Records answer, evaluates correctness server-side, adds points atomically,
 * advances turn, and marks question used. (Client cannot supply score or points).
 */
export async function answerMultiplayerQuestion(
  roomId: string,
  questionId: string,
  resolution?: AnswerResolutionOptions | 0 | 1 | null,
  _legacyPoints?: number,
) {
  const payload: Record<string, unknown> = {
    question_id: questionId,
  };

  if (typeof resolution === "object" && resolution !== null) {
    if (resolution.selectedAnswer !== undefined) {
      payload.selected_answer = resolution.selectedAnswer;
    }
    if (resolution.judgeTeam !== undefined) {
      payload.judge_team = resolution.judgeTeam;
    } else if (resolution.team !== undefined) {
      payload.judge_team = resolution.team;
    }
  } else if (resolution !== undefined) {
    payload.judge_team = resolution;
  }

  return submitMultiplayerAction(roomId, "answer_question", payload);
}

/**
 * Uses a team help item in-game.
 */
export async function triggerMultiplayerHelp(roomId: string, helpKey: HelpKey) {
  return submitMultiplayerAction(roomId, "use_help", { help_key: helpKey });
}

/**
 * Marks game as finished.
 */
export async function finishMultiplayerGame(roomId: string) {
  return submitMultiplayerAction(roomId, "finish_game");
}

/**
 * Leaves the room.
 */
export async function leaveRoom(roomId: string): Promise<void> {
  try {
    await supabase.rpc("leave_multiplayer_room", { p_room_id: roomId });
  } catch {
    /* Silent cleanup */
  }
}

/**
 * Looks up room by 6-digit code for direct navigation / refresh / reconnect.
 */
export async function fetchRoomByCode(
  code: string,
): Promise<{ data: MultiplayerRoomState | null; error: string | null }> {
  try {
    const cleanCode = code.replace(/\s+/g, "").trim().toUpperCase();
    const { data, error } = await supabase.rpc("get_room_by_code", { p_code: cleanCode });

    if (error) {
      return { data: null, error: parseRpcError(error) };
    }

    return { data: data as unknown as MultiplayerRoomState, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "تعذر جلب بيانات الغرفة";
    return { data: null, error: message };
  }
}

/**
 * Fetches current room state and players directly by ID.
 */
export async function fetchRoomState(
  roomId: string,
): Promise<{ data: MultiplayerRoomState | null; error: string | null }> {
  try {
    const { data: roomData, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (roomError || !roomData) {
      return { data: null, error: roomError ? parseRpcError(roomError) : "الغرفة غير موجودة" };
    }

    const { data: playersData, error: playersError } = await supabase
      .from("room_players")
      .select("id, user_id, player_name, role, player_index, joined_at, last_active_at")
      .eq("room_id", roomId)
      .order("player_index", { ascending: true });

    if (playersError) {
      return { data: null, error: parseRpcError(playersError) };
    }

    return {
      data: {
        room: roomData as RoomRecord,
        players: (playersData || []) as RoomPlayerRecord[],
      },
      error: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "تعذر جلب حالة الغرفة";
    return { data: null, error: message };
  }
}

/**
 * Subscribes to live room updates via Supabase Realtime with automatic polling fallback.
 */
export function subscribeToRoom(
  roomId: string,
  onUpdate: (state: MultiplayerRoomState) => void,
): () => void {
  let isMounted = true;

  // 1. Polling fallback every 2.5 seconds (resilient to mobile network drops)
  const pollInterval = setInterval(async () => {
    if (!isMounted) return;
    const { data } = await fetchRoomState(roomId);
    if (data && isMounted) {
      onUpdate(data);
    }
  }, 2500);

  // 2. Realtime WebSocket channel subscription
  const channel = supabase
    .channel(`room:${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      async () => {
        if (!isMounted) return;
        const { data } = await fetchRoomState(roomId);
        if (data && isMounted) onUpdate(data);
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
      async () => {
        if (!isMounted) return;
        const { data } = await fetchRoomState(roomId);
        if (data && isMounted) onUpdate(data);
      },
    )
    .subscribe();

  return () => {
    isMounted = false;
    clearInterval(pollInterval);
    void supabase.removeChannel(channel);
  };
}
