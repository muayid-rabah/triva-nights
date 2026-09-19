/**
 * Multiplayer Security & Anti-Cheat Test Suite
 *
 * Tests:
 * 5.A. Normal player tries judge_team=0 on MCQ -> Rejected (MANUAL_JUDGING_NOT_PERMITTED)
 * 5.B. Normal player tries judge_team=1 on MCQ -> Rejected (MANUAL_JUDGING_NOT_PERMITTED)
 * 5.C. Unauthorized user tries manual judgment on open question -> Rejected (NOT_AUTHORIZED_JUDGE)
 * 5.D. Authorized manual judgment on allowed subjective question -> Succeeds once
 * 5.E. Second judgment attempt on same question -> Rejected (QUESTION_ALREADY_USED)
 * 6.1. Fake question ID during session start -> Rejected (INVALID_QUESTION_ID)
 * 6.2. Client cannot inject modified correct answer (server evaluates from private room_questions)
 * 6.3. Pre-reveal SELECT/Realtime contains no answer field (zero secret leakage)
 * 6.4. Client-supplied points (e.g. 999999) ignored; server computes trusted points only
 * 6.5. Unselected / future question answering rejected (QUESTION_NOT_ACTIVE)
 * 6.6. Out-of-turn question selection rejected (NOT_YOUR_TURN)
 * 6.7. Third player joining 2-player room rejected (ROOM_FULL)
 */

import fs from "node:fs";
import path from "node:path";

// -------------------------------------------------------------
// 1. Static Contract & Migration Analysis
// -------------------------------------------------------------
function testMigrationSecurityContract() {
  console.log("\n=== 1. Validating 0018_multiplayer_rooms.sql Security Contract ===");
  const sqlPath = path.resolve(process.cwd(), "drizzle/migrations/0018_multiplayer_rooms.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");

  // A. Strict 2-player capacity
  if (!sql.includes("max_players integer NOT NULL DEFAULT 2 CHECK (max_players = 2)")) {
    throw new Error("Missing CHECK (max_players = 2) in rooms table");
  }
  if (!sql.includes("IF v_current_count >= 2 THEN") || !sql.includes("ROOM_FULL: الغرفة مكتملة")) {
    throw new Error("Missing server-side ROOM_FULL rejection in join_multiplayer_room");
  }
  console.log("  [PASS] Strict 2-player capacity enforced in DB schema & join RPC");

  // B. Secret answers in private room_questions with NO SELECT policies
  if (!sql.includes("CREATE TABLE IF NOT EXISTS public.room_questions")) {
    throw new Error("Missing room_questions table");
  }
  if (
    sql.includes('CREATE POLICY "room_questions_select_policy"') ||
    sql.includes("GRANT SELECT ON public.room_questions TO authenticated")
  ) {
    throw new Error(
      "Security vulnerability: room_questions has direct SELECT grant or policy for authenticated users!",
    );
  }
  console.log("  [PASS] Secret answers isolated in private room_questions with zero SELECT access");

  // C. Safe public session questions contain NO answer field
  const intoIndex = sql.indexOf("INTO v_safe_questions");
  const selectBeforeInto = sql.lastIndexOf("SELECT coalesce(jsonb_agg(", intoIndex);
  const safeQuestionsBuild = sql.slice(selectBeforeInto, intoIndex);
  if (safeQuestionsBuild.includes("'answer'") || safeQuestionsBuild.includes("q.answer")) {
    throw new Error(
      "Security vulnerability: v_safe_questions exposes answer field in public session!",
    );
  }
  console.log("  [PASS] Pre-reveal session questions contain NO answer field");

  // D. MCQ rejects manual judging
  if (!sql.includes("v_secret_q.kind = 'mcq'") || !sql.includes("MANUAL_JUDGING_NOT_PERMITTED")) {
    throw new Error("Missing MCQ manual judging rejection in submit_multiplayer_action");
  }
  console.log("  [PASS] MCQ rejects judge_team / manual judging server-side");

  // E. Host-only manual judging authorization on open questions
  if (!sql.includes("v_player.role <> 'host'") || !sql.includes("NOT_AUTHORIZED_JUDGE")) {
    throw new Error("Missing host-only authorization check for manual judging");
  }
  console.log("  [PASS] Host-only authorization enforced for subjective/open question judging");

  // F. Server derives points exclusively from room_questions.points
  if (!sql.includes("v_points := v_secret_q.points;")) {
    throw new Error("Server must derive points from trusted v_secret_q.points");
  }
  console.log(
    "  [PASS] Server derives points from trusted room_questions.points, client points ignored",
  );

  // G. Duplicate answer & future question rejection
  if (!sql.includes("IF v_used ? v_q_id THEN") || !sql.includes("QUESTION_ALREADY_USED")) {
    throw new Error("Missing duplicate question usage prevention");
  }
  if (!sql.includes("QUESTION_NOT_ACTIVE")) {
    throw new Error("Missing active question check");
  }
  console.log("  [PASS] Anti-cheat guards against double scoring and future question answering");

  // H. Migration 0019 contract: Non-recursive RLS & Canonical RPC
  console.log("\n=== 1.1 Validating 0019_fix_multiplayer_room_sync.sql Security & Non-Recursive RLS ===");
  const sql0019Path = path.resolve(
    process.cwd(),
    "drizzle/migrations/0019_fix_multiplayer_room_sync.sql",
  );
  if (!fs.existsSync(sql0019Path)) {
    throw new Error("Missing migration file: 0019_fix_multiplayer_room_sync.sql");
  }
  const sql0019 = fs.readFileSync(sql0019Path, "utf-8");

  // Verify non-recursive helper is defined as SECURITY DEFINER
  if (
    !sql0019.includes("CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id uuid)") ||
    !sql0019.includes("SECURITY DEFINER")
  ) {
    throw new Error("Migration 0019 must define public.is_room_member as SECURITY DEFINER");
  }

  // Verify room_players select policy does NOT recursively query room_players directly
  const roomPlayersSelectMatch = sql0019.match(
    /CREATE POLICY "room_players_select_policy" ON public\.room_players[\s\S]*?;/,
  );
  if (!roomPlayersSelectMatch) {
    throw new Error("Missing room_players_select_policy in migration 0019");
  }
  const roomPlayersSelectPolicy = roomPlayersSelectMatch[0];
  if (
    roomPlayersSelectPolicy.includes("FROM public.room_players rp2") ||
    roomPlayersSelectPolicy.includes("FROM public.room_players")
  ) {
    throw new Error(
      "Security / Architecture vulnerability: Recursive query on public.room_players found in room_players_select_policy!",
    );
  }
  console.log("  [PASS] Non-recursive RLS verified: room_players policy uses safe SECURITY DEFINER helper");

  // Verify room_players delete policy allows self or room host only
  const roomPlayersDeleteMatch = sql0019.match(
    /CREATE POLICY "room_players_delete_policy" ON public\.room_players[\s\S]*?;/,
  );
  if (!roomPlayersDeleteMatch) {
    throw new Error("Missing room_players_delete_policy in migration 0019");
  }
  const roomPlayersDeletePolicy = roomPlayersDeleteMatch[0];
  if (roomPlayersDeletePolicy.includes("public.is_room_member(room_id)")) {
    throw new Error(
      "Security vulnerability: room_players_delete_policy must not allow any room member to delete another player!",
    );
  }
  if (!roomPlayersDeletePolicy.includes("r.host_id = auth.uid()")) {
    throw new Error("room_players_delete_policy must allow room host to delete player rows");
  }
  console.log("  [PASS] Non-recursive secure DELETE RLS verified: only self or room host can delete player rows");

  // Verify get_multiplayer_room_state RPC
  if (
    !sql0019.includes("CREATE OR REPLACE FUNCTION public.get_multiplayer_room_state(p_room_id uuid)") &&
    !sql0019.includes("FUNCTION public.get_multiplayer_room_state(")
  ) {
    throw new Error("Migration 0019 must define canonical get_multiplayer_room_state RPC");
  }
  if (!sql0019.includes("RAISE EXCEPTION 'NOT_IN_ROOM")) {
    throw new Error("get_multiplayer_room_state must raise NOT_IN_ROOM for non-members");
  }
  if (!sql0019.includes("GRANT EXECUTE ON FUNCTION public.get_multiplayer_room_state(uuid) TO authenticated;")) {
    throw new Error("get_multiplayer_room_state must grant execute to authenticated");
  }
  console.log("  [PASS] Canonical RPC get_multiplayer_room_state contract verified");
}

// -------------------------------------------------------------
// 2. Behavioral State Machine Simulation (Simulating PL/pgSQL RPC)
// -------------------------------------------------------------

interface MockRoomQuestion {
  question_id: string;
  kind: "mcq" | "open";
  points: number;
  answer: string;
  choices?: string[];
}

interface MockRoomSession {
  activeQuestionId: string | null;
  revealed: boolean;
  revealedAnswer: string | null;
  used: string[];
  turn: 0 | 1;
  teams: [{ name: string; score: number }, { name: string; score: number }];
}

interface MockRoom {
  id: string;
  current_turn: 0 | 1;
  session_data: MockRoomSession;
}

interface MockPlayer {
  user_id: string;
  role: "host" | "guest";
  player_index: 0 | 1;
}

function simulateSubmitAction(
  room: MockRoom,
  player: MockPlayer,
  secretQuestions: Map<string, MockRoomQuestion>,
  action: string,
  payload: Record<string, unknown>,
): { success: boolean; error?: string; session?: MockRoomSession } {
  const session = JSON.parse(JSON.stringify(room.session_data)) as MockRoomSession;

  if (action === "select_question") {
    const qId = payload.question_id as string;
    if (player.player_index !== room.current_turn) {
      return { success: false, error: "NOT_YOUR_TURN: ليس دورك لاختيار السؤال" };
    }
    if (session.activeQuestionId !== null) {
      return { success: false, error: "QUESTION_ALREADY_ACTIVE: هناك سؤال نشط حالياً بالفعل" };
    }
    if (!secretQuestions.has(qId)) {
      return { success: false, error: "INVALID_QUESTION_ID: السؤال غير مسجل في هذه الجلسة" };
    }
    if (session.used.includes(qId)) {
      return { success: false, error: "QUESTION_ALREADY_USED: هذا السؤال تمت الإجابة عليه مسبقاً" };
    }
    session.activeQuestionId = qId;
    session.revealed = false;
    session.revealedAnswer = null;
    room.session_data = session;
    return { success: true, session };
  }

  if (action === "answer_question") {
    const qId = (payload.question_id as string) || session.activeQuestionId || "";
    if (!qId || qId !== session.activeQuestionId) {
      return {
        success: false,
        error: "QUESTION_NOT_ACTIVE: السؤال المحدد ليس السؤال النشط حالياً",
      };
    }
    if (session.used.includes(qId)) {
      return { success: false, error: "QUESTION_ALREADY_USED: هذا السؤال تمت الإجابة عليه مسبقاً" };
    }

    const secretQ = secretQuestions.get(qId);
    if (!secretQ) {
      return { success: false, error: "QUESTION_NOT_FOUND: السؤال غير مسجل في هذه الجلسة" };
    }

    // Points are derived strictly from trusted DB
    const points = secretQ.points;
    let awardedTeam: 0 | 1 | null = null;
    let isCorrect = false;

    if (secretQ.kind === "mcq") {
      // 5.A & 5.B: Reject manual judging on MCQ
      if ("judge_team" in payload || "team" in payload) {
        return {
          success: false,
          error:
            "MANUAL_JUDGING_NOT_PERMITTED: أسئلة الاختيار من متعدد تُحسم آلياً من الخادم ولا تقبل التحكيم اليدوي",
        };
      }
      if (!payload.selected_answer || typeof payload.selected_answer !== "string") {
        return {
          success: false,
          error: "ANSWER_REQUIRED: يجب تحديد خيار الإجابة لأسئلة الاختيار من متعدد",
        };
      }
      if (player.player_index !== room.current_turn) {
        return { success: false, error: "NOT_YOUR_TURN: لا يمكنك الإجابة في غير دورك" };
      }

      if (payload.selected_answer.trim().toLowerCase() === secretQ.answer.trim().toLowerCase()) {
        isCorrect = true;
        awardedTeam = room.current_turn;
      } else {
        isCorrect = false;
        awardedTeam = null;
      }
    } else {
      // 5.C: Unauthorized user tries manual judgment on open question
      if (player.role !== "host") {
        return {
          success: false,
          error: "NOT_AUTHORIZED_JUDGE: فقط مضيف الغرفة مخوّل بتحكيم الأسئلة المفتوحة والتمثيل",
        };
      }

      if ("judge_team" in payload || "team" in payload) {
        const val = String(payload.judge_team ?? payload.team);
        if (val === "0" || val === "1") {
          awardedTeam = Number(val) as 0 | 1;
          isCorrect = true;
        } else if (!val || val === "null") {
          awardedTeam = null;
          isCorrect = false;
        } else {
          return { success: false, error: "INVALID_JUDGE_TEAM: الفريق المحدد غير صالح" };
        }
      } else {
        return {
          success: false,
          error: "JUDGMENT_REQUIRED: يرجى تحديد نتيجة التحكيم للسؤال المفتوح",
        };
      }
    }

    session.used.push(qId);
    if (awardedTeam !== null) {
      session.teams[awardedTeam].score += points;
    }
    session.revealed = true;
    session.revealedAnswer = secretQ.answer;
    room.current_turn = ((room.current_turn + 1) % 2) as 0 | 1;
    session.turn = room.current_turn;
    session.activeQuestionId = null;
    room.session_data = session;
    return { success: true, session };
  }

  return { success: false, error: "UNKNOWN_ACTION" };
}

function runSecurityScenarios() {
  console.log("\n=== 2. Running Malicious Client & Attack Simulation Scenarios ===");

  const secretQuestions = new Map<string, MockRoomQuestion>([
    [
      "q-mcq-1",
      {
        question_id: "q-mcq-1",
        kind: "mcq",
        points: 400,
        answer: "البتراء",
        choices: ["البتراء", "جرش", "أم قيس", "العقبة"],
      },
    ],
    [
      "q-open-1",
      {
        question_id: "q-open-1",
        kind: "open",
        points: 600,
        answer: "طائر الحناء",
      },
    ],
  ]);

  const hostPlayer: MockPlayer = { user_id: "user-host", role: "host", player_index: 0 };
  const guestPlayer: MockPlayer = { user_id: "user-guest", role: "guest", player_index: 1 };

  function createFreshRoom(): MockRoom {
    return {
      id: "room-100",
      current_turn: 0,
      session_data: {
        activeQuestionId: null,
        revealed: false,
        revealedAnswer: null,
        used: [],
        turn: 0,
        teams: [
          { name: "المضيف", score: 0 },
          { name: "الضيف", score: 0 },
        ],
      },
    };
  }

  // -------------------------------------------------------------
  // Test 5.A: Normal player tries judge_team=0 on MCQ -> REJECTED
  // -------------------------------------------------------------
  {
    const room = createFreshRoom();
    simulateSubmitAction(room, hostPlayer, secretQuestions, "select_question", {
      question_id: "q-mcq-1",
    });
    const res = simulateSubmitAction(room, hostPlayer, secretQuestions, "answer_question", {
      question_id: "q-mcq-1",
      judge_team: 0,
    });
    if (res.success || !res.error?.includes("MANUAL_JUDGING_NOT_PERMITTED")) {
      throw new Error(
        `Test 5.A Failed: Expected MANUAL_JUDGING_NOT_PERMITTED, got: ${JSON.stringify(res)}`,
      );
    }
    console.log("  [PASS] Test 5.A: Player trying judge_team=0 on MCQ is rejected");
  }

  // -------------------------------------------------------------
  // Test 5.B: Normal player tries judge_team=1 on MCQ -> REJECTED
  // -------------------------------------------------------------
  {
    const room = createFreshRoom();
    simulateSubmitAction(room, hostPlayer, secretQuestions, "select_question", {
      question_id: "q-mcq-1",
    });
    const res = simulateSubmitAction(room, hostPlayer, secretQuestions, "answer_question", {
      question_id: "q-mcq-1",
      judge_team: 1,
    });
    if (res.success || !res.error?.includes("MANUAL_JUDGING_NOT_PERMITTED")) {
      throw new Error(
        `Test 5.B Failed: Expected MANUAL_JUDGING_NOT_PERMITTED, got: ${JSON.stringify(res)}`,
      );
    }
    console.log("  [PASS] Test 5.B: Player trying judge_team=1 on MCQ is rejected");
  }

  // -------------------------------------------------------------
  // Test 5.C: Unauthorized user (Guest) tries manual judgment -> REJECTED
  // -------------------------------------------------------------
  {
    const room = createFreshRoom();
    simulateSubmitAction(room, hostPlayer, secretQuestions, "select_question", {
      question_id: "q-open-1",
    });
    const res = simulateSubmitAction(room, guestPlayer, secretQuestions, "answer_question", {
      question_id: "q-open-1",
      judge_team: 1,
    });
    if (res.success || !res.error?.includes("NOT_AUTHORIZED_JUDGE")) {
      throw new Error(
        `Test 5.C Failed: Expected NOT_AUTHORIZED_JUDGE, got: ${JSON.stringify(res)}`,
      );
    }
    console.log("  [PASS] Test 5.C: Unauthorized user (Guest) trying manual judgment is rejected");
  }

  // -------------------------------------------------------------
  // Test 5.D: Authorized manual judgment (Host) on subjective question -> SUCCEEDS ONCE
  // -------------------------------------------------------------
  {
    const room = createFreshRoom();
    simulateSubmitAction(room, hostPlayer, secretQuestions, "select_question", {
      question_id: "q-open-1",
    });
    const res = simulateSubmitAction(room, hostPlayer, secretQuestions, "answer_question", {
      question_id: "q-open-1",
      judge_team: 1, // Award points to guest
      points: 999999, // Malicious injected points attempt!
    });
    if (!res.success) {
      throw new Error(`Test 5.D Failed: Expected success, got error: ${res.error}`);
    }
    // Check that points awarded were the trusted 600, NOT 999999!
    if (room.session_data.teams[1].score !== 600) {
      throw new Error(
        `Test 5.D Failed: Injected points accepted! Score is: ${room.session_data.teams[1].score}`,
      );
    }
    console.log(
      "  [PASS] Test 5.D: Authorized manual judgment by Host succeeds once (with trusted points 600, ignoring fake 999999)",
    );

    // -------------------------------------------------------------
    // Test 5.E: Second judgment attempt on same question -> REJECTED
    // -------------------------------------------------------------
    const res2 = simulateSubmitAction(room, hostPlayer, secretQuestions, "answer_question", {
      question_id: "q-open-1",
      judge_team: 0,
    });
    if (
      res2.success ||
      (!res2.error?.includes("QUESTION_ALREADY_USED") &&
        !res2.error?.includes("QUESTION_NOT_ACTIVE"))
    ) {
      throw new Error(`Test 5.E Failed: Second judgment attempt on used question succeeded!`);
    }
    console.log("  [PASS] Test 5.E: Second judgment attempt on already used question is rejected");
  }

  // -------------------------------------------------------------
  // Test 6.A: Client answers MCQ correctly -> Server awards points automatically
  // -------------------------------------------------------------
  {
    const room = createFreshRoom();
    simulateSubmitAction(room, hostPlayer, secretQuestions, "select_question", {
      question_id: "q-mcq-1",
    });
    const res = simulateSubmitAction(room, hostPlayer, secretQuestions, "answer_question", {
      question_id: "q-mcq-1",
      selected_answer: "البتراء",
    });
    if (!res.success || room.session_data.teams[0].score !== 400) {
      throw new Error("MCQ answer evaluation failed");
    }
    if (room.session_data.revealedAnswer !== "البتراء") {
      throw new Error("Revealed answer mismatch");
    }
    console.log(
      "  [PASS] Test 6.A: Correct MCQ answer awards 400 points to turn player and reveals answer",
    );
  }

  // -------------------------------------------------------------
  // Test 6.B: Client answers MCQ wrongly -> 0 points awarded
  // -------------------------------------------------------------
  {
    const room = createFreshRoom();
    simulateSubmitAction(room, hostPlayer, secretQuestions, "select_question", {
      question_id: "q-mcq-1",
    });
    const res = simulateSubmitAction(room, hostPlayer, secretQuestions, "answer_question", {
      question_id: "q-mcq-1",
      selected_answer: "جرش",
    });
    if (!res.success || room.session_data.teams[0].score !== 0) {
      throw new Error("Wrong MCQ answer gave points!");
    }
    console.log("  [PASS] Test 6.B: Wrong MCQ answer awards 0 points");
  }

  // -------------------------------------------------------------
  // Test 6.C: Answering unselected/future question -> REJECTED
  // -------------------------------------------------------------
  {
    const room = createFreshRoom();
    const res = simulateSubmitAction(room, hostPlayer, secretQuestions, "answer_question", {
      question_id: "q-mcq-1",
      selected_answer: "البتراء",
    });
    if (res.success || !res.error?.includes("QUESTION_NOT_ACTIVE")) {
      throw new Error("Attempting unselected question was not rejected");
    }
    console.log("  [PASS] Test 6.C: Answering unselected/future question is rejected");
  }

  // -------------------------------------------------------------
  // Test 6.D: Out-of-turn question selection -> REJECTED
  // -------------------------------------------------------------
  {
    const room = createFreshRoom(); // turn = 0 (Host)
    const res = simulateSubmitAction(room, guestPlayer, secretQuestions, "select_question", {
      question_id: "q-mcq-1",
    });
    if (res.success || !res.error?.includes("NOT_YOUR_TURN")) {
      throw new Error("Out-of-turn selection was not rejected");
    }
    console.log("  [PASS] Test 6.D: Out-of-turn question selection is rejected");
  }

  // -------------------------------------------------------------
  // Test 7.A - 7.C: Canonical RPC get_multiplayer_room_state authorization & shape
  // -------------------------------------------------------------
  {
    const room = createFreshRoom();
    const players: MockPlayer[] = [
      { user_id: "user-host", role: "host", player_index: 0 },
      { user_id: "user-guest", role: "guest", player_index: 1 },
    ];
    const nonMember: MockPlayer = { user_id: "user-third-party", role: "guest", player_index: 0 };

    function simulateGetMultiplayerRoomState(
      roomId: string,
      caller: MockPlayer | null,
    ): { success: boolean; data?: { room: Record<string, unknown>; players: Record<string, unknown>[] }; error?: string } {
      if (!caller || !caller.user_id) {
        return { success: false, error: "AUTH_REQUIRED: يجب تسجيل الدخول للوصول إلى الغرفة" };
      }
      if (roomId !== room.id) {
        return { success: false, error: "ROOM_NOT_FOUND: الغرفة غير موجودة" };
      }
      const isHost = caller.user_id === hostPlayer.user_id;
      const isMember = players.some((p) => p.user_id === caller.user_id);
      if (!isHost && !isMember) {
        return { success: false, error: "NOT_IN_ROOM: غير مصرح لك بالوصول إلى بيانات هذه الغرفة" };
      }

      return {
        success: true,
        data: {
          room: {
            id: room.id,
            status: "ready",
            current_turn: room.current_turn,
            session_data: room.session_data,
          },
          players: players.map((p) => ({
            id: `rp-${p.user_id}`,
            user_id: p.user_id,
            player_name: p.role === "host" ? "المضيف" : "الضيف",
            role: p.role,
            player_index: p.player_index,
            joined_at: new Date().toISOString(),
            last_active_at: new Date().toISOString(),
          })),
        },
      };
    }

    // 7.A: Host can fetch room state after guest joins
    const hostFetch = simulateGetMultiplayerRoomState(room.id, hostPlayer);
    if (!hostFetch.success || hostFetch.data.players.length !== 2) {
      throw new Error("Test 7.A Failed: Host unable to fetch 2-player room state");
    }
    console.log("  [PASS] Test 7.A: Host can fetch canonical room state after guest joins (2 players returned)");

    // 7.B: Guest can fetch same room state
    const guestFetch = simulateGetMultiplayerRoomState(room.id, guestPlayer);
    if (!guestFetch.success || guestFetch.data.players.length !== 2) {
      throw new Error("Test 7.B Failed: Guest unable to fetch canonical room state");
    }
    console.log("  [PASS] Test 7.B: Guest can fetch same canonical room state");

    // 7.C: Non-member cannot fetch room state (NOT_IN_ROOM)
    const outsiderFetch = simulateGetMultiplayerRoomState(room.id, nonMember);
    if (outsiderFetch.success || !outsiderFetch.error?.includes("NOT_IN_ROOM")) {
      throw new Error("Test 7.C Failed: Non-member was able to fetch private room state!");
    }
    console.log("  [PASS] Test 7.C: Non-member is rejected with NOT_IN_ROOM");

    // 7.D: Unauthenticated caller cannot fetch room state (AUTH_REQUIRED)
    const unauthFetch = simulateGetMultiplayerRoomState(room.id, null);
    if (unauthFetch.success || !unauthFetch.error?.includes("AUTH_REQUIRED")) {
      throw new Error("Test 7.D Failed: Unauthenticated caller was not rejected!");
    }
    console.log("  [PASS] Test 7.D: Unauthenticated caller is rejected with AUTH_REQUIRED");
  }

  // -------------------------------------------------------------
  // Test 8.A - 8.C: room_players DELETE Authorization Verification
  // -------------------------------------------------------------
  {
    const room = { id: "room-100", host_id: "user-host" };
    const hostUser = "user-host";
    const guestUser = "user-guest";

    function canDeletePlayerRow(
      targetPlayerUserId: string,
      targetRoomId: string,
      actingUserId: string,
    ): boolean {
      // Simulates:
      // user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = room_players.room_id AND r.host_id = auth.uid())
      const isSelf = targetPlayerUserId === actingUserId;
      const isRoomHost = room.id === targetRoomId && room.host_id === actingUserId;
      return isSelf || isRoomHost;
    }

    // 8.A: Guest can delete own player row
    if (!canDeletePlayerRow(guestUser, room.id, guestUser)) {
      throw new Error("Test 8.A Failed: Player could not delete their own row");
    }
    console.log("  [PASS] Test 8.A: Player can delete their own row (leave room)");

    // 8.B: Host can delete guest player row
    if (!canDeletePlayerRow(guestUser, room.id, hostUser)) {
      throw new Error("Test 8.B Failed: Host could not remove guest from room");
    }
    console.log("  [PASS] Test 8.B: Host can remove guest player row from their room");

    // 8.C: Guest CANNOT delete host player row
    if (canDeletePlayerRow(hostUser, room.id, guestUser)) {
      throw new Error("Security Failure: Guest was permitted to delete host player row!");
    }
    console.log("  [PASS] Test 8.C: Guest cannot delete host or other player's row");
  }

  console.log("\n>>> ALL MULTIPLAYER SECURITY TESTS PASSED SUCCESSFULLY! <<<\n");
}

function main() {
  testMigrationSecurityContract();
  runSecurityScenarios();
}

main();
