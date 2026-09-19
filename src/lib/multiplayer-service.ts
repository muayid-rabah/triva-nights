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
  if (msg.includes("NOT_IN_ROOM")) {
    return "غير مصرح لك بالوصول إلى بيانات هذه الغرفة";
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
 * Fetches current canonical room state and players via secure authoritative RPC.
 * Never uses direct client SELECT on rooms or room_players to avoid recursive RLS issues.
 */
export async function fetchRoomState(
  roomId: string,
): Promise<{ data: MultiplayerRoomState | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc("get_multiplayer_room_state", {
      p_room_id: roomId,
    });

    if (error) {
      return { data: null, error: parseRpcError(error) };
    }

    return {
      data: data as unknown as MultiplayerRoomState,
      error: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "تعذر جلب حالة الغرفة";
    return { data: null, error: message };
  }
}

/**
 * Subscribes to live room updates via Supabase Realtime with automatic polling fallback
 * and mobile lifecycle resume triggers (document.visibilitychange).
 */
export function subscribeToRoom(
  roomId: string,
  onUpdate: (state: MultiplayerRoomState) => void,
  onError?: (error: string) => void,
): () => void {
  let isMounted = true;
  let isFetching = false;
  let lastLoggedError: string | null = null;

  // Dedicated single-flight fetch and broadcast helper
  const triggerRefresh = async () => {
    if (!isMounted || isFetching) return;
    isFetching = true;
    try {
      const { data, error } = await fetchRoomState(roomId);
      if (!isMounted) return;

      if (error) {
        if (error !== lastLoggedError) {
          lastLoggedError = error;
          if (import.meta.env.DEV) {
            console.warn(`[Multiplayer] Room state refresh error for ${roomId}:`, error);
          }
        }
        onError?.(error);
      } else if (data) {
        lastLoggedError = null;
        onUpdate(data);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn(`[Multiplayer] Unexpected error refreshing room ${roomId}:`, err);
      }
    } finally {
      isFetching = false;
    }
  };

  // 1. Immediate fetch upon subscription start (do not wait 2.5s)
  void triggerRefresh();

  // 2. Polling fallback every 2.5 seconds (resilient to mobile network drops)
  const pollInterval = setInterval(() => {
    void triggerRefresh();
  }, 2500);

  // 3. Mobile / Browser lifecycle resume trigger
  const handleVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      void triggerRefresh();
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  // 4. Realtime WebSocket channel subscription
  const channel = supabase
    .channel(`room:${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      () => {
        void triggerRefresh();
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
      () => {
        void triggerRefresh();
      },
    )
    .subscribe();

  return () => {
    isMounted = false;
    clearInterval(pollInterval);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
    void supabase.removeChannel(channel);
  };
}
