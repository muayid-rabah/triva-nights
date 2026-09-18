import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LogOut, Sparkles, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizePhone, phoneError } from "@/lib/phone";
import { mapAuthError } from "@/lib/auth-errors";
import { Brand } from "@/components/site-header";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      throw redirect({ to: "/auth", replace: true });
    }

    // Read persistent database onboarding completion status
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profile?.onboarding_completed === true) {
      throw redirect({ to: "/games", replace: true });
    }

    return { user: session.user };
  },
  head: () => ({
    meta: [
      { title: "تجهيز حسابك | قدّ التحدي" },
      { name: "description", content: "أكمل بيانات حسابك وابدأ اللعب فوراً." },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = Route.useRouteContext();

  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [countryCode, setCountryCode] = useState("+962");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Prefill known data from user_metadata and existing profile
  useEffect(() => {
    if (!user) return;

    const metadata = user.user_metadata ?? {};
    const metaFullName =
      metadata.full_name ||
      `${metadata.first_name ?? ""} ${metadata.last_name ?? ""}`.trim() ||
      metadata.name ||
      "";
    const metaAvatar = metadata.avatar_url || metadata.picture || null;
    const authPhone = user.phone ? user.phone.replace(/^\+962|^\+970/, "").replace(/^0/, "") : "";
    const authCountry = user.phone?.startsWith("+970") ? "+970" : "+962";

    if (metaFullName) setFullName(metaFullName);
    if (metaAvatar) setAvatarUrl(metaAvatar);
    if (authPhone) {
      setPhone(authPhone);
      setCountryCode(authCountry);
    }

    // Also inspect any existing profile row in case of partial pre-existing data
    void supabase
      .from("profiles")
      .select("first_name, last_name, country_code, phone, avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data: prof }) => {
        if (!prof) return;
        const profName = `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim();
        if (profName && !metaFullName) setFullName(profName);
        if (prof.country_code) setCountryCode(prof.country_code);
        if (prof.phone && !authPhone) setPhone(prof.phone);
        if (prof.avatar_url && !metaAvatar) setAvatarUrl(prof.avatar_url);
      });
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const trimmedName = fullName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      toast.error("يرجى إدخال اسمك الكريم أو اسم العرض.");
      return;
    }

    const invalidPhone = phoneError(countryCode, phone);
    if (invalidPhone) {
      toast.error("رقم الهاتف غير صحيح", { description: invalidPhone });
      return;
    }

    const localPhone = normalizePhone(countryCode, phone);
    const parts = trimmedName.split(/\s+/);
    const firstName = parts[0] || trimmedName;
    const lastName = parts.slice(1).join(" ") || "";

    setLoading(true);

    try {
      // 1. Atomic claim_phone: registers claim, enforces 2-account limit, and updates profile with onboarding_completed = true
      const { error: claimErr } = await supabase.rpc("claim_phone", {
        p_country_code: countryCode,
        p_phone: localPhone,
        p_first_name: firstName,
        p_last_name: lastName,
        p_avatar_url: avatarUrl || null,
        p_complete_onboarding: true,
      });

      if (claimErr) {
        console.error("[onboarding claim_phone error]:", {
          code: claimErr.code,
          message: claimErr.message,
          details: claimErr.details,
          hint: claimErr.hint,
        });

        const isLimit = claimErr.message.includes("PHONE_ACCOUNT_LIMIT");
        if (isLimit) {
          setLoading(false);
          toast.error("وصلت الحد المسموح لهذا الرقم", {
            description: "للحفاظ على عدالة اللعب، مسموح بحسابين فقط لكل رقم هاتف.",
          });
          return;
        }

        const isInvalid = claimErr.message.includes("PHONE_INVALID");
        if (isInvalid) {
          setLoading(false);
          toast.error("رقم الهاتف غير صحيح", {
            description: "تأكد من كتابة رقم هاتف أردني صالح يبدأ بـ 077 أو 078 أو 079.",
          });
          return;
        }

        // Compatibility fallback for older claim_phone signature if migration 0017 has not yet been applied
        const isParamMismatch =
          claimErr.code === "PGRST202" ||
          claimErr.message.includes("parameter") ||
          claimErr.message.includes("Could not find the function");

        if (isParamMismatch) {
          const { error: legacyErr } = await supabase.rpc("claim_phone", {
            p_country_code: countryCode,
            p_phone: localPhone,
          });

          if (legacyErr && legacyErr.message.includes("PHONE_ACCOUNT_LIMIT")) {
            setLoading(false);
            toast.error("وصلت الحد المسموح لهذا الرقم", {
              description: "للحفاظ على عدالة اللعب، مسموح بحسابين فقط لكل رقم هاتف.",
            });
            return;
          }

          const { error: updateError } = await supabase.from("profiles").upsert(
            {
              id: user.id,
              first_name: firstName,
              last_name: lastName,
              country_code: countryCode,
              phone: localPhone,
              avatar_url: avatarUrl || null,
              onboarding_completed: true,
            },
            { onConflict: "id" },
          );

          if (updateError) {
            console.error("[onboarding legacy update error]:", updateError);
            setLoading(false);
            const friendly = mapAuthError(updateError);
            toast.error(friendly.title, { description: friendly.description });
            return;
          }
        } else {
          setLoading(false);
          const friendly = mapAuthError(claimErr);
          toast.error(friendly.title, { description: friendly.description });
          return;
        }
      }

      // 2. Update query cache so central route guard unlocks immediately
      qc.setQueryData(["onboarding-completed", user.id], true);
      await qc.invalidateQueries({ queryKey: ["profile"] });

      toast.success("أهلاً بك في قدّ التحدي!", {
        description: "تم تجهيز حسابك بنجاح. نتمنى لك جولات ممتعة!",
      });

      navigate({ to: "/games", replace: true });
    } catch (err) {
      setLoading(false);
      console.error("[onboarding unexpected exception]:", err);
      const friendly = mapAuthError(err);
      toast.error(friendly.title, { description: friendly.description });
    }
  }

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between px-4 py-6 sm:py-10">
      {/* Header bar with Brand and Logout */}
      <header className="mx-auto w-full max-w-md flex items-center justify-between">
        <Brand />
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-destructive"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>تسجيل خروج</span>
        </button>
      </header>

      {/* Main Card */}
      <main className="mx-auto w-full max-w-md my-auto py-6">
        <div className="rounded-3xl border border-gold/20 bg-card p-6 sm:p-8 shadow-lg shadow-black/20">
          <div className="text-center">
            {avatarUrl ? (
              <div className="mx-auto mb-4 relative h-20 w-20">
                <img
                  src={avatarUrl}
                  alt={fullName || "الصورة الشخصية"}
                  className="h-full w-full rounded-full object-cover border-2 border-gold/40 shadow-md"
                />
                <div className="absolute -bottom-1 -end-1 rounded-full bg-gold p-1 text-black">
                  <UserCheck className="h-3.5 w-3.5" />
                </div>
              </div>
            ) : (
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gold/15 text-gold">
                <Sparkles className="h-8 w-8" />
              </div>
            )}

            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              خلّينا نجهّز حسابك
            </h1>
            <p className="mt-2 text-xs sm:text-sm leading-relaxed text-muted-foreground">
              بنحتاج هالمعلومات حتى نجهز حسابك ونحفظ تقدمك ورصيدك داخل اللعبة.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Full Name */}
            <div>
              <Label htmlFor="full-name" className="text-sm font-bold">
                الاسم الكريم
              </Label>
              <Input
                id="full-name"
                type="text"
                required
                autoFocus
                disabled={loading}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="اكتب اسمك الأول واسم العائلة"
                className="mt-1.5 h-11 rounded-xl text-base"
              />
            </div>

            {/* Country & Phone */}
            <div>
              <Label htmlFor="onboarding-phone" className="text-sm font-bold">
                رقم الهاتف
              </Label>
              <div className="mt-1.5 grid grid-cols-[120px_1fr] gap-2">
                <select
                  id="country-code"
                  value={countryCode}
                  disabled={loading}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="h-11 rounded-xl border border-input bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="+962">الأردن +962</option>
                  <option value="+970">فلسطين +970</option>
                </select>
                <Input
                  id="onboarding-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  dir="ltr"
                  required
                  disabled={loading}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^0-9+]/g, ""))}
                  placeholder={countryCode === "+970" ? "0591234567" : "0791234567"}
                  className="h-11 rounded-xl text-left font-mono text-base"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                اكتب الرقم مع الصفر أو بدونه؛ سنربطه بحسابك لحفظ ألعابك وباقاتك.
              </p>
            </div>

            <Button
              type="submit"
              size="lg"
              className="mt-6 w-full h-12 rounded-xl text-base font-bold heritage-primary transition-transform active:scale-[0.99]"
              disabled={loading || !fullName.trim() || !phone.trim()}
            >
              <span>{loading ? "جاري الحفظ والبدء..." : "ابدأ اللعب"}</span>
            </Button>
          </form>
        </div>
      </main>

      {/* Footer copyright note */}
      <footer className="mx-auto w-full max-w-md text-center text-xs text-muted-foreground py-2">
        قدّ التحدي © {new Date().getFullYear()} — تجربة جماعية ممتعة
      </footer>
    </div>
  );
}
