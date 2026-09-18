// src/routes/delete-account.tsx
// Public Google Play Compliant Account & Data Deletion Page
// Application: قدّ التحدي | Developer: NextAura Studios

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Mail,
  ShieldAlert,
  ArrowRight,
  HelpCircle,
  Smartphone,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { executeAccountDeletion } from "@/lib/account-deletion-client";

export const Route = createFileRoute("/delete-account")({
  head: () => ({
    meta: [
      { title: "حذف الحساب والبيانات | قدّ التحدي - NextAura Studios" },
      {
        name: "description",
        content:
          "صفحة طلب حذف الحساب والبيانات الشخصية لتطبيق قدّ التحدي المقدم من استوديوهات NextAura Studios وفقاً لمعايير Google Play وسياسات الخصوصية.",
      },
      { property: "og:title", content: "حذف الحساب والبيانات | قدّ التحدي" },
      {
        property: "og:description",
        content:
          "طلب الحذف الدائم للحساب والبيانات الشخصية من تطبيق وموقع قدّ التحدي (NextAura Studios).",
      },
    ],
  }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    email?: string | null;
    phone?: string | null;
    name?: string | null;
  } | null>(null);

  const [loadingUser, setLoadingUser] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [isDeletedSuccess, setIsDeletedSuccess] = useState(false);

  // Unauthenticated verification flow
  const [verifyEmail, setVerifyEmail] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  useEffect(() => {
    // Check if redirected with ?deleted=true
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("deleted") === "true") {
        setIsDeletedSuccess(true);
      }
    }

    async function checkAuth() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name, last_name, email, phone")
            .eq("id", session.user.id)
            .maybeSingle();

          const fullName = [profile?.first_name, profile?.last_name]
            .filter(Boolean)
            .join(" ")
            .trim();

          setCurrentUser({
            id: session.user.id,
            email: session.user.email ?? profile?.email ?? null,
            phone: session.user.phone ?? profile?.phone ?? null,
            name: fullName || "مستخدم قدّ التحدي",
          });
        }
      } catch (err) {
        console.warn("[DeleteAccount] Auth lookup failed:", err);
      } finally {
        setLoadingUser(false);
      }
    }

    checkAuth();
  }, []);

  // Handle email OTP request for unauthenticated users
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!verifyEmail || !verifyEmail.includes("@")) {
      toast.error("يرجى إدخال بريد إلكتروني صالح");
      return;
    }

    setIsSendingOtp(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: verifyEmail.trim().toLowerCase(),
        options: {
          shouldCreateUser: false, // Do not register new users on deletion page
        },
      });

      if (error) {
        // If user doesn't exist, display a safe neutral message
        toast.error(
          "تعذر إرسال رمز التحقق. يرجى التأكد من صحة البريد الإلكتروني أو أنه مسجل لدينا.",
        );
        return;
      }

      setOtpSent(true);
      toast.success("تم إرسال رمز التحقق إلى بريدك الإلكتروني بنجاح.");
    } catch {
      toast.error("حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.");
    } finally {
      setIsSendingOtp(false);
    }
  }

  // Handle OTP verification
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otpToken || otpToken.trim().length < 6) {
      toast.error("يرجى إدخال رمز التحقق المكون من 6 أرقام");
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: verifyEmail.trim().toLowerCase(),
        token: otpToken.trim(),
        type: "email",
      });

      if (error || !data.user) {
        toast.error("رمز التحقق غير صحيح أو انتهت صلاحيته");
        return;
      }

      // Successfully authenticated
      setCurrentUser({
        id: data.user.id,
        email: data.user.email,
        phone: data.user.phone,
        name: "مستخدم مؤكد",
      });
      toast.success("تم تأكيد هويتك بنجاح. يمكنك الآن متابعة حذف الحساب.");
    } catch {
      toast.error("حدث خطأ أثناء التحقق من الرمز.");
    } finally {
      setIsVerifyingOtp(false);
    }
  }

  // Handle final account deletion execution
  async function handleConfirmDelete() {
    setIsDeleting(true);
    try {
      await executeAccountDeletion();
      setIsDeletedSuccess(true);
      setCurrentUser(null);
      toast.success("تم حذف حسابك وجميع بياناتك نهائياً.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر إتمام عملية الحذف";
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  }

  const isConfirmed = confirmInput.trim() === "حذف" || confirmInput.trim().toUpperCase() === "DELETE";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans" dir="rtl">
      <SiteHeader />

      <main className="flex-1 mx-auto max-w-4xl px-4 py-8 sm:py-12 w-full">
        {/* Header Branding */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 text-destructive mb-4 border border-destructive/20 shadow-sm">
            <Trash2 className="w-8 h-8" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
            حذف الحساب والبيانات
          </h1>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground font-medium">
            تطبيق <span className="font-bold text-foreground">قدّ التحدي</span> · المطور:{" "}
            <span className="font-bold text-foreground">NextAura Studios</span>
          </p>
          <div className="mt-3 inline-block rounded-full bg-surface-2 px-3 py-1 text-xs text-muted-foreground border border-border">
            متوافق مع معايير خصوصية وحذف بيانات المستخدم في Google Play
          </div>
        </div>

        {/* State 1: Account Successfully Deleted */}
        {isDeletedSuccess ? (
          <div className="rounded-3xl border border-success/30 bg-success/5 p-6 sm:p-10 text-center shadow-lg">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/15 text-success mb-4">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">تم حذف حسابك بنجاح</h2>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
              تم حذف حسابك في لعبة قدّ التحدي وجميع بياناتك الشخصية من خوادمنا بشكل دائم. نشكرك على
              الوقت الذي قضيته معنا ونأمل أن نراك مجدداً.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/">
                <Button className="w-full sm:w-auto font-bold bg-primary text-primary-foreground hover:bg-primary/90">
                  العودة للصفحة الرئيسية
                </Button>
              </Link>
              <Link to="/privacy">
                <Button variant="outline" className="w-full sm:w-auto">
                  قراءة سياسة الخصوصية
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Information Policy Section */}
            <section className="rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <ShieldAlert className="h-6 w-6 text-destructive" />
                <h2 className="text-xl font-bold text-foreground">ماذا يحدث عند حذف حسابك؟</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 text-sm leading-relaxed">
                <div className="rounded-2xl bg-surface-2/60 p-4 border border-border">
                  <h3 className="font-bold text-destructive mb-2 flex items-center gap-2">
                    <span>🗑️</span> البيانات التي يتم حذفها نهائياً:
                  </h3>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li>الملف الشخصي بالكامل (الاسم، البريد الإلكتروني، والصورة).</li>
                    <li>رقم الهاتف الموثق وأي مطالبات سابقة به.</li>
                    <li>رصيد الألعاب المتبقي والمشتريات داخل اللعبة.</li>
                    <li>سجل الجولات والألعاب التي تم إنشاؤها وتاريخ النتائج.</li>
                    <li>العضوية في الغرف المشتركة والتنافسية.</li>
                  </ul>
                </div>

                <div className="rounded-2xl bg-surface-2/60 p-4 border border-border">
                  <h3 className="font-bold text-foreground mb-2 flex items-center gap-2">
                    <span>⚖️</span> البيانات التي قد يُحتفظ بها لأغراض قانونية:
                  </h3>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    وفقاً للالتزامات الضريبية والقانونية والتنظيمية، قد يتم الاحتفاظ بسجلات المعاملات
                    المالية المكتملة بصيغة مجهولة الهوية تماماً (بدون أي ربط بهويتك الشخصية أو حسابك)
                    لأغراض التدقيق المالي ومكافحة الاحتيال.
                  </p>
                </div>
              </div>

              {/* Subscriptions Warning */}
              <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-warning text-xs sm:text-sm leading-relaxed flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-warning" />
                <div>
                  <span className="font-bold block mb-1">تنبيه هام بشأن الاشتراكات المتكررة:</span>
                  حذف الحساب من داخل التطبيق{" "}
                  <strong className="underline">لا يلغي بالضرورة اشتراكك التلقائي</strong> عبر{" "}
                  <strong>Google Play</strong> أو مزود الدفع الخارجي. يجب إلغاء الاشتراك أولاً عبر
                  متجر Google Play من خلال قائمة "المدفوعات والاشتراكات" لتجنب تجديد الفوترة.
                  <div className="mt-2">
                    <a
                      href="https://play.google.com/store/account/subscriptions"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-bold underline hover:text-warning/80"
                    >
                      <span>إدارة اشتراكاتك على Google Play</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </section>

            {/* Deletion Execution Section */}
            <section className="rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-sm">
              {loadingUser ? (
                <div className="py-12 text-center text-muted-foreground animate-pulse">
                  جاري التحقق من حالة الحساب...
                </div>
              ) : currentUser ? (
                /* Authenticated User Deletion Confirmation */
                <div className="space-y-6">
                  <div className="rounded-2xl bg-surface-2 p-5 border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground block">
                        الحساب المسجل حالياً:
                      </span>
                      <p className="text-lg font-bold text-foreground">{currentUser.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {currentUser.email || currentUser.phone || currentUser.id}
                      </p>
                    </div>
                    <span className="rounded-full bg-success/15 text-success px-3 py-1 text-xs font-bold">
                      تم التحقق من الهوية
                    </span>
                  </div>

                  <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm space-y-4">
                    <p className="text-destructive font-bold">
                      أنت على وشك حذف هذا الحساب نهائياً وبلا رجعة.
                    </p>

                    <div>
                      <Label htmlFor="confirm_del" className="text-xs font-semibold text-foreground">
                        لتأكيد الحذف، اكتب كلمة <strong className="text-destructive">حذف</strong> أو{" "}
                        <strong className="text-destructive">DELETE</strong> في الحقل أدناه:
                      </Label>
                      <Input
                        id="confirm_del"
                        type="text"
                        placeholder="حذف"
                        value={confirmInput}
                        onChange={(e) => setConfirmInput(e.target.value)}
                        className="mt-2 max-w-xs border-destructive/40 focus-visible:ring-destructive"
                        dir="ltr"
                      />
                    </div>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          disabled={!isConfirmed || isDeleting}
                          className="font-bold px-6"
                        >
                          {isDeleting ? "جاري حذف الحساب..." : "تأكيد حذف الحساب نهائياً"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent dir="rtl" className="bg-card border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-destructive flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            <span>تأكيد نهائي لحذف الحساب</span>
                          </AlertDialogTitle>
                          <AlertDialogDescription className="text-muted-foreground leading-relaxed">
                            هل أنت متأكد تماماً من رغبتك في حذف حسابك؟ سيتم محو جميع بياناتك ورصيدك
                            وسجلات اللعب فوراً ولا يمكن استرجاعها مطلقاً.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="flex-row-reverse gap-2">
                          <AlertDialogCancel disabled={isDeleting}>تراجع</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold"
                          >
                            {isDeleting ? "جاري الحذف..." : "نعم، احذف حسابي الآن"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ) : (
                /* Unauthenticated User: Verification Flow */
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">
                      طلب حذف حساب عبر التحقق بالبريد الإلكتروني
                    </h2>
                    <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      إذا لم يعد التطبيق مثبتاً على جهازك، أدخل بريدك الإلكتروني المسجل لإرسال رمز
                      التحقق والتأكد من ملكية الحساب قبل إتمام الحذف.
                    </p>
                  </div>

                  {!otpSent ? (
                    <form onSubmit={handleSendOtp} className="space-y-4 max-w-md">
                      <div>
                        <Label htmlFor="del_email" className="text-xs font-semibold">
                          البريد الإلكتروني المرتبط بحسابك
                        </Label>
                        <div className="relative mt-1.5">
                          <Input
                            id="del_email"
                            type="email"
                            required
                            placeholder="your-email@example.com"
                            value={verifyEmail}
                            onChange={(e) => setVerifyEmail(e.target.value)}
                            dir="ltr"
                            className="pl-10"
                          />
                          <Mail className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>

                      <Button
                        type="submit"
                        disabled={isSendingOtp}
                        className="w-full font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        {isSendingOtp ? "جاري الإرسال..." : "إرسال رمز التحقق"}
                      </Button>
                    </form>
                  ) : (
                    <form onSubmit={handleVerifyOtp} className="space-y-4 max-w-md">
                      <div className="rounded-xl bg-surface-2 p-3 text-xs text-muted-foreground border border-border">
                        تم إرسال رمز التحقق إلى: <strong className="text-foreground">{verifyEmail}</strong>
                        <button
                          type="button"
                          onClick={() => setOtpSent(false)}
                          className="mr-2 text-primary font-bold underline"
                        >
                          تغيير البريد
                        </button>
                      </div>

                      <div>
                        <Label htmlFor="del_otp" className="text-xs font-semibold">
                          رمز التحقق (OTP)
                        </Label>
                        <Input
                          id="del_otp"
                          type="text"
                          required
                          placeholder="123456"
                          value={otpToken}
                          onChange={(e) => setOtpToken(e.target.value)}
                          dir="ltr"
                          className="mt-1.5 tracking-widest text-center text-lg font-bold"
                          maxLength={8}
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={isVerifyingOtp}
                        className="w-full font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        {isVerifyingOtp ? "جاري التحقق..." : "تأكيد ومتابعة الحذف"}
                      </Button>
                    </form>
                  )}

                  <div className="border-t border-border pt-4 text-xs text-muted-foreground">
                    <p className="flex items-center gap-1.5">
                      <HelpCircle className="h-4 w-4 shrink-0 text-primary" />
                      <span>
                        تواجه صعوبة في الوصول لبريدك أو مسجل برقم هاتف فقط؟ يمكنك التواصل معنا عبر{" "}
                        <Link to="/contact" className="font-bold text-primary hover:underline">
                          صفحة المساعدة والتواصل
                        </Link>{" "}
                        أو مراسلتنا على البريد الإلكتروني:{" "}
                        <strong className="text-foreground">support@nextaurastudios.com</strong>
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* English Summary Section for International / Reviewers */}
            <section className="rounded-3xl border border-border bg-card p-6 text-xs sm:text-sm text-muted-foreground space-y-3" dir="ltr">
              <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">
                Account & Data Deletion Policy (English Summary)
              </h3>
              <p>
                <strong>App:</strong> قدّ التحدي (Qadd Al-Tahaddi) · <strong>Developer:</strong> NextAura Studios
              </p>
              <p>
                In compliance with Google Play User Data policies, users can permanently delete their
                account and all associated personal data (profile, phone number, games, and room states)
                either in-app via their Profile settings or on this public page.
              </p>
              <p>
                <strong>Subscriptions:</strong> Deleting your account does not automatically cancel
                active Google Play or Paddle subscriptions. Please manage and cancel recurring
                subscriptions directly in your Google Play account settings.
              </p>
              <p>
                For any assistance, please contact us at{" "}
                <a href="mailto:support@nextaurastudios.com" className="text-primary underline">
                  support@nextaurastudios.com
                </a>
                .
              </p>
            </section>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
