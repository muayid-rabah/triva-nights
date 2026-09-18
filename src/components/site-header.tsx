import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  Gavel,
  Gamepad2,
  Gift,
  LogIn,
  Plus,
  Search,
  Skull,
  Target,
  Trophy,
  Type,
  User2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/packages", label: "الباقات" },
  { to: "/contact", label: "تواصل معنا" },
] as const;

const GAME_NAV = [
  { to: "/arcade", search: { game: "taqha" }, label: "قدّ التحدي", Icon: Target },
  { to: "/arcade", search: { game: "huroof" }, label: "حروف", Icon: Type },
  { to: "/arcade", search: { game: "outsider" }, label: "مين برا السالفة", Icon: Search },
  { to: "/arcade", search: { game: "mafia" }, label: "مافيا", Icon: Skull },
  { to: "/arcade", search: { game: "auction" }, label: "المزاد", Icon: Gavel },
  { to: "/arcade", search: { game: "auction-billion" }, label: "مزاد المليار", Icon: Trophy },
] as const;

export function Brand() {
  return (
    <Link
      to="/"
      className="brand-lockup flex shrink-0 items-center gap-2"
      aria-label="قدّ التحدي - الصفحة الرئيسية"
    >
      <span
        className="brand-mark grid h-10 w-10 place-items-center sm:h-11 sm:w-11"
        aria-hidden="true"
      >
        <svg viewBox="0 0 64 64" className="h-9 w-9 sm:h-10 sm:w-10">
          <circle cx="32" cy="32" r="23" fill="currentColor" opacity=".1" />
          <circle cx="32" cy="32" r="18.5" fill="none" stroke="currentColor" strokeWidth="2.25" />
          <circle
            cx="32"
            cy="35"
            r="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            opacity=".75"
          />
          <circle cx="32" cy="35" r="2.5" fill="currentColor" />
          <path
            d="m21 18 17 17m-1-16 7 7-6 6-7-7zM19 40l5 5m16-5-5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="brand-dot" />
        <i className="brand-impact-ring" />
      </span>
      <span className="brand-gradient font-display text-lg font-black leading-none tracking-tight sm:text-xl">
        قدّ التحدي
        <span className="block text-[10px] font-bold tracking-normal sm:text-[11px]">
          لَمّة وتحدّي
        </span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const { user } = useAuth();
  const [gamesOpen, setGamesOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gamesOpen) return;
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setGamesOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setGamesOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [gamesOpen]);

  return (
    <header
      className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur"
      style={{ paddingTop: "var(--safe-area-top, 0px)" }}
    >
      {/* 1. Mobile & Tablet Compact App Bar (< 1024px) */}
      <div className="flex h-14 items-center justify-between px-4 lg:hidden">
        <Brand />

        <div className="flex items-center gap-1.5">
          {user ? (
            <Button
              asChild
              size="icon"
              variant="ghost"
              className="h-9 w-9 text-gold"
              aria-label="حسابي"
            >
              <Link to="/profile">
                <User2 className="h-5 w-5" />
              </Link>
            </Button>
          ) : (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-9 px-3 text-xs font-bold text-gold"
            >
              <Link to="/auth">
                <LogIn className="ms-1 h-4 w-4" /> دخول
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* 2. Desktop Full Header (>= 1024px) */}
      <div className="mx-auto hidden max-w-7xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 lg:grid">
        <Brand />

        <nav className="flex min-w-0 items-center justify-center gap-6">
          <div
            ref={menuRef}
            className="relative"
            onMouseEnter={() => setGamesOpen(true)}
            onMouseLeave={() => setGamesOpen(false)}
          >
            <button
              type="button"
              className="flex items-center gap-1 text-sm font-bold text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:text-primary"
              aria-expanded={gamesOpen}
              aria-haspopup="menu"
              onClick={() => setGamesOpen((val) => !val)}
            >
              العب{" "}
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${gamesOpen ? "rotate-180 text-gold" : ""}`}
              />
            </button>
            {gamesOpen && (
              <div
                className="games-menu absolute start-1/2 top-full mt-2 w-64 -translate-x-1/2 rounded-2xl border border-gold/45 bg-popover/95 p-2 shadow-2xl backdrop-blur-md z-50 before:absolute before:-top-3 before:start-0 before:end-0 before:h-3 before:content-['']"
                role="menu"
                dir="rtl"
              >
                <Link
                  to="/games"
                  className="mb-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-extrabold text-gold hover:bg-gold/15 transition-colors"
                  onClick={() => setGamesOpen(false)}
                  role="menuitem"
                >
                  <Gamepad2 className="h-4 w-4 shrink-0" /> كل الألعاب
                </Link>
                {GAME_NAV.map(({ to, search, label, Icon }) => (
                  <Link
                    key={label}
                    to={to}
                    search={search}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold text-foreground transition-colors hover:bg-primary/15 hover:text-primary"
                    onClick={() => setGamesOpen(false)}
                    role="menuitem"
                  >
                    <Icon className="h-4 w-4 text-gold shrink-0" /> {label}
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
        </div>
      </div>
    </header>
  );
}
