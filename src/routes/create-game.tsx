import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, Search, ShoppingBag, Shield, Trophy } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CategoryCard } from "@/components/category-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchCategories, fetchGroups, fetchQuestionsFor } from "@/lib/db";
import { freshHelps, type CategoryRow } from "@/lib/game-types";
import { useGame } from "@/lib/game-store";

export const Route = createFileRoute("/create-game")({
  head: () => ({
    meta: [
      { title: "إنشاء لعبة | لمّة جيم" },
      { name: "description", content: "اختر ٦ فئات، سمِّ الفريقين، وابدأ التحدي بـ ٣٦ سؤال." },
      { property: "og:title", content: "أنشئ لعبتك الآن" },
      { property: "og:description", content: "مكتبة فئات واسعة تتوسع باستمرار." },
    ],
  }),
  component: CreateGamePage,
});

const MODES = ["لمّة جيم", "لمّة الكبير", "كأس العالم", "إنشاء بطولة", "مضاويش"];

function CreateGamePage() {
  const navigate = useNavigate();
  const { startGame } = useGame();
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [starting, setStarting] = useState(false);

  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: fetchGroups });
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    return categories.filter((c) => c.name.includes(search.trim()));
  }, [categories, search]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 6) {
        toast.info("خلصت الفئات الست", { description: "شيل فئة قبل ما تختار وحدة ثانية." });
        return prev;
      }
      return [...prev, id];
    });
  }

  function scrollToGroup(index: number) {
    document.getElementById(`group-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const ready = selected.length === 6 && teamA.trim() && teamB.trim();

  async function start() {
    if (!ready) return;
    setStarting(true);
    try {
      const questions = await fetchQuestionsFor(selected);
      const chosen = selected
        .map((id) => categories.find((c) => c.id === id))
        .filter(Boolean) as CategoryRow[];
      startGame({
        id: crypto.randomUUID(),
        teams: [
          { name: teamA.trim(), score: 0, helps: freshHelps() },
          { name: teamB.trim(), score: 0, helps: freshHelps() },
        ],
        turn: 0,
        categories: chosen,
        questions,
        used: [],
        trapArmedBy: null,
        finished: false,
      });
      navigate({ to: "/play" });
    } catch {
      toast.error("ما قدرنا نجهز اللعبة، حاول مرة ثانية");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="min-h-screen pb-28">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-center text-4xl text-primary">إنشاء لعبة</h1>
        <p className="mt-2 text-center text-muted-foreground">
          اختر ٦ فئات — ٣ لكل فريق — وكل فئة فيها ٦ أسئلة من ١٠٠ إلى ٦٠٠ نقطة.
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {MODES.map((m) => (
            <span
              key={m}
              className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold text-muted-foreground"
            >
              {m}
            </span>
          ))}
        </div>

        <div className="mx-auto mt-8 flex max-w-2xl items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute end-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن فئة معينة"
              className="h-12 rounded-2xl pe-11 text-base"
              aria-label="ابحث عن فئة"
            />
          </div>
          <Button variant="secondary" className="h-12 rounded-2xl">
            <ShoppingBag className="ms-1 h-4 w-4" /> فئات مشتراتي
          </Button>
        </div>

        <div className="sticky top-[68px] z-30 mt-6 rounded-2xl border border-border bg-background/95 px-4 py-3 text-center text-sm font-bold backdrop-blur">
          اخترت <span className="text-primary">{selected.length}</span> من ٦ فئات
        </div>

        {isLoading && <p className="mt-10 text-center text-muted-foreground">جاري تحميل الفئات…</p>}

        {groups.map((g, i) => {
          const items = filtered.filter((c) => c.group_id === g.id);
          if (items.length === 0) return null;
          return (
            <section key={g.id} id={`group-${i}`} className="mt-10 scroll-mt-32">
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl fire-gradient font-display text-primary-foreground">
                  {i + 1}
                </span>
                <h2 className="text-xl">{g.name}</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {items.map((c) => (
                  <CategoryCard
                    key={c.id}
                    category={c}
                    selected={selected.includes(c.id)}
                    disabled={selected.length >= 6}
                    onToggle={() => toggle(c.id)}
                  />
                ))}
              </div>
              {i < groups.length - 1 && (
                <div className="mt-4 text-center">
                  <Button variant="ghost" onClick={() => scrollToGroup(i + 1)}>
                    التالي <ChevronDown className="me-1 h-4 w-4" />
                  </Button>
                </div>
              )}
            </section>
          );
        })}

        <section className="mt-14 rounded-3xl border border-border bg-card p-6">
          <h2 className="text-center text-2xl">حدد معلومات الفرق</h2>
          <div className="mx-auto mt-6 grid max-w-2xl gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-2 rounded-2xl bg-surface-2 px-3">
              <Shield className="h-5 w-5 shrink-0 text-primary" />
              <Input
                value={teamA}
                onChange={(e) => setTeamA(e.target.value)}
                placeholder="اسم الفريق الأول"
                aria-label="اسم الفريق الأول"
                className="border-0 bg-transparent text-base focus-visible:ring-0"
              />
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-surface-2 px-3">
              <Trophy className="h-5 w-5 shrink-0 text-gold" />
              <Input
                value={teamB}
                onChange={(e) => setTeamB(e.target.value)}
                placeholder="اسم الفريق الثاني"
                aria-label="اسم الفريق الثاني"
                className="border-0 bg-transparent text-base focus-visible:ring-0"
              />
            </div>
          </div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Button
            className="h-12 flex-1 text-lg"
            disabled={!ready || starting}
            onClick={start}
          >
            {starting ? "جاري التجهيز…" : "ابدأ اللعب"}
          </Button>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
