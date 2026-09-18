const countryDigits = (countryCode: string) => countryCode.replace(/\D/g, "");

/** Accept 079…, +962079…, and 96279… alike, then keep one canonical local number. */
export function normalizePhone(countryCode: string, value: string) {
  const country = countryDigits(countryCode);
  let local = value.replace(/\D/g, "");
  while (country && local.startsWith(country)) {
    local = local.slice(country.length);
  }
  return local.replace(/^0+/, "");
}

export function phoneError(countryCode: string, value: string) {
  const local = normalizePhone(countryCode, value);
  if (countryCode === "+962") {
    if (!/^(77|78|79)\d{7}$/.test(local)) {
      return "اكتب رقم أردني صحيح يبدأ بـ 077 أو 078 أو 079 (مثل 0791234567).";
    }
    return null;
  }
  if (countryCode === "+970") {
    if (!/^(56|59)\d{7}$/.test(local)) {
      return "اكتب رقم فلسطيني مثل 0591234567 أو 591234567.";
    }
    return null;
  }
  if (local.length < 7 || local.length > 12) return "اكتب رقم هاتف صحيح.";
  return null;
}

/** Returns the standard E.164 phone string required by Supabase Auth (e.g. +962791234567). */
export function formatE164(countryCode: string, value: string): string {
  const local = normalizePhone(countryCode, value);
  const code = countryCode.startsWith("+") ? countryCode : `+${countryCode}`;
  return `${code}${local}`;
}

/** Formats phone for user display during OTP verification (e.g. +962 791234567). */
export function formatDisplayPhone(countryCode: string, value: string): string {
  const local = normalizePhone(countryCode, value);
  const code = countryCode.startsWith("+") ? countryCode : `+${countryCode}`;
  return `${code} ${local}`;
}
