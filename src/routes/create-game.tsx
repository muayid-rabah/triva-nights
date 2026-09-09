import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/create-game")({
  head: () => ({
    meta: [
      { title: "جهّز القعدة | طقّها" },
      { name: "description", content: "اختر ٦ فئات، سمِّ الفريقين، وابدأ التحدي بـ ٣٦ سؤال." },
      { property: "og:title", content: "أنشئ لعبتك الآن" },
      { property: "og:description", content: "مكتبة فئات واسعة تتوسع باستمرار." },
    ],
  }),
  component: CreateGamePage,
});

function CreateGamePage() {
  const navigate = useNavigate();
  const { startGame } = useGame();
  const { user, loading: authLoading } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [teamA, setTeamA] = useState("الفريق الأول");
  const [teamB, setTeamB] = useState("الفريق الثاني");
  const [starter, setStarter] = useState<0 | 1>(0);
  const [starting, setStarting] = useState(false);

  const { data: access, isLoading: accessLoading, refetch: refetchAccess } = useQuery({
    queryKey: ["game-access", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("games_left, phone").eq("id", user!.id).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth", replace: true });
  }, [authLoading, user, navigate]);

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
    if (!ready || !user) return;
    if (!access?.phone) {
      toast.info("ثبّت رقم تلفونك أول", { description: "بدنا رقمك قبل أول لعبة عشان تظل المحاولات عادلة." });
      navigate({ to: "/profile" });
      return;
    }
    setStarting(true);
    try {
      const { error: creditError } = await supabase.rpc("consume_game_credit");
      if (creditError) {
        if (creditError.message.includes("NO_GAMES_LEFT")) {
          toast.info("خلصت اللعبتين المجانيات", { description: "اختار باقة جديدة وكمّل القعدة." });
          navigate({ to: "/packages" });
          return;
        }
        if (creditError.message.includes("PHONE_REQUIRED")) {
          toast.info("ثبّت رقم تلفونك أول");
          navigate({ to: "/profile" });
          return;
        }
        throw creditError;
      }
      await refetchAccess();
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
        turn: starter,
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

  if (authLoading || !user || accessLoading) {
    return <div className="min-h-screen"><SiteHeader /><p className="py-24 text-center text-muted-foreground">بنجهّز حسابك…</p></div>;
  }

  return (
    <div className="min-h-screen pb-28">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-center text-4xl text-primary">جهّز القعدة</h1>
        <p className="mt-2 text-center text-muted-foreground">
          اختاروا ٦ فئات، سمّوا الفريقين، وباقي الحماس علينا.
        </p>

        <div className="mx-auto mt-5 flex max-w-xl items-center justify-between rounded-2xl border border-gold/40 bg-surface px-4 py-3 text-sm">
          <span>رصيدك الحالي: <b className="text-gold">{access?.games_left ?? 0} لعبة</b></span>
          {(access?.games_left ?? 0) === 0 ? <Button asChild size="sm" variant="outline"><Link to="/packages">اشترِ لعبة جديدة</Link></Button> : <span className="text-muted-foreground">إلك لعبتين مجاناً بالحساب</span>}
        </div>

        <div className="mx-auto mt-8 flex max-w-2xl items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute end-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="دوّروا على فئة"
              className="h-12 rounded-2xl pe-11 text-base"
              aria-label="ابحث عن فئة"
            />
          </div>
          <Button variant="secondary" className="h-12 rounded-2xl">
            <ShoppingBag className="ms-1 h-4 w-4" /> فئات مشتراتي
          </Button>
        </div>

        <div className="sticky top-[68px] z-30 mt-6 rounded-2xl border border-border bg-background/95 px-4 py-3 text-center text-sm font-bold backdrop-blur">
          اخترتوا <span className="text-primary">{selected.length}</span> من ٦ فئات
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
          <h2 className="text-center text-2xl">سمّوا الفرق</h2>
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
          <div className="mx-auto mt-6 max-w-2xl rounded-2xl bg-surface p-3 text-center">
            <p className="text-sm font-bold text-muted-foreground">مين ببلّش أول جولة؟</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setStarter(0)} className={starter === 0 ? "heritage-primary rounded-xl px-3 py-2 font-bold text-primary-foreground" : "rounded-xl bg-surface-2 px-3 py-2 font-bold"}>{teamA || "الفريق الأول"}</button>
              <button type="button" onClick={() => setStarter(1)} className={starter === 1 ? "heritage-primary rounded-xl px-3 py-2 font-bold text-primary-foreground" : "rounded-xl bg-surface-2 px-3 py-2 font-bold"}>{teamB || "الفريق الثاني"}</button>
            </div>
          </div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Button
            className="h-12 flex-1 text-lg"
            disabled={!ready || starting || (access?.games_left ?? 0) === 0}
            onClick={start}
          >
            {starting ? "بنجهّز الجولة…" : (access?.games_left ?? 0) === 0 ? "اشترِ لعبة جديدة" : "يلا نبدأ"}
          </Button>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
