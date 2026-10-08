// lib/providers.ts
// providers_public view'undan guvenli alanlari okur. Kolon adlari
// projeler arasinda degisebildigi icin calisma aninda esler.

import { supabase } from './supabase';

export type PublicProvider = {
  id: string;
  name: string;
  rating: number | null;
  jobs: number | null;
  avatar: string | null;
};

function pick(row: any, keys: string[]): any {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return null;
}

function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function publicProviders(ids: string[]): Promise<Record<string, PublicProvider>> {
  const out: Record<string, PublicProvider> = {};
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return out;

  const { data, error } = await supabase.from('providers_public').select('*').in('id', unique);
  if (error || !data) return out;

  for (const row of data as any[]) {
    const joined = [pick(row, ['first_name']), pick(row, ['last_name'])].filter(Boolean).join(' ');
    out[row.id] = {
      id: row.id,
      name:
        pick(row, ['display_name', 'full_name', 'name', 'business_name', 'company_name']) ||
        joined ||
        'Provider',
      rating: num(pick(row, ['rating', 'avg_rating', 'rating_avg', 'average_rating'])),
      jobs: num(pick(row, ['jobs_done', 'completed_jobs', 'jobs_completed', 'job_count'])),
      avatar: pick(row, ['avatar_url', 'photo_url', 'profile_photo_url', 'avatar']),
    };
  }
  return out;
}
