import type { AuthError } from "@supabase/supabase-js";

interface FriendlyError {
  title: string;
  description?: string;
}

export function mapAuthError(error: AuthError | Error | unknown): FriendlyError {
  if (!error) {
    return { title: "حدث خطأ غير متوقع", description: "يرجى المحاولة مرة أخرى." };
  }

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof (error as { message: unknown }).message === "string"
        ? (error as { message: string }).message
        : String(error);

  const message = rawMessage.toLowerCase();

  // Rate limits / cooldown
  if (
    message.includes("for security purposes") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return {
      title: "يرجى الانتظار قليلاً",
      description: "تم إرسال طلبات متعددة خلال فترة قصيرة. انتظر دقيقة ثم حاول مجدداً.",
    };
  }

  // Invalid OTP token
  if (
    message.includes("token has expired") ||
    message.includes("token is invalid") ||
    message.includes("invalid token") ||
    message.includes("otp expired")
  ) {
    return {
      title: "رمز التحقق غير صحيح أو منتهي",
      description: "تأكد من إدخال الأرقام الستة بشكل صحيح أو اطلب رمزاً جديداً.",
    };
  }

  // SMS provider issues or disabled
  if (
    message.includes("sms sending failed") ||
    message.includes("error sending sms") ||
    message.includes("provider") ||
    message.includes("sms")
  ) {
    return {
      title: "تعذّر إرسال رسالة التحقق (SMS)",
      description: "يرجى التأكد من اتصال الإنترنت أو محاولة التسجيل لاحقاً.",
    };
  }

  // Signups not allowed / OTP disabled in Supabase project
  if (message.includes("signups not allowed") || message.includes("otp disabled")) {
    return {
      title: "تسجيل الدخول عبر الهاتف غير متاح حالياً",
      description: "يمكنك المتابعة باستخدام حساب Google أو البريد الإلكتروني.",
    };
  }

  // Invalid login credentials (email/password)
  if (message.includes("invalid login credentials") || message.includes("invalid credentials")) {
    return {
      title: "بيانات الدخول غير صحيحة",
      description: "تأكد من صحة البريد الإلكتروني وكلمة المرور.",
    };
  }

  // User already exists
  if (message.includes("user already registered") || message.includes("already registered")) {
    return {
      title: "هذا البريد مسجل مسبقاً",
      description: "يمكنك تسجيل الدخول مباشرة بدلاً من إنشاء حساب جديد.",
    };
  }

  // Password requirements
  if (
    message.includes("password should be at least") ||
    message.includes("weak password") ||
    message.includes("easy to guess")
  ) {
    return {
      title: "كلمة المرور سهلة أو قصيرة",
      description: "اختر كلمة مرور مكوّنة من 6 خانات على الأقل وتحتوي أرقاماً وحروفاً.",
    };
  }

  // Phone account limit in app
  if (message.includes("phone_account_limit")) {
    return {
      title: "وصلت الحد المسموح لهذا الرقم",
      description: "للحفاظ على عدالة اللعب، يسمح بحسابين فقط لكل رقم هاتف.",
    };
  }

  // Phone invalid
  if (message.includes("phone_invalid")) {
    return {
      title: "رقم الهاتف غير صحيح",
      description: "تأكد من كتابة رقم هاتف صالح يبدأ بـ 077 أو 078 أو 079.",
    };
  }

  // Phone locked in profile
  if (message.includes("phone_locked")) {
    return {
      title: "رقم الهاتف مثبت مسبقاً",
      description: "رقم هاتفك مربوط بالفعل ولا يمكن تغييره.",
    };
  }

  // Network offline
  if (message.includes("network") || message.includes("failed to fetch")) {
    return {
      title: "تعذّر الاتصال بالخادم",
      description: "تأكد من اتصالك بالإنترنت وحاول مرة أخرى.",
    };
  }

  // Fallback with original message
  return {
    title: "تعذّر إكمال العملية",
    description: rawMessage || "حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.",
  };
}
