import { supabase } from './supabase';

export type ServiceType = {
  id: string; name: string; description: string;
  multiplier: number; min_hours: number; base_minutes: number;
  icon: string; sort_order: number;
  category?: string;
  pricing_model?: 'hourly' | 'fixed';
  fixed_price?: number | null;
  callout_fee?: number | null;
  typical_minutes?: number | null;
  needs_location?: boolean;
};

export type ServiceExtra = {
  id: string; name: string; description: string;
  price: number; extra_minutes: number; icon: string; sort_order: number;
};

export type PropertySize = {
  id: string; name: string; factor: number; icon: string; sort_order: number;
};

export type ServiceTask = {
  id: string; service_type_id: string; area: string; task: string; sort_order: number;
};

export async function loadServiceTypes(category?: string): Promise<ServiceType[]> {
  let q = supabase.from('service_types').select('*').eq('active', true);
  if (category) q = q.eq('category', category);
  const { data, error } = await q.order('sort_order');
  if (error) { console.log('loadServiceTypes:', error.message); return []; }
  return data || [];
}

export async function loadServiceExtras(): Promise<ServiceExtra[]> {
  const { data, error } = await supabase
    .from('service_extras').select('*').eq('active', true).order('sort_order');
  if (error) { console.log('loadServiceExtras:', error.message); return []; }
  return data || [];
}

export async function loadPropertySizes(): Promise<PropertySize[]> {
  const { data, error } = await supabase
    .from('property_sizes').select('*').order('sort_order');
  if (error) { console.log('loadPropertySizes:', error.message); return []; }
  return data || [];
}

export async function loadTasksFor(serviceTypeId: string): Promise<ServiceTask[]> {
  const { data, error } = await supabase
    .from('service_tasks').select('*')
    .eq('service_type_id', serviceTypeId)
    .order('area').order('sort_order');
  if (error) { console.log('loadTasksFor:', error.message); return []; }
  return data || [];
}

export function groupTasks(tasks: ServiceTask[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  tasks.forEach(t => { (out[t.area] ||= []).push(t.task); });
  return out;
}

/**
 * Work out how long the job should take.
 * Base time for the service, scaled by property size, plus every extra.
 * Rounded up to the nearest half hour, never below the minimum.
 */
export function estimateHours(opts: {
  baseMinutes: number;
  sizeFactor: number;
  extraMinutes: number;
  minHours: number;
  numCleaners: number;
}) {
  const totalMinutes = opts.baseMinutes * opts.sizeFactor + opts.extraMinutes;
  const perCleaner   = totalMinutes / Math.max(1, opts.numCleaners);
  const rawHours     = perCleaner / 60;
  const rounded      = Math.ceil(rawHours * 2) / 2;      // nearest 0.5h
  return {
    totalMinutes: Math.round(totalMinutes),
    hours: Math.max(rounded, opts.minHours),
    wasRaised: rounded < opts.minHours,
  };
}

/**
 * Price. The cleaner's own rate, adjusted by the service multiplier
 * and a supplies surcharge. Time does the rest — no flat extra fees.
 */
export function quote(opts: {
  baseRate: number;
  hours: number;
  numCleaners: number;
  multiplier: number;
  suppliesByCleaner: boolean;
}) {
  const SUPPLY_SURCHARGE = 2;
  const VAT_RATE   = 0.18;
  const COMMISSION = 0.20;

  const effectiveRate = +(opts.baseRate * opts.multiplier
    + (opts.suppliesByCleaner ? SUPPLY_SURCHARGE : 0)).toFixed(2);

  const exVat   = +(effectiveRate * opts.hours * opts.numCleaners).toFixed(2);
  const vat     = +(exVat * VAT_RATE).toFixed(2);
  const service = +(exVat + vat).toFixed(2);
  const stripe  = +(service * 0.029 + 0.30).toFixed(2);

  return {
    effectiveRate,
    exVat,
    vat,
    stripeFee: stripe,
    clientPays: +(service + stripe).toFixed(2),
    cleanerGets: +(exVat * (1 - COMMISSION)).toFixed(2),
    platform:    +(exVat * COMMISSION).toFixed(2),
  };
}

export async function seedChecklist(bookingId: string, serviceTypeId: string) {
  const tasks = await loadTasksFor(serviceTypeId);
  if (!tasks.length) return;
  const rows = tasks.map(t => ({
    booking_id: bookingId, area: t.area, task: t.task, done: false,
  }));
  const { error } = await supabase.from('booking_checklist').insert(rows);
  if (error) console.log('seedChecklist:', error.message);
}

/** Add the chosen extras as checklist items too, so nothing is missed */
export async function seedExtraTasks(bookingId: string, extras: ServiceExtra[]) {
  if (!extras.length) return;
  const rows = extras.map(e => ({
    booking_id: bookingId, area: 'Extras', task: e.name, done: false,
  }));
  const { error } = await supabase.from('booking_checklist').insert(rows);
  if (error) console.log('seedExtraTasks:', error.message);
}


/**
 * What the job actually costs once the timer has stopped.
 * Billed on real elapsed minutes, rounded up to the next 15 minutes
 * so a 4h 02m job doesn't get billed as 4h 30m.
 */
export function finalQuote(opts: {
  startedAt: string;
  finishedAt: string;
  baseRate: number;
  multiplier: number;
  suppliesByCleaner: boolean;
  numCleaners: number;
}) {
  const SUPPLY_SURCHARGE = 2;
  const VAT_RATE   = 0.18;
  const COMMISSION = 0.20;

  const ms      = new Date(opts.finishedAt).getTime() - new Date(opts.startedAt).getTime();
  const rawMins = Math.max(0, Math.round(ms / 60000));
  const billed  = Math.ceil(rawMins / 15) * 15;          // round up to 15 min
  const hours   = billed / 60;

  const effectiveRate = +(opts.baseRate * opts.multiplier
    + (opts.suppliesByCleaner ? SUPPLY_SURCHARGE : 0)).toFixed(2);

  const exVat   = +(effectiveRate * hours * opts.numCleaners).toFixed(2);
  const vat     = +(exVat * VAT_RATE).toFixed(2);
  const service = +(exVat + vat).toFixed(2);
  const stripe  = +(service * 0.029 + 0.30).toFixed(2);

  return {
    actualMinutes: rawMins,
    billedMinutes: billed,
    hours,
    effectiveRate,
    exVat,
    vat,
    stripeFee: stripe,
    total:       +(service + stripe).toFixed(2),
    cleanerGets: +(exVat * (1 - COMMISSION)).toFixed(2),
    platform:    +(exVat * COMMISSION).toFixed(2),
  };
}

export const fmtDuration = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};


/**
 * Callout jobs — roadside and similar. One agreed price plus a callout fee.
 * No timer, no hourly maths: the client knows the number before anyone sets off.
 */
export function fixedQuote(opts: {
  fixedPrice: number;
  calloutFee: number;
  urgent?: boolean;
}) {
  const URGENT_SURCHARGE = 0.25;   // 25% for "come now"
  const VAT_RATE   = 0.18;
  const COMMISSION = 0.20;

  const base    = Number(opts.fixedPrice) + Number(opts.calloutFee || 0);
  const urgent  = opts.urgent ? +(base * URGENT_SURCHARGE).toFixed(2) : 0;
  const exVat   = +(base + urgent).toFixed(2);
  const vat     = +(exVat * VAT_RATE).toFixed(2);
  const service = +(exVat + vat).toFixed(2);
  const stripe  = +(service * 0.029 + 0.30).toFixed(2);

  return {
    jobPrice:   Number(opts.fixedPrice),
    calloutFee: Number(opts.calloutFee || 0),
    urgentFee:  urgent,
    exVat,
    vat,
    stripeFee:  stripe,
    clientPays: +(service + stripe).toFixed(2),
    providerGets: +(exVat * (1 - COMMISSION)).toFixed(2),
    platform:     +(exVat * COMMISSION).toFixed(2),
  };
}

/** Straight-line distance in km — good enough to show how far a provider is */
export function distanceKm(
  a: { lat:number; lng:number },
  b: { lat:number; lng:number }
) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1  = a.lat * Math.PI / 180;
  const la2  = b.lat * Math.PI / 180;
  const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2;
  return +(2 * R * Math.asin(Math.sqrt(h))).toFixed(1);
}
