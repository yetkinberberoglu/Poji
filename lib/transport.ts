import { MALTA_MAIN, GOZO_LOCALITIES } from '../constants/malta';

/**
 * Malta is small enough that drivers price by rough distance, not by the
 * kilometre. Six regions, and a band worked out from which two you're
 * crossing between.
 */
export const ZONES = {
  nh: { name:'Northern Harbour', places:[
    'Birkirkara','Gzira','Hamrun','Msida','Pembroke','Qormi','San Gwann',
    'Santa Venera','Sliema',"St. Julian's","Ta' Xbiex",'Swieqi'] },
  sh: { name:'Southern Harbour', places:[
    'Birgu','Bormla','Fgura','Floriana','Isla','Kalkara','Luqa','Marsa',
    'Paola','Santa Lucija','Tarxien','Valletta','Xghajra','Zabbar'] },
  n:  { name:'North', places:[
    'Mellieha','Mgarr','Mosta','Naxxar',"St. Paul's Bay",'Bugibba','Qawra'] },
  w:  { name:'West', places:[
    'Attard','Balzan','Dingli','Iklin','Lija','Mdina','Rabat','Siggiewi','Zebbug'] },
  se: { name:'South East', places:[
    'Birzebbuga','Gudja','Ghaxaq','Kirkop','Marsaskala','Marsaxlokk','Mqabba',
    'Qrendi','Safi','Zejtun','Zurrieq'] },
  g:  { name:'Gozo & Comino', places: GOZO_LOCALITIES as unknown as string[] },
} as const;

export type ZoneKey = keyof typeof ZONES;

/** Which zones sit next to each other — a short hop rather than a run */
const NEIGHBOURS: Record<ZoneKey, ZoneKey[]> = {
  nh: ['sh','w','n'],
  sh: ['nh','w','se'],
  n:  ['nh','w'],
  w:  ['nh','sh','n','se'],
  se: ['sh','w'],
  g:  [],
};

export function zoneOf(locality?: string | null): ZoneKey | null {
  if (!locality) return null;
  const hit = (Object.keys(ZONES) as ZoneKey[])
    .find(k => (ZONES[k].places as readonly string[]).includes(locality));
  return hit ?? null;
}

export const BANDS = [
  { k:'local',  label:'Within the same area',   hint:'Sliema to Gzira' },
  { k:'short',  label:'A few towns over',       hint:'Sliema to Mosta' },
  { k:'long',   label:'Across the island',      hint:'Mellieha to Birzebbuga' },
  { k:'gozo',   label:'Malta to Gozo',          hint:'Includes the ferry' },
  { k:'ingozo', label:'Within Gozo',            hint:'Victoria to Nadur' },
] as const;

export type BandKey = typeof BANDS[number]['k'];

export function bandFor(from?: string | null, to?: string | null): BandKey | null {
  const a = zoneOf(from), b = zoneOf(to);
  if (!a || !b) return null;

  if (a === 'g' && b === 'g') return 'ingozo';
  if (a === 'g' || b === 'g') return 'gozo';
  if (a === b) return 'local';
  if (NEIGHBOURS[a].includes(b)) return 'short';
  return 'long';
}

export const VEHICLES = [
  { k:'van',   label:'Van',             hint:'Up to about 6 m³ — a flat\u2019s worth' },
  { k:'luton', label:'Luton van',       hint:'About 18 m³ — a small house' },
  { k:'truck', label:'Truck',           hint:'Larger loads, longer items' },
  { k:'lift',  label:'Truck with lift', hint:'Tail lift for heavy or awkward pieces' },
] as const;

export type VehicleKey = typeof VEHICLES[number]['k'];

export const routeKey = (v: string, b: string) => `${v}:${b}`;

/** What this driver charges for this vehicle on this run */
export function routePrice(
  prices: Record<string, number> | null | undefined,
  vehicle: string, band: string,
): number | null {
  const v = prices?.[routeKey(vehicle, band)];
  return v == null ? null : Number(v);
}

/** The cheapest run they'll do, for the "from €X" on their card */
export function cheapestRoute(prices: Record<string, number> | null | undefined): number | null {
  const vals = Object.values(prices || {}).map(Number).filter(n => n > 0);
  return vals.length ? Math.min(...vals) : null;
}

export const ALL_LOCALITIES = [...MALTA_MAIN, ...GOZO_LOCALITIES];

export const vehicleLabel = (k?: string | null) =>
  VEHICLES.find(v => v.k === k)?.label || k || '';

export const bandLabel = (k?: string | null) =>
  BANDS.find(b => b.k === k)?.label || k || '';
