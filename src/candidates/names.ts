/**
 * Name tokens for the name signal: camelCase and snake_case split, lowercased, plural stripped,
 * and mapped to a canonical word when they belong to a small group of synonyms.
 */

/** Groups of words used for the same intent in business code. The first word is the canonical one. */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["get", "fetch", "load", "find", "read", "retrieve", "lookup", "query"],
  ["remove", "delete", "destroy", "drop", "erase", "purge"],
  ["deactivate", "close", "disable", "suspend", "deactivated", "closed"],
  ["create", "add", "new", "make", "build", "insert", "register"],
  ["update", "edit", "modify", "patch", "change", "set"],
  ["validate", "check", "verify", "ensure", "assert", "valid", "validation"],
  ["compute", "calculate", "calc", "count", "sum", "total", "amount", "estimate", "quote"],
  ["user", "account", "customer", "person", "people", "member", "client", "profile"],
  ["price", "cost", "fee", "charge"],
  ["format", "render", "display", "print", "show"],
  ["normalize", "clean", "sanitize", "scrub", "strip", "tidy"],
  ["mask", "hide", "redact", "obfuscate"],
  ["anonymize", "anonymise", "pseudonymize"],
  ["cancel", "abort", "void", "cancellable", "cancelled", "canceled"],
  ["email", "mail"],
  ["invoice", "bill", "billing"],
  ["discount", "promotion", "promo", "coupon", "voucher", "reward", "loyalty", "point"],
  ["ship", "shipping", "delivery", "deliver", "shipment"],
  ["stock", "inventory", "restock", "reorder"],
  ["password", "credential", "passphrase"],
  ["session", "login", "token"],
  ["tax", "vat"],
  ["day", "date", "time"],
  ["phone", "telephone", "mobile"],
  ["expire", "expired", "expiry", "timeout"],
  ["overdue", "late"],
];

const CANONICAL = new Map<string, string>(
  SYNONYM_GROUPS.flatMap((group) => group.map((word) => [word, group[0] ?? word] as const)),
);

/** Words that carry no intent on their own. */
const STOP_WORDS = new Set(["is", "has", "can", "should", "for", "of", "the", "a", "an", "and", "or", "from", "with", "into", "on", "all", "to"]);

function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** `checkEmailFormat` → `["validate", "email", "format"]` */
export function nameTokens(name: string): string[] {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w !== "" && !STOP_WORDS.has(w));
  const tokens = words.map((w) => {
    const base = singular(w);
    return CANONICAL.get(w) ?? CANONICAL.get(base) ?? base;
  });
  return [...new Set(tokens)];
}
