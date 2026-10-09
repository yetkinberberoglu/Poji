import { supabase } from './supabase';

export type ServiceType = {
  id: string; name: string; description: string;
  multiplier: number; min_hours: number; base_minutes: number;
  icon: string; sort_order: number;
  category?: string;
  pricing_model?: 'hourly' | 'fixed' | 'quote' | 'unit';
  /** Priced per unit of area or length — tiling, painting, screed, flooring */
  unit_label?: string | null;
  unit_price?: number | null;
  min_charge?: number | null;
  unit_binding?: boolean | null;
  /** This service's own commission rate; null means the platform rate */
  labour_commission?: number | null;
  fixed_price?: number | null;
  callout_fee?: number | null;
  typical_minutes?: number | null;
  needs_location?: boolean;
  trade_id?: string | null;
  allows_parts?: boolean;
  labour_price?: number | null;
  parts_price?: number | null;
  parts_label?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  quote_prompt?: string | null;
  questions?: ServiceQuestion[] | null;
};

/** An answer that changes the price */
export type PricedOption = { label: string; delta: number };

/** A question a service needs answered before anyone turns up */
export type ServiceQuestion = {
  id: string;
  label: string;
  type: 'choice' | 'text';
  options?: (string | PricedOption)[];
  placeholder?: string;
  required?: boolean;
  /** 'labour' adds to the work, 'parts' to the materials */
  affects?: 'labour' | 'parts';
};

export const optionLabel = (o: string | PricedOption) =>
  typeof o === 'string' ? o : o.label;

export const optionDelta = (o: string | PricedOption) =>
  typeof o === 'string' ? 0 : Number(o.delta) || 0;

/**
 * What the answers add to the price.
 * Twenty litres of diesel costs more than five — the booking should say so
 * before anyone agrees to it.
 */
export function answerAdjustments(
  questions: ServiceQuestion[] | null | undefined,
  answers: Record<string, string>,
  /** `${questionId}:${optionLabel}` → price, when a provider sets their own */
  overrides?: Record<string, number> | null,
) {
  let labour = 0, parts = 0;
  const lines: { label: string; amount: number; kind: 'labour'|'parts' }[] = [];

  (questions || []).forEach(q => {
    if (!q.affects || !q.options) return;
    const chosen = answers[q.id];
    if (!chosen) return;
    const opt = q.options.find(o => optionLabel(o) === chosen);
    if (!opt) return;

    const key = `${q.id}:${optionLabel(opt)}`;
    const own = overrides?.[key];
    const delta = own != null ? Number(own) : optionDelta(opt);
    if (!delta) return;

    if (q.affects === 'parts') parts += delta;
    else labour += delta;

    lines.push({ label: optionLabel(opt), amount: delta, kind: q.affects });
  });

  return { labour: +labour.toFixed(2), parts: +parts.toFixed(2), lines };
}

/** Which required questions still have no answer */
export function missingAnswers(
  questions: ServiceQuestion[] | null | undefined,
  answers: Record<string, string>,
): string[] {
  if (!questions?.length) return [];
  return questions
    .filter(q => q.required && !(answers[q.id] || '').trim())
    .map(q => q.label);
}

/** A provider's own price for a service they offer */
export type ProviderService = {
  id: string;
  provider_id: string;
  service_type_id: string;
  active: boolean;
  labour_price: number | null;
  parts_price: number | null;
  parts_label: string | null;
  price_min: number | null;
  price_max: number | null;
  typical_minutes: number | null;
  note: string | null;
  option_prices?: Record<string, number> | null;
  questions?: ServiceQuestion[] | null;
  vehicles?: string[] | null;
  route_prices?: Record<string, number> | null;
  unit_price?: number | null;
  min_charge?: number | null;
  /** null means "whatever the platform says"; true/false is the provider's own call */
  unit_binding?: boolean | null;
};

export type ServiceExtra = {
  id: string; name: string; description: string;
  price: number; extra_minutes: number; icon: string; sort_order: number;
  /** Extras belong to a trade. Oven cleaning has no business on a tiling job. */
  trade_id?: string | null;
};

export type PropertySize = {
  id: string; name: string; factor: number; icon: string; sort_order: number;
};

export type ServiceTask = {
  id: string; service_type_id: string; area: string; task: string; sort_order: number;
};

export async function loadServiceTypes(opts?: {
  category?: string;
  trade?: string;
  trades?: string[];
}): Promise<ServiceType[]> {
  let q = supabase.from('service_types').select('*').eq('active', true);
  if (opts?.trade)       q = q.eq('trade_id', opts.trade);
  else if (opts?.trades?.length) q = q.in('trade_id', opts.trades);
  else if (opts?.category)       q = q.eq('category', opts.category);
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
  numWorkers: number;
}) {
  const totalMinutes = opts.baseMinutes * opts.sizeFactor + opts.extraMinutes;
  const perCleaner   = totalMinutes / Math.max(1, opts.numWorkers);
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
  numWorkers: number;
  multiplier: number;
  suppliesByCleaner: boolean;
}) {
  const SUPPLY_SURCHARGE = 2;
  const VAT_RATE   = VAT_ON_TOP;
  const COMMISSION = 0.20;

  const effectiveRate = +(opts.baseRate * opts.multiplier
    + (opts.suppliesByCleaner ? SUPPLY_SURCHARGE : 0)).toFixed(2);

  const exVat   = +(effectiveRate * opts.hours * opts.numWorkers).toFixed(2);
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
  numWorkers: number;
}) {
  const SUPPLY_SURCHARGE = 2;
  const VAT_RATE   = VAT_ON_TOP;
  const COMMISSION = 0.20;

  const ms      = new Date(opts.finishedAt).getTime() - new Date(opts.startedAt).getTime();
  const rawMins = Math.max(0, Math.round(ms / 60000));
  const billed  = Math.ceil(rawMins / 15) * 15;          // round up to 15 min
  const hours   = billed / 60;

  const effectiveRate = +(opts.baseRate * opts.multiplier
    + (opts.suppliesByCleaner ? SUPPLY_SURCHARGE : 0)).toFixed(2);

  const exVat   = +(effectiveRate * hours * opts.numWorkers).toFixed(2);
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
 * Nothing is added for VAT. A provider's price already contains whatever
 * VAT they owe, and they account for it themselves — Poji is the
 * intermediary, not the seller. This mirrors poji_rates() in the database;
 * if one ever changes the other must too, or the figure on screen stops
 * matching the figure charged.
 */
export const VAT_ON_TOP = 0;

/** Commission on parts — deliberately low so nobody routes around it. */
export const PARTS_COMMISSION = 0.05;

/**
 * Fixed-price work — a filter service, an AC regas, a puncture.
 * Labour and parts are priced separately because we take a different
 * cut of each: 20% of the work, 5% of the materials.
 */
export const LABOUR_COMMISSION = 0.20;

export function fixedQuote(opts: {
  labourPrice: number;
  partsPrice?: number;
  calloutFee?: number;
  urgent?: boolean;
  /** This service's rate. Big jobs carry less, or providers go around us. */
  labourCommission?: number | null;
}) {
  const URGENT_SURCHARGE = 0.25;
  const VAT_RATE = VAT_ON_TOP;
  const COMMISSION = opts.labourCommission != null
    ? Number(opts.labourCommission) : LABOUR_COMMISSION;

  const labour  = Number(opts.labourPrice) || 0;
  const callout = Number(opts.calloutFee)  || 0;
  const parts   = Number(opts.partsPrice)  || 0;

  // Urgency is a premium on the work, never on the parts
  const urgentFee = opts.urgent ? +((labour + callout) * URGENT_SURCHARGE).toFixed(2) : 0;

  const labourSide = +(labour + callout + urgentFee).toFixed(2);
  const exVat      = +(labourSide + parts).toFixed(2);
  const vat        = +(exVat * VAT_RATE).toFixed(2);
  const service    = +(exVat + vat).toFixed(2);
  const stripe     = +(service * 0.029 + 0.30).toFixed(2);

  const labourCommission = +(labourSide * COMMISSION).toFixed(2);
  const partsCommission  = +(parts * PARTS_COMMISSION).toFixed(2);

  return {
    labour, callout, parts, urgentFee,
    labourSide,
    commissionRate: COMMISSION,
    exVat, vat,
    stripeFee: stripe,
    clientPays: +(service + stripe).toFixed(2),
    labourCommission,
    partsCommission,
    platform: +(labourCommission + partsCommission).toFixed(2),
    providerGets: +(labourSide - labourCommission + parts - partsCommission).toFixed(2),
  };
}

/**
 * Work priced by the square metre (or metre, or panel).
 *
 * The minimum charge is not a detail: at €22/m² a four-square-metre
 * bathroom is €88, and no tiler gives up a day's slot for that. Without
 * a floor under the price the model quietly loses providers.
 */
export function unitLabour(opts: {
  unitPrice?: number | null;
  quantity?: number | null;
  minCharge?: number | null;
}) {
  const rate = Number(opts.unitPrice) || 0;
  const qty  = Number(opts.quantity)  || 0;
  const min  = Number(opts.minCharge) || 0;
  const raw  = +(rate * qty).toFixed(2);
  const labour = Math.max(raw, min);
  return { raw, labour: +labour.toFixed(2), minApplied: min > 0 && raw < min, rate, qty, min };
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



export type BookingPart = {
  id: string;
  booking_id: string;
  name: string;
  qty: number;
  unit_price: number;
  total: number;
  note?: string | null;
  status: 'proposed' | 'approved' | 'rejected';
  created_at: string;
};

export async function loadParts(bookingId: string): Promise<BookingPart[]> {
  const { data, error } = await supabase
    .from('booking_parts').select('*')
    .eq('booking_id', bookingId)
    .order('created_at');
  if (error) { console.log('loadParts:', error.message); return []; }
  return data || [];
}

export async function addPart(bookingId: string, part: {
  name: string; qty: number; unitPrice: number; note?: string;
}) {
  const { data:{ user } } = await supabase.auth.getUser();
  const total = +(part.qty * part.unitPrice).toFixed(2);
  const { data, error } = await supabase.from('booking_parts').insert({
    booking_id: bookingId,
    added_by: user?.id,
    name: part.name.trim(),
    qty: part.qty,
    unit_price: part.unitPrice,
    total,
    note: part.note?.trim() || null,
    status: 'proposed',
  }).select().single();
  if (error) throw error;
  return data as BookingPart;
}

export async function removePart(partId: string) {
  const { error } = await supabase.from('booking_parts').delete().eq('id', partId);
  if (error) throw error;
}

export async function respondToParts(bookingId: string, accept: boolean) {
  const { error } = await supabase.from('booking_parts')
    .update({ status: accept ? 'approved' : 'rejected',
              responded_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .eq('status', 'proposed');
  if (error) throw error;
}

/** Parts the client has agreed to, and what each side gets from them. */
export function partsSummary(parts: BookingPart[]) {
  const approved = parts.filter(p => p.status === 'approved');
  const proposed = parts.filter(p => p.status === 'proposed');

  const approvedTotal = +approved.reduce((s,p)=>s+Number(p.total),0).toFixed(2);
  const proposedTotal = +proposed.reduce((s,p)=>s+Number(p.total),0).toFixed(2);

  return {
    approved, proposed,
    approvedTotal, proposedTotal,
    commission:   +(approvedTotal * PARTS_COMMISSION).toFixed(2),
    providerGets: +(approvedTotal * (1 - PARTS_COMMISSION)).toFixed(2),
    hasPending: proposed.length > 0,
  };
}


/** Everything a provider has priced, keyed by service id */
export async function loadProviderServices(providerId: string) {
  const { data, error } = await supabase
    .from('provider_services').select('*')
    .eq('provider_id', providerId);
  if (error) { console.log('loadProviderServices:', error.message); return {}; }
  const map: Record<string, ProviderService> = {};
  (data || []).forEach((r:any) => { map[r.service_type_id] = r; });
  return map;
}

/** Prices for several providers at once — used on the choose-a-provider step */
export async function loadServicePrices(serviceTypeId: string) {
  const { data, error } = await supabase
    .from('provider_services').select('*')
    .eq('service_type_id', serviceTypeId)
    .eq('active', true);
  if (error) { console.log('loadServicePrices:', error.message); return {}; }
  const map: Record<string, ProviderService> = {};
  (data || []).forEach((r:any) => { map[r.provider_id] = r; });
  return map;
}

/**
 * The provider's own numbers where they set them, the platform's where
 * they haven't. Nobody is forced to price everything up front.
 */
export function effectiveService(
  type: ServiceType,
  own?: ProviderService | null,
): {
  labour: number; parts: number; partsLabel: string | null;
  minutes: number; priceMin: number | null; priceMax: number | null;
  optionPrices: Record<string, number> | null;
  questions: ServiceQuestion[];
  vehicles: string[];
  routePrices: Record<string, number>;
  unitLabel: string; unitPrice: number; minCharge: number; unitBinding: boolean;
  labourCommission: number;
  custom: boolean;
} {
  const num = (a: any, b: any) => {
    const v = a ?? b;
    return v == null ? 0 : Number(v);
  };
  return {
    optionPrices: (own?.option_prices || null) as Record<string, number> | null,
    // a provider's own list wins outright — their stages, their brands
    questions: (own?.questions?.length ? own.questions : (type.questions || [])) as ServiceQuestion[],
    vehicles: (own?.vehicles || []) as string[],
    routePrices: (own?.route_prices || {}) as Record<string, number>,
    labour:     num(own?.labour_price,    type.labour_price),
    parts:      num(own?.parts_price,     type.parts_price),
    partsLabel: own?.parts_label ?? type.parts_label ?? null,
    minutes:    num(own?.typical_minutes, type.typical_minutes) || 60,
    priceMin:   own?.price_min != null ? Number(own.price_min)
                : type.price_min != null ? Number(type.price_min) : null,
    priceMax:   own?.price_max != null ? Number(own.price_max)
                : type.price_max != null ? Number(type.price_max) : null,
    unitLabel:  type.unit_label || 'm\u00b2',
    unitPrice:  num(own?.unit_price, type.unit_price),
    minCharge:  num(own?.min_charge, type.min_charge),
    // the provider decides whether their rate is a promise or an estimate
    labourCommission: type.labour_commission != null
                      ? Number(type.labour_commission) : LABOUR_COMMISSION,
    unitBinding: own?.unit_binding != null
                 ? !!own.unit_binding
                 : !!type.unit_binding,
    custom:     !!own,
  };
}

/** Seed a provider's list from the platform defaults for their trades */
export async function seedProviderServices(providerId: string, tradeIds: string[]) {
  if (!tradeIds.length) return;

  const { data: types } = await supabase
    .from('service_types').select('*')
    .in('trade_id', tradeIds).eq('active', true);
  if (!types?.length) return;

  const { data: existing } = await supabase
    .from('provider_services').select('service_type_id')
    .eq('provider_id', providerId);
  const have = new Set((existing || []).map((r:any) => r.service_type_id));

  const rows = types
    .filter((t:any) => !have.has(t.id))
    .map((t:any) => ({
      provider_id: providerId,
      service_type_id: t.id,
      active: true,
      labour_price: t.labour_price,
      parts_price: t.parts_price,
      parts_label: t.parts_label,
      price_min: t.price_min,
      price_max: t.price_max,
      typical_minutes: t.typical_minutes,
      unit_price: t.unit_price,
      min_charge: t.min_charge,
      unit_binding: t.unit_binding,
    }));

  if (rows.length) await supabase.from('provider_services').insert(rows);
}
