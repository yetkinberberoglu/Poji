// lib/quotes.ts
// Teklif toplama + karsi teklif. Butun para hesabi Postgres'te yapilir;
// burada hicbir yerde fiyat hesaplanmaz, sadece gosterilir.

import { supabase } from './supabase';

export type QuoteStatus = 'sent' | 'countered' | 'accepted' | 'declined' | 'withdrawn';

export type Quote = {
  id: string;
  booking_id: string;
  provider_id: string;
  labour: number;
  parts: number;
  note: string | null;
  client_pays: number;
  provider_gets: number;
  status: QuoteStatus;
  counter_total: number | null;
  counter_note: string | null;
  countered_at: string | null;
  expires_at: string;
  created_at: string;
};

// ---------------------------------------------------------------- okuma

export async function listQuotes(bookingId: string): Promise<Quote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('booking_id', bookingId)
    .order('client_pays', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Quote[];
}

/** Saglayicinin bu is icin kendi teklifi (varsa). */
export async function myQuote(bookingId: string, providerId: string): Promise<Quote | null> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('booking_id', bookingId)
    .eq('provider_id', providerId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Quote | null;
}

/** Canli tekliflere realtime abone ol. Donen fonksiyonu unmount'ta cagir. */
export function watchQuotes(bookingId: string, onChange: () => void) {
  const ch = supabase
    .channel(`quotes:${bookingId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'quotes', filter: `booking_id=eq.${bookingId}` },
      onChange,
    )
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// ---------------------------------------------------------------- yazma

/** Saglayici teklif gonderir / kendi teklifini guncller. */
export async function sendQuote(
  bookingId: string,
  labour: number,
  parts = 0,
  note?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('send_quote', {
    p_booking: bookingId,
    p_labour: labour,
    p_parts: parts,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data as string;
}

/** Musteri karsi teklif verir. Verdigi rakam MUSTERININ ODEYECEGI TOPLAM. */
export async function counterQuote(
  quoteId: string,
  total: number,
  note?: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('counter_quote', {
    p_quote: quoteId,
    p_total: total,
    p_note: note ?? null,
  });
  if (error) throw error;
  return Number(data); // karsi teklifin icindeki emek ucreti
}

/** Saglayici karsi teklife cevap verir. accept=true ise is direkt baglanir. */
export async function respondCounter(quoteId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_counter', {
    p_quote: quoteId,
    p_accept: accept,
  });
  if (error) throw error;
}

/** Musteri kazanan teklifi secer. Digerleri otomatik reddedilir. */
export async function acceptQuote(quoteId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_quote', { p_quote: quoteId });
  if (error) throw error;
}

/** Musteri bir teklifi reddeder, ya da saglayici kendi teklifini geri ceker. */
export async function declineQuote(quoteId: string): Promise<void> {
  const { error } = await supabase.rpc('decline_quote', { p_quote: quoteId });
  if (error) throw error;
}

// ---------------------------------------------------------------- yardimcilar

export const euro = (n: number) =>
  `€${Number(n ?? 0).toLocaleString('en-MT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function isExpired(q: Quote): boolean {
  return new Date(q.expires_at).getTime() <= Date.now();
}

/** "4h 12m left" / "Expired" */
export function timeLeft(q: Quote): string {
  const ms = new Date(q.expires_at).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 1 ? `${h}h ${m}m left` : `${m}m left`;
}

export function isLive(q: Quote): boolean {
  return (q.status === 'sent' || q.status === 'countered') && !isExpired(q);
}

/**
 * Ilanda yazan araligin disina cikildi mi?
 * Engellemiyoruz - uyariyoruz ve not zorunlu kiliyoruz.
 */
export type RangeCheck = { out: boolean; side: 'below' | 'above' | null; message: string | null };

export function checkRange(total: number, min?: number | null, max?: number | null): RangeCheck {
  if (!total || (min == null && max == null)) return { out: false, side: null, message: null };
  if (min != null && total < min) {
    return {
      out: true,
      side: 'below',
      message: `This is below the ${euro(min)}–${euro(max ?? min)} range shown to clients. Explain why in a note so they trust the price.`,
    };
  }
  if (max != null && total > max) {
    return {
      out: true,
      side: 'above',
      message: `This is above the ${euro(min ?? max)}–${euro(max)} range shown to clients. You must explain what makes this job cost more.`,
    };
  }
  return { out: false, side: null, message: null };
}

/** Araligin disindaysa not zorunlu. */
export function noteRequired(check: RangeCheck, note: string): boolean {
  return check.out && note.trim().length < 15;
}

/** Postgres exception mesajlarini kullaniciya gosterilecek hale getirir. */
export function quoteError(e: any): string {
  const raw = String(e?.message ?? e ?? '');
  if (/expired/i.test(raw)) return 'That quote has expired. Ask the provider for a fresh one.';
  if (/no longer open/i.test(raw)) return 'That quote is no longer available.';
  if (/no longer collecting/i.test(raw)) return 'This job is already assigned.';
  if (/must be lower/i.test(raw)) return 'Your counter-offer has to be lower than the quote.';
  if (/cover the parts/i.test(raw)) return 'That amount does not even cover the parts.';
  if (/cannot be countered/i.test(raw)) return 'You have already answered this quote.';
  if (/no counter-offer/i.test(raw)) return 'There is no counter-offer to answer.';
  if (/not your/i.test(raw) || /Not yours/i.test(raw)) return 'You cannot change this quote.';
  if (/greater than zero/i.test(raw)) return 'Enter your labour price.';
  return raw || 'Something went wrong.';
}
