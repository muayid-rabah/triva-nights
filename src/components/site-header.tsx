import { Link } from "@tanstack/react-router";
import { ChevronDown, Gamepad2, Gift, LogIn, Menu, Moon, Plus, Search, Skull, Sun, Target, Type, User2, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";

const NAV = [
  { to: "/packages", label: "الباقات" },
  { to: "/contact", label: "تواصل معنا" },
] as const;

const GAME_NAV = [
  { to: "/arcade", search: { game: "taqha" }, label: "طقّها", Icon: Target },
  { to: "/arcade", search: { game: "huroof" }, label: "حروف", Icon: Type },
  { to: "/arcade", search: { game: "outsider" }, label: "مين برا السالفة", Icon: Search },
  { to: "/arcade", search: { game: "mafia" }, label: "مافيا", Icon: Skull },
] as const;

export function Brand() {
  return (
    <Link to="/" className="brand-lockup flex shrink-0 items-center gap-2" aria-label="طقّها - الصفحة الرئيسية">
      <span className="brand-mark grid h-11 w-11 place-items-center" aria-hidden="true">
        <svg viewBox="0 0 64 64" className="h-10 w-10">
          <circle cx="32" cy="32" r="23" fill="currentColor" opacity=".1" />
          <circle cx="32" cy="32" r="18.5" fill="none" stroke="currentColor" strokeWidth="2.25" />
          <circle cx="32" cy="35" r="8" fill="none" stroke="currentColor" strokeWidth="2" opacity=".75" />
          <circle cx="32" cy="35" r="2.5" fill="currentColor" />
          <path d="m21 18 17 17m-1-16 7 7-6 6-7-7zM19 40l5 5m16-5-5 5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <i className="brand-impact-ring" />
      </span>
      <span className="brand-gradient font-display text-xl font-black leading-none tracking-tight">
        طقّها
        <span className="block text-[11px] font-bold tracking-normal">لَمّة وتحدّي</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="mx-auto grid max-w-7xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
        <Brand />

        <nav className="hidden min-w-0 items-center justify-center gap-6 md:flex">
          <div className="relative" onMouseEnter={() => setGamesOpen(true)} onMouseLeave={() => setGamesOpen(false)}>
            <button
              className="flex items-center gap-1 text-sm font-bold text-muted-foreground transition-colors hover:text-primary"
              aria-expanded={gamesOpen}
              aria-haspopup="menu"
              onClick={() => setGamesOpen((value) => !value)}
            >
              العب <ChevronDown className={`h-4 w-4 transition-transform ${gamesOpen ? "rotate-180" : ""}`} />
            </button>
            {gamesOpen && (
              <div className="games-menu absolute left-1/2 top-full mt-3 w-60 -translate-x-1/2 rounded-2xl border border-gold/45 p-2 shadow-2xl" role="menu">
                <Link to="/games" className="mb-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-extrabold text-gold hover:bg-gold/10" role="menuitem">
                  <Gamepad2 className="h-4 w-4" /> كل الألعاب
                </Link>
                {GAME_NAV.map(({ to, search, label, Icon }) => (
                  <Link key={label} to={to} search={search} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold text-foreground transition-colors hover:bg-primary/10 hover:text-primary" role="menuitem">
                    <Icon className="h-4 w-4 text-gold" /> {label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-sm font-bold text-muted-foreground transition-colors hover:text-primary"
              activeProps={{ className: "text-primary" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الغامق"}
            title={theme === "dark" ? "الوضع الفاتح" : "الوضع الغامق"}
          >
            {theme === "dark" ? <Sun className="h-5 w-5 text-gold" /> : <Moon className="h-5 w-5 text-primary" />}
          </Button>
          {user ? (
            <>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link to="/packages">
                  <Plus className="ms-1 h-4 w-4" /> اشتر لعبة جديدة
                </Link>
              </Button>
              <Button asChild size="sm" variant="secondary" className="hidden lg:inline-flex">
                <Link to="/gifts">
                  <Gift className="ms-1 h-4 w-4" /> قسم الهدايا
                </Link>
              </Button>
              <Button asChild size="icon" variant="ghost" aria-label="حسابي">
                <Link to="/profile">
                  <User2 className="h-5 w-5" />
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">
                <LogIn className="ms-1 h-4 w-4" /> تسجيل الدخول
              </Link>
            </Button>
          )}
          <button
            className="md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="القائمة"
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-border/60 px-4 py-3 md:hidden">
          <Link to="/games" onClick={() => setOpen(false)} className="block py-2 font-bold text-gold">كل الألعاب</Link>
          {GAME_NAV.map(({ to, search, label }) => (
            <Link key={label} to={to} search={search} onClick={() => setOpen(false)} className="block py-2 pr-3 font-bold text-muted-foreground">
              {label}
            </Link>
          ))}
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="block py-2 font-bold text-muted-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
