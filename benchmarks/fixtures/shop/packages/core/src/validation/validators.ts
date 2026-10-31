import type { Address } from "../domain/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Accepts addresses like name@domain.tld; rejects spaces and missing parts. */
export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length > 254) return false;
  return EMAIL_PATTERN.test(trimmed);
}

/** Usernames: 3 to 20 lowercase letters, digits or underscores, starting with a letter. */
export function validateUsername(username: string): string[] {
  const errors: string[] = [];
  if (username.length < 3 || username.length > 20) errors.push("Username must be 3-20 characters long");
  if (!/^[a-z]/.test(username)) errors.push("Username must start with a letter");
  if (!/^[a-z0-9_]*$/.test(username)) errors.push("Username may contain only a-z, 0-9 and _");
  return errors;
}

/** SKUs: three uppercase letters, a dash and four to six digits (ABC-1234). */
export function validateSku(sku: string): string[] {
  const errors: string[] = [];
  if (sku.length < 8 || sku.length > 10) errors.push("SKU must be 8-10 characters long");
  if (!/^[A-Z]{3}-/.test(sku)) errors.push("SKU must start with three uppercase letters and a dash");
  if (!/^[A-Z]{3}-\d{4,6}$/.test(sku)) errors.push("SKU must end with 4-6 digits");
  return errors;
}

const POSTAL_CODE_PATTERNS: Record<string, RegExp> = {
  IT: /^\d{5}$/,
  DE: /^\d{5}$/,
  FR: /^\d{5}$/,
  NL: /^\d{4}\s?[A-Z]{2}$/,
  GB: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/,
};

/** A shipping address is valid when every field is filled and the postal code matches the country. */
export function validateAddress(address: Address): string[] {
  const errors: string[] = [];
  if (address.street.trim() === "") errors.push("Street is required");
  if (address.city.trim() === "") errors.push("City is required");
  if (address.country.trim() === "") errors.push("Country is required");
  const pattern = POSTAL_CODE_PATTERNS[address.country.toUpperCase()];
  if (pattern === undefined) {
    errors.push(`We do not ship to ${address.country}`);
  } else if (!pattern.test(address.postalCode.trim().toUpperCase())) {
    errors.push("Postal code is not valid for the country");
  }
  return errors;
}
