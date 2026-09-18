import { useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  Copy,
  Crown,
  Loader2,
  Monitor,
  Share2,
  Smartphone,
  Users,
  UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ArcadeGame } from "@/lib/arcade-catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { fetchCategories } from "@/lib/db";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  startRoom as apiStartRoom,
  subscribeToRoom,
  type MultiplayerRoomState,
} from "@/lib/multiplayer-service";

export type PlayMode = "single" | "online";

type FlowView = "select_mode" | "choose_action" | "join_input" | "host_lobby" | "guest_lobby";

interface GameRoomFlowProps {
  game: ArcadeGame;
  onStart: (mode: PlayMode, players?: string[], roomState?: MultiplayerRoomState) => void;
  initialCode?: string;
}

export function GameRoomFlow({ game, onStart, initialCode = "" }: GameRoomFlowProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [view, setView] = useState<FlowView>(initialCode ? "join_input" : "select_mode");
  const [roomState, setRoomState] = useState<MultiplayerRoomState | null>(null);

  // Form states
  const [inputCode, setInputCode] = useState(initialCode.replace(/\s+/g, "").slice(0, 6));
  const [playerName, setPlayerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Preload user's profile display name
  useEffect(() => {
    if (!user) return;
    async function loadProfileName() {
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user!.id)
        .maybeSingle();
      if (data?.first_name) {
        const full = `${data.first_name} ${data.last_name || ""}`.trim();
        setPlayerName(full);
      }
    }
    void loadProfileName();
  }, [user]);

  // Realtime subscription when inside a room
  useEffect(() => {
    if (!roomState?.room.id) return;
    const roomId = roomState.room.id;

    const unsubscribe = subscribeToRoom(roomId, (updatedState) => {
      setRoomState(updatedState);

      // If guest is in lobby and host starts the game
      if (view === "guest_lobby" && updatedState.room.status === "playing") {
        toast.success("بدأت اللعبة!");
        if (game.slug === "taqha") {
          navigate({ to: "/play", search: { room: updatedState.room.code } });
          return;
        }
        const playerNames = updatedState.players.map((p) => p.player_name);
        onStart("online", playerNames, updatedState);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [roomState?.room.id, view, onStart, game.slug, navigate]);

  // Clean code input helper (digits only, max 6)
  function handleCodeChange(val: string) {
    const clean = val.replace(/\D/g, "").slice(0, 6);
    setInputCode(clean);
    if (errorMessage) setErrorMessage(null);
  }

  // Action: Create Room (Host)
  async function handleCreateRoom() {
    if (!user) {
      toast.error("سجّل دخولك أولاً لإنشاء غرفة");
      return;
    }
    setLoading(true);
    setErrorMessage(null);

    const hostDisplayName = playerName.trim() || user.email?.split("@")[0] || "المضيف";
    const { data, error } = await createRoom(game.slug, hostDisplayName);

    setLoading(false);
    if (error || !data) {
      setErrorMessage(error || "تعذر إنشاء الغرفة، يرجى المحاولة لاحقاً");
      return;
    }

    setRoomState(data);
    setView("host_lobby");
    toast.success("تم إنشاء الغرفة بنجاح! كود الغرفة: " + data.room.code);
  }

  // Action: Join Room (Guest)
  async function handleJoinRoom() {
    if (!user) {
      toast.error("سجّل دخولك أولاً للانضمام للغرفة");
      return;
    }
    const clean = inputCode.replace(/\D/g, "").trim();
    if (clean.length !== 6) {
      setErrorMessage("يرجى كتابة رمز الغرفة المكوّن من ٦ أرقام");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const guestDisplayName = playerName.trim() || user.email?.split("@")[0] || "لاعب";
    const { data, error } = await joinRoom(clean, guestDisplayName);

    setLoading(false);
    if (error || !data) {
      setErrorMessage(error || "تعذر الانضمام إلى الغرفة");
      return;
    }

    setRoomState(data);
    setView("guest_lobby");
    toast.success("تم الانضمام للغرفة بنجاح!");
  }

  // Action: Host starts game (Server-authoritative: sends only category slugs, no client session trusted)
  async function handleStartByHost() {
    if (!roomState) return;
    setLoading(true);
    try {
      let categorySlugs: string[] | undefined;

      if (game.slug === "taqha") {
        const categories = await fetchCategories();
        const chosen = categories.slice(0, 6);
        categorySlugs = chosen.map((c) => c.slug || c.id);
      }

      const { data, error } = await apiStartRoom(roomState.room.id, categorySlugs);
      setLoading(false);

      if (error || !data) {
        toast.error(error || "تعذر بدء اللعبة");
        return;
      }

      toast.success("انطلقت اللعبة!");
      if (game.slug === "taqha") {
        navigate({ to: "/play", search: { room: data.room.code } });
        return;
      }
      const playerNames = data.players.map((p) => p.player_name);
      onStart("online", playerNames, data);
    } catch {
      setLoading(false);
      toast.error("حدث خطأ أثناء تجهيز اللعبة");
    }
  }

  // Action: Leave/Cancel Room
  async function handleLeaveRoom() {
    if (roomState?.room.id) {
      await leaveRoom(roomState.room.id);
    }
    setRoomState(null);
    setInputCode("");
    setErrorMessage(null);
    setView("select_mode");
  }

  // Share room code via Web Share API
  async function handleShareCode() {
    if (!roomState?.room.code) return;
    const shareUrl = `${window.location.origin}/arcade?game=${game.slug}&room=${roomState.room.code}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `انضم للعب ${game.name} في قدّ التحدي`,
          text: `رمز الغرفة: ${roomState.room.code}`,
          url: shareUrl,
        });
        return;
      } catch {
        /* User cancelled or share failed, fallback to copy */
      }
    }
    await navigator.clipboard.writeText(roomState.room.code);
    toast.success("تم نسخ كود الغرفة: " + roomState.room.code);
  }

  // -------------------------------------------------------------
  // VIEW 1: HOST LOBBY
  // -------------------------------------------------------------
  if (view === "host_lobby" && roomState) {
    const players = roomState.players;
    const guest = players.find((p) => p.role === "guest");
    const canStart = players.length >= 2;

    return (
      <section
        className={`arcade-skin arcade-${game.accent} mx-auto max-w-2xl rounded-3xl border border-gold/40 bg-card/90 p-5 sm:p-8 text-center backdrop-blur-md shadow-2xl`}
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-gold">
          <Crown className="h-4 w-4" /> غرفة المضيف · تحدي ثنائي 1 ضد 1 · {game.name}
        </div>

        <h1 className="mt-4 text-2xl sm:text-3xl font-black">غرفتكم جاهزة!</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          شارك هذا الكود المكوّن من ٦ أرقام مع الطرف الثاني لينضم مباشرة من جواله. (السعة: لاعبان
          فقط)
        </p>

        {/* 6-Digit Room Code Card */}
        <div className="mx-auto mt-6 max-w-md rounded-2xl border-2 border-dashed border-gold/60 bg-surface-2/70 p-5 text-center">
          <span className="text-xs font-bold text-muted-foreground">كود الغرفة</span>
          <div
            dir="ltr"
            className="mt-1 font-mono text-4xl sm:text-5xl font-black tracking-widest text-gold select-all"
          >
            {roomState.room.code}
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-gold/40 text-gold hover:bg-gold/15"
              onClick={() => {
                void navigator.clipboard.writeText(roomState.room.code);
                toast.success("تم نسخ كود الغرفة: " + roomState.room.code);
              }}
            >
              <Copy className="h-4 w-4" /> نسخ الكود
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-gold/40 text-gold hover:bg-gold/15"
              onClick={() => void handleShareCode()}
            >
              <Share2 className="h-4 w-4" /> مشاركة
            </Button>
          </div>
        </div>

        {/* Live Lobby Participants (Exactly 2 slots) */}
        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-border/80 bg-background/50 p-4 text-start">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">
              اللاعبان المتنافسان ({players.length} / 2)
            </span>
            {canStart ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> اكتمل اللاعبان
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gold">
                <span className="h-2 w-2 rounded-full bg-gold animate-ping" />
                بانتظار اللاعب الثاني...
              </span>
            )}
          </div>

          <div className="mt-3 space-y-2">
            {/* Host */}
            <div className="flex items-center justify-between rounded-xl bg-surface-2/60 p-2.5">
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-gold shrink-0" />
                <span className="text-sm font-bold text-foreground">
                  {roomState.room.host_name}
                </span>
              </div>
              <span className="text-[11px] font-bold text-gold bg-gold/10 px-2 py-0.5 rounded-md">
                المضيف (اللاعب الأول)
              </span>
            </div>

            {/* Guest */}
            {guest ? (
              <div className="flex items-center justify-between rounded-xl bg-surface-2/60 p-2.5 animate-in fade-in duration-300">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-bold text-foreground">{guest.player_name}</span>
                </div>
                <span className="text-[11px] font-bold text-success bg-success/15 px-2 py-0.5 rounded-md">
                  اللاعب الثاني
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-gold" />
                <span>بانتظار انضمام اللاعب الثاني عبر كود الغرفة...</span>
              </div>
            )}
          </div>
        </div>

        {/* Start Button */}
        <div className="mt-6 flex flex-col items-center gap-3">
          <Button
            className="w-full max-w-md h-12 text-base font-bold shadow-lg"
            disabled={!canStart || loading}
            onClick={() => void handleStartByHost()}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> جاري بدء التحدي...
              </span>
            ) : canStart ? (
              "ابدأ التحدي الآن"
            ) : (
              "بانتظار انضمام اللاعب الثاني للبدء"
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-destructive"
            onClick={() => void handleLeaveRoom()}
          >
            إلغاء الغرفة والرجوع
          </Button>
        </div>
      </section>
    );
  }

  // -------------------------------------------------------------
  // VIEW 2: GUEST LOBBY
  // -------------------------------------------------------------
  if (view === "guest_lobby" && roomState) {
    return (
      <section
        className={`arcade-skin arcade-${game.accent} mx-auto max-w-2xl rounded-3xl border border-gold/40 bg-card/90 p-5 sm:p-8 text-center backdrop-blur-md shadow-2xl`}
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-success">
          <CheckCircle2 className="h-4 w-4" /> متصل بالغرفة · تحدي ثنائي · {game.name}
        </div>

        <h1 className="mt-4 text-2xl sm:text-3xl font-black">أنت الآن داخل الغرفة!</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تم قفل الغرفة على لاعبين اثنين. بانتظار أن يضغط المضيف على &quot;ابدأ اللعبة&quot; لننطلق
          معاً.
        </p>

        {/* Players List */}
        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-border/80 bg-background/50 p-4 text-start">
          <span className="text-xs font-bold text-muted-foreground">
            المتنافسان في الغرفة ({roomState.players.length} / 2)
          </span>

          <div className="mt-3 space-y-2">
            {roomState.players.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-surface-2/60 p-2.5"
              >
                <div className="flex items-center gap-2">
                  {p.role === "host" ? (
                    <Crown className="h-4 w-4 text-gold shrink-0" />
                  ) : (
                    <Users className="h-4 w-4 text-primary shrink-0" />
                  )}
                  <span className="text-sm font-bold text-foreground">{p.player_name}</span>
                </div>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                    p.role === "host" ? "text-gold bg-gold/10" : "text-success bg-success/15"
                  }`}
                >
                  {p.role === "host" ? "المضيف" : "أنت (اللاعب الثاني)"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Waiting Status Card */}
        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-gold/30 bg-gold/5 p-4 flex items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-gold shrink-0" />
          <p className="text-sm font-bold text-gold">
            بانتظار إشارة البدء من المضيف... ستفتح شاشة اللعب تلقائياً فوراً!
          </p>
        </div>

        <div className="mt-6">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-destructive"
            onClick={() => void handleLeaveRoom()}
          >
            مغادرة الغرفة
          </Button>
        </div>
      </section>
    );
  }

  // -------------------------------------------------------------
  // VIEW 3: JOIN INPUT (Enter 6-digit Code)
  // -------------------------------------------------------------
  if (view === "join_input") {
    return (
      <section
        className={`arcade-skin arcade-${game.accent} mx-auto max-w-xl rounded-3xl border border-gold/40 bg-card/90 p-5 sm:p-8 text-center backdrop-blur-md shadow-2xl`}
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-gold">
          <Smartphone className="h-4 w-4" /> انضمام لتحدي ثنائي · {game.name}
        </div>

        <h1 className="mt-4 text-2xl sm:text-3xl font-black">أدخل رمز الغرفة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          اطلب من المضيف رمز الغرفة المكوّن من ٦ أرقام للانضمام إلى التحدي (السعة: لاعبان فقط).
        </p>

        <div className="mx-auto mt-6 max-w-sm space-y-4">
          <div>
            <label className="block text-start text-xs font-bold text-muted-foreground mb-1.5">
              اسمك المستعار في التحدي
            </label>
            <Input
              type="text"
              placeholder="مثال: يزن أو فريق الصقور"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="h-11 bg-background/60 text-center font-bold"
              maxLength={25}
            />
          </div>

          <div>
            <label className="block text-start text-xs font-bold text-muted-foreground mb-1.5">
              رمز الغرفة (٦ أرقام)
            </label>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="123456"
              value={inputCode}
              onChange={(e) => handleCodeChange(e.target.value)}
              className="h-14 bg-background/60 text-center font-mono text-3xl font-black tracking-widest text-gold"
              maxLength={6}
              autoFocus
            />
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs font-bold text-destructive animate-in fade-in">
              {errorMessage}
            </div>
          )}

          <Button
            className="w-full h-12 text-base font-bold shadow-lg"
            disabled={inputCode.length !== 6 || loading}
            onClick={() => void handleJoinRoom()}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> جاري التحقق من الغرفة...
              </span>
            ) : (
              "انضمام للتحدي"
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setErrorMessage(null);
              setView("choose_action");
            }}
          >
            الرجوع للخيارات
          </Button>
        </div>
      </section>
    );
  }

  // -------------------------------------------------------------
  // VIEW 4: CHOOSE ACTION (Host vs Join)
  // -------------------------------------------------------------
  if (view === "choose_action") {
    return (
      <section
        className={`arcade-skin arcade-${game.accent} mx-auto max-w-2xl rounded-3xl border border-gold/40 bg-card/90 p-5 sm:p-8 text-center backdrop-blur-md shadow-2xl`}
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-gold">
          <UsersRound className="h-4 w-4" /> كل واحد على جواله · تحدي 1 ضد 1
        </div>

        <h1 className="mt-4 text-2xl sm:text-3xl font-black">اختر دورك في التحدي</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          هل تريد إنشاء غرفة ومشاركة الكود، أم الانضمام إلى غرفة أنشأها صاحبك؟
        </p>

        <div className="mx-auto mt-6 max-w-md text-start">
          <label className="block text-xs font-bold text-muted-foreground mb-1.5">
            اسمك المستعار في اللعبة
          </label>
          <Input
            type="text"
            placeholder="مثال: يزن أو أبو سمرة"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="h-11 bg-background/60 text-start font-bold"
            maxLength={25}
          />
        </div>

        {errorMessage && (
          <div className="mx-auto mt-4 max-w-md rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs font-bold text-destructive">
            {errorMessage}
          </div>
        )}

        <div className="mx-auto mt-6 grid max-w-md gap-3 sm:grid-cols-2">
          {/* Create Room */}
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleCreateRoom()}
            className="group flex flex-col items-center justify-center rounded-2xl border border-gold/40 bg-surface-2/60 p-5 text-center transition-all hover:border-gold hover:bg-gold/10 hover:scale-[1.02]"
          >
            <Crown className="h-8 w-8 text-gold transition-transform group-hover:scale-110" />
            <span className="mt-3 text-base font-black text-foreground">إنشاء غرفة جديدة</span>
            <span className="mt-1 text-xs text-muted-foreground">تصبح المضيف وتشارك الكود</span>
          </button>

          {/* Join Room */}
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setErrorMessage(null);
              setView("join_input");
            }}
            className="group flex flex-col items-center justify-center rounded-2xl border border-border bg-surface-2/60 p-5 text-center transition-all hover:border-primary hover:bg-primary/10 hover:scale-[1.02]"
          >
            <Smartphone className="h-8 w-8 text-primary transition-transform group-hover:scale-110" />
            <span className="mt-3 text-base font-black text-foreground">انضمام بكود</span>
            <span className="mt-1 text-xs text-muted-foreground">أدخل كود مكوّن من ٦ أرقام</span>
          </button>
        </div>

        <div className="mt-6">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setView("select_mode")}
          >
            تغيير طريقة اللعب
          </Button>
        </div>
      </section>
    );
  }

  // -------------------------------------------------------------
  // VIEW 5: SELECT MODE (Single Device vs Multiplayer)
  // -------------------------------------------------------------
  return (
    <section
      className={`arcade-skin arcade-${game.accent} mx-auto max-w-3xl rounded-3xl border border-gold/40 bg-card/90 p-5 sm:p-9 text-center backdrop-blur-md shadow-2xl`}
    >
      <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-gold">
        {game.name} · اختر طريقة اللعب
      </div>

      <h1 className="mt-4 text-2xl sm:text-4xl font-black">كيف حابين تلعبوا اليوم؟</h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">
        تقدروا تلعبوا مع بعض على جوال واحد يتمرر بين الفريقين، أو كل واحد يمسك جواله بتحدي ثنائي
        مباشر ومتزامن لحظياً.
      </p>

      <div className="mx-auto mt-8 grid max-w-xl gap-4 sm:grid-cols-2">
        {/* Mode 1: Single Device */}
        <button
          type="button"
          onClick={() => onStart("single")}
          className="group relative flex flex-col items-center rounded-2xl border border-border/80 bg-surface-2/70 p-6 text-center transition-all hover:border-gold/60 hover:bg-surface-2 hover:scale-[1.02]"
        >
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-background text-gold shadow-md">
            <Monitor className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-black text-foreground">جهاز واحد (للجمعة)</h2>
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            الشاشة مع حكم الجلسة وتلفّ بينكم. الأنسب للقعدات العائلية ولمّات الصحاب.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-gold">
            ابدأ الآن على هذا الجهاز &larr;
          </span>
        </button>

        {/* Mode 2: Realtime Multiplayer (Strictly 2 players) */}
        <button
          type="button"
          onClick={() => setView("choose_action")}
          className="group relative flex flex-col items-center rounded-2xl border-2 border-primary/60 bg-primary/5 p-6 text-center transition-all hover:border-primary hover:bg-primary/10 hover:scale-[1.02] shadow-lg"
        >
          <div className="absolute -top-3 start-1/2 -translate-x-1/2 rounded-full border border-primary/40 bg-primary px-2.5 py-0.5 text-[10px] font-black text-primary-foreground">
            تحدي ثنائي مباشر
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/20 text-primary shadow-md">
            <Smartphone className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-black text-foreground">كل واحد على جواله</h2>
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            لاعب ضد لاعب (1 vs 1) بكود مباشر ومزامنة لحظية للأسئلة والنقاط والأدوار.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-primary">
            إنشاء أو انضمام لغرفة &larr;
          </span>
        </button>
      </div>
    </section>
  );
}
