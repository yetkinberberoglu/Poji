import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type Trade = {
  id: string;
  name: string;
  icon: string;
  desc: string;
  category: string;
  live?: boolean;         // bookable today
  pricing: 'hourly' | 'fixed';
  roadside?: boolean;     // needs GPS, goes through /roadside
};

export type Category = {
  id: string;
  name: string;
  icon: string;
  desc: string;
  colour: string;
  urgent?: boolean;
};

/**
 * These two lists are the fallback, not the source of truth — the database
 * is. They exist so the app has something to draw on the very first frame,
 * and so it still works if the trades table cannot be reached. Anything
 * added through the admin screen appears once the real list loads.
 */
export const CATEGORIES: Category[] = [
  { id:'cleaning', name:'Cleaning & care',    icon:'🧹', desc:'Homes, offices, laundry, pests',   colour:'#4F46E5' },
  { id:'repairs',  name:'Repairs & installs', icon:'🔧', desc:'AC, water, electrics, appliances', colour:'#0891B2' },
  { id:'improve',  name:'Home improvement',   icon:'🎨', desc:'Painting, carpentry, tiling, damp',colour:'#7C3AED' },
  { id:'outdoor',  name:'Outdoor & property', icon:'🌿', desc:'Gardens, pools, solar, moving',    colour:'#059669' },
  { id:'vehicle',  name:'Vehicle & roadside', icon:'🛞', desc:'Punctures, batteries, breakdowns', colour:'#D97706', urgent:true },
];

export const TRADES: Trade[] = [
  { id:'cleaning',   category:'cleaning', icon:'🧹', name:'Cleaning',          desc:'Homes, offices, Airbnb turnovers', live:true, pricing:'hourly' },
  { id:'laundry',    category:'cleaning', icon:'🧺', name:'Laundry & ironing', desc:'Collected, washed, pressed',                  pricing:'hourly' },
  { id:'windows',    category:'cleaning', icon:'🪟', name:'Window cleaning',   desc:'Exterior glass and balconies',                pricing:'hourly' },
  { id:'upholstery', category:'cleaning', icon:'🛋️', name:'Sofa & carpet',     desc:'Deep extraction cleaning',                    pricing:'fixed'  },
  { id:'pest',       category:'cleaning', icon:'🐜', name:'Pest control',      desc:'Cockroaches, ants, mosquitoes',               pricing:'fixed'  },

  { id:'ac',        category:'repairs', icon:'❄️', name:'AC technician',      desc:'Service, gas refill, install',      pricing:'fixed'  },
  { id:'water',     category:'repairs', icon:'💧', name:'Water filters',      desc:'RO systems, softeners, cartridges', pricing:'fixed'  },
  { id:'electric',  category:'repairs', icon:'⚡', name:'Electrician',        desc:'Wiring, sockets, lighting',         pricing:'hourly' },
  { id:'plumbing',  category:'repairs', icon:'🚰', name:'Plumber',            desc:'Leaks, taps, drainage',             pricing:'hourly' },
  { id:'appliance', category:'repairs', icon:'🔌', name:'Appliance repair',   desc:'Washer, oven, fridge, dryer',       pricing:'fixed'  },
  { id:'handyman',  category:'repairs', icon:'🔧', name:'Handyman',           desc:'Small jobs and odd repairs',        pricing:'hourly' },
  { id:'assembly',  category:'repairs', icon:'🪑', name:'Furniture assembly', desc:'Flat-pack built and fitted',        pricing:'hourly' },
  { id:'locksmith', category:'repairs', icon:'🔑', name:'Locksmith',          desc:'Lockouts, cylinder changes',        pricing:'fixed'  },
  { id:'tv',        category:'repairs', icon:'📺', name:'TV & satellite',     desc:'Wall mounting, dish setup',         pricing:'fixed'  },

  { id:'painting',   category:'improve', icon:'🎨', name:'Painter',           desc:'Interior and exterior',        pricing:'hourly' },
  { id:'carpenter',  category:'improve', icon:'🪚', name:'Carpenter',         desc:'Doors, shelving, wardrobes',   pricing:'hourly' },
  { id:'tiler',      category:'improve', icon:'🧱', name:'Tiler & marble',    desc:'Laying, grouting, polishing',  pricing:'hourly' },
  { id:'aluminium',  category:'improve', icon:'🪟', name:'Aluminium works',   desc:'Apertures, shutters, screens', pricing:'fixed'  },
  { id:'waterproof', category:'improve', icon:'🛡️', name:'Waterproofing',     desc:'Roof membrane and damp',       pricing:'fixed'  },
  { id:'curtains',   category:'improve', icon:'🪟', name:'Curtains & blinds', desc:'Measured, supplied, fitted',   pricing:'fixed'  },

  { id:'garden', category:'outdoor', icon:'🌿', name:'Gardening',    desc:'Terraces, balconies, plants',    pricing:'hourly' },
  { id:'pool',   category:'outdoor', icon:'🏊', name:'Pool service', desc:'Cleaning and chemical balance',  pricing:'fixed'  },
  { id:'solar',  category:'outdoor', icon:'☀️', name:'Solar water',  desc:'Heater service and repair',      pricing:'fixed'  },
  { id:'gas',    category:'outdoor', icon:'🔥', name:'Gas service',  desc:'Cylinder swap and safety check', pricing:'fixed'  },
  { id:'moving', category:'outdoor', icon:'📦', name:'Moving help',  desc:'Packing, loading, van',          pricing:'hourly' },

  { id:'tyre',     category:'vehicle', icon:'🛞', name:'Mobile tyre fix', desc:'Puncture repair or swap, at your car', live:true, pricing:'fixed', roadside:true },
  { id:'battery',  category:'vehicle', icon:'🔋', name:'Battery service', desc:'Jump start or new battery fitted',     live:true, pricing:'fixed', roadside:true },
  { id:'mechanic', category:'vehicle', icon:'🔩', name:'Mobile mechanic', desc:'Breakdown diagnosis on the spot',      live:true, pricing:'fixed', roadside:true },
  { id:'towing',   category:'vehicle', icon:'🚛', name:'Towing',          desc:'Recovery to your garage',              live:true, pricing:'fixed', roadside:true },
  { id:'fuel',     category:'vehicle', icon:'⛽', name:'Fuel delivery',   desc:'Ran dry? We bring a can',              live:true, pricing:'fixed', roadside:true },
  { id:'carlock',  category:'vehicle', icon:'🗝️', name:'Car lockout',     desc:'Keys locked in or lost',               live:true, pricing:'fixed', roadside:true },
  { id:'carvalet', category:'vehicle', icon:'🚗', name:'Car valet',       desc:'Washed and detailed at your door',                pricing:'fixed'  },
  { id:'vrt',      category:'vehicle', icon:'📋', name:'VRT help',        desc:'Pre-test check and booking',                      pricing:'fixed'  },
];

/* ── the live lists ─────────────────────────────────────────────────── */

/**
 * TRADES and CATEGORIES above are the arrays every screen already imports.
 * Rather than swap them for new arrays — which those screens would never
 * see, since they hold the original reference — the loader empties them and
 * refills them in place. One source, no screen changes, and anything added
 * in the admin screen shows up everywhere.
 */
const tradeCache: Trade[]    = TRADES;
const catCache:   Category[] = CATEGORIES;
let loaded = false;
let loading: Promise<void> | null = null;

const listeners = new Set<() => void>();
const announce  = () => listeners.forEach(fn => fn());

export async function loadTrades(force = false): Promise<void> {
  if (loading) return loading;
  if (loaded && !force) return;

  loading = (async () => {
    try {
      const [cats, trs] = await Promise.all([
        supabase.from('trade_categories').select('*').eq('active', true).order('sort_order'),
        supabase.from('trades').select('*').eq('active', true).order('sort_order'),
      ]);

      if (!cats.error && cats.data?.length) {
        catCache.length = 0;
        catCache.push(...cats.data.map((c: any) => ({
          id: c.id, name: c.name, icon: c.icon || '•',
          desc: c.description || '', colour: c.colour || '#4F46E5',
          urgent: !!c.urgent,
        })));
      }

      if (!trs.error && trs.data?.length) {
        tradeCache.length = 0;
        tradeCache.push(...trs.data.map((t: any) => ({
          id: t.id, category: t.category_id, icon: t.icon || '•',
          name: t.name, desc: t.description || '',
          pricing: (t.pricing === 'fixed' ? 'fixed' : 'hourly') as 'hourly'|'fixed',
          live: !!t.live, roadside: !!t.roadside,
        })));
      }

      loaded = true;
      announce();
    } catch (e) {
      // the built-in lists stay in place; the app is still usable
      console.log('loadTrades:', e);
    } finally {
      loading = null;
    }
  })();

  return loading;
}

/* Start fetching as soon as anything imports this. Screens that have
   already drawn get a nudge through useTrades when the real list lands. */
loadTrades();

export const allTrades     = () => tradeCache;
export const allCategories = () => catCache;

export const tradesIn = (categoryId: string) =>
  tradeCache.filter(t => t.category === categoryId);

export const findTrade = (id?: string | null) =>
  tradeCache.find(t => t.id === id) || null;

export const findCategory = (id?: string | null) =>
  catCache.find(c => c.id === id) || null;

export const liveCount = (categoryId: string) =>
  tradesIn(categoryId).filter(t => t.live).length;

/** Re-renders the screen when the real list arrives, or after an admin edit. */
export function useTrades() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump(n => n + 1);
    listeners.add(fn);
    loadTrades();
    return () => { listeners.delete(fn); };
  }, []);
  return { trades: tradeCache, categories: catCache, loaded, reload: () => loadTrades(true) };
}
