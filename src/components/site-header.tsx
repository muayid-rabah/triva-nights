import { Link } from "@tanstack/react-router";
import { Gift, LogIn, Menu, Plus, User2, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/create-game", label: "العب" },
  { to: "/packages", label: "الباقات" },
  { to: "/contact", label: "تواصل معنا" },
] as const;

export function Brand() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2">
      <span className="grid h-10 w-10 place-items-center rounded-2xl fire-gradient text-lg font-black text-primary-foreground">
        ل
      </span>
      <span className="font-display text-xl leading-none text-primary">
        لمّة
        <span className="block text-sm text-foreground">جيم</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="mx-auto grid max-w-7xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
        <Brand />

        <nav className="hidden min-w-0 items-center justify-center gap-6 md:flex">
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
