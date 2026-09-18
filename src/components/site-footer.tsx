import { Apple, Instagram, Music2, Smartphone, Twitter, Youtube } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Brand } from "./site-header";

const SOCIAL = [
  { icon: Instagram, label: "انستغرام" },
  { icon: Music2, label: "تيك توك" },
  { icon: Youtube, label: "يوتيوب" },
  { icon: Twitter, label: "إكس" },
];

export function SiteFooter() {
  return (
    <footer className="heritage-footer relative mt-6 border-t border-border/60 bg-surface/95 lg:mt-16">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-5 sm:py-6 lg:flex-row lg:items-center lg:justify-between lg:py-8 text-center sm:text-start">
        <Brand />

        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {SOCIAL.map(({ icon: Icon, label }) => (
            <span
              key={label}
              title={label}
              className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-foreground transition-colors hover:bg-primary hover:text-primary-foreground sm:h-10 sm:w-10"
            >
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
          ))}
        </div>

        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <span className="flex items-center gap-1.5 rounded-xl bg-surface-2 px-2.5 py-1.5 text-xs">
            <Apple className="h-3.5 w-3.5" /> آيفون
          </span>
          <span className="flex items-center gap-1.5 rounded-xl bg-surface-2 px-2.5 py-1.5 text-xs">
            <Smartphone className="h-3.5 w-3.5" /> أندرويد
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-border/60 py-3 px-4 text-center text-xs text-muted-foreground">
        <span>كل الحقوق محفوظة © قدّ التحدي ٢٠٢٦</span>
        <Link to="/privacy" className="font-bold text-primary hover:underline">
          سياسة الخصوصية
        </Link>
        <span>•</span>
        <Link to="/delete-account" className="text-muted-foreground hover:text-primary hover:underline">
          حذف الحساب والبيانات
        </Link>
      </div>
    </footer>
  );
}
