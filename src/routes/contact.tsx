import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "تواصل معنا | لمّة جيم" },
      { name: "description", content: "عندك سؤال أو اقتراح فئة جديدة؟ راسلنا وبنرد عليك بأسرع وقت." },
      { property: "og:title", content: "تواصل مع لمّة جيم" },
      { property: "og:description", content: "استفسارات، اقتراحات فئات، وشراكات." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [sent, setSent] = useState(false);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-center text-4xl text-primary">تواصل معنا</h1>
        <p className="mt-3 text-center text-muted-foreground">
          عندك اقتراح فئة جديدة أو استفسار؟ اكتب لنا.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-[1fr_320px]">
          <form
            className="rounded-3xl border border-border bg-card p-6"
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
              toast.success("وصلتنا رسالتك، بنرد عليك قريب");
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input required placeholder="الاسم" aria-label="الاسم" />
              <Input required type="email" placeholder="البريد الإلكتروني" aria-label="البريد الإلكتروني" />
            </div>
            <Textarea required className="mt-4 min-h-32" placeholder="رسالتك" aria-label="رسالتك" />
            <Button type="submit" className="mt-4 w-full sm:w-auto">
              إرسال الرسالة
            </Button>
            {sent && <p className="mt-3 text-sm text-success">تم الإرسال، شكراً لك!</p>}
          </form>

          <aside className="space-y-3">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
              <Mail className="h-5 w-5 text-primary" /> hello@lammahgame.com
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
              <Phone className="h-5 w-5 text-primary" /> ‎+965 5000 0000
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
              <MessageCircle className="h-5 w-5 text-primary" /> رد خلال ٢٤ ساعة
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
