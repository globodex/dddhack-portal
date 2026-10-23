import { demand } from "./security";
export function normalizePhone(value: string) {
  const raw = value.trim();
  demand(
    /^\+[0-9 ()-]+$/.test(raw),
    422,
    "PHONE_REQUIRED",
    "Include your phone’s country code, starting with +.",
  );
  const phone = "+" + raw.slice(1).replace(/[^0-9]/g, "");
  demand(
    /^\+[1-9][0-9]{7,14}$/.test(phone),
    422,
    "PHONE_REQUIRED",
    "Enter a valid international phone number.",
  );
  return phone;
}
export function teamPhone(value: string | undefined) {
  if (!value) return {};
  try {
    const phone = normalizePhone(value);
    return { phone, whatsappUrl: "https://wa.me/" + phone.slice(1) };
  } catch {
    return {};
  }
}
