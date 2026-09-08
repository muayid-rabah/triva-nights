import { createFileRoute } from "@tanstack/react-router";
import { Gift, Heart, Send } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/gifts")({
  head: () => ({
    meta: [
      { title: "قسم الهدايا | لمّة جيم" },
      { name: "description", content: "اهدِ أحبابك بطاقة لعبة كاملة مع رسالة خاصة منك." },
      { property: "og:title", content: "اهدِ أحبابك لعبة" },
      { property: "og:description", content: "بطاقة هدية تصل على البريد مع رسالتك." },
    ],
  }),
  component: GiftsPage,
});

function GiftsPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-3xl border border-gold/40 bg-surface p-8 text-center">
          <Gift className="mx-auto h-14 w-14 text-gold" />
          <h1 className="mt-4 text-4xl text-gold">اهدِ أحبابك</h1>
          <p className="mt-3 text-muted-foreground">
            أرسل بطاقة لعبة كاملة لشخص تحبه، ويوصله رابط اللعبة مع رسالتك.
          </p>
        </div>

        <form
          className="mt-8 rounded-3xl border border-border bg-card p-6"
          onSubmit={(e) => {
            e.preventDefault();
            toast.success("جهزنا بطاقتك", { description: "الدفع بيتفعل قريباً وبتوصل الهدية مباشرة." });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input required placeholder="اسم المستلم" aria-label="اسم المستلم" />
            <Input required type="email" placeholder="بريد المستلم" aria-label="بريد المستلم" />
          </div>
          <Textarea className="mt-4" placeholder="رسالتك الخاصة (اختياري)" aria-label="رسالتك" />
          <Button type="submit" className="mt-4 w-full">
            <Send className="ms-1 h-4 w-4" /> أرسل الهدية
          </Button>
          <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Heart className="h-3.5 w-3.5 text-primary" /> هدية تنفع للأعياد والمناسبات والدواوين
          </p>
        </form>
      </main>
      <SiteFooter />
    </div>
  );
}
