/** Localities on the main island. */
export const MALTA_MAIN = [
  // Northern Harbour
  'Birkirkara','Gzira','Hamrun','Msida','Pembroke','Qormi','San Gwann',
  'Santa Venera','Sliema',"St. Julian's","Ta' Xbiex",'Swieqi',
  // Southern Harbour
  'Birgu','Bormla','Fgura','Floriana','Isla','Kalkara','Luqa','Marsa',
  'Paola','Santa Lucija','Tarxien','Valletta','Xghajra','Zabbar',
  // Northern
  'Mellieha','Mgarr','Mosta','Naxxar',"St. Paul's Bay",'Bugibba','Qawra',
  // Western
  'Attard','Balzan','Dingli','Iklin','Lija','Mdina','Rabat','Siggiewi','Zebbug',
  // South Eastern
  'Birzebbuga','Gudja','Ghaxaq','Kirkop','Marsaskala','Marsaxlokk','Mqabba',
  'Qrendi','Safi','Zejtun','Zurrieq',
];

/** Localities on Gozo and Comino. */
export const GOZO_LOCALITIES = [
  'Victoria','Fontana','Ghajnsielem','Gharb','Ghasri','Kercem','Marsalforn',
  'Munxar','Nadur','Qala','San Lawrenz','Sannat','Xaghra','Xewkija','Xlendi',
  'Zebbug (Gozo)','Comino',
];

/** Everything, for pickers that don't care which island. */
export const MALTA_LOCALITIES = [...MALTA_MAIN, ...GOZO_LOCALITIES];

/**
 * IBAN check — structure plus the mod-97 checksum.
 * Catches typos that would otherwise bounce a payment weeks later.
 */
export function validateIban(raw: string): { ok: boolean; reason?: string } {
  const iban = (raw || '').replace(/\s+/g, '').toUpperCase();

  if (!iban) return { ok:false, reason:'Enter your IBAN' };
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban))
    return { ok:false, reason:'That does not look like an IBAN' };

  const LENGTHS: Record<string, number> = {
    MT:31, IT:27, GB:22, DE:22, FR:27, ES:24, PT:25, NL:18, BE:16, IE:22,
    AT:20, PL:28, RO:24, BG:22, HU:28, HR:21, GR:27, CY:28, CZ:24, SK:24,
    SI:19, LT:20, LV:21, EE:20, FI:18, SE:24, DK:18, NO:15, CH:21, LU:20,
  };

  const country = iban.slice(0, 2);
  const expected = LENGTHS[country];
  if (expected && iban.length !== expected)
    return { ok:false, reason:`A ${country} IBAN has ${expected} characters, yours has ${iban.length}` };

  // mod-97: move the first four characters to the end, letters → numbers
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, ch => String(ch.charCodeAt(0) - 55));

  let remainder = 0;
  for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;

  if (remainder !== 1) return { ok:false, reason:'Those digits do not add up — check for a typo' };
  return { ok:true };
}

/** Pretty-print an IBAN in groups of four */
export const formatIban = (raw: string) =>
  (raw || '').replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();

/**
 * Malta mobile numbers are 8 digits starting 77, 79, 98 or 99.
 * We accept anything international but insist on a country code.
 */
export function validatePhone(raw: string): { ok: boolean; value?: string; reason?: string } {
  let v = (raw || '').replace(/[\s\-()]/g, '');
  if (!v) return { ok:false, reason:'Enter a mobile number' };

  // bare 8-digit Maltese number — add the country code for them
  if (/^[0-9]{8}$/.test(v) && /^(77|79|98|99|21|22|23|25|27)/.test(v)) v = '+356' + v;
  if (/^00/.test(v)) v = '+' + v.slice(2);
  if (!v.startsWith('+')) return { ok:false, reason:'Start with a country code, e.g. +356' };
  if (!/^\+[0-9]{8,15}$/.test(v)) return { ok:false, reason:'That number looks too short or too long' };

  if (v.startsWith('+356') && !/^\+356(77|79|98|99|21|22|23|25|27)[0-9]{6}$/.test(v))
    return { ok:false, reason:'A Maltese number is 8 digits, e.g. +356 7900 0000' };

  return { ok:true, value:v };
}

export const validateEmail = (raw: string) =>
  /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test((raw || '').trim());

/** Age in whole years, or null if the date makes no sense */
export function ageFrom(dob: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const d = new Date(dob + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  if (d > now) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/** Is this date in the future? Used for permit and insurance expiry. */
export function isFutureDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(d + 'T23:59:59');
  return !isNaN(dt.getTime()) && dt > new Date();
}
