export const DAYS = [
  { k:'mon', short:'Mon', long:'Monday' },
  { k:'tue', short:'Tue', long:'Tuesday' },
  { k:'wed', short:'Wed', long:'Wednesday' },
  { k:'thu', short:'Thu', long:'Thursday' },
  { k:'fri', short:'Fri', long:'Friday' },
  { k:'sat', short:'Sat', long:'Saturday' },
  { k:'sun', short:'Sun', long:'Sunday' },
] as const;

export const SLOTS = [
  { k:'am',  label:'Morning',   range:'07:00 – 12:00', from:7,  to:12 },
  { k:'pm',  label:'Afternoon', range:'12:00 – 17:00', from:12, to:17 },
  { k:'eve', label:'Evening',   range:'17:00 – 21:00', from:17, to:21 },
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
  { id:'always',   label:'Any time',
    value: Object.fromEntries(DAYS.map(d=>[d.k,['am','pm','eve']])) as Availability },
];

/** Which slot does a clock time fall into? */
export function slotFor(time: string): SlotKey | null {
  const h = Number((time || '').split(':')[0]);
  if (isNaN(h)) return null;
  const s = SLOTS.find(x => h >= x.from && h < x.to);
  return s ? s.k : null;
}

export function dayKeyFor(dateStr: string): DayKey | null {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  // JS weeks start on Sunday
  return (['sun','mon','tue','wed','thu','fri','sat'] as DayKey[])[d.getDay()];
}

/** Can this provider work at that date and time? */
export function worksAt(
  availability: Availability | null | undefined,
  dateStr: string,
  time: string,
): boolean {
  const av = availability || DEFAULT_AVAILABILITY;
  const day  = dayKeyFor(dateStr);
  const slot = slotFor(time);
  if (!day || !slot) return true;         // can't tell — don't block
  return (av[day] || []).includes(slot);
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
    const all = DAYS.every(d => (a[d.k] || []).length === 3);
    if (all) return 'Any time, any day';
    return 'Every day';
  }

  const weekdays = DAYS.slice(0,5);
  const weekend  = DAYS.slice(5);
  const allWeek  = weekdays.every(d => (a[d.k] || []).length > 0);
  const noWeekend= weekend.every(d => (a[d.k] || []).length === 0);

  const slotsUsed = new Set(working.flatMap(d => a[d.k] || []));
  const slotText = slotsUsed.size === 3 ? 'all day'
    : Array.from(slotsUsed).map(k => SLOTS.find(s=>s.k===k)?.label.toLowerCase())
        .join(' and ');

  if (allWeek && noWeekend) return `Weekdays · ${slotText}`;
  return `${working.map(d=>d.short).join(', ')} · ${slotText}`;
}
