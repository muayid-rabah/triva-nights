import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { fetchPackages } from "@/lib/db";

export const Route = createFileRoute("/packages")({
  head: () => ({
    meta: [
      { title: "الباقات | لمّة جيم" },
      { name: "description", content: "اختر باقتك: لعبة وحدة، ٣ ألعاب، اشتراك شهري، أو باقة بطولة." },
      { property: "og:title", content: "باقات لمّة جيم" },
      { property: "og:description", content: "باقات مرنة تناسب الديوانية والتجمعات العائلية." },
    ],
  }),
  component: PackagesPage,
});

function PackagesPage() {
  const { data: packages = [], isLoading } = useQuery({
    queryKey: ["packages"],
    queryFn: fetchPackages,
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-center text-4xl text-primary">الباقات</h1>
        <p className="mt-3 text-center text-muted-foreground">
          لعبة تجريبية مجانية لكل مستخدم جديد، وبعدها اختر الباقة اللي تناسب لمّتكم.
        </p>

        {isLoading ? (
          <p className="mt-10 text-center text-muted-foreground">جاري التحميل…</p>
        ) : (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {packages.map((p) => (
              <div
                key={p.id}
                className="card-hover relative flex flex-col rounded-3xl border border-border bg-card p-6"
              >
                {p.badge && (
                  <span className="absolute -top-3 start-6 rounded-full fire-gradient px-3 py-1 text-xs font-bold text-primary-foreground">
                    {p.badge}
                  </span>
                )}
                <h2 className="text-2xl">{p.name}</h2>
                <p className="mt-2 min-h-12 text-sm text-muted-foreground">{p.description}</p>
                <p className="mt-4 font-display text-3xl text-gold">
                  {p.price} <span className="text-base">{p.currency}</span>
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-success" />
                    {p.games_count > 100 ? "ألعاب غير محدودة" : `${p.games_count} لعبة كاملة`}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-success" /> ٦ فئات و ٣٦ سؤال لكل لعبة
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-success" /> ٥ وسائل مساعدة لكل فريق
                  </li>
                </ul>
                <Button
                  className="mt-6 w-full"
                  onClick={() => toast.info("الدفع بيتفعل قريباً", { description: "حالياً تقدر تجرب اللعبة المجانية." })}
                >
                  <Sparkles className="ms-1 h-4 w-4" /> اشترِ الباقة
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
