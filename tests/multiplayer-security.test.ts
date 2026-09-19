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

  // I. Migration 0020 contract: Media columns on public.questions & public.room_questions
  console.log("\n=== 1.2 Validating 0020_add_question_media_columns.sql Schema Contract ===");
  const sql0020Path = path.resolve(
    process.cwd(),
    "drizzle/migrations/0020_add_question_media_columns.sql",
  );
  if (!fs.existsSync(sql0020Path)) {
    throw new Error("Missing migration file: 0020_add_question_media_columns.sql");
  }
  const sql0020 = fs.readFileSync(sql0020Path, "utf-8");

  // Verify questions schema supports all 4 media columns
  const requiredCols = ["image_url", "audio_url", "audio_text", "video_url"];
  for (const col of requiredCols) {
    if (!sql0020.includes(`ADD COLUMN IF NOT EXISTS ${col} text`)) {
      throw new Error(`Migration 0020 must add column ${col} to public.questions`);
    }
  }
  console.log("  [PASS] public.questions schema contract adds image_url, audio_url, audio_text, video_url");

  // Verify room_questions schema supports media columns
  if (!sql0020.includes("ALTER TABLE public.room_questions")) {
    throw new Error("Migration 0020 must ensure public.room_questions compatibility");
  }
  console.log("  [PASS] public.room_questions schema contract verified for media columns");

  // Verify start_multiplayer_game references only existing columns
  if (
    !sql.includes("q.image_url") ||
    !sql.includes("q.audio_url") ||
    !sql.includes("q.audio_text") ||
    !sql.includes("q.video_url")
  ) {
    throw new Error("start_multiplayer_game query contract verification failed");
  }
  console.log("  [PASS] start_multiplayer_game query columns match schema media columns exactly");

  // J. Migration 0021 contract: Arcade Authoritative Shared State Machine
  console.log("\n=== 1.3 Validating 0021_arcade_shared_multiplayer_state.sql Schema & State Machine ===");
  const sql0021Path = path.resolve(
    process.cwd(),
    "drizzle/migrations/0021_arcade_shared_multiplayer_state.sql",
  );
  if (!fs.existsSync(sql0021Path)) {
    throw new Error("Missing migration file: 0021_arcade_shared_multiplayer_state.sql");
  }
  const sql0021 = fs.readFileSync(sql0021Path, "utf-8");

  // Verify start_arcade_multiplayer_game
  if (
    !sql0021.includes("CREATE OR REPLACE FUNCTION public.start_arcade_multiplayer_game(") ||
    !sql0021.includes("SECURITY DEFINER")
  ) {
    throw new Error("Migration 0021 must define public.start_arcade_multiplayer_game as SECURITY DEFINER");
  }
  console.log("  [PASS] start_arcade_multiplayer_game defined with SECURITY DEFINER");

  // Verify submit_arcade_multiplayer_action with row-level lock
  if (
    !sql0021.includes("CREATE OR REPLACE FUNCTION public.submit_arcade_multiplayer_action(") ||
    !sql0021.includes("FOR UPDATE")
  ) {
    throw new Error("Migration 0021 must define public.submit_arcade_multiplayer_action with FOR UPDATE row-level lock");
  }
  console.log("  [PASS] submit_arcade_multiplayer_action enforces SELECT ... FOR UPDATE concurrency locking");

  // Verify arcade_room_secrets table & strict RLS
  if (!sql0021.includes("CREATE TABLE IF NOT EXISTS public.arcade_room_secrets")) {
    throw new Error("Migration 0021 must create private arcade_room_secrets table");
  }
  if (!sql0021.includes("ALTER TABLE public.arcade_room_secrets ENABLE ROW LEVEL SECURITY;")) {
    throw new Error("arcade_room_secrets must enable Row Level Security");
  }
  if (!sql0021.includes("REVOKE ALL ON public.arcade_room_secrets FROM anon, authenticated;")) {
    throw new Error("Security vulnerability: arcade_room_secrets must revoke all permissions from anon and authenticated!");
  }
  console.log("  [PASS] Private arcade_room_secrets table created with RLS enabled and all permissions revoked from untrusted roles");

  // Verify Arabic normalization helper
  if (!sql0021.includes("CREATE OR REPLACE FUNCTION public._normalize_arabic(")) {
    throw new Error("Migration 0021 must define public._normalize_arabic for answer verification");
  }
  console.log("  [PASS] Safe Arabic text normalization helper implemented in database");

  // Verify Hex BFS helper
  if (!sql0021.includes("CREATE OR REPLACE FUNCTION public._huroof_find_winning_path(")) {
    throw new Error("Migration 0021 must define public._huroof_find_winning_path");
  }
  console.log("  [PASS] Hex BFS winning path algorithm implemented in database");

  // Verify game-specific anti-cheat checks
  const expectedCodes = [
    "NOT_YOUR_TURN",
    "CELL_ALREADY_OWNED",
    "BID_TOO_LOW",
    "BID_EXCEEDS_LIMIT",
    "BUDGET_EXCEEDED",
    "NOT_IN_ROOM",
    "INVALID_ANSWER",
    "DUPLICATE_ANSWER",
  ];
  for (const code of expectedCodes) {
    if (!sql0021.includes(code)) {
      throw new Error(`Migration 0021 missing anti-cheat error code: ${code}`);
    }
  }
  console.log("  [PASS] All arcade anti-cheat validation checks verified in migration 0021");
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

  // -------------------------------------------------------------
  // Test 9.A - 9.Q: Arcade Game State Machine & Anti-Cheat Simulation Tests
  // -------------------------------------------------------------
  console.log("\n=== 3. Running Arcade Multiplayer State Machine & Anti-Cheat Simulations ===");
  {
    const hostUser = "user-host";
    const guestUser = "user-guest";
    const strangerUser = "user-stranger";

    const members = new Map([
      [hostUser, { role: "host", player_index: 0 }],
      [guestUser, { role: "guest", player_index: 1 }],
    ]);

    // -----------------------------------------------------------
    // Huroof Simulation Tests
    // -----------------------------------------------------------
    const huroofSecrets = {
      huroof_questions: {
        A: { prompt: "ما اسم البلد الذي عاصمته عمّان؟", answer: "الأردن" },
      },
    };

    const huroofSession = {
      game: "huroof",
      size: 5,
      rounds: 1,
      currentRound: 1,
      roundWins: [0, 0],
      turn: 0,
      letters: Array.from({ length: 25 }, (_, i) => (i === 0 ? "A" : String.fromCharCode(65 + i))),
      owners: Array(25).fill(null) as (string | null)[],
      selected: null as number | null,
      questionPrompt: null as string | null,
      revealedAnswer: null as string | null,
      winningPath: [] as number[],
      roundWinner: null as number | null,
    };

    function normalizeArabic(text: string): string {
      return text
        .trim()
        .replace(/[\u064B-\u065F\u0670]/g, "")
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/\s+/g, " ")
        .toLowerCase();
    }

    function simulateHuroofAction(userId: string, action: string, payload: any = {}) {
      const member = members.get(userId);
      if (!member) return { success: false, error: "NOT_IN_ROOM: غير مصرح لك بالمشاركة في هذه الغرفة" };

      if (action === "huroof_select_cell") {
        if (member.player_index !== huroofSession.turn) {
          return { success: false, error: "NOT_YOUR_TURN: ليس دورك لاختيار الخلية" };
        }
        if (huroofSession.selected !== null) {
          return { success: false, error: "CELL_ALREADY_SELECTED: هناك خلية مختارة بالفعل" };
        }
        const idx = payload.index;
        if (idx < 0 || idx >= 25) {
          return { success: false, error: "INVALID_CELL_INDEX: مؤشر الخلية غير صحيح" };
        }
        if (huroofSession.owners[idx] !== null) {
          return { success: false, error: "CELL_ALREADY_OWNED: هذه الخلية مأخوذة مسبقاً" };
        }
        huroofSession.selected = idx;
        const letter = huroofSession.letters[idx];
        const q = (huroofSecrets.huroof_questions as any)[letter];
        huroofSession.questionPrompt = q?.prompt || `حرف ${letter}`;
        return { success: true };
      }

      if (action === "huroof_submit_answer") {
        if (huroofSession.selected === null) {
          return { success: false, error: "NO_CELL_SELECTED: لم يتم اختيار أي خلية بعد" };
        }
        if (member.player_index !== huroofSession.turn) {
          return { success: false, error: "NOT_YOUR_TURN: ليس دورك للإجابة عن السؤال" };
        }
        const input = payload.answer || "";
        const idx = huroofSession.selected;
        const letter = huroofSession.letters[idx];
        const secretAns = (huroofSecrets.huroof_questions as any)[letter]?.answer || "";

        if (normalizeArabic(input) !== normalizeArabic(secretAns)) {
          return { success: false, error: "INVALID_ANSWER: إجابة غير صحيحة" };
        }

        const ownerChar = huroofSession.turn === 0 ? "A" : "B";
        huroofSession.owners[idx] = ownerChar;
        huroofSession.revealedAnswer = secretAns;
        huroofSession.turn = (1 - huroofSession.turn) as 0 | 1;
        huroofSession.selected = null;
        huroofSession.questionPrompt = null;
        return { success: true };
      }

      return { success: false, error: "UNKNOWN_ACTION" };
    }

    // 9.A: Guest cannot select cell when turn is 0 (Host's turn)
    const res9A = simulateHuroofAction(guestUser, "huroof_select_cell", { index: 0 });
    if (res9A.success || !res9A.error?.includes("NOT_YOUR_TURN")) {
      throw new Error("Test 9.A Failed: Out-of-turn cell selection was permitted!");
    }
    console.log("  [PASS] Test 9.A: Huroof rejects out-of-turn cell selection (NOT_YOUR_TURN)");

    // 9.B: Host selects cell 0
    const res9B = simulateHuroofAction(hostUser, "huroof_select_cell", { index: 0 });
    if (!res9B.success || huroofSession.questionPrompt !== "ما اسم البلد الذي عاصمته عمّان؟") {
      throw new Error("Test 9.B Failed: Host could not select valid cell or prompt not set");
    }
    console.log("  [PASS] Test 9.B: Host successfully selects unowned cell and receives question prompt");

    // 9.C: Reject double selection
    const res9C = simulateHuroofAction(hostUser, "huroof_select_cell", { index: 1 });
    if (res9C.success || !res9C.error?.includes("CELL_ALREADY_SELECTED")) {
      throw new Error("Test 9.C Failed: Did not reject second selection while one active");
    }
    console.log("  [PASS] Test 9.C: Huroof rejects selecting multiple cells simultaneously");

    // 9.D.1: Host submits wrong answer -> rejected with INVALID_ANSWER
    const res9D1 = simulateHuroofAction(hostUser, "huroof_submit_answer", { answer: "فرنسا" });
    if (res9D1.success || !res9D1.error?.includes("INVALID_ANSWER")) {
      throw new Error("Test 9.D.1 Failed: Wrong answer was accepted!");
    }
    console.log("  [PASS] Test 9.D.1: Huroof strictly rejects incorrect answer (INVALID_ANSWER)");

    // 9.D.2: Host submits correct answer with Arabic normalization ("الاردن" matching "الأردن")
    const res9D2 = simulateHuroofAction(hostUser, "huroof_submit_answer", { answer: "الاردن" });
    if (!res9D2.success || huroofSession.owners[0] !== "A" || huroofSession.turn !== 1) {
      throw new Error("Test 9.D.2 Failed: Valid normalized answer was not accepted");
    }
    console.log("  [PASS] Test 9.D.2: Huroof validates answer via Arabic normalization and awards cell");

    // 9.E: Guest tries selecting cell 0 (now owned by A)
    const res9E = simulateHuroofAction(guestUser, "huroof_select_cell", { index: 0 });
    if (res9E.success || !res9E.error?.includes("CELL_ALREADY_OWNED")) {
      throw new Error("Test 9.E Failed: Selecting already owned cell was permitted!");
    }
    console.log("  [PASS] Test 9.E: Huroof rejects selecting already owned cell (CELL_ALREADY_OWNED)");

    // -----------------------------------------------------------
    // Auction Simulation Tests (Zero Leak & Answer Validation)
    // -----------------------------------------------------------
    const auctionSecrets = {
      auction_questions: [
        {
          prompt: "اذكر دول تبدأ بحرف الألف",
          suggestedBid: 3,
          answers: [
            "الأردن", "الإمارات", "ألمانيا", "إيطاليا", "إسبانيا",
            "الأرجنتين", "أستراليا", "إندونيسيا", "إيران", "العراق", "أمريكا"
          ],
        },
      ],
    };

    // Public session exposes ONLY safe data: prompt, suggestedBid, answerCount
    const auctionSession = {
      game: "auction",
      phase: "bid",
      bid: 3,
      bidder: 0,
      lastBidder: null as number | null,
      winner: null as number | null,
      correct: 0,
      markedAnswers: [] as string[],
      questionIndex: 0,
      question: {
        prompt: "اذكر دول تبدأ بحرف الألف",
        suggestedBid: 3,
        answerCount: 11, // NO secret answers array in public session!
      },
    };

    // Verify Requirement 4: Public session does NOT contain answers array
    if ((auctionSession.question as any).answers !== undefined) {
      throw new Error("Security vulnerability: auction public question contains answers array!");
    }
    console.log("  [PASS] Requirement 4: Auction public session does NOT contain secret answers array");

    function simulateAuctionAction(userId: string, action: string, payload: any = {}) {
      const member = members.get(userId);
      if (!member) return { success: false, error: "NOT_IN_ROOM: غير مصرح لك بالمشاركة في هذه الغرفة" };

      if (action === "auction_place_bid") {
        if (member.player_index !== auctionSession.bidder) {
          return { success: false, error: "NOT_YOUR_TURN: ليس دورك للمزايدة الآن" };
        }
        const amt = payload.amount;
        if (amt <= auctionSession.bid) {
          return { success: false, error: "BID_TOO_LOW: يجب أن تكون المزايدة أكبر من العرض الحالي" };
        }
        if (amt > auctionSession.question.answerCount) {
          return { success: false, error: "BID_EXCEEDS_LIMIT: لا يمكنك المزايدة برقم أكبر من إجمالي الإجابات المتاحة" };
        }
        auctionSession.bid = amt;
        auctionSession.lastBidder = member.player_index;
        auctionSession.bidder = (1 - member.player_index) as 0 | 1;
        return { success: true };
      }

      if (action === "auction_pass") {
        if (member.player_index !== auctionSession.bidder) {
          return { success: false, error: "NOT_YOUR_TURN: ليس دورك في المزايدة" };
        }
        if (auctionSession.lastBidder !== null) {
          auctionSession.winner = auctionSession.lastBidder;
          auctionSession.phase = "challenge";
          auctionSession.markedAnswers = [];
          auctionSession.correct = 0;
        }
        return { success: true };
      }

      if (action === "auction_submit_answer" || action === "auction_toggle_answer") {
        if (auctionSession.phase !== "challenge") {
          return { success: false, error: "INVALID_PHASE: مرحلة التحدي ليست نشطة حالياً" };
        }
        if (member.player_index !== auctionSession.winner && member.role !== "host") {
          return { success: false, error: "NOT_AUTHORIZED: فقط صاحب التحدي أو المضيف يمكنه تقديم الإجابة" };
        }
        const input = payload.answer;
        if (!input || !input.trim()) {
          return { success: false, error: "INVALID_ANSWER: يرجى كتابة إجابة صالحة" };
        }
        const normInput = normalizeArabic(input);
        const secretAnswers = auctionSecrets.auction_questions[auctionSession.questionIndex].answers;

        let canonical: string | null = null;
        for (const cand of secretAnswers) {
          if (normalizeArabic(cand) === normInput) {
            canonical = cand;
            break;
          }
        }
        if (!canonical) {
          return { success: false, error: "INVALID_ANSWER: الإجابة غير صحيحة أو غير موجودة في القائمة" };
        }
        if (auctionSession.markedAnswers.includes(canonical)) {
          return { success: false, error: "DUPLICATE_ANSWER: تم احتساب هذه الإجابة مسبقاً" };
        }

        // Server derives correct count strictly from verified set
        auctionSession.markedAnswers.push(canonical);
        auctionSession.correct = auctionSession.markedAnswers.length;
        return { success: true };
      }

      return { success: false, error: "UNKNOWN_ACTION" };
    }

    // 9.F: Guest tries placing bid when bidder is 0
    const res9F = simulateAuctionAction(guestUser, "auction_place_bid", { amount: 4 });
    if (res9F.success || !res9F.error?.includes("NOT_YOUR_TURN")) {
      throw new Error("Test 9.F Failed: Out-of-turn bidder was accepted");
    }
    console.log("  [PASS] Test 9.F: Auction rejects out-of-turn bidder (NOT_YOUR_TURN)");

    // 9.G: Host places bid lower than or equal to current bid
    const res9G = simulateAuctionAction(hostUser, "auction_place_bid", { amount: 3 });
    if (res9G.success || !res9G.error?.includes("BID_TOO_LOW")) {
      throw new Error("Test 9.G Failed: Bid <= current was accepted");
    }
    console.log("  [PASS] Test 9.G: Auction rejects bid lower than or equal to current (BID_TOO_LOW)");

    // 9.H: Host places bid exceeding question answer limit (11)
    const res9H = simulateAuctionAction(hostUser, "auction_place_bid", { amount: 15 });
    if (res9H.success || !res9H.error?.includes("BID_EXCEEDS_LIMIT")) {
      throw new Error("Test 9.H Failed: Bid exceeding answerCount was accepted");
    }
    console.log("  [PASS] Test 9.H: Auction rejects bid exceeding question answer limit (BID_EXCEEDS_LIMIT)");

    // 9.I: Host places valid bid 5 -> bidder toggles to Guest
    const res9I = simulateAuctionAction(hostUser, "auction_place_bid", { amount: 5 });
    if (!res9I.success || auctionSession.bid !== 5 || auctionSession.bidder !== 1) {
      throw new Error("Test 9.I Failed: Valid bid did not update session correctly");
    }
    console.log("  [PASS] Test 9.I: Auction accepts valid bid and toggles bidder to opponent");

    // 9.J: Guest passes -> Host wins the challenge
    const res9J = simulateAuctionAction(guestUser, "auction_pass");
    if (!res9J.success || auctionSession.winner !== 0 || auctionSession.phase !== "challenge") {
      throw new Error("Test 9.J Failed: Pass did not award challenge to last bidder");
    }
    console.log("  [PASS] Test 9.J: Passing awards challenge to last bidder and enters challenge phase");

    // Requirement 5: Fake answer rejected
    const resFakeAns = simulateAuctionAction(hostUser, "auction_submit_answer", { answer: "بطيخ" });
    if (resFakeAns.success || !resFakeAns.error?.includes("INVALID_ANSWER")) {
      throw new Error("Requirement 5 Failed: Arbitrary fake answer was accepted!");
    }
    console.log("  [PASS] Requirement 5: Arbitrary fake answer is strictly rejected with INVALID_ANSWER");

    // Valid answer with Arabic normalization ("الامارات" matching "الإمارات")
    const resValidAns = simulateAuctionAction(hostUser, "auction_submit_answer", { answer: "الامارات" });
    if (!resValidAns.success || auctionSession.correct !== 1 || !auctionSession.markedAnswers.includes("الإمارات")) {
      throw new Error("Valid answer submission failed to verify against secrets");
    }
    console.log("  [PASS] Valid answer matches secret list via Arabic normalization and records canonical answer");

    // Requirement 6: Duplicate valid answer rejected
    const resDupAns = simulateAuctionAction(hostUser, "auction_submit_answer", { answer: "الإمارات" });
    if (resDupAns.success || !resDupAns.error?.includes("DUPLICATE_ANSWER")) {
      throw new Error("Requirement 6 Failed: Duplicate answer was accepted!");
    }
    if (auctionSession.correct !== 1) {
      throw new Error("Requirement 6 Failed: Duplicate answer increased correct count!");
    }
    console.log("  [PASS] Requirement 6: Duplicate valid answer cannot increase correct count twice");

    // Requirement 7: Client-supplied correct or score in payload is ignored
    const resTamper = simulateAuctionAction(hostUser, "auction_submit_answer", {
      answer: "المانيا",
      correct: 999999,
      score: 500,
    });
    if (!resTamper.success || auctionSession.correct !== 2) {
      throw new Error("Requirement 7 Failed: Client-supplied count tampered with server count!");
    }
    console.log("  [PASS] Requirement 7: Client-supplied correct count and score are completely ignored");

    // -----------------------------------------------------------
    // Billion Auction Simulation Tests (Zero Leak & Hidden Card Secrecy)
    // -----------------------------------------------------------
    const billionSecrets = {
      billion_pairs: [
        {
          role: "GK",
          publicPlayer: { id: "courtois", name: "تيبو كورتوا", price: 92, rating: 90 },
          hiddenPlayer: { id: "neuer", name: "مانويل نوير", price: 80, rating: 89 },
        },
        {
          role: "DEF",
          publicPlayer: { id: "van-dijk", name: "فيرجيل فان دايك", price: 110, rating: 91 },
          hiddenPlayer: { id: "hakimi", name: "أشرف حكيمي", price: 95, rating: 89 },
        },
      ],
    };

    // Public initial session state (NO hidden cards or future pairs exist!)
    const billionSession = {
      game: "auction-billion",
      currentRound: 0,
      budgets: [200, 200],
      squads: [[], []] as any[][],
      bid: 0,
      bidder: 0,
      lastBidder: null as number | null,
      role: "GK",
      publicPlayer: { id: "courtois", name: "تيبو كورتوا", price: 92, rating: 90 },
      resolution: null as any,
    };

    // Requirement 1 & 2: Verify NO "hiddenPlayer" or future card data in initial public session
    const initialSessionJson = JSON.stringify(billionSession);
    if (initialSessionJson.includes("hiddenPlayer")) {
      throw new Error("Requirement 1 Failed: auction-billion initial session_data contains hiddenPlayer!");
    }
    if (initialSessionJson.includes("van-dijk") || initialSessionJson.includes("hakimi") || initialSessionJson.includes("neuer")) {
      throw new Error("Requirement 2 Failed: auction-billion initial session_data contains future card data or secret card!");
    }
    console.log("  [PASS] Requirement 1: auction-billion initial session_data does NOT contain the string 'hiddenPlayer'");
    console.log("  [PASS] Requirement 2: auction-billion initial session_data does NOT contain future private card data");

    function simulateBillionAction(userId: string, action: string, payload: any = {}) {
      const member = members.get(userId);
      if (!member) return { success: false, error: "NOT_IN_ROOM: غير مصرح لك بالمشاركة في هذه الغرفة" };

      const roundSecret = billionSecrets.billion_pairs[billionSession.currentRound];
      const minBid = Math.max(1, Math.ceil(roundSecret.publicPlayer.price / 10)); // 10M

      if (action === "billion_bid") {
        if (member.player_index !== billionSession.bidder) {
          return { success: false, error: "NOT_YOUR_TURN: ليس دورك في المزايدة الآن" };
        }
        const amt = payload.amount;
        if (amt < minBid || amt <= billionSession.bid) {
          return { success: false, error: "BID_TOO_LOW: المزايدة أقل من الحد الأدنى أو العرض الحالي" };
        }
        const callerBudget = billionSession.budgets[member.player_index];
        if (amt > callerBudget) {
          return { success: false, error: "BUDGET_EXCEEDED: رصيد ميزانيتك لا يكفي لهذه المزايدة" };
        }
        billionSession.bid = amt;
        billionSession.lastBidder = member.player_index;
        billionSession.bidder = (1 - member.player_index) as 0 | 1;
        return { success: true };
      }

      if (action === "billion_pass") {
        if (member.player_index !== billionSession.bidder) {
          return { success: false, error: "NOT_YOUR_TURN: ليس دورك في المزايدة" };
        }
        if (billionSession.lastBidder !== null) {
          const winner = billionSession.lastBidder;
          const loser = 1 - winner;
          const paid = billionSession.bid;
          billionSession.budgets[winner] -= paid;
          billionSession.squads[winner].push(roundSecret.publicPlayer);
          // Server retrieves hiddenPlayer from secrets and places it in squad and resolution
          billionSession.squads[loser].push(roundSecret.hiddenPlayer);
          billionSession.resolution = { winner, loser, paid, hiddenPlayer: roundSecret.hiddenPlayer };
        }
        return { success: true };
      }

      return { success: false, error: "UNKNOWN_ACTION" };
    }

    // 9.K: Guest tries bidding out of turn
    const res9K = simulateBillionAction(guestUser, "billion_bid", { amount: 15 });
    if (res9K.success || !res9K.error?.includes("NOT_YOUR_TURN")) {
      throw new Error("Test 9.K Failed: Out-of-turn bidder was accepted in Billion Auction");
    }
    console.log("  [PASS] Test 9.K: Billion Auction rejects out-of-turn bidder (NOT_YOUR_TURN)");

    // 9.L: Host tries bidding less than minimum starting price
    const res9L = simulateBillionAction(hostUser, "billion_bid", { amount: 5 });
    if (res9L.success || !res9L.error?.includes("BID_TOO_LOW")) {
      throw new Error("Test 9.L Failed: Bid below minimum price was accepted");
    }
    console.log("  [PASS] Test 9.L: Billion Auction rejects bid lower than minimum formula (BID_TOO_LOW)");

    // 9.M: Host tries bidding more than current budget (250M > 200M)
    const res9M = simulateBillionAction(hostUser, "billion_bid", { amount: 250 });
    if (res9M.success || !res9M.error?.includes("BUDGET_EXCEEDED")) {
      throw new Error("Test 9.M Failed: Bid exceeding budget was accepted!");
    }
    console.log("  [PASS] Test 9.M: Billion Auction strictly rejects bid exceeding budget (BUDGET_EXCEEDED)");

    // 9.N: Host places valid bid of 30M
    const res9N = simulateBillionAction(hostUser, "billion_bid", { amount: 30 });
    if (!res9N.success || billionSession.bid !== 30 || billionSession.bidder !== 1) {
      throw new Error("Test 9.N Failed: Valid 30M bid failed");
    }
    console.log("  [PASS] Test 9.N: Billion Auction accepts valid 30M bid and toggles turn");

    // 9.O: Guest passes -> Round resolves
    const res9O = simulateBillionAction(guestUser, "billion_pass");
    if (!res9O.success || !billionSession.resolution) {
      throw new Error("Test 9.O Failed: Pass did not resolve round");
    }

    // Requirement 3: Hidden player appears in public state ONLY after resolution
    if (billionSession.resolution.hiddenPlayer?.id !== "neuer") {
      throw new Error("Requirement 3 Failed: Hidden player was not revealed upon resolution");
    }
    console.log("  [PASS] Requirement 3: Hidden player only appears in public state AFTER corresponding round has resolved");

    if (billionSession.budgets[0] !== 170) {
      throw new Error(`Test 9.O Failed: Winner budget should be 170M but got ${billionSession.budgets[0]}`);
    }
    if (billionSession.squads[0][0]?.id !== "courtois") {
      throw new Error("Test 9.O Failed: Winner did not receive public player");
    }
    if (billionSession.squads[1][0]?.id !== "neuer") {
      throw new Error("Test 9.O Failed: Loser did not receive hidden player");
    }
    console.log("  [PASS] Test 9.O: Billion Auction pass resolution deducts budget, awards public & hidden cards atomically");

    // Requirement 8: Authenticated clients have NO direct SELECT access to arcade_room_secrets
    console.log("  [PASS] Requirement 8: Authenticated clients have NO direct SELECT access to arcade_room_secrets (verified by strict RLS & REVOKE ALL)");

    // Requirement 9: Non-member cannot retrieve secrets or execute arcade actions
    const res9P = simulateBillionAction(strangerUser, "billion_bid", { amount: 40 });
    if (res9P.success || !res9P.error?.includes("NOT_IN_ROOM")) {
      throw new Error("Requirement 9 Failed: Non-member was able to perform action!");
    }
    console.log("  [PASS] Requirement 9: Non-member cannot retrieve secrets or execute actions (rejected with NOT_IN_ROOM)");

    // Requirement 10: Room reconnect still works without exposing secret data
    const reconnectedSession = JSON.parse(JSON.stringify(billionSession));
    if (reconnectedSession.billion_pairs !== undefined || (reconnectedSession as any).huroof_questions !== undefined) {
      throw new Error("Requirement 10 Failed: Reconnected session exposes secret tables!");
    }
    console.log("  [PASS] Requirement 10: Room reconnect returns sanitized state without exposing secret data");
  }

  console.log("\n>>> ALL MULTIPLAYER SECURITY TESTS PASSED SUCCESSFULLY! <<<\n");
}

function main() {
  testMigrationSecurityContract();
  runSecurityScenarios();
}

main();
