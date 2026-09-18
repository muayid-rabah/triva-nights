import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  Hand,
  HandMetal,
  Loader2,
  Phone,
  Shell,
  Shovel,
  Smartphone,
  Video,
  Volume2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game-store";
import {
  HELPS,
  type CategoryRow,
  type HelpKey,
  type QuestionRow,
  type GameState,
} from "@/lib/game-types";
import { categoryImage } from "@/lib/category-images";
import { CategoryArtwork } from "@/components/category-artwork";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchRoomByCode,
  subscribeToRoom,
  selectMultiplayerQuestion,
  answerMultiplayerQuestion,
  triggerMultiplayerHelp,
  revealMultiplayerAnswer,
  closeMultiplayerQuestion,
  type MultiplayerRoomState,
} from "@/lib/multiplayer-service";
import "@/category-board.css";

export const Route = createFileRoute("/play")({
  validateSearch: (search: Record<string, unknown>) => ({
    room: typeof search.room === "string" ? search.room : undefined,
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "لوحة التحدّي | قدّ التحدي" },
      { name: "description", content: "لوحة التحدي: ٦ فئات × ٦ أسئلة، مؤقت، ووسائل مساعدة." },
      { property: "og:title", content: "لوحة تحدي قدّ التحدي" },
      { property: "og:description", content: "نقاط، مؤقت، ووسائل مساعدة لكل فريق." },
    ],
  }),
  component: PlayPage,
});

const HELP_ICONS: Record<HelpKey, typeof Hand> = {
  trap: Shell,
  rest: Hand,
  two: HandMetal,
  dig: Shovel,
  call: Phone,
};

const TOTAL_TIME = 20;
const ROUND_POINTS = [200, 400, 600] as const;

function roundLevel(points: number) {
  if (points === 200) return "دافية";
  if (points === 400) return "قوية";
  return "تحدّي الكبار";
}

function PlayPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { room: roomCode } = Route.useSearch();

  // Local game store state (for single-device mode)
  const {
    game: localGame,
    ready: localReady,
    answer: localAnswer,
    useHelp: localTriggerHelp,
  } = useGame();

  // Multiplayer room state
  const [multiplayerRoom, setMultiplayerRoom] = useState<MultiplayerRoomState | null>(null);
  const [mpLoading, setMpLoading] = useState(Boolean(roomCode));

  // Local active question state (used for single-device mode)
  const [activeLocal, setActiveLocal] = useState<QuestionRow | null>(null);

  // Initialize and subscribe to multiplayer room if roomCode is present
  useEffect(() => {
    if (!roomCode) return;
    let unsub: (() => void) | null = null;

    async function initMpRoom() {
      setMpLoading(true);
      const { data, error } = await fetchRoomByCode(roomCode!);
      if (error || !data) {
        toast.error(error || "تعذر العثور على الغرفة أو انتهت صلاحيتها");
        navigate({ to: "/arcade", search: { game: "taqha" } });
        return;
      }
      setMultiplayerRoom(data);
      setMpLoading(false);

      unsub = subscribeToRoom(data.room.id, (updated) => {
        setMultiplayerRoom(updated);
      });
    }

    void initMpRoom();

    return () => {
      if (unsub) unsub();
    };
  }, [roomCode, navigate]);

  // Determine current active authoritative GameState
  const isMultiplayer = Boolean(roomCode);
  const mpGameState = (multiplayerRoom?.room.session_data ?? null) as unknown as GameState | null;
  const game = isMultiplayer ? mpGameState : localGame;

  // Identify current player role in multiplayer (Host = 0, Guest = 1)
  const currentUserId = user?.id;
  const myPlayerRecord = multiplayerRoom?.players.find((p) => p.user_id === currentUserId);
  const myPlayerIndex: 0 | 1 =
    myPlayerRecord?.player_index ?? (multiplayerRoom?.room.host_id === currentUserId ? 0 : 1);
  const isMyTurn = isMultiplayer && game ? game.turn === myPlayerIndex : true;

  // Determine active question (synced from DB in multiplayer or local state)
  const activeMpQuestionId = (
    multiplayerRoom?.room.session_data as Record<string, unknown> | undefined
  )?.activeQuestionId as string | null | undefined;
  const activeMpQuestion = game?.questions.find((q) => q.id === activeMpQuestionId) ?? null;
  const active = isMultiplayer ? activeMpQuestion : activeLocal;

  // Determine revealed state in multiplayer
  const mpRevealed = Boolean(
    (multiplayerRoom?.room.session_data as Record<string, unknown> | undefined)?.revealed,
  );
  const mpRevealedAnswer = (
    multiplayerRoom?.room.session_data as Record<string, unknown> | undefined
  )?.revealedAnswer as string | null | undefined;
  const mpDigHidden = (multiplayerRoom?.room.session_data as Record<string, unknown> | undefined)
    ?.digHiddenChoices as string[] | undefined;
  const mpOpenedAt = (multiplayerRoom?.room.session_data as Record<string, unknown> | undefined)
    ?.activeQuestionOpenedAt as string | null | undefined;

  // Navigation checks
  useEffect(() => {
    if (!isMultiplayer && localReady && !localGame) {
      navigate({ to: "/create-game", replace: true });
    }
  }, [isMultiplayer, localReady, localGame, navigate]);

  useEffect(() => {
    if (game?.finished) {
      navigate({ to: "/result" });
    }
  }, [game?.finished, navigate]);

  if (mpLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-gold" />
        <h2 className="mt-4 text-xl font-bold">جاري المزامنة مع الغرفة #{roomCode}...</h2>
        <p className="mt-1 text-xs text-muted-foreground">بنجهّز الأسئلة المتطابقة للشاشتين</p>
      </div>
    );
  }

  if (!game) return null;

  const byCategory = (catId: string) =>
    game.questions
      .filter(
        (q) =>
          q.category_id === catId &&
          ROUND_POINTS.includes(q.points as (typeof ROUND_POINTS)[number]),
      )
      .sort((a, b) => a.points - b.points);

  // Question selection handler
  async function handleQuestionClick(q: QuestionRow) {
    if (isMultiplayer && multiplayerRoom) {
      if (!isMyTurn) {
        toast.info(`الدور الحالي لفريق ${game?.teams[game.turn].name} لاختيار السؤال`);
        return;
      }
      const { error } = await selectMultiplayerQuestion(multiplayerRoom.room.id, q.id);
      if (error) toast.error(error);
      return;
    }
    setActiveLocal(q);
  }

  // Answer resolution handler (server evaluates, awards points, advances turn, records used)
  async function handleResolve(team: 0 | 1 | null) {
    if (isMultiplayer && multiplayerRoom && active) {
      const { error } = await answerMultiplayerQuestion(multiplayerRoom.room.id, active.id, {
        judgeTeam: team,
      });
      if (error) toast.error(error);
      return;
    }
    if (active) {
      localAnswer(active.id, team, active.points);
      setActiveLocal(null);
    }
  }

  // Handle MCQ answer submission directly from player (server evaluates correctness against room_questions.answer)
  async function handleMcqAnswer(selectedChoice: string) {
    if (isMultiplayer && multiplayerRoom && active) {
      if (!isMyTurn) {
        toast.info("لا يمكنك الإجابة في غير دورك");
        return;
      }
      const { error } = await answerMultiplayerQuestion(multiplayerRoom.room.id, active.id, {
        selectedAnswer: selectedChoice,
      });
      if (error) toast.error(error);
      return;
    }
  }

  // Helper activation handler
  async function handleUseHelp(key: HelpKey) {
    if (isMultiplayer && multiplayerRoom) {
      if (!isMyTurn) {
        toast.info("لا يمكنك استخدام وسيلة مساعدة في غير دورك");
        return;
      }
      const { error } = await triggerMultiplayerHelp(multiplayerRoom.room.id, key);
      if (error) toast.error(error);
      return;
    }
    localTriggerHelp(game.turn, key);
  }

  // Reveal answer handler
  async function handleReveal() {
    if (isMultiplayer && multiplayerRoom) {
      const { error } = await revealMultiplayerAnswer(multiplayerRoom.room.id);
      if (error) toast.error(error);
      return;
    }
  }

  // Close question modal
  async function handleCloseModal() {
    if (isMultiplayer && multiplayerRoom) {
      await closeMultiplayerQuestion(multiplayerRoom.room.id);
      return;
    }
    setActiveLocal(null);
  }

  return (
    <div className="min-h-screen pb-mobile-nav">
      <SiteHeader />

      {/* Synchronized Game Status Header */}
      <div className="sticky top-[calc(var(--mobile-header-height)+var(--safe-area-top))] lg:top-[68px] z-30 border-b border-border bg-background/95 backdrop-blur">
        {isMultiplayer && (
          <div className="bg-primary/10 border-b border-primary/20 px-3 py-1 text-center text-xs font-bold text-primary flex items-center justify-center gap-2">
            <Smartphone className="h-3.5 w-3.5" />
            <span>
              تحدي ثنائي مباشر · كود الغرفة:{" "}
              <b className="font-mono text-gold tracking-widest">{roomCode}</b>
            </span>
            <span className="opacity-60">·</span>
            <span>
              أنت: <b className="text-foreground">{game.teams[myPlayerIndex]?.name}</b>{" "}
              {isMyTurn ? "(دورك الآن!)" : "(بانتظار دور الخصم)"}
            </span>
          </div>
        )}
        <div className="mx-auto grid max-w-6xl grid-cols-3 items-center gap-2 px-4 py-3">
          {game.teams.map((t, i) => (
            <div
              key={i}
              className={cn(
                "heritage-turn rounded-2xl border px-3 py-2 text-center transition-all",
                game.turn === i ? "team-active" : "team-waiting",
                i === 1 && "order-3",
              )}
            >
              <p className="truncate text-sm font-bold">
                {t.name}
                {isMultiplayer && i === myPlayerIndex && " (أنت)"}
              </p>
              <p
                className={cn(
                  "font-display text-2xl",
                  game.turn === i ? "text-gold" : "text-foreground",
                )}
              >
                {t.score}
              </p>
            </div>
          ))}
          <div className="turn-indicator order-2 text-center">
            <span>الدور الحالي</span>
            <strong>{game.teams[game.turn].name}</strong>
            <small>{isMyTurn ? "اختاروا الفئة والنقاط" : "بانتظار اختيار السؤال..."}</small>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-3 py-5">
        <div className="heritage-panel mb-4 rounded-2xl px-4 py-3 text-center text-sm font-bold text-muted-foreground">
          هسّه دور <span className="text-primary">{game.teams[game.turn].name}</span> — بكل فئة ست
          بطاقات: سؤالان ٢٠٠، سؤالان ٤٠٠، وسؤالان ٦٠٠؛ حتى يأخذ كل فريق فرصته.
        </div>
        <div className="taqha-board-grid">
          {game.categories.map((cat) => {
            const img = categoryImage(cat.image_key ?? cat.slug);
            return (
              <div key={cat.id} className="taqha-board-card">
                <div className="taqha-category-core heritage-card rounded-2xl border border-border bg-card p-2 text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-surface-2">
                    {img ? (
                      <img
                        src={img}
                        alt={cat.name}
                        loading="lazy"
                        width={512}
                        height={512}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <CategoryArtwork category={cat} compact />
                    )}
                  </div>
                  <p className="mt-2 truncate text-xs font-bold">{cat.name}</p>
                </div>

                {byCategory(cat.id).map((q, index) => {
                  const used = game.used.includes(q.id);
                  const questionNumber = index + 1;
                  const isSelectable = !used && active === null && (!isMultiplayer || isMyTurn);

                  return (
                    <button
                      key={q.id}
                      disabled={used || active !== null || (isMultiplayer && !isMyTurn)}
                      onClick={() => void handleQuestionClick(q)}
                      className={cn(
                        `point-choice point-${q.points} flex h-[4.35rem] w-full items-center justify-center rounded-xl font-display text-lg transition-all sm:h-[4.7rem]`,
                        used
                          ? "cursor-not-allowed bg-surface text-muted-foreground/40"
                          : isSelectable
                            ? "text-primary-foreground hover:scale-105"
                            : "opacity-60 cursor-not-allowed",
                      )}
                    >
                      <span
                        className={cn(
                          "block text-[10px] font-sans font-bold",
                          q.points === 200
                            ? "text-emerald-100"
                            : q.points === 400
                              ? "text-yellow-100"
                              : "text-red-100",
                        )}
                      >
                        {roundLevel(q.points)} · سؤال {questionNumber}
                      </span>
                      <span>{q.points}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </main>

      {/* Synchronized Question Modal */}
      {active && (
        <QuestionModal
          question={active}
          category={game.categories.find((category) => category.id === active.category_id)}
          onClose={() => void handleCloseModal()}
          onResolve={(team) => void handleResolve(team)}
          onHelp={(key) => void handleUseHelp(key)}
          helps={game.teams[game.turn].helps}
          teams={[game.teams[0].name, game.teams[1].name]}
          currentTeam={game.teams[game.turn].name}
          multiplayerRevealed={isMultiplayer ? mpRevealed : undefined}
          multiplayerRevealedAnswer={isMultiplayer ? mpRevealedAnswer : undefined}
          multiplayerDigHidden={isMultiplayer ? mpDigHidden : undefined}
          onReveal={() => void handleReveal()}
          onMcqAnswer={(choice) => void handleMcqAnswer(choice)}
          openedAt={isMultiplayer ? mpOpenedAt : undefined}
          isMultiplayer={isMultiplayer}
          isMyTurn={isMyTurn}
          isHost={isMultiplayer ? myPlayerIndex === 0 : true}
        />
      )}
    </div>
  );
}

function QuestionMedia({ question }: { question: QuestionRow }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayerPhoto = question.category_id === "players-by-photo";

  function playStartTone() {
    try {
      const AudioContextClass =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, context.currentTime);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.24);
      window.setTimeout(() => void context.close(), 350);
    } catch {
      /* The spoken clue still works when Web Audio is unavailable. */
    }
  }

  async function playAudioClue() {
    if (question.audio_url && !audioFailed) {
      const audio = audioRef.current;
      if (!audio) return;
      playStartTone();
      audio.currentTime = 0;
      setSpeaking(true);
      try {
        await audio.play();
      } catch {
        setSpeaking(false);
        toast.error("تعذّر تشغيل الملف الصوتي. تأكدوا من رفع صوت الجهاز ثم أعيدوا المحاولة.");
      }
      return;
    }

    if (!question.audio_text || typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("المتصفح لا يدعم تشغيل هذا المقطع الصوتي.");
      return;
    }
    playStartTone();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(question.audio_text);
    utterance.lang = "ar-SA";
    utterance.rate = 0.95;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div className="question-media-slot">
      {question.image_url && !imageFailed && (
        <div
          className={cn(
            "media-frame mx-auto my-4 max-w-xl overflow-hidden rounded-2xl border border-border bg-card",
            isPlayerPhoto && "player-frame max-w-md",
          )}
        >
          <img
            src={question.image_url}
            alt={question.text}
            loading="eager"
            onError={() => setImageFailed(true)}
            className={cn(
              "max-h-[360px] w-full object-contain sm:max-h-[420px]",
              isPlayerPhoto && "player-photo object-cover",
            )}
          />
        </div>
      )}

      {question.video_url && (
        <div className="media-frame mx-auto my-4 max-w-2xl overflow-hidden rounded-2xl border border-border bg-black">
          <video
            src={question.video_url}
            controls
            playsInline
            preload="metadata"
            className="max-h-[380px] w-full"
          >
            <track kind="captions" />
          </video>
        </div>
      )}

      {(question.audio_url || question.audio_text) && (
        <div className="audio-dock mx-auto my-4 flex max-w-md items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-surface-2 px-4 py-3">
          {question.audio_url && (
            <audio
              ref={audioRef}
              src={question.audio_url}
              preload="auto"
              onEnded={() => setSpeaking(false)}
              onError={() => setAudioFailed(true)}
            >
              <track kind="captions" />
            </audio>
          )}
          <div className="flex items-center gap-2">
            <Volume2 className={cn("h-5 w-5 text-gold", speaking && "animate-pulse")} />
            <span className="text-xs font-bold text-muted-foreground">
              {speaking ? "المقطع شغال هسّه..." : "مقطع صوتي مسجّل"}
            </span>
          </div>
          <Button size="sm" onClick={() => void playAudioClue()} disabled={speaking}>
            {speaking ? "جارٍ التشغيل" : "شغّل الصوت"}
          </Button>
        </div>
      )}
    </div>
  );
}

function QuestionModal({
  question,
  category,
  onClose,
  onResolve,
  onHelp,
  helps,
  teams,
  currentTeam,
  multiplayerRevealed,
  multiplayerRevealedAnswer,
  multiplayerDigHidden,
  onReveal,
  onMcqAnswer,
  openedAt,
  isMultiplayer,
  isMyTurn,
  isHost,
}: {
  question: QuestionRow;
  category?: CategoryRow;
  onClose: () => void;
  onResolve: (team: 0 | 1 | null) => void;
  onHelp: (key: HelpKey) => void;
  helps: Record<HelpKey, boolean>;
  teams: [string, string];
  currentTeam: string;
  multiplayerRevealed?: boolean;
  multiplayerRevealedAnswer?: string | null;
  multiplayerDigHidden?: string[];
  onReveal?: () => void;
  onMcqAnswer?: (choice: string) => void;
  openedAt?: string | null;
  isMultiplayer?: boolean;
  isMyTurn?: boolean;
  isHost?: boolean;
}) {
  const isSilentPrompt = category?.slug === "no-words";

  // Compute synchronized timer
  const initialTime = useMemo(() => {
    if (openedAt) {
      const elapsed = (Date.now() - new Date(openedAt).getTime()) / 1000;
      return Math.max(0, Math.floor(TOTAL_TIME - elapsed));
    }
    return TOTAL_TIME;
  }, [openedAt]);

  const [left, setLeft] = useState(initialTime);
  const [paused, setPaused] = useState(isSilentPrompt);
  const [promptVisible, setPromptVisible] = useState(!isSilentPrompt);
  const [localRevealed, setLocalRevealed] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [allowTwo, setAllowTwo] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [resolution, setResolution] = useState<{ team: string | null; points: number } | null>(
    null,
  );
  const timer = useRef<number | null>(null);

  const revealed = multiplayerRevealed !== undefined ? multiplayerRevealed : localRevealed;
  const displayAnswer = isMultiplayer ? multiplayerRevealedAnswer || "" : question.answer;

  useEffect(() => {
    if (paused) return;
    timer.current = window.setInterval(() => {
      setLeft((v) => (v <= 0 ? 0 : v - 1));
    }, 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [paused]);

  const pct = (left / TOTAL_TIME) * 100;
  const color = left > 15 ? "var(--success)" : left > 5 ? "var(--gold)" : "var(--destructive)";

  const effectiveHidden = useMemo(() => {
    const set = new Set(hidden);
    if (multiplayerDigHidden && Array.isArray(multiplayerDigHidden)) {
      multiplayerDigHidden.forEach((c) => set.add(c));
    }
    return Array.from(set);
  }, [hidden, multiplayerDigHidden]);

  const choices = useMemo(
    () => (question.choices ?? []).filter((c) => !hidden.includes(c)),
    [question.choices, hidden],
    () => (question.choices ?? []).filter((c) => !effectiveHidden.includes(c)),
    [question.choices, effectiveHidden],
  );

  function activate(key: HelpKey) {
    if (!helps[key]) return;
    onHelp(key);
    if (key === "rest") {
      setPaused(true);
      toast.info("استريح مفعّلة", { description: "المؤقت متوقف، اضغط استئناف لما تجهزون." });
    }
    if (key === "two") {
      setAllowTwo(true);
      toast.info("جاوب جوابين", { description: "تقدرون تختارون إجابتين." });
    }
    if (key === "dig") {
      const wrong = (question.choices ?? []).filter((c) => c !== question.answer);
      setHidden(wrong.slice(0, 2));
      if (!isMultiplayer) {
        const wrong = (question.choices ?? []).filter((c) => c !== question.answer);
        setHidden(wrong.slice(0, 2));
      }
      toast.info("الحفرة", { description: "انحذف خيارين خاطئين." });
    }
    if (key === "call") {
      setCallOpen(true);
      setPaused(true);
    }
    if (key === "trap") {
      toast.warning("الفخ انزرع!", {
        description: "الفريق الثاني بيوصله جواب مضلل في دوره الجاي.",
      });
    }
  }

  function pick(choice: string) {
    setPicked((prev) => {
      if (prev.includes(choice)) return prev.filter((c) => c !== choice);
      const max = allowTwo ? 2 : 1;
      return [...prev, choice].slice(-max);
    });
  }

  function handleRevealClick() {
    if (onReveal) {
      onReveal();
    }
    setLocalRevealed(true);
  }

  function resolve(team: 0 | 1 | null) {
    setPaused(true);
    setResolution({ team: team === null ? null : teams[team], points: question.points });
    window.setTimeout(() => onResolve(team), 2200);
  }

  return (
    <div className="fixed inset-0 z-50 flex min-h-0 animate-pop-in flex-col overflow-hidden bg-background/98">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 50% 0%, color-mix(in oklab, var(--primary) 45%, transparent), transparent 60%)",
        }}
      />

      <div
        className="relative flex items-center justify-between px-4 py-4"
        style={{ paddingTop: "calc(var(--safe-area-top) + 0.75rem)" }}
      >
        <div
          className={cn(
            "grid h-20 w-20 place-items-center rounded-full font-display text-2xl",
            left <= 5 && "timer-urgent",
          )}
          style={{
            background: `conic-gradient(${color} ${pct}%, var(--surface-2) 0)`,
          }}
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-background">
            {left}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {paused && (
            <Button size="sm" variant="secondary" onClick={() => setPaused(false)}>
              استئناف المؤقت
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="إغلاق">
            <X className="h-6 w-6" />
          </Button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-4 text-center">
        <article className="question-glow w-full max-w-5xl rounded-[2rem] border border-primary/25 px-6 py-9 shadow-2xl sm:px-12 sm:py-14">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full bg-surface-2 px-4 py-1 text-sm font-bold text-gold">
              {question.points} نقطة
            </span>
            <span className="rounded-full border border-border bg-card/70 px-4 py-1 text-sm font-bold">
              {category?.emoji ?? "❓"} {category?.name ?? "الفئة الحالية"}
            </span>
            <span className="rounded-full border border-primary/50 bg-primary/15 px-4 py-1 text-sm font-bold text-primary">
              دور: {currentTeam} {isMultiplayer && (isMyTurn ? "(دورك الآن)" : "(دور الخصم)")}
            </span>
          </div>
          {isSilentPrompt && !promptVisible ? (
            <div className="mx-auto mt-8 max-w-xl rounded-3xl border border-gold/40 bg-surface-2 px-6 py-10">
              <EyeOff className="mx-auto h-11 w-11 text-gold" />
              <h2 className="mt-4 text-2xl font-bold sm:text-3xl">سلّم الجهاز للشخص صاحب الدور</h2>
              <p className="mt-3 text-muted-foreground">
                الكلمة مخفية حتى لا يراها باقي الفريق. بعد كشفها يبدأ المؤقت.
              </p>
              <Button
                size="lg"
                className="mt-6"
                onClick={() => {
                  setPromptVisible(true);
                  setPaused(false);
                }}
              >
                <Eye className="ms-2 h-5 w-5" /> اكشف كلمة التمثيل
              </Button>
            </div>
          ) : (
            <>
              <h2 className="mt-7 text-2xl leading-relaxed sm:text-4xl">{question.text}</h2>

              <QuestionMedia question={question} />

              {question.kind === "mcq" ? (
                <>
                  <div className="mx-auto mt-8 grid w-full max-w-3xl gap-3 sm:grid-cols-2">
                    {choices.map((c) => (
                      <button
                        key={c}
                        disabled={isMultiplayer && !isMyTurn}
                        onClick={() => pick(c)}
                        className={cn(
                          "rounded-2xl border p-4 text-lg font-bold transition-all",
                          picked.includes(c)
                            ? "border-primary bg-primary/15 glow-primary"
                            : "border-border bg-card hover:border-primary/60",
                          revealed &&
                            Boolean(displayAnswer) &&
                            c === displayAnswer &&
                            "border-success bg-success/20",
                          isMultiplayer && !isMyTurn && "opacity-70 cursor-not-allowed",
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>

                  {/* Multiplayer: Turn player confirms MCQ answer */}
                  {isMultiplayer && isMyTurn && !revealed && picked.length > 0 && (
                    <div className="mt-6 flex justify-center">
                      <Button
                        size="lg"
                        className="h-14 px-8 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 glow-primary"
                        onClick={() => {
                          if (onMcqAnswer && picked[0]) {
                            onMcqAnswer(picked[0]);
                          }
                        }}
                      >
                        <Check className="ms-2 h-5 w-5" /> تأكيد الإجابة: {picked[0]}
                      </Button>
                    </div>
                  )}

                  {/* Multiplayer: Non-turn player waits */}
                  {isMultiplayer && !isMyTurn && !revealed && (
                    <p className="mt-6 text-sm font-bold text-muted-foreground animate-pulse">
                      بانتظار اختيار فريق {currentTeam} للإجابة...
                    </p>
                  )}
                </>
              ) : isSilentPrompt ? (
                <p className="mt-7 text-sm font-bold text-gold">
                  مثّلها من دون كلام، والحكم يقرر إن كانت الإجابة صحيحة.
                </p>
              ) : (
                <div className="mt-8">
                  {revealed ? (
                    <p className="rounded-2xl border border-success/50 bg-success/10 px-6 py-4 text-2xl font-bold text-success animate-in fade-in">
                      {question.answer}
                      {displayAnswer || "تم كشف الجواب"}
                    </p>
                  ) : (
                    <Button size="lg" onClick={handleRevealClick}>
                      <Eye className="ms-2 h-5 w-5" /> إظهار الجواب
                    </Button>
                  )}
                </div>
              )}

              {question.kind === "mcq" && !revealed && (
                <Button variant="ghost" className="mt-6" onClick={handleRevealClick}>
                  <Eye className="ms-2 h-4 w-4" /> إظهار الجواب الصحيح
                </Button>
              )}
            </>
          )}
        </article>
      </div>

      <div
        className="relative shrink-0 border-t border-border bg-surface/80 px-4 py-4"
        style={{ paddingBottom: "calc(var(--safe-area-bottom) + 0.75rem)" }}
      >
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-3">
          {HELPS.map((h) => {
            const Icon = HELP_ICONS[h.key];
            const available = helps[h.key];
            return (
              <button
                key={h.key}
                onClick={() => activate(h.key)}
                disabled={!available || (isMultiplayer && !isMyTurn)}
                title={h.short}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-3 py-2 transition-all",
                  available && (!isMultiplayer || isMyTurn)
                    ? "bg-surface-2 hover:scale-105"
                    : "opacity-30 cursor-not-allowed",
                )}
              >
                <Icon className={cn("h-6 w-6", h.color)} />
                <span className="text-xs font-bold">{h.name}</span>
              </button>
            );
          })}
        </div>

        {/* Judging controls: In multiplayer, MCQ is judged automatically on the server. Only open/subjective questions permit manual judging by the Host! */}
        {isMultiplayer && question.kind === "mcq" ? null : isMultiplayer && !isHost ? (
          <div className="mx-auto mt-4 max-w-md rounded-2xl border border-gold/30 bg-surface-2 p-4 text-center">
            <p className="text-sm font-bold text-gold">بانتظار تحكيم المضيف للإجابة...</p>
            <p className="mt-1 text-xs text-muted-foreground">
              المضيف هو الحكم المعتمد لتحديد نتيجة السؤال الشفهي
            </p>
          </div>
        ) : (
          <div className="mx-auto mt-4 max-w-2xl">
            <p className="mb-3 text-center text-sm font-bold text-muted-foreground">
              من الفريق الذي أجاب صح؟
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                disabled={resolution !== null}
                className="h-16 bg-success text-base text-primary-foreground hover:bg-success/90"
                onClick={() => resolve(0)}
              >
                <Check className="ms-1 h-4 w-4" /> صح لـ {teams[0]}
              </Button>
              <Button
                disabled={resolution !== null}
                className="h-16 bg-success text-base text-primary-foreground hover:bg-success/90"
                onClick={() => resolve(1)}
              >
                <Check className="ms-1 h-4 w-4" /> صح لـ {teams[1]}
              </Button>
            </div>
            <Button
              disabled={resolution !== null}
              variant="destructive"
              size="sm"
              className="mx-auto mt-3 flex"
              onClick={() => resolve(null)}
            >
              <X className="ms-1 h-4 w-4" /> ما أحد جاوب
            </Button>
            {resolution && (
              <p className="mt-3 rounded-xl border border-success/40 bg-success/10 px-4 py-2 text-center text-sm font-bold text-success">
                {resolution.team
                  ? `تُحسب ${resolution.points} نقطة لفريق ${resolution.team}`
                  : "لا تُحتسب نقاط لهذه الجولة"}
              </p>
            )}
          </div>
        )}
      </div>

      {callOpen && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-background/90">
          <div className="w-80 rounded-3xl border border-success/50 bg-card p-8 text-center">
            <Phone className="mx-auto h-12 w-12 animate-bounce text-success" />
            <p className="mt-4 text-lg font-bold">مكالمة صديق</p>
            <p className="mt-1 text-sm text-muted-foreground">عندكم ٣٠ ثانية للتشاور</p>
            <Button
              className="mt-5 w-full"
              onClick={() => {
                setCallOpen(false);
                setPaused(false);
              }}
            >
              إنهاء المكالمة
            </Button>
          </div>
        </div>
      )}
      {resolution && (
        <div
          className="pointer-events-none absolute inset-0 z-20 grid place-items-center overflow-hidden"
          aria-live="assertive"
        >
          <div
            className={cn(
              "round-result rounded-[2rem] border px-9 py-7 text-center shadow-2xl",
              resolution.team ? "border-success/70" : "border-destructive/60",
            )}
          >
            <p className="text-sm font-black tracking-wide text-gold">نتيجة الجولة</p>
            {resolution.team ? (
              <>
                <p className="taqha-hit-text mt-2 text-2xl font-black sm:text-4xl">
                  أبدعتم يا {resolution.team}! 🔥
                </p>
                <p className="mt-2 text-lg font-bold text-success">
                  أخذوا {resolution.points} نقطة
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-2xl font-black sm:text-4xl">ما حدا أخذ النقاط</p>
                <p className="mt-2 text-sm font-bold text-muted-foreground">
                  الجولة الجاية إلها حكي ثاني.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
