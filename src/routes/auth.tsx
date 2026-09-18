import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, ChevronDown, Mail, Phone, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { formatDisplayPhone, formatE164, normalizePhone, phoneError } from "@/lib/phone";
import { mapAuthError } from "@/lib/auth-errors";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { authRedirectUrl, isNativeApp } from "@/lib/native-platform";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | قدّ التحدي" },
      { name: "description", content: "سجل دخولك أو أنشئ حساب جديد وابدأ لعبتك المجانية." },
      { property: "og:title", content: "الدخول إلى قدّ التحدي" },
      { property: "og:description", content: "حساب واحد يكفي لكل ألعابك وباقاتك." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Phone OTP Auth State
  const [phoneStep, setPhoneStep] = useState<"enter_phone" | "verify_otp">("enter_phone");
  const [countryCode, setCountryCode] = useState("+962");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // Secondary Email Auth State
  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupCountryCode, setSignupCountryCode] = useState("+962");

  const navigatePostAuth = useCallback(
    async (userId: string) => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", userId)
        .maybeSingle();

      if (prof?.onboarding_completed === false || !prof) {
        navigate({ to: "/onboarding", replace: true });
      } else {
        navigate({ to: "/games", replace: true });
      }
    },
    [navigate],
  );

  // Redirect if already authenticated
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        void navigatePostAuth(data.session.user.id);
      }
    });
  }, [navigatePostAuth]);

  // Deep link listener for Capacitor Android Google OAuth
  useEffect(() => {
    if (!isNativeApp()) return;

    let listener: Awaited<ReturnType<typeof App.addListener>> | undefined;
    void App.addListener("appUrlOpen", async ({ url }) => {
      if (!url.startsWith("com.nextaurastudios.qadaltahaddi://auth/")) return;

      const { data: exchangeData, error } = await supabase.auth.exchangeCodeForSession(url);
      await Browser.close();
      if (error) {
        const friendly = mapAuthError(error);
        toast.error(friendly.title, { description: friendly.description });
        return;
      }
      if (exchangeData.user) {
        void navigatePostAuth(exchangeData.user.id);
      } else {
        navigate({ to: "/onboarding", replace: true });
      }
    }).then((handle) => {
      listener = handle;
    });

    return () => {
      void listener?.remove();
    };
  }, [navigate, navigatePostAuth]);

  // Timer effect for OTP resend cooldown
  useEffect(() => {
    if (phoneStep !== "verify_otp" || cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [phoneStep, cooldown]);

  // Send Supabase Phone OTP
  async function sendPhoneOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const invalid = phoneError(countryCode, phone);
    if (invalid) {
      toast.error("رقم الهاتف غير صحيح", { description: invalid });
      return;
    }

    const e164 = formatE164(countryCode, phone);
    const local = normalizePhone(countryCode, phone);

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      phone: e164,
      options: {
        data: {
          phone: local,
          country_code: countryCode,
        },
      },
    });
    setLoading(false);

    if (error) {
      const friendly = mapAuthError(error);
      toast.error(friendly.title, { description: friendly.description });
      return;
    }

    setPhoneStep("verify_otp");
    setOtp("");
    setCooldown(60);
    toast.success("تم إرسال رمز التحقق", {
      description: `أدخل الرمز المكوّن من 6 أرقام المرسل إلى ${formatDisplayPhone(countryCode, phone)}`,
    });
  }

  // Resend Phone OTP
  async function resendOtp() {
    if (cooldown > 0 || loading) return;
    await sendPhoneOtp();
  }

  // Verify Supabase Phone OTP
  async function verifyOtp(tokenToVerify?: string) {
    const code = tokenToVerify ?? otp;
    if (code.length !== 6) {
      toast.error("رمز التحقق غير مكتمل", { description: "يرجى إدخال 6 أرقام." });
      return;
    }

    const e164 = formatE164(countryCode, phone);
    const local = normalizePhone(countryCode, phone);

    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({
      phone: e164,
      token: code,
      type: "sms",
    });
    setLoading(false);

    if (error) {
      const friendly = mapAuthError(error);
      toast.error(friendly.title, { description: friendly.description });
      return;
    }

    // Attach phone to profiles if missing
    if (data.user) {
      try {
        const { data: prof } = await supabase
          .from("profiles")
          .select("phone")
          .eq("id", data.user.id)
          .maybeSingle();

        if (!prof?.phone) {
          const { error: claimError } = await supabase.rpc("claim_phone", {
            p_country_code: countryCode,
            p_phone: local,
          });
          if (claimError) {
            await supabase
              .from("profiles")
              .update({ country_code: countryCode, phone: local })
              .eq("id", data.user.id);
          }
        }
      } catch {
        // Non-fatal, profile can still be filled in profile settings
      }
    }

    toast.success("تم تسجيل الدخول بنجاح! أهلاً بك.");
    if (data.user) {
      void navigatePostAuth(data.user.id);
    } else {
      navigate({ to: "/onboarding" });
    }
  }

  // Google OAuth Handler (Web & Android Capacitor)
  async function googleSignIn() {
    const native = isNativeApp();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authRedirectUrl(), skipBrowserRedirect: native },
    });

    if (error) {
      const friendly = mapAuthError(error);
      toast.error(friendly.title, { description: friendly.description });
      return;
    }

    if (native && data.url) {
      await Browser.open({ url: data.url });
    }
  }

  // Secondary Email Sign In
  async function emailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      const friendly = mapAuthError(error);
      toast.error(friendly.title, { description: friendly.description });
      return;
    }

    toast.success("أهلاً فيك!");
    if (data.user) {
      void navigatePostAuth(data.user.id);
    } else {
      navigate({ to: "/onboarding" });
    }
  }

  // Secondary Email Sign Up
  async function emailSignUp(e: React.FormEvent) {
    e.preventDefault();
    const normalizedPhone = normalizePhone(signupCountryCode, signupPhone);
    const invalidPhone = phoneError(signupCountryCode, signupPhone);
    if (invalidPhone) {
      toast.error("رقم الهاتف غير صحيح", { description: invalidPhone });
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: authRedirectUrl(),
        data: {
          first_name: firstName,
          last_name: lastName,
          country_code: signupCountryCode,
          phone: normalizedPhone,
        },
      },
    });
    setLoading(false);

    if (error) {
      const friendly = mapAuthError(error);
      toast.error(friendly.title, { description: friendly.description });
      return;
    }

    if (!data.session) {
      toast.success("تم إنشاء الحساب بنجاح", {
        description: "افحص بريدك وأكد الحساب لتسجيل الدخول.",
      });
      return;
    }

    if (data.user) {
      void navigatePostAuth(data.user.id);
    } else {
      navigate({ to: "/onboarding" });
    }
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-8 sm:py-12">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            حسابك بقدّ التحدي
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            دخول فوري برقم هاتفك أو عبر Google للوصول لجميع ألعابك وباقاتك.
          </p>
        </div>

        <div className="mt-6 rounded-3xl border border-border bg-card p-5 sm:p-7 shadow-sm">
          {/* Prominent Google Sign-in */}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full flex items-center justify-center gap-3 border-border bg-surface-1 font-bold text-foreground hover:bg-surface-2 transition-colors"
            onClick={googleSignIn}
            disabled={loading}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>المتابعة عبر Google</span>
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>أو برقم الهاتف</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          {/* Phone OTP Section */}
          {phoneStep === "enter_phone" ? (
            <form onSubmit={sendPhoneOtp} className="space-y-4">
              <div>
                <Label htmlFor="phone-number" className="text-sm font-semibold">
                  رقم الهاتف
                </Label>
                <div className="mt-1.5 grid grid-cols-[120px_1fr] gap-2">
                  <select
                    id="country"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="h-11 rounded-xl border border-input bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={loading}
                  >
                    <option value="+962">الأردن +962</option>
                    <option value="+970">فلسطين +970</option>
                  </select>
                  <Input
                    id="phone-number"
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
                <p className="mt-1.5 text-xs text-muted-foreground">
                  سنرسل لك رسالة نصية قصيرة (SMS) برمز التحقق المكوّن من 6 أرقام.
                </p>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full h-11 rounded-xl font-bold flex items-center justify-center gap-2"
                disabled={loading || !phone.trim()}
              >
                <Phone className="h-4 w-4" />
                <span>{loading ? "جاري الإرسال..." : "إرسال رمز التحقق"}</span>
              </Button>
            </form>
          ) : (
            /* OTP Verification Step */
            <div className="space-y-5">
              <div className="rounded-2xl bg-surface-2 p-3.5 text-center">
                <p className="text-xs text-muted-foreground">تم إرسال رمز التحقق عبر SMS إلى:</p>
                <p dir="ltr" className="mt-1 font-mono font-bold text-foreground text-sm">
                  {formatDisplayPhone(countryCode, phone)}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPhoneStep("enter_phone");
                    setOtp("");
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline"
                >
                  <ArrowRight className="h-3 w-3" />
                  <span>تغيير رقم الهاتف</span>
                </button>
              </div>

              <div>
                <Label className="block text-center text-sm font-semibold mb-2">
                  أدخل رمز التحقق (6 أرقام)
                </Label>
                <div dir="ltr" className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={(value) => {
                      setOtp(value);
                      if (value.length === 6) {
                        void verifyOtp(value);
                      }
                    }}
                    autoFocus
                    disabled={loading}
                  >
                    <InputOTPGroup className="gap-1.5 sm:gap-2">
                      <InputOTPSlot
                        index={0}
                        className="h-12 w-10 sm:h-13 sm:w-12 rounded-xl border text-lg font-bold"
                      />
                      <InputOTPSlot
                        index={1}
                        className="h-12 w-10 sm:h-13 sm:w-12 rounded-xl border text-lg font-bold"
                      />
                      <InputOTPSlot
                        index={2}
                        className="h-12 w-10 sm:h-13 sm:w-12 rounded-xl border text-lg font-bold"
                      />
                      <InputOTPSlot
                        index={3}
                        className="h-12 w-10 sm:h-13 sm:w-12 rounded-xl border text-lg font-bold"
                      />
                      <InputOTPSlot
                        index={4}
                        className="h-12 w-10 sm:h-13 sm:w-12 rounded-xl border text-lg font-bold"
                      />
                      <InputOTPSlot
                        index={5}
                        className="h-12 w-10 sm:h-13 sm:w-12 rounded-xl border text-lg font-bold"
                      />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>

              <Button
                type="button"
                size="lg"
                className="w-full h-11 rounded-xl font-bold flex items-center justify-center gap-2"
                onClick={() => void verifyOtp()}
                disabled={loading || otp.length !== 6}
              >
                <ShieldCheck className="h-4 w-4" />
                <span>{loading ? "جاري التحقق..." : "تأكيد والدخول"}</span>
              </Button>

              <div className="text-center">
                {cooldown > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    إعادة إرسال الرمز خلال{" "}
                    <span className="font-mono font-bold text-foreground">{cooldown}</span> ثانية
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={resendOtp}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    <span>إعادة إرسال رمز التحقق</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Secondary Email/Password Collapsible Section */}
          <div className="mt-6 pt-5 border-t border-border">
            <button
              type="button"
              onClick={() => setShowEmailAuth((prev) => !prev)}
              className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5" />
                <span>خيارات أخرى: الدخول بالبريد الإلكتروني</span>
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${showEmailAuth ? "rotate-180" : ""}`}
              />
            </button>

            {showEmailAuth && (
              <div className="mt-4 pt-4 border-t border-border/60">
                <Tabs defaultValue="signin" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 rounded-xl">
                    <TabsTrigger value="signin" className="rounded-lg text-xs font-bold">
                      تسجيل الدخول
                    </TabsTrigger>
                    <TabsTrigger value="signup" className="rounded-lg text-xs font-bold">
                      حساب جديد
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="signin" className="mt-4">
                    <form className="space-y-3" onSubmit={emailSignIn}>
                      <div>
                        <Label htmlFor="email" className="text-xs">
                          البريد الإلكتروني
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="mt-1 h-10 rounded-xl text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="password" className="text-xs">
                          كلمة المرور
                        </Label>
                        <Input
                          id="password"
                          type="password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="mt-1 h-10 rounded-xl text-sm"
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full h-10 rounded-xl font-bold"
                        disabled={loading}
                      >
                        {loading ? "جاري الدخول..." : "دخول"}
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="signup" className="mt-4">
                    <form className="space-y-3" onSubmit={emailSignUp}>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label htmlFor="fn" className="text-xs">
                            الاسم الأول
                          </Label>
                          <Input
                            id="fn"
                            required
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            className="mt-1 h-10 rounded-xl text-sm"
                          />
                        </div>
                        <div>
                          <Label htmlFor="ln" className="text-xs">
                            اسم العائلة
                          </Label>
                          <Input
                            id="ln"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            className="mt-1 h-10 rounded-xl text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="email2" className="text-xs">
                          البريد الإلكتروني
                        </Label>
                        <Input
                          id="email2"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="mt-1 h-10 rounded-xl text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-[110px_1fr] gap-2">
                        <div>
                          <Label htmlFor="country2" className="text-xs">
                            رمز الدولة
                          </Label>
                          <select
                            id="country2"
                            value={signupCountryCode}
                            onChange={(e) => setSignupCountryCode(e.target.value)}
                            className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-2 text-xs"
                          >
                            <option value="+962">الأردن +962</option>
                            <option value="+970">فلسطين +970</option>
                          </select>
                        </div>
                        <div>
                          <Label htmlFor="phone2" className="text-xs">
                            رقم التلفون
                          </Label>
                          <Input
                            id="phone2"
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel-national"
                            dir="ltr"
                            required
                            value={signupPhone}
                            onChange={(e) => setSignupPhone(e.target.value.replace(/[^0-9+]/g, ""))}
                            placeholder={signupCountryCode === "+970" ? "0591234567" : "0791234567"}
                            className="mt-1 h-10 rounded-xl text-left font-mono text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="password2" className="text-xs">
                          كلمة المرور
                        </Label>
                        <Input
                          id="password2"
                          type="password"
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="mt-1 h-10 rounded-xl text-sm"
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full h-10 rounded-xl font-bold"
                        disabled={loading}
                      >
                        {loading ? "جاري إنشاء الحساب..." : "إنشاء الحساب"}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
