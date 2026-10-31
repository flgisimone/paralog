import type { Address } from "@shop/core";

/** Support checks the e-mail typed by a customer on the phone. */
export function checkEmailFormat(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Phone numbers typed by agents, in any format, to E.164. */
export function cleanPhoneNumber(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input.charAt(i);
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "+" && out.length === 0) out = "+";
  }
  if (out.charAt(0) === "+") return out;
  if (out.substring(0, 2) === "00") return "+" + out.substring(2);
  return "+39" + out;
}

const POSTAL_RULES: Record<string, RegExp> = {
  IT: /^\d{5}$/,
  DE: /^\d{5}$/,
  FR: /^\d{5}$/,
  NL: /^\d{4}\s?[A-Z]{2}$/,
  GB: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/,
};

/** Step 1 of checking an address typed by an agent: the postal code for the country. */
export function checkPostalCode(country: string, postalCode: string): string | undefined {
  const rule = POSTAL_RULES[country.toUpperCase()];
  if (!rule) return `We do not ship to ${country}`;
  return rule.test(postalCode.trim().toUpperCase()) ? undefined : "Postal code is not valid for the country";
}

/** Step 2 of checking an address typed by an agent: the mandatory fields. */
export function hasRequiredAddressFields(address: Address): boolean {
  return [address.street, address.city, address.country].every((field) => field.trim().length > 0);
}
