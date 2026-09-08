import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Eye,
  Hand,
  HandMetal,
  Phone,
  Shell,
  Shovel,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game-store";
import { HELPS, type HelpKey, type QuestionRow } from "@/lib/game-types";
import { categoryImage } from "@/lib/category-images";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/play")({
  head: () => ({
    meta: [
      { title: "لوحة اللعب | لمّة جيم" },
      { name: "description", content: "لوحة التحدي: ٦ فئات × ٦ أسئلة، مؤقت، ووسائل مساعدة." },
      { property: "og:title", content: "لوحة تحدي لمّة جيم" },
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

const TOTAL_TIME = 30;

function PlayPage() {
  const navigate = useNavigate();
  const { game, ready, answer, useHelp, setTurn } = useGame();
  const [active, setActive] = useState<QuestionRow | null>(null);

  useEffect(() => {
    if (ready && !game) navigate({ to: "/create-game", replace: true });
  }, [ready, game, navigate]);

  useEffect(() => {
    if (game?.finished) navigate({ to: "/result" });
  }, [game?.finished, navigate]);

  if (!game) return null;

  const byCategory = (catId: string) =>
    game.questions.filter((q) => q.category_id === catId).sort((a, b) => a.points - b.points);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="sticky top-[68px] z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-3 items-center gap-2 px-4 py-3">
          {game.teams.map((t, i) => (
            <button
              key={i}
              onClick={() => setTurn(i as 0 | 1)}
              className={cn(
                "rounded-2xl px-3 py-2 text-center transition-all",
                game.turn === i ? "bg-primary/15 glow-primary scale-105" : "bg-surface",
                i === 1 && "order-3",
              )}
            >
              <p className="truncate text-sm font-bold">{t.name}</p>
              <p className="font-display text-2xl text-primary">{t.score}</p>
            </button>
          ))}
          <p className="order-2 text-center text-xs font-bold text-muted-foreground">
            الدور على
            <br />
            <span className="text-gold">{game.teams[game.turn].name}</span>
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-3 py-6">
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6 md:gap-3">
          {game.categories.map((cat) => {
            const img = categoryImage(cat.image_key);
            return (
              <div key={cat.id} className="flex flex-col gap-2">
                <div className="rounded-2xl border border-border bg-card p-2 text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center overflow-hidden rounded-xl bg-surface-2">
                    {img ? (
                      <img src={img} alt={cat.name} loading="lazy" width={512} height={512} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-3xl">{cat.emoji ?? "❓"}</span>
                    )}
                  </div>
                  <p className="mt-2 truncate text-xs font-bold">{cat.name}</p>
                </div>

                {byCategory(cat.id).map((q) => {
                  const used = game.used.includes(q.id);
                  return (
                    <button
                      key={q.id}
                      disabled={used}
                      onClick={() => setActive(q)}
                      className={cn(
                        "aspect-square rounded-xl font-display text-lg transition-all",
                        used
                          ? "cursor-not-allowed bg-surface text-muted-foreground/40"
                          : "fire-gradient text-primary-foreground hover:scale-105",
                      )}
                    >
                      {q.points}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </main>

      {active && (
        <QuestionModal
          question={active}
          onClose={() => setActive(null)}
          onResolve={(team) => {
            answer(active.id, team, active.points);
            setActive(null);
          }}
          onHelp={(key) => useHelp(game.turn, key)}
          helps={game.teams[game.turn].helps}
          teams={[game.teams[0].name, game.teams[1].name]}
        />
      )}
    </div>
  );
}

function QuestionModal({
  question,
  onClose,
  onResolve,
  onHelp,
  helps,
  teams,
}: {
  question: QuestionRow;
  onClose: () => void;
  onResolve: (team: 0 | 1 | null) => void;
  onHelp: (key: HelpKey) => void;
  helps: Record<HelpKey, boolean>;
  teams: [string, string];
}) {
  const [left, setLeft] = useState(TOTAL_TIME);
  const [paused, setPaused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [allowTwo, setAllowTwo] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const timer = useRef<number | null>(null);

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
  const color = left > 20 ? "var(--success)" : left > 10 ? "var(--gold)" : "var(--destructive)";

  const choices = useMemo(
    () => (question.choices ?? []).filter((c) => !hidden.includes(c)),
    [question.choices, hidden],
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
      toast.info("الحفرة", { description: "انحذف خيارين خاطئين." });
    }
    if (key === "call") {
      setCallOpen(true);
      setPaused(true);
    }
    if (key === "trap") {
      toast.warning("الفخ انزرع!", { description: "الفريق الثاني بيوصله جواب مضلل في دوره الجاي." });
    }
  }

  function pick(choice: string) {
    setPicked((prev) => {
      if (prev.includes(choice)) return prev.filter((c) => c !== choice);
      const max = allowTwo ? 2 : 1;
      return [...prev, choice].slice(-max);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex animate-pop-in flex-col bg-background/98">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 50% 0%, color-mix(in oklab, var(--primary) 45%, transparent), transparent 60%)",
        }}
      />

      <div className="relative flex items-center justify-between px-4 py-4">
        <div
          className="grid h-20 w-20 place-items-center rounded-full font-display text-2xl"
          style={{
            background: `conic-gradient(${color} ${pct}%, var(--surface-2) 0)`,
          }}
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-background">{left}</span>
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

      <div className="relative flex flex-1 flex-col items-center justify-center px-4 text-center">
        <span className="rounded-full bg-surface-2 px-4 py-1 text-sm font-bold text-gold">
          {question.points} نقطة
        </span>
        <h2 className="mt-6 max-w-4xl text-2xl leading-relaxed sm:text-4xl">{question.text}</h2>

        {question.kind === "mcq" ? (
          <div className="mt-8 grid w-full max-w-3xl gap-3 sm:grid-cols-2">
            {choices.map((c) => (
              <button
                key={c}
                onClick={() => pick(c)}
                className={cn(
                  "rounded-2xl border p-4 text-lg font-bold transition-all",
                  picked.includes(c)
                    ? "border-primary bg-primary/15 glow-primary"
                    : "border-border bg-card hover:border-primary/60",
                  revealed && c === question.answer && "border-success bg-success/20",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-8">
            {revealed ? (
              <p className="rounded-2xl border border-success/50 bg-success/10 px-6 py-4 text-2xl font-bold">
                {question.answer}
              </p>
            ) : (
              <Button size="lg" onClick={() => setRevealed(true)}>
                <Eye className="ms-2 h-5 w-5" /> إظهار الجواب
              </Button>
            )}
          </div>
        )}

        {question.kind === "mcq" && !revealed && (
          <Button variant="ghost" className="mt-6" onClick={() => setRevealed(true)}>
            <Eye className="ms-2 h-4 w-4" /> إظهار الجواب الصحيح
          </Button>
        )}
      </div>

      <div className="relative border-t border-border bg-surface/80 px-4 py-4">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-3">
          {HELPS.map((h) => {
            const Icon = HELP_ICONS[h.key];
            const available = helps[h.key];
            return (
              <button
                key={h.key}
                onClick={() => activate(h.key)}
                disabled={!available}
                title={h.short}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-3 py-2 transition-all",
                  available ? "bg-surface-2 hover:scale-105" : "opacity-30",
                )}
              >
                <Icon className={cn("h-6 w-6", h.color)} />
                <span className="text-xs font-bold">{h.name}</span>
              </button>
            );
          })}
        </div>

        <div className="mx-auto mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
          <Button className="flex-1 bg-success text-primary-foreground hover:bg-success/90" onClick={() => onResolve(0)}>
            <Check className="ms-1 h-4 w-4" /> صح لـ {teams[0]}
          </Button>
          <Button className="flex-1 bg-success text-primary-foreground hover:bg-success/90" onClick={() => onResolve(1)}>
            <Check className="ms-1 h-4 w-4" /> صح لـ {teams[1]}
          </Button>
          <Button variant="destructive" className="flex-1" onClick={() => onResolve(null)}>
            <X className="ms-1 h-4 w-4" /> ما أحد جاوب
          </Button>
        </div>
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
    </div>
  );
}
