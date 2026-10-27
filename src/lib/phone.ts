/** Zambian numbers like 0971234567 → 260971234567 for WhatsApp links. */
export function waNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "260" + digits.slice(1);
  return digits;
}
