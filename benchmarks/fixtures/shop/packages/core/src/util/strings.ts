/** Turns a product name into the slug used in its URL. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Keeps digits and a leading plus; Italian numbers without prefix get +39. */
export function normalizePhone(raw: string): string {
  const compact = raw.replace(/[\s\-().]/g, "");
  const digits = compact.startsWith("+") ? "+" + compact.slice(1).replace(/\D/g, "") : compact.replace(/\D/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  return "+39" + digits;
}

export function capitalize(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}
