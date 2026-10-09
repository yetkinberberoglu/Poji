// components/QuotePanel.tsx
// Teklif toplama + karsi teklif. Hicbir para hesabi burada yapilmaz;
// butun rakamlar Postgres'ten gelir (lib/quotes.ts -> rpc).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import {
  Quote, acceptQuote, counterQuote, declineQuote, euro, isLive, listQuotes,
  quoteError, respondCounter, sendQuote, timeLeft, watchQuotes, checkRange, noteRequired,
} from '../lib/quotes';
import { PublicProvider, publicProviders } from '../lib/providers';

const ACCENT = '#0F766E';   // marka rengin neyse burayi degistir
const DANGER = '#B42318';
const WARN   = '#B54708';
const INK    = '#101828';
const MUTED  = '#667085';
const LINE   = '#E4E7EC';

type Props = {
  booking?: any;                      // mevcut cagri sekli korunuyor
  bookingId?: string;
  role?: 'client' | 'provider';
  min?: number | null;                // ilanda yazan aralik
  max?: number | null;
  ttlMinutes?: number | null;         // teklifin gecerlilik suresi
  onChanged?: () => void;
};

export default function QuotePanel(props: Props) {
  const b = props.booking;
  const bookingId: string | undefined = b?.id ?? props.bookingId;
  // booking objesi bazi ekranlarda camelCase geliyor, ikisini de kabul et
  const rangeMin = props.min ?? b?.quote_min ?? b?.quoteMin ?? b?.price_min ?? b?.priceMin ?? null;
  const rangeMax = props.max ?? b?.quote_max ?? b?.quoteMax ?? b?.price_max ?? b?.priceMax ?? null;
  const ttl = props.ttlMinutes ?? b?.quote_ttl_minutes ?? b?.quoteTtlMinutes ?? null;

  const [me, setMe] = useState<string | null>(null);
  const [role, setRole] = useState<'client' | 'provider' | null>(props.role ?? null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [people, setPeople] = useState<Record<string, PublicProvider>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ---- yukleme ----------------------------------------------------
  const load = useCallback(async () => {
    if (!bookingId) return;
    try {
      const rows = await listQuotes(bookingId);
      setQuotes(rows);
      const map = await publicProviders(rows.map((q) => q.provider_id));
      setPeople(map);
    } catch (e: any) {
      setErr(quoteError(e));
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id ?? null;
      if (!alive) return;
      setMe(uid);
      if (!props.role) {
        const clientId = b?.client_id ?? b?.clientId;
        setRole(clientId && uid && clientId === uid ? 'client' : 'provider');
      }
      await load();
    })();
    return () => { alive = false; };
  }, [load, props.role, b?.client_id, b?.clientId]);

  useEffect(() => {
    if (!bookingId) return;
    return watchQuotes(bookingId, load);
  }, [bookingId, load]);

  const run = async (key: string, fn: () => Promise<any>) => {
    setErr(null); setBusy(key);
    try { await fn(); await load(); props.onChanged?.(); }
    catch (e: any) { setErr(quoteError(e)); }
    finally { setBusy(null); }
  };

  if (!bookingId) return null;
  if (loading) {
    return <View style={s.center}><ActivityIndicator color={ACCENT} /></View>;
  }

  return (
    <View style={s.wrap}>
      {err ? <View style={s.errBox}><Text style={s.errText}>{err}</Text></View> : null}
      {role === 'client'
        ? <ClientSide
            quotes={quotes} people={people} busy={busy} run={run}
            rangeMin={rangeMin} rangeMax={rangeMax} />
        : <ProviderSide
            bookingId={bookingId} me={me} quotes={quotes} busy={busy} run={run}
            rangeMin={rangeMin} rangeMax={rangeMax} ttl={ttl} />}
    </View>
  );
}

/* ================================================================ MUSTERI */

function ClientSide({ quotes, people, busy, run, rangeMin, rangeMax }: any) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [total, setTotal] = useState('');
  const [note, setNote] = useState('');

  const live: Quote[] = useMemo(() => quotes.filter(isLive), [quotes]);
  const dead: Quote[] = useMemo(() => quotes.filter((q: Quote) => !isLive(q)), [quotes]);
  const best = live.length ? Math.min(...live.map((q) => q.client_pays)) : null;

  if (!quotes.length) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyTitle}>Waiting for quotes</Text>
        <Text style={s.emptyBody}>
          Providers in your area are looking at your job now. You will get a
          notification as each quote arrives, then you pick the one you want.
          Nothing is charged until you accept.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView>
      <Text style={s.h1}>
        {live.length} quote{live.length === 1 ? '' : 's'}
      </Text>
      <Text style={s.sub}>
        Prices include VAT and card fees — what you see is what you pay.
        Your card is only held; money moves after you confirm the work is done.
      </Text>

      {live.map((q) => {
        const p = people[q.provider_id];
        const open = openId === q.id;
        const asked = Number(total || 0);
        const chk = checkRange(asked, rangeMin, rangeMax);
        const blocked = !asked || asked >= q.client_pays || noteRequired(chk, note);

        return (
          <View key={q.id} style={[s.card, q.client_pays === best && s.cardBest]}>
            {q.client_pays === best && live.length > 1
              ? <Text style={s.badge}>Lowest price</Text> : null}

            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{p?.name ?? 'Provider'}</Text>
                <Text style={s.meta}>
                  {p?.rating != null ? `${p.rating.toFixed(1)} ★` : 'New to Poji'}
                  {p?.jobs ? `  ·  ${p.jobs} jobs` : ''}
                  {`  ·  ${timeLeft(q)}`}
                </Text>
              </View>
              <Text style={s.price}>{euro(q.client_pays)}</Text>
            </View>

            <Text style={s.break}>
              Labour {euro(q.labour)}
              {q.parts > 0 ? `  +  parts ${euro(q.parts)}` : '  ·  no parts needed'}
            </Text>

            {q.note ? <Text style={s.note}>{q.note}</Text> : null}

            {q.status === 'countered' ? (
              <View style={s.pending}>
                <Text style={s.pendingText}>
                  You offered {euro(q.counter_total ?? 0)} — waiting for an answer.
                </Text>
              </View>
            ) : open ? (
              <View style={s.counterBox}>
                <Text style={s.label}>Your offer (total you would pay)</Text>
                <TextInput
                  style={s.input}
                  keyboardType="decimal-pad"
                  placeholder={`Less than ${euro(q.client_pays)}`}
                  placeholderTextColor={MUTED}
                  value={total}
                  onChangeText={setTotal}
                />
                {asked >= q.client_pays && asked > 0 ? (
                  <Text style={s.warn}>Your offer has to be lower than {euro(q.client_pays)}.</Text>
                ) : null}
                {chk.out ? <Text style={s.warn}>{chk.message}</Text> : null}

                <Text style={s.label}>Note {chk.out ? '(required)' : '(optional)'}</Text>
                <TextInput
                  style={[s.input, s.multi]}
                  multiline
                  placeholder="Tell the provider why — it makes a yes more likely."
                  placeholderTextColor={MUTED}
                  value={note}
                  onChangeText={setNote}
                />
                <View style={s.row}>
                  <Pressable
                    style={[s.btn, s.btnGhost, { flex: 1 }]}
                    onPress={() => { setOpenId(null); setTotal(''); setNote(''); }}>
                    <Text style={s.btnGhostText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    disabled={blocked || busy === q.id}
                    style={[s.btn, s.btnMain, { flex: 1 }, blocked && s.btnOff]}
                    onPress={() => run(q.id, async () => {
                      await counterQuote(q.id, asked, note.trim() || undefined);
                      setOpenId(null); setTotal(''); setNote('');
                    })}>
                    <Text style={s.btnMainText}>
                      {busy === q.id ? 'Sending…' : 'Send offer'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={s.row}>
                <Pressable
                  disabled={!!busy}
                  style={[s.btn, s.btnMain, { flex: 1.4 }]}
                  onPress={() => run(q.id, () => acceptQuote(q.id))}>
                  <Text style={s.btnMainText}>
                    {busy === q.id ? 'Booking…' : `Accept ${euro(q.client_pays)}`}
                  </Text>
                </Pressable>
                <Pressable style={[s.btn, s.btnGhost, { flex: 1 }]} onPress={() => setOpenId(q.id)}>
                  <Text style={s.btnGhostText}>Counter</Text>
                </Pressable>
                <Pressable
                  disabled={!!busy}
                  style={[s.btn, s.btnGhost]}
                  onPress={() => run(q.id, () => declineQuote(q.id))}>
                  <Text style={[s.btnGhostText, { color: DANGER }]}>Decline</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}

      {live.length > 1 ? (
        <Text style={s.footnote}>
          Accepting one quote automatically declines the others. The cheapest is
          not always the best — check the rating and what the note says is included.
        </Text>
      ) : null}

      {dead.length ? (
        <View style={{ marginTop: 18 }}>
          <Text style={s.h2}>Closed</Text>
          {dead.map((q: Quote) => (
            <View key={q.id} style={[s.card, s.cardDead]}>
              <View style={s.row}>
                <Text style={[s.name, { flex: 1 }]}>{people[q.provider_id]?.name ?? 'Provider'}</Text>
                <Text style={s.deadPrice}>{euro(q.client_pays)}</Text>
              </View>
              <Text style={s.meta}>
                {q.status === 'accepted' ? 'Accepted' :
                 q.status === 'declined' ? 'Declined' :
                 q.status === 'withdrawn' ? 'Withdrawn by provider' : 'Expired'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

/* ============================================================== SAGLAYICI */

function ttlText(m?: number | null): string {
  if (!m) return 'Quotes expire automatically \u2014 send yours while the job is fresh.';
  if (m <= 120) return `This one is urgent: your quote expires in ${m} minutes.`;
  const h = Math.round(m / 60);
  if (h < 24) return `Your quote stays open for ${h} hours.`;
  const d = Math.round(h / 24);
  return `Your quote stays open for ${d} day${d === 1 ? '' : 's'}.`;
}

function ProviderSide({ bookingId, me, quotes, busy, run, rangeMin, rangeMax, ttl }: any) {
  const mine: Quote | undefined = useMemo(
    () => quotes.find((q: Quote) => q.provider_id === me), [quotes, me]);

  const [labour, setLabour] = useState(mine ? String(mine.labour) : '');
  const [parts, setParts] = useState(mine && mine.parts > 0 ? String(mine.parts) : '');
  const [note, setNote] = useState(mine?.note ?? '');
  const [pv, setPv] = useState<any>(null);
  const timer = useRef<any>(null);
  const synced = useRef<string | null>(null);

  // Teklifler asenkron geliyor: mevcut teklif yuklenince formu doldur.
  useEffect(() => {
    if (mine && synced.current !== mine.id) {
      synced.current = mine.id;
      setLabour(String(mine.labour));
      setParts(mine.parts > 0 ? String(mine.parts) : '');
      setNote(mine.note ?? '');
    }
  }, [mine]);

  /**
   * The server works out every line, including this job's own commission
   * rate and whether it is urgent. Nothing is calculated on screen, so the
   * figure here is the figure that settles — and the provider can see
   * exactly where the difference goes before committing to it.
   */
  useEffect(() => {
    const L = Number(labour || 0), P = Number(parts || 0);
    if (!L) { setPv(null); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { data, error } = await supabase.rpc('poji_quote_preview', {
        p_booking: bookingId, p_labour: L, p_parts: P,
      });
      if (!error && data) setPv(data);
    }, 350);
    return () => clearTimeout(timer.current);
  }, [labour, parts, bookingId]);

  const chk = checkRange(pv?.total ?? 0, rangeMin, rangeMax);
  const blocked = !Number(labour || 0) || noteRequired(chk, note);

  // Karsi teklif bekliyor
  if (mine?.status === 'countered') {
    return (
      <View style={s.card}>
        <Text style={s.h2}>The client made an offer</Text>
        <View style={s.row}>
          <Text style={[s.break, { flex: 1 }]}>Your quote was {euro(mine.client_pays)}</Text>
          <Text style={s.price}>{euro(mine.counter_total ?? 0)}</Text>
        </View>
        {mine.counter_note ? <Text style={s.note}>{mine.counter_note}</Text> : null}
        <View style={s.preview}>
          <View style={s.row}>
            <Text style={[s.previewLabel, { flex: 1 }]}>If you accept, you receive</Text>
            <Text style={[s.previewValue, { color: ACCENT }]}>
              {euro(mine.provider_gets)}
            </Text>
          </View>
        </View>
        <Text style={s.sub}>
          Accept and the job is yours straight away — no second confirmation needed.
          Keep your price and the client can still accept the original quote.
        </Text>
        <View style={s.row}>
          <Pressable
            disabled={!!busy}
            style={[s.btn, s.btnMain, { flex: 1.3 }]}
            onPress={() => run(mine.id, () => respondCounter(mine.id, true))}>
            <Text style={s.btnMainText}>
              {busy === mine.id ? 'Working…' : `Accept ${euro(mine.counter_total ?? 0)}`}
            </Text>
          </Pressable>
          <Pressable
            disabled={!!busy}
            style={[s.btn, s.btnGhost, { flex: 1 }]}
            onPress={() => run(mine.id, () => respondCounter(mine.id, false))}>
            <Text style={s.btnGhostText}>Keep my price</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (mine?.status === 'accepted') {
    return (
      <View style={[s.card, s.cardBest]}>
        <Text style={s.h2}>Quote accepted</Text>
        <Text style={s.break}>
          You receive {euro(mine.provider_gets)} for this job. The client has been charged a hold
          of {euro(mine.client_pays)}.
        </Text>
      </View>
    );
  }

  if (mine && (mine.status === 'declined' || mine.status === 'withdrawn')) {
    return (
      <View style={[s.card, s.cardDead]}>
        <Text style={s.h2}>
          {mine.status === 'declined' ? 'Not selected' : 'Quote withdrawn'}
        </Text>
        <Text style={s.meta}>
          {mine.status === 'declined'
            ? 'The client went with another provider this time.'
            : 'You pulled this quote. You can send a new one.'}
        </Text>
      </View>
    );
  }

  const others = quotes.filter((q: Quote) => q.provider_id !== me && isLive(q)).length;

  return (
    <View style={s.card}>
      <Text style={s.h2}>{mine ? 'Update your quote' : 'Send a quote'}</Text>
      <Text style={s.sub}>
        {others > 0
          ? `${others} other provider${others === 1 ? ' has' : 's have'} quoted. The client sees every quote and picks one.`
          : 'You are the first to quote. The client can accept, counter, or wait for more.'}
        {rangeMin != null && rangeMax != null
          ? `  Clients were shown ${euro(rangeMin)}–${euro(rangeMax)} for this service.`
          : ''}
      </Text>

      <Text style={s.label}>Your labour price</Text>
      <TextInput
        style={s.input} keyboardType="decimal-pad" placeholder="0.00"
        placeholderTextColor={MUTED} value={labour} onChangeText={setLabour} />

      <Text style={s.label}>Parts or materials (leave empty if none)</Text>
      <TextInput
        style={s.input} keyboardType="decimal-pad" placeholder="0.00"
        placeholderTextColor={MUTED} value={parts} onChangeText={setParts} />

      {pv ? (() => {
        const n = (k: string) => Number(pv[k] || 0);
        const base = +(n('labour') - n('urgent_fee')).toFixed(2);
        const rate = Math.round(n('labour_commission_rate') * 100);
        return (
          <View style={s.preview}>
            <View style={s.row}>
              <Text style={[s.previewLabel, { flex: 1 }]}>Your labour</Text>
              <Text style={s.breakVal}>{euro(base)}</Text>
            </View>

            {n('urgent_fee') > 0 && (
              <View style={s.row}>
                <Text style={[s.previewLabel, { flex: 1 }]}>Urgent callout (25%)</Text>
                <Text style={s.breakVal}>+{euro(n('urgent_fee'))}</Text>
              </View>
            )}

            {n('parts') > 0 && (
              <View style={s.row}>
                <Text style={[s.previewLabel, { flex: 1 }]}>Parts you supply</Text>
                <Text style={s.breakVal}>{euro(n('parts'))}</Text>
              </View>
            )}

            <View style={s.row}>
              <Text style={[s.previewLabel, { flex: 1 }]}>Poji fee on labour ({rate}%)</Text>
              <Text style={[s.breakVal, { color: DANGER }]}>
                −{euro(n('labour_commission'))}
              </Text>
            </View>

            {n('parts_commission') > 0 && (
              <View style={s.row}>
                <Text style={[s.previewLabel, { flex: 1 }]}>Poji fee on parts (5%)</Text>
                <Text style={[s.breakVal, { color: DANGER }]}>
                  −{euro(n('parts_commission'))}
                </Text>
              </View>
            )}

            <View style={[s.row, s.breakTotal]}>
              <Text style={[s.previewLabel, { flex: 1, fontWeight: '700', color: INK }]}>
                You receive
              </Text>
              <Text style={[s.previewValue, { color: ACCENT }]}>
                {euro(n('provider_gets'))}
              </Text>
            </View>

            <View style={[s.row, s.breakClient]}>
              <Text style={[s.previewLabel, { flex: 1 }]}>Client pays</Text>
              <Text style={s.previewValue}>{euro(n('total'))}</Text>
            </View>

            <Text style={s.previewFoot}>
              Their total includes the {euro(n('stripe_fee'))} card fee
              {n('vat') > 0 ? ` and ${euro(n('vat'))} VAT` : ''}. Your price is
              yours to set; any VAT inside it is for you to account for.
            </Text>
          </View>
        );
      })() : null}

      {chk.out ? <Text style={s.warn}>{chk.message}</Text> : null}

      <Text style={s.label}>
        What the price covers {chk.out ? '(required)' : '(optional, but it wins jobs)'}
      </Text>
      <TextInput
        style={[s.input, s.multi]} multiline
        placeholder="e.g. Full service, new filter fitted, 6-month guarantee. Two hours on site."
        placeholderTextColor={MUTED} value={note} onChangeText={setNote} />

      <Pressable
        disabled={blocked || !!busy}
        style={[s.btn, s.btnMain, blocked && s.btnOff]}
        onPress={() => run('send', () =>
          sendQuote(bookingId, Number(labour), Number(parts || 0), note.trim() || undefined))}>
        <Text style={s.btnMainText}>
          {busy === 'send' ? 'Sending…' : mine ? 'Update quote' : 'Send quote'}
        </Text>
      </Pressable>

      {mine ? (
        <Pressable
          disabled={!!busy}
          style={[s.btn, s.btnGhost, { marginTop: 8 }]}
          onPress={() => run(mine.id, () => declineQuote(mine.id))}>
          <Text style={[s.btnGhostText, { color: DANGER }]}>Withdraw my quote</Text>
        </Pressable>
      ) : null}

      <Text style={s.footnote}>{ttlText(ttl)}</Text>
    </View>
  );
}

/* ================================================================= STIL */

const s = StyleSheet.create({
  wrap: { gap: 12 },
  center: { padding: 28, alignItems: 'center' },
  h1: { fontSize: 20, fontWeight: '700', color: INK, marginBottom: 4 },
  h2: { fontSize: 16, fontWeight: '700', color: INK, marginBottom: 6 },
  sub: { fontSize: 13, color: MUTED, lineHeight: 19, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  card: {
    borderWidth: 1, borderColor: LINE, borderRadius: 14,
    padding: 14, marginBottom: 10, backgroundColor: '#fff', gap: 8,
  },
  cardBest: { borderColor: ACCENT, borderWidth: 2 },
  cardDead: { opacity: 0.55 },
  badge: {
    alignSelf: 'flex-start', fontSize: 11, fontWeight: '700', color: '#fff',
    backgroundColor: ACCENT, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },

  name: { fontSize: 15, fontWeight: '700', color: INK },
  meta: { fontSize: 12, color: MUTED },
  price: { fontSize: 20, fontWeight: '800', color: INK },
  deadPrice: { fontSize: 15, fontWeight: '600', color: MUTED },
  break: { fontSize: 13, color: MUTED },
  note: {
    fontSize: 13, color: INK, lineHeight: 19,
    backgroundColor: '#F9FAFB', padding: 10, borderRadius: 10,
  },

  label: { fontSize: 12, fontWeight: '600', color: INK, marginTop: 8, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: LINE, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: INK,
  },
  multi: { minHeight: 70, textAlignVertical: 'top' },

  counterBox: { borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8, gap: 2 },
  pending: { backgroundColor: '#FFFAEB', borderRadius: 10, padding: 10 },
  pendingText: { fontSize: 13, color: WARN },

  preview: { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, gap: 4, marginTop: 10 },
  previewLabel: { fontSize: 13, color: MUTED },
  previewValue: { fontSize: 16, fontWeight: '700', color: INK },
  breakVal: { fontSize: 13, fontWeight: '600', color: INK },
  breakTotal: { borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8, marginTop: 4 },
  breakClient: { borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
  previewFoot: { fontSize: 11, color: MUTED, marginTop: 4, lineHeight: 15 },

  btn: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  btnMain: { backgroundColor: ACCENT },
  btnMainText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnGhost: { borderWidth: 1, borderColor: LINE, backgroundColor: '#fff' },
  btnGhostText: { color: INK, fontWeight: '600', fontSize: 14 },
  btnOff: { opacity: 0.4 },

  warn: { fontSize: 12, color: WARN, lineHeight: 17, marginTop: 6 },
  errBox: { backgroundColor: '#FEF3F2', borderRadius: 10, padding: 12 },
  errText: { color: DANGER, fontSize: 13 },
  footnote: { fontSize: 11, color: MUTED, marginTop: 10, lineHeight: 16 },

  empty: { padding: 18, borderWidth: 1, borderColor: LINE, borderRadius: 14, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: INK },
  emptyBody: { fontSize: 13, color: MUTED, lineHeight: 19 },
});
