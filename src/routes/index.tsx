import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Gavel,
  Gift,
  Hand,
  HandMetal,
  Phone,
  Play,
  Search,
  Shell,
  Skull,
  Shovel,
  Target,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CategoryCard } from "@/components/category-card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { fetchCategories } from "@/lib/db";
import { HELPS, type HelpKey } from "@/lib/game-types";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { ARCADE_GAMES, type ArcadeGameSlug } from "@/lib/arcade-catalog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "طقّها | لعبة القعدة الأردنية" },
      {
        name: "description",
        content:
          "لعبة أسئلة جماعية عربية للديوانيات والتجمعات العائلية: اختر ٦ فئات، تحدَّ فريقك المنافس، واستخدم ٥ وسائل مساعدة.",
      },
      { property: "og:title", content: "طقّها — لعبة الأسئلة الجماعية" },
      {
        property: "og:description",
        content: "٦ فئات، ٣٦ سؤال، ووسائل مساعدة تقلب اللعبة. جاهزين تلعبون؟",
      },
    ],
  }),
  component: HomePage,
});

const HELP_ICONS: Record<HelpKey, typeof Hand> = {
  trap: Shell,
  rest: Hand,
  two: HandMetal,
  dig: Shovel,
  call: Phone,
};

const GAME_MARKS = { taqha: Target, huroof: Type, outsider: Search, mafia: Skull, auction: Gavel } satisfies Record<ArcadeGameSlug, typeof Target>;

const FAQ = [
  { q: "كيف أنشئ لعبة؟", a: "ادخل على صفحة إنشاء لعبة، اختر ٦ فئات، سمِّ الفريقين، واضغط ابدأ اللعب." },
  { q: "هل أقدر أجرب اللعبة قبل الشراء؟", a: "أكيد، كل مستخدم جديد عنده لعبة تجريبية مجانية كاملة." },
  { q: "هل تتكرر الأسئلة؟", a: "نحرص على تنويع الأسئلة، ومكتبة الفئات تتوسع بشكل دوري بأسئلة جديدة." },
  { q: "إذا وقفت اللعبة ورجعت لها لاحقاً؟", a: "اللعبة تنحفظ في المتصفح وتقدر تكمل من نفس النقطة." },
  { q: "كم نقطة لكل سؤال؟", a: "كل فئة فيها ٦ أسئلة بنقاط من ١٠٠ إلى ٦٠٠، وكل ما زادت النقاط صعب السؤال." },
  { q: "قديش الوقت للسؤال؟", a: "معكم ٢٠ ثانية، وبإمكانكم توقفوا الوقت بوسيلة خذوا نفس." },
];

function HomePage() {
  const [railPaused, setRailPaused] = useState(false);
  const [comment, setComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
  const { data: comments = [] } = useQuery({
    queryKey: ["public-comments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("comments").select("*").order("created_at", { ascending: false }).limit(6);
      // Fresh Supabase projects may not have the optional community migration
      // applied yet. The home page must still render normally in that state.
      if (error) return [];
      return data;
    },
  });

  async function submitComment(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSendingComment(true);
    const { error } = await supabase.rpc("submit_comment", { p_body: comment });
    setSendingComment(false);
    if (error) {
      toast.error(error.message.includes("COMMENT_BLOCKED") ? "خلّينا نحافظ على حكي مرتب بالقعدة." : "ما اننشر التعليق", { description: error.message.includes("COMMENT_BLOCKED") ? "عدّل الكلمات وحاول مرة ثانية." : error.message });
      return;
    }
    setComment("");
    await queryClient.invalidateQueries({ queryKey: ["public-comments"] });
    toast.success("وصل تعليقك، يسعدك!");
  }

  useEffect(() => {
    if (railPaused || categories.length === 0) return;
    const timer = window.setInterval(() => {
      const rail = railRef.current;
      if (!rail) return;
      const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 12;
      rail.scrollTo({ left: atEnd ? 0 : rail.scrollLeft + 172, behavior: "smooth" });
    }, 2600);
    return () => window.clearInterval(timer);
  }, [railPaused, categories.length]);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="heritage-hero relative overflow-hidden px-4 pb-16 pt-14 text-center">
          <div className="relative mx-auto max-w-3xl">
            <div className="taqha-hero-title">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-bold text-primary">لمّة الدار، والتحدّي حاضر ✦</span>
              <h1 className="mt-5 font-display text-5xl leading-tight text-primary sm:text-7xl">طقّها!؟</h1>
              <p className="mt-1 font-display text-2xl text-gold sm:text-3xl">طقّها؟ ولا لسا؟</p>
            </div>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
              منصّة القعدة لأربع ألعاب مختلفة: معلومات، حروف، غموض، ومواجهة. اختاروا اللعبة اللي تناسب لمّتكم وابدأوا فوراً.
            </p>

            <div className="game-launcher-rail mt-9" aria-label="اختاروا لعبة">
              {ARCADE_GAMES.map((game) => {
                const Icon = GAME_MARKS[game.slug];
                return (
                  <Link key={game.slug} to="/arcade" search={{ game: game.slug }} className={`game-launcher game-launcher-${game.accent}`}>
                    <span className="game-launcher-icon"><Icon /></span>
                    <strong>{game.name}</strong>
                    <small>{game.tagline}</small>
                  </Link>
                );
              })}
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="heritage-button h-14 px-8 text-lg">
                <Link to="/arcade" search={{ game: "taqha" }}>
                  <Play className="ms-2 h-5 w-5" /> ابدأ لعبتك المجانية
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 px-6 text-base">
                <Link to="/games">شوف كل الألعاب</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* دليل الألعاب */}
        <section className="mx-auto max-w-5xl px-4 py-12 text-center">
          <h2 className="text-3xl">شو بنلعب الليلة؟</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            كل لعبة إلها طريقتها، لكن الكل يشتغل على نفس القعدة: قواعد قصيرة، أسماء واضحة، وحماس بدون تعقيد.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ARCADE_GAMES.map((game) => {
              const Icon = GAME_MARKS[game.slug];
              const how = game.slug === "taqha" ? "فريقان يختاران الفئات ويصعدان بلوحة النقاط." : game.slug === "huroof" ? "جاوبوا، خذوا خلية، ووصلوا خط فريقكم أولاً." : game.slug === "outsider" ? "الكل يعرف السر إلا لاعب واحد؛ اكتشفوه قبل ما يهرب." : game.slug === "mafia" ? "ليلة أدوار سرية، نقاش وتصويت حتى يحسم أحد الفريقين." : "زايدوا على التحدّي وثبّتوا التزامكم قبل أن ينسحب الخصم.";
              return <Link key={game.slug} to="/arcade" search={{ game: game.slug }} className={`heritage-card card-hover rounded-3xl border border-border bg-card p-5 text-start game-guide-${game.accent}`}>
                <span className="help-emblem grid h-12 w-12 place-items-center rounded-full bg-surface-2"><Icon className="h-6 w-6 text-gold" /></span>
                <h3 className="mt-4 text-xl">{game.name}</h3><p className="mt-2 min-h-20 text-sm leading-6 text-muted-foreground">{how}</p>
                <span className="mt-4 inline-flex items-center text-sm font-bold text-gold">اعرف القواعد والعب <ChevronDown className="me-1 h-4 w-4 -rotate-90" /></span>
              </Link>;
            })}
          </div>
        </section>

        {/* شرح الفئات */}
        <section className="mx-auto max-w-7xl px-4 py-12">
          <h2 className="text-center text-3xl">شرح الفئات</h2>
          <p className="mt-3 text-center text-muted-foreground">
            مكتبة فئات واسعة تتوسع باستمرار — من الثقافة العامة للرياضة والأفلام وفئات الأطفال.
          </p>
          <div ref={railRef} dir="ltr" onMouseEnter={() => setRailPaused(true)} onMouseLeave={() => setRailPaused(false)} onTouchStart={() => setRailPaused(true)} onTouchEnd={() => setRailPaused(false)} className="category-rail mt-8 flex snap-x gap-3 overflow-x-auto pb-4">
            {categories.slice(0, 12).map((c) => (
              <div key={c.id} dir="rtl" className="w-40 shrink-0 snap-start">
                <CategoryCard category={c} />
              </div>
            ))}
          </div>
        </section>

        {/* وسائل المساعدة */}
        <section className="mx-auto max-w-7xl px-4 py-12">
          <h2 className="text-center text-3xl">فزعات القعدة</h2>
          <p className="mt-3 text-center text-muted-foreground">
            خمس أدوات، كل وحدة تستخدمها مرة وحدة بس طوال اللعبة — استخدمها بذكاء.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {HELPS.map((h) => {
              const Icon = HELP_ICONS[h.key];
              return (
                <div key={h.key} className="heritage-card card-hover rounded-3xl border border-border bg-card p-5 text-center">
                  <span className="help-emblem mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-2">
                    <Icon className={`h-7 w-7 ${h.color}`} />
                  </span>
                  <h3 className="mt-4 text-lg">{h.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{h.short}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* اهدِ أحبابك */}
        <section className="mx-auto max-w-5xl px-4 py-12">
          <div className="heritage-feature flex flex-col items-center gap-6 rounded-3xl border border-gold/40 bg-surface p-8 md:flex-row md:justify-between">
            <div className="text-center md:text-start">
              <h2 className="text-3xl text-gold">اهدِ أحبابك</h2>
              <p className="mt-2 max-w-md text-muted-foreground">
                اشترِ اللعبة هدية لشخص تحبه، وتوصله بطاقة هدية مع رسالتك الخاصة.
              </p>
            </div>
            <Gift className="h-20 w-20 text-gold" />
            <Button asChild variant="secondary" className="bg-gold text-gold-foreground hover:bg-gold/90">
              <Link to="/gifts">قسم الهدايا</Link>
            </Button>
          </div>
        </section>

        {/* تعليقات القعدة */}
        <section className="mx-auto max-w-5xl px-4 py-12">
          <h2 className="text-center text-3xl">تعليقات القعدة</h2>
          <p className="mt-2 text-center text-muted-foreground">رأيك مكانه هون — التعليق للحسابات المسجّلة فقط، وفلترنا محافظ على حكي القعدة المرتّب.</p>
          {user ? (
            <form onSubmit={submitComment} className="heritage-card mx-auto mt-7 max-w-3xl rounded-3xl border border-border bg-card p-4">
              <Textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={320} required minLength={3} placeholder="شو رأيك باللعبة؟ احكيلنا…" className="min-h-24 resize-none" />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{comment.length}/320</span>
                <Button type="submit" disabled={sendingComment || comment.trim().length < 3}>{sendingComment ? "بننشر تعليقك…" : "انشر تعليقك"}</Button>
              </div>
            </form>
          ) : (
            <div className="mt-7 text-center"><Button asChild variant="outline"><Link to="/auth">سجّل دخولك عشان تترك رأيك</Link></Button></div>
          )}
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {comments.length ? comments.map((item) => (
              <article key={item.id} className="heritage-card rounded-3xl border border-border bg-card p-6">
                <p className="leading-8 text-foreground">“{item.body}”</p>
                <footer className="mt-4 font-bold text-primary">{item.display_name}</footer>
              </article>
            )) : <p className="col-span-full rounded-3xl border border-dashed border-border bg-card/70 p-8 text-center text-muted-foreground">أول تعليق بالقعدة ممكن يكون منك ✦</p>}
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-12">
          <h2 className="text-center text-3xl">الأسئلة الشائعة</h2>
          <Accordion type="single" collapsible className="mt-8">
            {FAQ.map((item) => (
              <AccordionItem key={item.q} value={item.q} className="rounded-2xl border border-border bg-card px-4">
                <AccordionTrigger className="text-start font-bold">{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-5xl px-4 py-16 text-center">
          <h2 className="text-4xl text-primary">جاهزين تلعبون؟</h2>
          <p className="mt-3 text-muted-foreground">أول جولة علينا — جيبوا القعدة وخلوها حماس.</p>
          <Button asChild size="lg" className="mt-6 h-14 px-10 text-lg">
            <Link to="/create-game">إنشاء لعبة</Link>
          </Button>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
