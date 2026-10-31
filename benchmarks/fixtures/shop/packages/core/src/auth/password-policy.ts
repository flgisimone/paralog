const COMMON_PASSWORDS = new Set(["password123!", "qwerty123456", "letmein12345", "welcome2026!"]);

export class PasswordPolicy {
  /** Returns the rules the password breaks; empty when it is acceptable. */
  validate(password: string): string[] {
    const problems: string[] = [];
    if (password.length < 12) problems.push("at least 12 characters");
    if (!/[A-Z]/.test(password)) problems.push("an uppercase letter");
    if (!/[0-9]/.test(password)) problems.push("a digit");
    if (!/[^A-Za-z0-9]/.test(password)) problems.push("a symbol");
    if (COMMON_PASSWORDS.has(password.toLowerCase())) problems.push("not a common password");
    return problems;
  }
}
