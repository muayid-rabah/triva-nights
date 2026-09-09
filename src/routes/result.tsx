import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Crown, RotateCcw } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game-store";

export const Route = createFileRoute("/result")({
  head: () => ({
    meta: [
      { title: "النتيجة النهائية | طقّها" },
      { name: "description", content: "شوف الفريق الفائز ومقارنة النقاط بعد ٣٦ سؤال." },
      { property: "og:title", content: "نتيجة اللعبة" },
      { property: "og:description", content: "من كسب اللمّة هالمرة؟" },
    ],
  }),
  component: ResultPage,
});

function ResultPage() {
  const navigate = useNavigate();
  const { game, ready, reset } = useGame();

  useEffect(() => {
    if (ready && !game) navigate({ to: "/create-game", replace: true });
  }, [ready, game, navigate]);

  if (!game) return null;

  const [a, b] = game.teams;
  const max = Math.max(a.score, b.score, 1);
  const winner = a.score === b.score ? null : a.score > b.score ? a : b;

  return (
    <div className="min-h-screen overflow-hidden">
      <SiteHeader />

      <div className="pointer-events-none fixed inset-0 z-0">
        {Array.from({ length: 40 }).map((_, i) => (
          <span
            key={i}
            className="absolute block h-3 w-2 rounded-sm"
            style={{
              left: `${(i * 2.5) % 100}%`,
              backgroundColor: i % 3 === 0 ? "var(--primary)" : i % 3 === 1 ? "var(--gold)" : "var(--success)",
              animation: `confetti-fall ${3 + (i % 5)}s linear ${(i % 10) * 0.3}s infinite`,
            }}
          />
        ))}
      </div>

      <main className="relative z-10 mx-auto max-w-3xl px-4 py-16 text-center">
        <Crown className="mx-auto h-16 w-16 text-gold" />
        <p className="mt-4 text-muted-foreground">الفريق الفائز</p>
        <h1 className="mt-2 font-display text-5xl text-primary sm:text-6xl">
          {winner ? winner.name : "تعادل!"}
        </h1>

        <div className="mt-12 space-y-6 text-start">
          {[a, b].map((t) => (
            <div key={t.name}>
              <div className="mb-2 flex items-center justify-between font-bold">
                <span>{t.name}</span>
                <span className="text-gold">{t.score} نقطة</span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full fire-gradient transition-all duration-1000"
                  style={{ width: `${(t.score / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <Button
          size="lg"
          className="mt-12"
          onClick={() => {
            reset();
            navigate({ to: "/create-game" });
          }}
        >
          <RotateCcw className="ms-2 h-5 w-5" /> يلا جولة جديدة
        </Button>
      </main>
    </div>
  );
}
