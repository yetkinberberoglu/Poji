/**
 * Spots messages that look like someone trying to take the job off-platform.
 * We never block a message — we flag it so a human can look later.
 * False positives are cheap; missing a real one is not.
 */

export type Flag = {
  code: string;
  label: string;
  weight: number;   // 1 = worth noting, 3 = clear signal
};

const PHONE = /(\+?\d[\d\s\-().]{6,}\d)/g;
const IBAN  = /\b[A-Z]{2}\d{2}[A-Z0-9\s]{10,30}\b/gi;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/gi;

/** Words that come up when people arrange things off the books, in English and Maltese */
const PHRASES: { re: RegExp; code: string; label: string; weight: number }[] = [
  { re: /\bcash\b|\bbi\s*flus\b|\bflus\b/i,              code:'cash',     label:'Talk of cash',            weight:2 },
  { re: /\bcancel\b.*\b(book|job|app)/i,                  code:'cancel',   label:'Asking to cancel',        weight:3 },
  { re: /\b(outside|off)\s+(the\s+)?(app|platform|poji)/i,code:'offapp',   label:'Mentions going off-app',  weight:3 },
  { re: /\bdirect(ly)?\b.*\b(pay|book|deal)/i,            code:'direct',   label:'Suggests dealing direct', weight:3 },
  { re: /\bwhats?app\b|\bviber\b|\btelegram\b|\bmessenger\b/i, code:'channel', label:'Another messaging app', weight:2 },
  { re: /\bno\s+commission\b|\bwithout\s+(the\s+)?(fee|commission)\b/i, code:'nocomm', label:'Avoiding commission', weight:3 },
  { re: /\bcheaper\b.*\b(if|when)\b/i,                    code:'cheaper',  label:'Offering a cheaper deal', weight:2 },
  { re: /\bnext\s+time\b.*\b(call|ring|phone|contact)\s+me\b/i, code:'nexttime', label:'Asking for direct contact next time', weight:3 },
  { re: /\bmy\s+number\b|\bcall\s+me\s+on\b|\bring\s+me\b/i, code:'number', label:'Sharing a number', weight:2 },
  { re: /\brevolut\b|\bbank\s+transfer\b|\btrasferiment/i, code:'transfer', label:'Payment outside the app', weight:3 },
];

export function scanMessage(text: string): { flagged: boolean; reasons: string[]; score: number } {
  const reasons: string[] = [];
  let score = 0;

  // A phone number on its own is weak evidence — people share addresses and times too.
  const phones = text.match(PHONE) || [];
  const realPhones = phones.filter(p => p.replace(/\D/g,'').length >= 8);
  if (realPhones.length) { reasons.push('Phone number'); score += 2; }

  if (IBAN.test(text))  { reasons.push('Bank details');  score += 3; }
  IBAN.lastIndex = 0;

  if (EMAIL.test(text)) { reasons.push('Email address'); score += 1; }
  EMAIL.lastIndex = 0;

  for (const p of PHRASES) {
    if (p.re.test(text)) { reasons.push(p.label); score += p.weight; }
  }

  // two weak signals together are worth a look; one alone usually isn't
  return { flagged: score >= 3, reasons, score };
}

/** Contact details open two hours before the job, not the moment it's accepted. */
export const CONTACT_WINDOW_HOURS = 2;

export function contactUnlocked(booking: {
  date?: string; time?: string; status?: string;
}): boolean {
  if (!booking.date || !booking.time) return false;
  if (['en_route','arrived','in_progress','awaiting_confirmation','completed','disputed']
      .includes(booking.status || '')) return true;

  const start = new Date(`${booking.date}T${booking.time}:00`);
  if (isNaN(start.getTime())) return false;
  return start.getTime() - Date.now() <= CONTACT_WINDOW_HOURS * 3600 * 1000;
}

/** What happens on each successive breach */
export const PENALTIES = [
  { count: 1, severity:'warning',    fine: 0,   label:'Written warning',
    detail:'Noted on your account. Nothing charged.' },
  { count: 2, severity:'fine',       fine: 50,  label:'€50 penalty',
    detail:'Taken from your next payout.' },
  { count: 3, severity:'suspension', fine: 100, label:'30-day suspension + €100',
    detail:'You cannot take jobs for 30 days.' },
  { count: 4, severity:'ban',        fine: 0,   label:'Permanent ban',
    detail:'Account closed. Outstanding balance held pending review.' },
];

export const nextPenalty = (priorCount: number) =>
  PENALTIES[Math.min(priorCount, PENALTIES.length - 1)];
