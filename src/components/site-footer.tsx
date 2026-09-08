import { Apple, Instagram, Music2, Smartphone, Twitter, Youtube } from "lucide-react";
import { Brand } from "./site-header";

const SOCIAL = [
  { icon: Instagram, label: "انستغرام" },
  { icon: Music2, label: "تيك توك" },
  { icon: Youtube, label: "يوتيوب" },
  { icon: Twitter, label: "إكس" },
];

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border/60 bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between">
        <Brand />

        <div className="flex flex-wrap items-center gap-3">
          {SOCIAL.map(({ icon: Icon, label }) => (
            <span
              key={label}
              title={label}
              className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              <Icon className="h-5 w-5" />
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <Apple className="h-4 w-4" /> آيفون
          </span>
          <span className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <Smartphone className="h-4 w-4" /> أندرويد
          </span>
        </div>
      </div>
      <p className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        جميع الحقوق محفوظة © لمّة جيم ٢٠٢٦
      </p>
    </footer>
  );
}
