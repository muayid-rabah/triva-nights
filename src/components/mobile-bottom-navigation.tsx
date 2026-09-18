import { Link, useLocation } from "@tanstack/react-router";
import { Gamepad2, Home, ShoppingBag, Target, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export function MobileBottomNavigation() {
  const location = useLocation();
  const { user } = useAuth();
  const pathname = location.pathname;

  // Hide bottom navigation during active gameplay or onboarding
  if (pathname === "/play" || pathname === "/onboarding") {
    return null;
  }

  const accountTo = user ? "/profile" : "/auth";
  const isHomeActive = pathname === "/";
  const isGamesActive = pathname === "/games";
  const isPackagesActive = pathname === "/packages";
  const isAccountActive = pathname === "/profile" || pathname === "/auth";

  return (
    <nav
      aria-label="شريط التنقل السفلي"
      className="fixed bottom-0 start-0 end-0 z-40 block border-t border-gold/25 bg-[#1A1410]/95 backdrop-blur-lg lg:hidden"
      style={{
        paddingBottom: "calc(var(--safe-area-bottom, 0px) + 0.35rem)",
      }}
    >
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-2">
        {/* 1. الرئيسية */}
        <Link
          to="/"
          className={cn(
            "group flex flex-1 flex-col items-center justify-center gap-1 py-1 text-xs font-bold transition-colors select-none",
            isHomeActive ? "text-gold" : "text-muted-foreground hover:text-foreground",
          )}
          aria-current={isHomeActive ? "page" : undefined}
        >
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-xl transition-all",
              isHomeActive && "bg-gold/15 text-gold",
            )}
          >
            <Home className="h-5 w-5" strokeWidth={isHomeActive ? 2.3 : 1.9} />
          </div>
          <span className="text-[11px] leading-tight">الرئيسية</span>
        </Link>

        {/* 2. الألعاب */}
        <Link
          to="/games"
          className={cn(
            "group flex flex-1 flex-col items-center justify-center gap-1 py-1 text-xs font-bold transition-colors select-none",
            isGamesActive ? "text-gold" : "text-muted-foreground hover:text-foreground",
          )}
          aria-current={isGamesActive ? "page" : undefined}
        >
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-xl transition-all",
              isGamesActive && "bg-gold/15 text-gold",
            )}
          >
            <Gamepad2 className="h-5 w-5" strokeWidth={isGamesActive ? 2.3 : 1.9} />
          </div>
          <span className="text-[11px] leading-tight">الألعاب</span>
        </Link>

        {/* 3. العب - الزر المركزي البارز */}
        <div className="flex flex-1 items-center justify-center">
          <Link
            to="/games"
            className="group relative -translate-y-3 flex flex-col items-center justify-center"
            aria-label="العب الآن"
          >
            <div className="relative flex h-13 w-13 items-center justify-center rounded-full border-2 border-gold/70 bg-gradient-to-b from-[#A52A37] to-[#6A1621] text-foreground shadow-lg shadow-black/60 transition-transform active:scale-95 group-hover:scale-105">
              <Target className="h-6 w-6 text-[#FBF4E4]" strokeWidth={2.4} />
              <span className="absolute inset-0 rounded-full border border-gold/30 pointer-events-none" />
            </div>
            <span className="mt-1 text-[11px] font-black text-gold">العب</span>
          </Link>
        </div>

        {/* 4. الباقات */}
        <Link
          to="/packages"
          className={cn(
            "group flex flex-1 flex-col items-center justify-center gap-1 py-1 text-xs font-bold transition-colors select-none",
            isPackagesActive ? "text-gold" : "text-muted-foreground hover:text-foreground",
          )}
          aria-current={isPackagesActive ? "page" : undefined}
        >
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-xl transition-all",
              isPackagesActive && "bg-gold/15 text-gold",
            )}
          >
            <ShoppingBag className="h-5 w-5" strokeWidth={isPackagesActive ? 2.3 : 1.9} />
          </div>
          <span className="text-[11px] leading-tight">الباقات</span>
        </Link>

        {/* 5. حسابي */}
        <Link
          to={accountTo}
          className={cn(
            "group flex flex-1 flex-col items-center justify-center gap-1 py-1 text-xs font-bold transition-colors select-none",
            isAccountActive ? "text-gold" : "text-muted-foreground hover:text-foreground",
          )}
          aria-current={isAccountActive ? "page" : undefined}
        >
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-xl transition-all",
              isAccountActive && "bg-gold/15 text-gold",
            )}
          >
            <User className="h-5 w-5" strokeWidth={isAccountActive ? 2.3 : 1.9} />
          </div>
          <span className="text-[11px] leading-tight">حسابي</span>
        </Link>
      </div>
    </nav>
  );
}
