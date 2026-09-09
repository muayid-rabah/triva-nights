const countryDigits = (countryCode: string) => countryCode.replace(/\D/g, "");

/** Accept 079… and 96279… alike, then keep one canonical local number. */
export function normalizePhone(countryCode: string, value: string) {
  const country = countryDigits(countryCode);
  let local = value.replace(/\D/g, "");
  if (country && local.startsWith(country)) local = local.slice(country.length);
  return local.replace(/^0/, "");
}

export function phoneError(countryCode: string, value: string) {
  const local = normalizePhone(countryCode, value);
  if (countryCode === "+962" && !/^7\d{8}$/.test(local)) return "اكتب رقم أردني مثل 0791234567 أو 791234567.";
  if (countryCode === "+970" && !/^(56|59)\d{7}$/.test(local)) return "اكتب رقم فلسطيني مثل 0591234567 أو 591234567.";
  if (local.length < 7 || local.length > 12) return "اكتب رقم هاتف صحيح.";
  return null;
}
