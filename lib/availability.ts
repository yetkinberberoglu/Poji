export const DAYS = [
  { k:'mon', short:'Mon', long:'Monday' },
  { k:'tue', short:'Tue', long:'Tuesday' },
  { k:'wed', short:'Wed', long:'Wednesday' },
  { k:'thu', short:'Thu', long:'Thursday' },
  { k:'fri', short:'Fri', long:'Friday' },
  { k:'sat', short:'Sat', long:'Saturday' },
  { k:'sun', short:'Sun', long:'Sunday' },
] as const;

/* Night is new, and it is the one that wraps: it starts at 21:00 and
   ends at 07:00 the following morning.
   *
   * Before it, the three slots covered 07:00 to 21:00 and nothing else,
   * which did more damage than simply leaving a DJ unable to say he
   * works until four in the morning. slotFor returned null for any hour
   * outside them, and worksAt reads null as "can't tell - don't block".
   * So every hour between 21:00 and 07:00 skipped the availability check
   * for EVERY provider: a cleaner who works mornings was eligible for a
   * three in the morning job.
   *
   * The four slots now cover the whole clock, so there is no hour left
   * that nobody has an answer for. */
export const SLOTS = [
  { k:'am',    label:'Morning',   range:'07:00 – 12:00', from:7,  to:12 },
  { k:'pm',    label:'Afternoon', range:'12:00 – 17:00', from:12, to:17 },
  { k:'eve',   label:'Evening',   range:'17:00 – 21:00', from:17, to:21 },
  { k:'night', label:'Night',     range:'21:00 – 07:00', from:21, to:7  },
] as const;

export type DayKey  = typeof DAYS[number]['k'];
export type SlotKey = typeof SLOTS[number]['k'];
export type Availability = Partial<Record<DayKey, SlotKey[]>>;

export const DEFAULT_AVAILABILITY: Availability = {
  mon:['am','pm'], tue:['am','pm'], wed:['am','pm'],
  thu:['am','pm'], fri:['am','pm'], sat:['am'],   sun:[],
};

export const PRESETS = [
  { id:'weekdays', label:'Weekdays, 9 to 5',
    value: { mon:['am','pm'], tue:['am','pm'], wed:['am','pm'],
             thu:['am','pm'], fri:['am','pm'], sat:[], sun:[] } as Availability },
  { id:'mornings', label:'Mornings only',
    value: { mon:['am'], tue:['am'], wed:['am'],
             thu:['am'], fri:['am'], sat:['am'], sun:[] } as Availability },
  { id:'evenings', label:'Evenings and weekends',
    value: { mon:['eve'], tue:['eve'], wed:['eve'], thu:['eve'], fri:['eve'],
             sat:['am','pm','eve'], sun:['am','pm'] } as Availability },
  /* For the trades that start when everyone else finishes — a DJ, a
     night locksmith, a tow truck. */
  { id:'nights',   label:'Evenings and nights',
    value: Object.fromEntries(DAYS.map(d=>[d.k,['eve','night']])) as Availability },
  { id:'always',   label:'Any time',
    value: Object.fromEntries(DAYS.map(d=>[d.k,SLOTS.map(s=>s.k)])) as Availability },
];

/** Does this slot run past midnight? */
const wraps = (s: typeof SLOTS[number]) => s.from > s.to;

const hourOf = (time: string) => {
  const h = Number((time || '').split(':')[0]);
  return isNaN(h) ? null : h;
};

/** Which slot does a clock time fall into? */
export function slotFor(time: string): SlotKey | null {
  const h = hourOf(time);
  if (h === null) return null;
  /* A wrapping slot holds the hours at or after its start AND the hours
     before its end, which are on the other side of midnight. */
  const s = SLOTS.find(x => wraps(x) ? (h >= x.from || h < x.to)
                                     : (h >= x.from && h < x.to));
  return s ? s.k : null;
}

export function dayKeyFor(dateStr: string): DayKey | null {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  // JS weeks start on Sunday
  return (['sun','mon','tue','wed','thu','fri','sat'] as DayKey[])[d.getDay()];
}

/** The calendar day before this one, as yyyy-mm-dd.
 *
 * Formatted from the local parts, not through toISOString. The date is
 * built as local midnight, and in Malta local midnight is 22:00 or
 * 23:00 of the day before in UTC — so toISOString().slice(0,10) came
 * back a further day short, and every small-hours booking was checked
 * against the wrong night. dayKeyFor reads getDay() locally too, so
 * both now work in the same frame. */
export function prevDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Can this provider work at that date and time?
 *
 * The small hours belong to the night that began the evening before.
 * Somebody who ticks Friday night means Friday 21:00 until Saturday
 * morning, which is what they would say out loud, so two o'clock on a
 * Saturday morning is checked against Friday.
 */
export function worksAt(
  availability: Availability | null | undefined,
  dateStr: string,
  time: string,
): boolean {
  const av   = availability || DEFAULT_AVAILABILITY;
  const slot = slotFor(time);
  const h    = hourOf(time);
  if (!slot || h === null) return true;   // can't tell — don't block

  const def     = SLOTS.find(s => s.k === slot)!;
  const smallHrs = wraps(def) && h < def.to;
  const day     = dayKeyFor(smallHrs ? prevDay(dateStr) : dateStr);
  if (!day) return true;

  return (av[day] || []).includes(slot);
}

/** Does this provider work any nights at all? */
export function worksNights(av: Availability | null | undefined): boolean {
  const a = av || {};
  return DAYS.some(d => (a[d.k] || []).includes('night'));
}

export function isAwayOn(
  timeOff: { starts_on: string; ends_on: string }[] | null | undefined,
  dateStr: string,
): boolean {
  if (!timeOff?.length) return false;
  return timeOff.some(t => dateStr >= t.starts_on && dateStr <= t.ends_on);
}

/** Enough notice? A job starting in an hour is no use to most people. */
export function hasEnoughNotice(
  dateStr: string, time: string, noticeHours = 12,
): boolean {
  const start = new Date(`${dateStr}T${time}:00`);
  if (isNaN(start.getTime())) return true;
  return start.getTime() - Date.now() >= noticeHours * 3600 * 1000;
}

/** Everything together — used to decide who hears about a job */
export function canTakeJob(provider: {
  availability?: Availability | null;
  notice_hours?: number | null;
  timeOff?: { starts_on:string; ends_on:string }[];
}, dateStr: string, time: string) {
  if (isAwayOn(provider.timeOff, dateStr))
    return { ok:false, reason:'away' as const };
  if (!worksAt(provider.availability, dateStr, time))
    return { ok:false, reason:'not_working' as const };
  if (!hasEnoughNotice(dateStr, time, provider.notice_hours ?? 12))
    return { ok:false, reason:'short_notice' as const };
  return { ok:true as const };
}

export const countSlots = (av: Availability | null | undefined) =>
  DAYS.reduce((n, d) => n + ((av?.[d.k] || []).length), 0);

/** A short human summary, e.g. "Weekdays · mornings and afternoons" */
export function describe(av: Availability | null | undefined): string {
  const a = av || {};
  const working = DAYS.filter(d => (a[d.k] || []).length > 0);
  if (working.length === 0) return 'No days set';
  if (working.length === 7) {
    /* Counted against SLOTS rather than a hardcoded 3, which is how
       adding the night slot would otherwise have quietly stopped
       "Any time, any day" from ever being true. */
    const all = DAYS.every(d => (a[d.k] || []).length === SLOTS.length);
    if (all) return 'Any time, any day';
    return 'Every day';
  }

  const weekdays = DAYS.slice(0,5);
  const weekend  = DAYS.slice(5);
  const allWeek  = weekdays.every(d => (a[d.k] || []).length > 0);
  const noWeekend= weekend.every(d => (a[d.k] || []).length === 0);

  const slotsUsed = new Set(working.flatMap(d => a[d.k] || []));
  const slotText = slotsUsed.size === SLOTS.length ? 'all day'
    : Array.from(slotsUsed).map(k => SLOTS.find(s=>s.k===k)?.label.toLowerCase())
        .join(' and ');

  if (allWeek && noWeekend) return `Weekdays · ${slotText}`;
  return `${working.map(d=>d.short).join(', ')} · ${slotText}`;
}
