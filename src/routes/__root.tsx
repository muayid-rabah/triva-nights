import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  redirect,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import "../game-polish.css";
import { GameProvider } from "../lib/game-store";
import { ThemeProvider } from "../lib/theme";
import { Toaster } from "../components/ui/sonner";
import { NativeRuntimeBridge } from "../components/native-runtime-bridge";
import { MobileBottomNavigation } from "../components/mobile-bottom-navigation";
import { supabase } from "../integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-primary">٤٠٤</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">الصفحة مو موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">يمكن الرابط تغيّر أو الصفحة انحذفت.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            الرجوع للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">الصفحة ما تحمّلت</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          صار خطأ غير متوقع. جرب تحدّث الصفحة أو ارجع للرئيسية.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            حاول مرة ثانية
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-input bg-background px-4 py-2 text-sm font-bold text-foreground transition-colors hover:bg-accent"
          >
            الرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ location, context }) => {
    const rawPath = location.pathname;

    // Keep the Arabic address requested for the games hub working while the
    // filesystem route stays ASCII-safe on Windows and Cloudflare builds.
    if (decodeURIComponent(rawPath) === "/العاب") {
      throw redirect({ to: "/games", replace: true });
    }

    // Allow minimal safe set while onboarding is incomplete:
    // /auth and /onboarding
    if (rawPath === "/auth" || rawPath === "/onboarding") {
      return;
    }

    // Check if session exists in Supabase
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      // Unauthenticated users can view public pages
      return;
    }

    // Authenticated user: verify database onboarding_completed state
    const userId = session.user.id;
    const isComplete = await context.queryClient.fetchQuery({
      queryKey: ["onboarding-completed", userId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", userId)
          .maybeSingle();

        if (error) {
          console.warn("[Onboarding Check Error]:", error.message);
          return false;
        }

        return data?.onboarding_completed === true;
      },
      staleTime: 1000 * 60 * 5, // 5 minutes cache
    });

    if (!isComplete) {
      throw redirect({ to: "/onboarding", replace: true });
    }
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "قدّ التحدي | لعبة القعدة الأردنية" },
      {
        name: "description",
        content: "لعبة تحدي جماعية: ٦ فئات، ٣٦ سؤال، و٣ وسائل مساعدة لكل فريق.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Rakkas&family=Tajawal:wght@400;500;700;900&display=swap",
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <GameProvider>
          <NativeRuntimeBridge />
          <div className="flex min-h-[100dvh] flex-col pb-mobile-nav">
            {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
            <Outlet />
          </div>
          <MobileBottomNavigation />
          <Toaster position="top-center" richColors />
        </GameProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
