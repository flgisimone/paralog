const WEAK = ["password123!", "qwerty123456", "letmein12345", "welcome2026!"];

/** Password check used when an admin resets a customer password. */
export function checkPasswordStrength(candidate: string): { ok: boolean; missing: string[] } {
  const rules: [boolean, string][] = [
    [candidate.length >= 12, "at least 12 characters"],
    [/[A-Z]/.test(candidate), "an uppercase letter"],
    [/\d/.test(candidate), "a digit"],
    [/[^A-Za-z0-9]/.test(candidate), "a symbol"],
    [!WEAK.includes(candidate.toLowerCase()), "not a common password"],
  ];
  const missing = rules.filter(([passed]) => !passed).map(([, rule]) => rule);
  return { ok: missing.length === 0, missing };
}
