import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  Check,
  Sparkles,
  Loader2,
  History,
  AlertCircle,
  ShieldCheck,
  Zap,
  Ban,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { fetchPackages } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { isNativeApp } from "@/lib/native-platform";
import {
  getPackageDefinition,
  AD_FREE_SUBSCRIPTIONS,
  type PackageProductDefinition,
  type SubscriptionProductDefinition,
} from "@/lib/payment-config";
import {
  openPaddleCheckout,
  openPaddleSubscriptionCheckout,
  getPaddlePricePreview,
} from "@/lib/paddle-client";
import {
  purchaseGooglePlayPackage,
  recoverInterruptedPurchases,
  purchaseGooglePlaySubscription,
  openGooglePlaySubscriptionManagement,
  recoverInterruptedSubscriptions,
  fetchGooglePlaySubscriptionProducts,
} from "@/lib/google-play-client";
import { useAdFreeEntitlement } from "@/lib/use-ad-free-entitlement";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/packages")({
  head: () => ({
    meta: [
      { title: "الباقات | قدّ التحدي" },
      {
        name: "description",
        content: "اختر باقتك: لعبة وحدة، ٣ ألعاب، باقة بطولة، أو باقة VIP.",
      },
      { property: "og:title", content: "باقات قدّ التحدي" },
      { property: "og:description", content: "باقات مرنة تناسب القعدات والتجمعات العائلية." },
    ],
  }),
  component: PackagesPage,
});

type ProcessingState =
  "idle" | "initializing" | "checkout" | "processing" | "verified" | "cancelled" | "failed";

function PackagesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [activePackageId, setActivePackageId] = useState<string | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [processState, setProcessState] = useState<ProcessingState>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");

  const {
    isAdFree,
    subscription: activeSubscription,
    refetch: refetchEntitlement,
  } = useAdFreeEntitlement();

  const [paddlePrices, setPaddlePrices] = useState<Record<string, string>>({});
  const [googlePlayPrices, setGooglePlayPrices] = useState<Record<string, string>>({});

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ["packages"],
    queryFn: fetchPackages,
  });

  // Query dynamic provider pricing (Paddle PricePreview for Web, Google Play for Android)
  useEffect(() => {
    let isMounted = true;
    if (isNativeApp()) {
      fetchGooglePlaySubscriptionProducts().then((products) => {
        if (!isMounted || !products) return;
        const prices: Record<string, string> = {};
        for (const prod of products) {
          if (prod.identifier && prod.priceString) {
            prices[prod.identifier] = prod.priceString;
          }
        }
        setGooglePlayPrices(prices);
      });
    } else {
      const monthlyId = AD_FREE_SUBSCRIPTIONS.monthly.paddlePriceId;
      const yearlyId = AD_FREE_SUBSCRIPTIONS.yearly.paddlePriceId;
      Promise.all([getPaddlePricePreview(monthlyId), getPaddlePricePreview(yearlyId)]).then(
        ([monthlyRes, yearlyRes]) => {
          if (!isMounted) return;
          const prices: Record<string, string> = {};
          if (monthlyRes?.formattedTotal) {
            prices["monthly"] = monthlyRes.formattedTotal;
          }
          if (yearlyRes?.formattedTotal) {
            prices["yearly"] = yearlyRes.formattedTotal;
          }
          setPaddlePrices(prices);
        },
      );
    }
    return () => {
      isMounted = false;
    };
  }, []);

  // Reconcile and recover any interrupted purchases or subscriptions on Android
  useEffect(() => {
    if (isNativeApp() && user) {
      recoverInterruptedPurchases().then((recovered) => {
        if (recovered > 0) {
          toast.success("تم استرجاع مشترياتك وتأكيدها بنجاح! 🎉");
          void queryClient.invalidateQueries({ queryKey: ["profile"] });
          void queryClient.invalidateQueries({ queryKey: ["purchases"] });
        }
      });
      recoverInterruptedSubscriptions().then((recovered) => {
        if (recovered > 0) {
          toast.success("تم استرجاع اشتراكك بدون إعلانات وتأكيده بنجاح! 🎉");
          void refetchEntitlement();
        }
      });
    }
  }, [user, queryClient, refetchEntitlement]);

  // Polling helper to detect webhook credit fulfillment for Web
  async function pollForCreditGrant(initialCredits: number, expectedAddition: number) {
    if (!user) return;
    setProcessState("processing");
    setStatusMessage("جاري تأكيد عملية الدفع وإضافة الألعاب...");

    for (let i = 0; i < 15; i++) {
      await new Promise((res) => setTimeout(res, 2000));
      const { data: prof } = await supabase
        .from("profiles")
        .select("games_left")
        .eq("id", user.id)
        .single();

      if (prof && prof.games_left > initialCredits) {
        setProcessState("verified");
        setStatusMessage(`تمت إضافة ${expectedAddition} ألعاب إلى رصيدك 🎉`);
        toast.success(`تمت إضافة ${expectedAddition} ألعاب إلى رصيدك بنجاح! 🎉`);
        await queryClient.invalidateQueries({ queryKey: ["profile"] });
        await queryClient.invalidateQueries({ queryKey: ["purchases"] });
        setTimeout(() => {
          setProcessState("idle");
          setActivePackageId(null);
        }, 4000);
        return;
      }
    }

    // If polling timed out, inform user gently that webhook will complete asynchronously
    setProcessState("idle");
    setActivePackageId(null);
    toast.info("العملية قيد المزامنة", {
      description: "سيتم تحديث رصيدك تلقائياً خلال لحظات فور اكتمال إشعار الدفع.",
    });
  }

  async function handleSubscribe(planDef: SubscriptionProductDefinition) {
    if (!user) {
      toast.error("تسجيل الدخول مطلوب", {
        description: "يرجى تسجيل الدخول أولاً لتفعيل الاشتراك على حسابك.",
      });
      navigate({ to: "/auth" });
      return;
    }

    setActivePlanId(planDef.plan);
    setProcessState("initializing");

    if (isNativeApp()) {
      setStatusMessage("جاري فتح اشتراكات Google Play...");
      try {
        const result = await purchaseGooglePlaySubscription({
          plan: planDef.period,
          userId: user.id,
        });

        if (result.success) {
          setProcessState("verified");
          setStatusMessage("تم تفعيل اشتراك إزالة الإعلانات بنجاح! 🎉");
          toast.success("تم تفعيل اشتراك إزالة الإعلانات بنجاح! 🎉");
          await refetchEntitlement();
          setTimeout(() => {
            setProcessState("idle");
            setActivePlanId(null);
          }, 3500);
        } else if (result.error === "USER_CANCELLED") {
          setProcessState("cancelled");
          toast.info("تم إلغاء الاشتراك");
          setProcessState("idle");
          setActivePlanId(null);
        } else {
          setProcessState("failed");
          toast.error("لم تكتمل عملية الاشتراك", {
            description: "يرجى التحقق من وسيلة الدفع في Google Play ثم المحاولة ثانية.",
          });
          setProcessState("idle");
          setActivePlanId(null);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setProcessState("failed");
        toast.error("لم تكتمل عملية الاشتراك", { description: msg });
        setProcessState("idle");
        setActivePlanId(null);
      }
    } else {
      // Browser: Paddle Billing Subscription
      setStatusMessage("جاري فتح بوابة الدفع الآمنة للاشتراك...");
      const opened = await openPaddleSubscriptionCheckout({
        subscriptionDef: planDef,
        userId: user.id,
        userEmail: user.email,
        onCheckoutComplete: () => {
          setProcessState("verified");
          setStatusMessage("تم استلام الاشتراك وجاري تفعيله...");
          toast.success("تم تأكيد اشتراكك بنجاح! 🎉");
          void refetchEntitlement();
          setTimeout(() => {
            setProcessState("idle");
            setActivePlanId(null);
          }, 4000);
        },
        onCheckoutClose: () => {
          if (processState !== "processing" && processState !== "verified") {
            setProcessState("idle");
            setActivePlanId(null);
          }
        },
      });

      if (!opened) {
        toast.info("بوابة الاشتراكات قيد التهيئة (Sandbox)", {
          description: "قم بإعداد VITE_PADDLE_CLIENT_TOKEN لتشغيل نافذة الاشتراك التجريبية.",
        });
        setProcessState("idle");
        setActivePlanId(null);
      } else {
        setProcessState("checkout");
      }
    }
  }

  async function handlePurchase(pkg: {
    id: string;
    slug: string;
    name: string;
    games_count: number;
    price: number;
  }) {
    if (!user) {
      toast.error("تسجيل الدخول مطلوب", {
        description: "يرجى تسجيل الدخول أولاً لتثبيت الألعاب في رصيد حسابك.",
      });
      navigate({ to: "/auth" });
      return;
    }

    const pkgDef: PackageProductDefinition = getPackageDefinition(pkg.slug) || {
      slug: pkg.slug,
      name: pkg.name,
      gamesCount: pkg.games_count,
      priceUsd: pkg.price,
      googlePlayProductId: `qad_pkg_${pkg.slug}`,
      paddlePriceId: `pri_sandbox_${pkg.slug}`,
    };

    setActivePackageId(pkg.id);
    setProcessState("initializing");

    // Current credits before purchase
    const { data: initialProf } = await supabase
      .from("profiles")
      .select("games_left")
      .eq("id", user.id)
      .maybeSingle();
    const currentCredits = initialProf?.games_left ?? 0;

    // Platform branching: Native Android (Google Play) vs Web (Paddle)
    if (isNativeApp()) {
      setStatusMessage("جاري فتح متجر Google Play...");
      try {
        const result = await purchaseGooglePlayPackage({
          packageDef: pkgDef,
          userId: user.id,
        });

        if (result.success) {
          setProcessState("verified");
          setStatusMessage(`تمت إضافة ${pkg.games_count} ألعاب إلى رصيدك 🎉`);
          toast.success(`تمت إضافة ${pkg.games_count} ألعاب إلى رصيدك بنجاح! 🎉`);
          await queryClient.invalidateQueries({ queryKey: ["profile"] });
          await queryClient.invalidateQueries({ queryKey: ["purchases"] });
          setTimeout(() => {
            setProcessState("idle");
            setActivePackageId(null);
          }, 3500);
        } else if (result.error === "USER_CANCELLED") {
          setProcessState("cancelled");
          toast.info("تم إلغاء العملية");
          setProcessState("idle");
          setActivePackageId(null);
        } else {
          setProcessState("failed");
          toast.error("لم تكتمل عملية الدفع", {
            description: "يرجى التحقق من اتصالك وحساب Google Play ثم المحاولة ثانية.",
          });
          setProcessState("idle");
          setActivePackageId(null);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setProcessState("failed");
        toast.error("لم تكتمل عملية الدفع", { description: msg });
        setProcessState("idle");
        setActivePackageId(null);
      }
    } else {
      // Browser: Paddle Billing
      setStatusMessage("جاري فتح بوابة الدفع الآمنة...");
      const opened = await openPaddleCheckout({
        packageDef: pkgDef,
        userId: user.id,
        userEmail: user.email,
        onCheckoutComplete: () => {
          void pollForCreditGrant(currentCredits, pkg.games_count);
        },
        onCheckoutClose: () => {
          if (processState !== "processing" && processState !== "verified") {
            setProcessState("idle");
            setActivePackageId(null);
          }
        },
      });

      if (!opened) {
        // Paddle token is not configured yet (Sandbox preparation mode)
        toast.info("بوابة الدفع قيد التهيئة (Sandbox)", {
          description: "قم بإعداد VITE_PADDLE_CLIENT_TOKEN لتشغيل نافذة الشراء التجريبية.",
        });
        setProcessState("idle");
        setActivePackageId(null);
      } else {
        setProcessState("checkout");
      }
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-12">
        <div className="text-center">
          <h1 className="text-4xl text-primary">الباقات</h1>
          <p className="mt-3 text-muted-foreground">
            لعبتان تجريبيتان لكل مستخدم جديد، وبعدها اختاروا باقة تكمل كل ألعاب القعدة.
          </p>
          {isNativeApp() ? (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-foreground">
              ⚡ الدفع عبر متجر Google Play مع تأكيد واستهلاك فوري
            </span>
          ) : (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-foreground">
              🔒 دفع آمن ومشفر عالمياً عبر Paddle Billing
            </span>
          )}
        </div>

        {/* Global Processing Banner */}
        {processState !== "idle" && (
          <div className="mx-auto mt-6 max-w-lg rounded-2xl border border-primary/30 bg-primary/10 p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-primary font-bold">
              {processState === "verified" ? (
                <Sparkles className="h-5 w-5 text-gold animate-bounce" />
              ) : processState === "failed" ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin" />
              )}
              <span>{statusMessage}</span>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="mt-10 text-center text-muted-foreground">جاري التحميل…</p>
        ) : (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {packages.map((p) => {
              const isProcessingThis = activePackageId === p.id && processState !== "idle";

              return (
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
                    {p.price} <span className="text-base">USD</span>
                  </p>
                  <ul className="mt-4 space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-success" />
                      {p.games_count > 100 ? "ألعاب غير محدودة" : `${p.games_count} لعبة كاملة`}
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-success" /> صالحة للألعاب الست: قدّ التحدي،
                      حروف، برا السالفة، مافيا، المزاد ومزاد المليار
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-success" /> مكتبة أسئلة وفئات تتجدد باستمرار
                    </li>
                  </ul>
                  <Button
                    className="mt-6 w-full"
                    disabled={isProcessingThis || (activePackageId !== null && !isProcessingThis)}
                    onClick={() => handlePurchase(p)}
                  >
                    {isProcessingThis ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        جاري التنفيذ...
                      </span>
                    ) : (
                      <>
                        <Sparkles className="ms-1 h-4 w-4" /> اشترِ الباقة
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* ======================================================= */}
        {/* Ad-Free Subscriptions Section                           */}
        {/* ======================================================= */}
        <div className="mt-10 border-t border-border/60 pt-8 sm:mt-20 sm:pt-16">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3.5 py-1 text-xs font-bold text-primary">
              <Ban className="h-3.5 w-3.5" /> تجربة نقية وبدون مقاطعة
            </span>
            <h2 className="mt-3 text-3xl font-bold text-foreground">اشتراك إزالة الإعلانات</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
              العب بحرية تامة وبدون أي إعلانات بينية أو بانرات مزعجة. اشتراك متجدد يلغي كافة
              الإعلانات التلقائية عبر جميع شاشات التطبيق والموقع.
            </p>
            {!isNativeApp() && (
              <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-border/80 bg-surface-2/60 px-4 py-2 text-center text-xs text-muted-foreground">
                <p>يتم تحصيل المبلغ بالدولار الأمريكي عبر Paddle حسب السعر المحدد عند الدفع.</p>
              </div>
            )}
          </div>

          {/* Active Subscription Banner if user already subscribed */}
          {isAdFree && (
            <div className="mx-auto mt-8 max-w-2xl rounded-3xl border border-success/30 bg-success/10 p-6 text-center">
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between text-start">
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-success/20 text-success">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-foreground">
                      أنت مشترك حالياً في باقة إزالة الإعلانات
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {activeSubscription?.plan === "ad_free_yearly"
                        ? "الاشتراك السنوي النشط"
                        : "الاشتراك الشهري النشط"}
                      {activeSubscription?.current_period_end && (
                        <span>
                          {" • "}
                          صالح حتى:{" "}
                          {new Date(activeSubscription.current_period_end).toLocaleDateString(
                            "ar-JO",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-success/40 text-success hover:bg-success/20"
                  onClick={() => {
                    if (isNativeApp()) {
                      void openGooglePlaySubscriptionManagement();
                    } else {
                      toast.info("إدارة الاشتراك", {
                        description:
                          "يمكنك إدارة اشتراكك وإلغائه عبر رسالة تأكيد الدفع من Paddle أو إعدادات بطاقتك.",
                      });
                    }
                  }}
                >
                  <ExternalLink className="ms-1.5 h-4 w-4" />
                  إدارة الاشتراك
                </Button>
              </div>
            </div>
          )}

          {/* Subscription Plans Grid */}
          <div className="mt-8 grid gap-6 sm:grid-cols-2 max-w-3xl mx-auto">
            {/* Monthly Plan */}
            <div className="card-hover relative flex flex-col rounded-3xl border border-border bg-card p-6">
              <h3 className="text-2xl font-bold text-foreground">
                {AD_FREE_SUBSCRIPTIONS.monthly.name}
              </h3>
              <p className="mt-2 text-xs text-muted-foreground min-h-10">
                إزالة شاملة للإعلانات شهرياً مع إمكانية الإلغاء في أي وقت.
              </p>
              <div className="mt-4 flex flex-wrap items-baseline gap-2">
                <span className="font-display text-3xl font-bold text-gold">٣ د.أ</span>
                <span className="text-sm text-muted-foreground">/ شهر</span>
                {isNativeApp()
                  ? googlePlayPrices["monthly"] && (
                      <span className="text-xs font-medium text-muted-foreground/90">
                        ({googlePlayPrices["monthly"]})
                      </span>
                    )
                  : paddlePrices["monthly"] && (
                      <span className="text-xs font-medium text-muted-foreground/90">
                        ({paddlePrices["monthly"]})
                      </span>
                    )}
              </div>
              {!isNativeApp() && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  يتم تحصيل المبلغ بالدولار الأمريكي عبر Paddle حسب السعر المحدد عند الدفع.
                </p>
              )}

              <ul className="mt-6 space-y-2.5 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success shrink-0" />
                  <span>إزالة تامة للإعلانات البينية والبانرات</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success shrink-0" />
                  <span>تجديد تلقائي شهري يمكن إلغاؤه في أي وقت</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success shrink-0" />
                  <span>تجربة لعب سريعة ومريحة لجميع اللاعبين</span>
                </li>
                <li className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>لا يمنح ألعاباً (باقات الألعاب تباع منفصلة)</span>
                </li>
              </ul>

              <Button
                className="mt-6 w-full"
                variant={isAdFree ? "outline" : "default"}
                disabled={
                  (activePlanId !== null && processState !== "idle") ||
                  (isAdFree && activeSubscription?.plan === "ad_free_monthly")
                }
                onClick={() => handleSubscribe(AD_FREE_SUBSCRIPTIONS.monthly)}
              >
                {activePlanId === AD_FREE_SUBSCRIPTIONS.monthly.plan && processState !== "idle" ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جاري المعالجة...
                  </span>
                ) : isAdFree && activeSubscription?.plan === "ad_free_monthly" ? (
                  "باقتك الحالية النشطة"
                ) : (
                  <>
                    <Sparkles className="ms-1 h-4 w-4" /> اشترك شهرياً
                  </>
                )}
              </Button>
            </div>

            {/* Yearly Plan */}
            <div className="card-hover relative flex flex-col rounded-3xl border-2 border-primary/60 bg-card p-6 shadow-lg shadow-primary/5">
              <span className="absolute -top-3 start-6 rounded-full fire-gradient px-3 py-1 text-xs font-bold text-primary-foreground">
                {AD_FREE_SUBSCRIPTIONS.yearly.badge} • {AD_FREE_SUBSCRIPTIONS.yearly.savingsText}
              </span>
              <h3 className="text-2xl font-bold text-foreground">
                {AD_FREE_SUBSCRIPTIONS.yearly.name}
              </h3>
              <p className="mt-2 text-xs text-muted-foreground min-h-10">
                العرض الأوفر للقعدة الدائمة: شهرين مجاناً عند الاشتراك السنوي.
              </p>
              <div className="mt-4 flex flex-wrap items-baseline gap-2">
                <span className="font-display text-3xl font-bold text-gold">٣٠ د.أ</span>
                <span className="text-sm text-muted-foreground">/ سنة</span>
                {isNativeApp()
                  ? googlePlayPrices["yearly"] && (
                      <span className="text-xs font-medium text-muted-foreground/90">
                        ({googlePlayPrices["yearly"]})
                      </span>
                    )
                  : paddlePrices["yearly"] && (
                      <span className="text-xs font-medium text-muted-foreground/90">
                        ({paddlePrices["yearly"]})
                      </span>
                    )}
              </div>
              {!isNativeApp() && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  يتم تحصيل المبلغ بالدولار الأمريكي عبر Paddle حسب السعر المحدد عند الدفع.
                </p>
              )}

              <ul className="mt-6 space-y-2.5 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success shrink-0" />
                  <span className="font-semibold text-foreground">
                    وفّر ٦ د.أ سنوياً (احصل على شهرين مجاناً)
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success shrink-0" />
                  <span>إزالة تامة للإعلانات البينية والبانرات طوال السنة</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success shrink-0" />
                  <span>أولوية في سرعة التحديثات ودعم العملاء</span>
                </li>
                <li className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>لا يمنح ألعاباً (باقات الألعاب تباع منفصلة)</span>
                </li>
              </ul>

              <Button
                className="mt-6 w-full fire-gradient font-bold text-primary-foreground"
                variant="default"
                disabled={
                  (activePlanId !== null && processState !== "idle") ||
                  (isAdFree && activeSubscription?.plan === "ad_free_yearly")
                }
                onClick={() => handleSubscribe(AD_FREE_SUBSCRIPTIONS.yearly)}
              >
                {activePlanId === AD_FREE_SUBSCRIPTIONS.yearly.plan && processState !== "idle" ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جاري المعالجة...
                  </span>
                ) : isAdFree && activeSubscription?.plan === "ad_free_yearly" ? (
                  "باقتك الحالية النشطة"
                ) : (
                  <>
                    <Sparkles className="ms-1 h-4 w-4" /> اشترك سنوياً ووفّر
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {user && (
          <div className="mt-12 text-center">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-xl border-border bg-surface-1 text-muted-foreground hover:text-foreground"
              onClick={() => navigate({ to: "/profile" })}
            >
              <History className="h-4 w-4" />
              عرض سجل مشترياتي
            </Button>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
