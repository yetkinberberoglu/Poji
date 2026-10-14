/**
 * IBAN checking, offline.
 *
 * An IBAN is not just a string: ISO 13616 builds a checksum into it. Move
 * the first four characters to the end, turn each letter into a number
 * (A=10 … Z=35), read the result as one long integer, and the remainder
 * when divided by 97 must be exactly 1. Mistype a digit, or swap two of
 * them, and the arithmetic stops working. No bank, no network, no API
 * key - the number proves itself.
 *
 * What this does NOT tell us: whether the account exists, whether it is
 * open, or whether it belongs to the person who typed it. Only that the
 * number is a well-formed one. That is still worth having, because the
 * failure we are avoiding is a payout that leaves, bounces, and comes
 * back three weeks later with the provider wondering where their money
 * went.
 */

/**
 * Length per country. Revolut is the reason this is a table rather than a
 * single number: a Revolut account opened in Malta is MT and 31
 * characters, the same product opened in Lithuania is LT and 20. Both are
 * real, and a provider may hold either.
 */
const IBAN_LENGTHS: Record<string, number> = {
  AD:24, AE:23, AT:20, BE:16, BG:22, CH:21, CY:28, CZ:24, DE:22, DK:18,
  EE:20, ES:24, FI:18, FR:27, GB:22, GI:23, GR:27, HR:21, HU:28, IE:22,
  IS:26, IT:27, LI:21, LT:20, LU:20, LV:21, MC:27, MD:24, MK:19, MT:31,
  NL:18, NO:15, PL:28, PT:25, RO:24, RS:22, SA:24, SE:24, SI:19, SK:24,
  SM:27, TR:26, UA:29, VA:22,
};

/** Spaces and dashes are how people write it; neither is part of it. */
export const normaliseIban = (s: string) =>
  String(s || '').replace(/[\s-]/g, '').toUpperCase();

/**
 * The mod-97 remainder, computed a digit at a time.
 *
 * The rearranged number runs to thirty-odd digits, past what a JavaScript
 * number holds exactly, so it is never assembled: each digit is folded
 * into a running remainder instead, which stays below 97 throughout.
 */
function mod97(iban: string): number {
  const rotated = iban.slice(4) + iban.slice(0, 4);
  let acc = 0;
  for (const ch of rotated) {
    const code = ch.charCodeAt(0);
    // A–Z become 10–35, and each of those is fed in as two digits
    const part = code >= 65 && code <= 90 ? String(code - 55) : ch;
    for (const d of part) acc = (acc * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return acc;
}

export type IbanCheck = { ok: boolean; value: string; reason?: string };

/**
 * Checks an IBAN and says what is wrong in words a person can act on.
 *
 * An empty string comes back not-ok with no reason, so a caller can treat
 * "not filled in" differently from "filled in wrongly" - leaving it blank
 * is allowed during sign-up, getting it wrong is not.
 */
export function validateIban(raw: string): IbanCheck {
  const value = normaliseIban(raw);
  if (!value) return { ok: false, value: '' };

  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(value))
    return { ok: false, value,
      reason: 'an IBAN starts with two letters and two digits, then the account' };

  const country = value.slice(0, 2);
  const want = IBAN_LENGTHS[country];

  /* An unknown country code is not treated as wrong. This table is a
     snapshot and countries do get added; refusing a valid account because
     our list is a year old would be our mistake charged to the provider.
     The checksum below still has to pass either way. */
  if (want && value.length !== want)
    return { ok: false, value,
      reason: `a ${country} IBAN is ${want} characters — this one is ${value.length}` };

  if (mod97(value) !== 1)
    return { ok: false, value,
      reason: 'the check digits do not match, so a character is wrong somewhere' };

  return { ok: true, value };
}

/** Grouped in fours, the way it is printed on a statement. */
export const prettyIban = (s: string) =>
  normaliseIban(s).replace(/(.{4})/g, '$1 ').trim();
