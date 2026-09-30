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

export const CATEGORIES: Category[] = [
  { id:'cleaning', name:'Cleaning & care',    icon:'🧹', desc:'Homes, offices, laundry, pests',        colour:'#4F46E5' },
  { id:'repairs',  name:'Repairs & installs', icon:'🔧', desc:'AC, water, electrics, appliances',      colour:'#0891B2' },
  { id:'improve',  name:'Home improvement',   icon:'🎨', desc:'Painting, carpentry, tiling, damp',     colour:'#7C3AED' },
  { id:'outdoor',  name:'Outdoor & property', icon:'🌿', desc:'Gardens, pools, solar, moving',         colour:'#059669' },
  { id:'vehicle',  name:'Vehicle & roadside', icon:'🛞', desc:'Punctures, batteries, breakdowns',      colour:'#D97706', urgent:true },
];

export const TRADES: Trade[] = [
  // ── Cleaning & care ──
  { id:'cleaning',   category:'cleaning', icon:'🧹', name:'Cleaning',          desc:'Homes, offices, Airbnb turnovers', live:true, pricing:'hourly' },
  { id:'laundry',    category:'cleaning', icon:'🧺', name:'Laundry & ironing', desc:'Collected, washed, pressed',                  pricing:'hourly' },
  { id:'windows',    category:'cleaning', icon:'🪟', name:'Window cleaning',   desc:'Exterior glass and balconies',                pricing:'hourly' },
  { id:'upholstery', category:'cleaning', icon:'🛋️', name:'Sofa & carpet',     desc:'Deep extraction cleaning',                    pricing:'fixed'  },
  { id:'pest',       category:'cleaning', icon:'🐜', name:'Pest control',      desc:'Cockroaches, ants, mosquitoes',               pricing:'fixed'  },

  // ── Repairs & installs ──
  { id:'ac',        category:'repairs', icon:'❄️', name:'AC technician',      desc:'Service, gas refill, install',   pricing:'fixed'  },
  { id:'water',     category:'repairs', icon:'💧', name:'Water filters',      desc:'RO systems, softeners, cartridges', pricing:'fixed' },
  { id:'electric',  category:'repairs', icon:'⚡', name:'Electrician',        desc:'Wiring, sockets, lighting',       pricing:'hourly' },
  { id:'plumbing',  category:'repairs', icon:'🚰', name:'Plumber',            desc:'Leaks, taps, drainage',           pricing:'hourly' },
  { id:'appliance', category:'repairs', icon:'🔌', name:'Appliance repair',   desc:'Washer, oven, fridge, dryer',     pricing:'fixed'  },
  { id:'handyman',  category:'repairs', icon:'🔧', name:'Handyman',           desc:'Small jobs and odd repairs',      pricing:'hourly' },
  { id:'assembly',  category:'repairs', icon:'🪑', name:'Furniture assembly', desc:'Flat-pack built and fitted',      pricing:'hourly' },
  { id:'locksmith', category:'repairs', icon:'🔑', name:'Locksmith',          desc:'Lockouts, cylinder changes',      pricing:'fixed'  },
  { id:'tv',        category:'repairs', icon:'📺', name:'TV & satellite',     desc:'Wall mounting, dish setup',       pricing:'fixed'  },

  // ── Home improvement ──
  { id:'painting',   category:'improve', icon:'🎨', name:'Painter',           desc:'Interior and exterior',        pricing:'hourly' },
  { id:'carpenter',  category:'improve', icon:'🪚', name:'Carpenter',         desc:'Doors, shelving, wardrobes',   pricing:'hourly' },
  { id:'tiler',      category:'improve', icon:'🧱', name:'Tiler & marble',    desc:'Laying, grouting, polishing',  pricing:'hourly' },
  { id:'aluminium',  category:'improve', icon:'🪟', name:'Aluminium works',   desc:'Apertures, shutters, screens', pricing:'fixed'  },
  { id:'waterproof', category:'improve', icon:'🛡️', name:'Waterproofing',     desc:'Roof membrane and damp',       pricing:'fixed'  },
  { id:'curtains',   category:'improve', icon:'🪟', name:'Curtains & blinds', desc:'Measured, supplied, fitted',   pricing:'fixed'  },

  // ── Outdoor & property ──
  { id:'garden', category:'outdoor', icon:'🌿', name:'Gardening',    desc:'Terraces, balconies, plants',      pricing:'hourly' },
  { id:'pool',   category:'outdoor', icon:'🏊', name:'Pool service', desc:'Cleaning and chemical balance',    pricing:'fixed'  },
  { id:'solar',  category:'outdoor', icon:'☀️', name:'Solar water',  desc:'Heater service and repair',        pricing:'fixed'  },
  { id:'gas',    category:'outdoor', icon:'🔥', name:'Gas service',  desc:'Cylinder swap and safety check',   pricing:'fixed'  },
  { id:'moving', category:'outdoor', icon:'📦', name:'Moving help',  desc:'Packing, loading, van',            pricing:'hourly' },

  // ── Vehicle & roadside ──
  { id:'tyre',     category:'vehicle', icon:'🛞', name:'Mobile tyre fix', desc:'Puncture repair or swap, at your car', live:true, pricing:'fixed', roadside:true },
  { id:'battery',  category:'vehicle', icon:'🔋', name:'Battery service', desc:'Jump start or new battery fitted',     live:true, pricing:'fixed', roadside:true },
  { id:'mechanic', category:'vehicle', icon:'🔩', name:'Mobile mechanic', desc:'Breakdown diagnosis on the spot',      live:true, pricing:'fixed', roadside:true },
  { id:'towing',   category:'vehicle', icon:'🚛', name:'Towing',          desc:'Recovery to your garage',              live:true, pricing:'fixed', roadside:true },
  { id:'fuel',     category:'vehicle', icon:'⛽', name:'Fuel delivery',   desc:'Ran dry? We bring a can',              live:true, pricing:'fixed', roadside:true },
  { id:'carlock',  category:'vehicle', icon:'🗝️', name:'Car lockout',     desc:'Keys locked in or lost',               live:true, pricing:'fixed', roadside:true },
  { id:'carvalet', category:'vehicle', icon:'🚗', name:'Car valet',       desc:'Washed and detailed at your door',                pricing:'fixed'  },
  { id:'vrt',      category:'vehicle', icon:'📋', name:'VRT help',        desc:'Pre-test check and booking',                      pricing:'fixed'  },
];

export const tradesIn = (categoryId: string) =>
  TRADES.filter(t => t.category === categoryId);

export const findTrade = (id?: string | null) =>
  TRADES.find(t => t.id === id) || null;

export const findCategory = (id?: string | null) =>
  CATEGORIES.find(c => c.id === id) || null;

export const liveCount = (categoryId: string) =>
  tradesIn(categoryId).filter(t => t.live).length;
