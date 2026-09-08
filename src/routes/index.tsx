import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Gift,
  Hand,
  HandMetal,
  Phone,
  Play,
  Shell,
  Shovel,
  Sparkles,
} from "lucide-react";
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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "لمّة جيم | ٦ فئات، ٣٦ سؤال، وتحدي ما ينتهي" },
      {
        name: "description",
        content:
          "لعبة أسئلة جماعية عربية للديوانيات والتجمعات العائلية: اختر ٦ فئات، تحدَّ فريقك المنافس، واستخدم ٥ وسائل مساعدة.",
      },
      { property: "og:title", content: "لمّة جيم — لعبة الأسئلة الجماعية" },
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

const MODES = ["لمّة جيم", "لمّة الكبير", "كأس العالم", "إنشاء لعبة", "إنشاء بطولة"];

const FAQ = [
  { q: "كيف أنشئ لعبة؟", a: "ادخل على صفحة إنشاء لعبة، اختر ٦ فئات، سمِّ الفريقين، واضغط ابدأ اللعب." },
  { q: "هل أقدر أجرب اللعبة قبل الشراء؟", a: "أكيد، كل مستخدم جديد عنده لعبة تجريبية مجانية كاملة." },
  { q: "هل تتكرر الأسئلة؟", a: "نحرص على تنويع الأسئلة، ومكتبة الفئات تتوسع بشكل دوري بأسئلة جديدة." },
  { q: "إذا وقفت اللعبة ورجعت لها لاحقاً؟", a: "اللعبة تنحفظ في المتصفح وتقدر تكمل من نفس النقطة." },
  { q: "كم نقطة لكل سؤال؟", a: "كل فئة فيها ٦ أسئلة بنقاط من ١٠٠ إلى ٦٠٠، وكل ما زادت النقاط صعب السؤال." },
  { q: "كم الوقت المحدد للإجابة؟", a: "٣٠ ثانية لكل سؤال، وتقدر توقف المؤقت بوسيلة استريح." },
];

function HomePage() {
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden px-4 pb-16 pt-14 text-center">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background:
                "radial-gradient(circle at 50% -10%, color-mix(in oklab, var(--primary) 35%, transparent), transparent 55%)",
            }}
          />
          <div className="relative mx-auto max-w-3xl">
            <h1 className="font-display text-5xl leading-tight text-primary sm:text-7xl">لمّة جيم</h1>
            <p className="mt-4 text-lg text-muted-foreground">
              ٦ فئات، ٣٦ سؤال، ومعك ٥ وسائل مساعدة — تحدي عائلي على شاشة وحدة.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {MODES.map((m) => (
                <span
                  key={m}
                  className="rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-bold text-muted-foreground"
                >
                  {m}
                </span>
              ))}
            </div>

            <Button asChild size="lg" className="mt-8 h-14 px-8 text-lg">
              <Link to="/create-game">
                <Play className="ms-2 h-5 w-5" /> ابدأ لعبتك المجانية
              </Link>
            </Button>
          </div>
        </section>

        {/* ما هي اللعبة */}
        <section className="mx-auto max-w-5xl px-4 py-12 text-center">
          <h2 className="text-3xl">وش هي لمّة جيم؟</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            لعبة أسئلة جماعية تجمع أهل البيت والربع: فريقين، كل فريق يختار ٣ فئات، والأسئلة تتصاعد
            بالنقاط والصعوبة لين يطلع الفائز.
          </p>
          <div className="mx-auto mt-8 aspect-video w-full max-w-3xl overflow-hidden rounded-3xl border border-border">
            <iframe
              className="h-full w-full"
              src="https://www.youtube.com/embed/dQw4w9WgXcQ"
              title="فيديو تعريفي عن لمّة جيم"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
              allowFullScreen
            />
          </div>
          <Button asChild className="mt-6">
            <Link to="/packages">
              <Sparkles className="ms-2 h-4 w-4" /> اشترِ باقة والعب
            </Link>
          </Button>
        </section>

        {/* شرح الفئات */}
        <section className="mx-auto max-w-7xl px-4 py-12">
          <h2 className="text-center text-3xl">شرح الفئات</h2>
          <p className="mt-3 text-center text-muted-foreground">
            مكتبة فئات واسعة تتوسع باستمرار — من الثقافة العامة للرياضة والأفلام وفئات الأطفال.
          </p>
          <div className="mt-8 flex snap-x gap-3 overflow-x-auto pb-4">
            {categories.slice(0, 12).map((c) => (
              <div key={c.id} className="w-40 shrink-0 snap-start">
                <CategoryCard category={c} />
              </div>
            ))}
          </div>
        </section>

        {/* وسائل المساعدة */}
        <section className="mx-auto max-w-7xl px-4 py-12">
          <h2 className="text-center text-3xl">وسائل المساعدة</h2>
          <p className="mt-3 text-center text-muted-foreground">
            خمس أدوات، كل وحدة تستخدمها مرة وحدة بس طوال اللعبة — استخدمها بذكاء.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {HELPS.map((h) => {
              const Icon = HELP_ICONS[h.key];
              return (
                <div key={h.key} className="card-hover rounded-3xl border border-border bg-card p-5 text-center">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-2">
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
          <div className="flex flex-col items-center gap-6 rounded-3xl border border-gold/40 bg-surface p-8 md:flex-row md:justify-between">
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

        {/* آراء المستخدمين */}
        <section className="mx-auto max-w-7xl px-4 py-12">
          <h2 className="text-center text-3xl">شفهم وهم يلعبون</h2>
          <div className="mt-8 grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-7">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className="group relative aspect-square overflow-hidden rounded-full bg-surface-2 transition-transform hover:scale-105"
              >
                <span className="grid h-full w-full place-items-center text-3xl">🎉</span>
                <span className="absolute inset-0 grid place-items-center bg-background/70 opacity-0 transition-opacity group-hover:opacity-100">
                  <Play className="h-7 w-7 text-primary" />
                </span>
              </div>
            ))}
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
          <p className="mt-3 text-muted-foreground">لعبتك الأولى علينا — جرب وشوف اللمّة كيف تنقلب.</p>
          <Button asChild size="lg" className="mt-6 h-14 px-10 text-lg">
            <Link to="/create-game">إنشاء لعبة</Link>
          </Button>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
