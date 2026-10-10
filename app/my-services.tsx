import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Switch
} from 'react-native';
import { router } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { findTrade } from '../constants/trades';
import QuestionEditor from '../components/QuestionEditor';
import RoutePricing from '../components/RoutePricing';
import { cheapestRoute } from '../lib/transport';
import {
  loadServiceTypes, loadProviderServices, seedProviderServices,
  effectiveService, fixedQuote, optionLabel, optionDelta, unitLabour,
  type ServiceType, type ProviderService,
} from '../lib/services';

const fmtM = (m:number) => m >= 60
  ? (m % 60 === 0 ? `${m/60}h` : `${Math.floor(m/60)}h ${m%60}m`)
  : `${m}m`;

/**
 * A provider's own price list. Seeded from the platform defaults so
 * nobody starts with an empty screen, then edited to suit how they work.
 */
export default function MyServices() {
  const [types, setTypes] = useState<ServiceType[]>([]);
  const [mine, setMine]   = useState<Record<string, ProviderService>>({});
  const [trades, setTrades] = useState<string[]>([]);
  const [loading, setLoad] = useState(true);
  const [editing, setEdit] = useState<string|null>(null);
  const [saving, setSaving]= useState(false);
  const [error, setError]  = useState('');

  const [draft, setDraft] = useState<any>({});

  /**
   * What the form looked like when it opened. Anything different means
   * unsaved work, and unsaved work is never allowed to disappear quietly:
   * a provider who thinks they changed their price and didn't will blame
   * us for the booking that comes in at the old one.
   */
  const [baseline, setBaseline] = useState('');
  const [confirmDiscard, setConfirm] = useState<null | { next?: ServiceType }>(null);
  const [savedAt, setSavedAt] = useState('');

  /**
   * The figures on their profile, used for any hourly service they have
   * not priced on its own. An hour of a chef is not an hour of a
   * cleaner, so the rate belongs on the service — but a cleaner with
   * three cleaning services should not have to type the same number
   * three times either.
   */
  const [prof, setProf] = useState<{ hourlyRate: number; minHours: number }>(
    { hourlyRate: 0, minHours: 0 });

  const dirty = !!editing && JSON.stringify(draft) !== baseline;

  const load = async () => {
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/auth'); return; }

    const { data: me } = await supabase.from('cleaner_profiles')
      .select('categories, hourly_rate, min_hours').eq('id', user.id).maybeSingle();
    const cats = me?.categories || [];
    setTrades(cats);
    setProf({
      hourlyRate: Number(me?.hourly_rate) || 0,
      minHours:   Number(me?.min_hours)   || 0,
    });

    if (cats.length) {
      await seedProviderServices(user.id, cats);
      const t = await loadServiceTypes({ trades: cats });
      setTypes(t);
    }

    setMine(await loadProviderServices(user.id));
    setLoad(false);
  };

  useEffect(() => { load(); }, []);

  const leavingScreen = useRef(false);

  const goBack = () => {
    if (dirty) { leavingScreen.current = true; setConfirm({}); return; }
    router.back();
  };

  // the confirmation clears itself once the work is saved
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(''), 5000);
    return () => clearTimeout(t);
  }, [savedAt]);

  const startEdit = (t: ServiceType) => {
    const own = mine[t.id];
    const eff = effectiveService(t, own, prof);
    const fresh = {
      /* only their own figure, never the profile fallback - showing the
         fallback here would make them think they had set a rate for this
         service when they had not */
      hourly_rate: own?.hourly_rate ? String(own.hourly_rate) : '',
      min_hours:   own?.min_hours   ? String(own.min_hours)   : '',
      labour_price: String(eff.labour || ''),
      parts_price:  String(eff.parts || ''),
      parts_label:  eff.partsLabel || '',
      price_min:    eff.priceMin != null ? String(eff.priceMin) : '',
      price_max:    eff.priceMax != null ? String(eff.priceMax) : '',
      typical_minutes: String(eff.minutes),
      unit_price: eff.unitPrice ? String(eff.unitPrice) : '',
      min_charge: eff.minCharge ? String(eff.minCharge) : '',
      unit_binding: eff.unitBinding,
      note: own?.note || '',
      option_prices: { ...(own?.option_prices || {}) },
      vehicles: own?.vehicles || [],
      route_prices: { ...(own?.route_prices || {}) },
      questions: own?.questions?.length
        ? JSON.parse(JSON.stringify(own.questions))
        : JSON.parse(JSON.stringify(t.questions || [])),
    };
    setDraft(fresh);
    setBaseline(JSON.stringify(fresh));
    setEdit(t.id);
    setError('');
    setSavedAt('');
  };

  /** Opening another service, cancelling or leaving all go through here. */
  const leaveEdit = (next?: ServiceType) => {
    if (dirty) { setConfirm({ next }); return; }
    setEdit(null); setError('');
    if (next) startEdit(next);
  };

  const discardNow = () => {
    const next = confirmDiscard?.next;
    setConfirm(null);
    setEdit(null); setError(''); setBaseline('');
    if (next) startEdit(next);
    else if (leavingScreen.current) router.back();
  };

  const saveOne = async (t: ServiceType) => {
    const isQuote = t.pricing_model === 'quote';

    if (isQuote) {
      const lo = Number(draft.price_min), hi = Number(draft.price_max);
      if (!lo || !hi)  { setError('Give a price range'); return; }
      if (hi < lo)     { setError('The top of the range is below the bottom'); return; }
    } else if ((t as any).is_transport) {
      if (!(draft.vehicles || []).length) { setError('Pick at least one vehicle'); return; }
      if (!Object.keys(draft.route_prices || {}).length) {
        setError('Price at least one run'); return;
      }
    } else if (t.pricing_model === 'unit') {
      if (!Number(draft.unit_price)) { setError('Set your price per ' + (t.unit_label || 'm²')); return; }
    } else if (t.pricing_model === 'fixed') {
      if (!Number(draft.labour_price)) { setError('Set your service charge'); return; }
    } else if ((t.pricing_model ?? 'hourly') === 'hourly') {
      /* Their rate here, or the one on their profile. One of the two has
         to exist: a rate nobody chose is a number they never agreed to
         be paid, and the database refuses the booking rather than
         inventing one. */
      if (!Number(draft.hourly_rate) && !prof.hourlyRate) {
        setError('Set your hourly rate for this work — there is none on your profile to fall back on');
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
    const { data:{ user } } = await supabase.auth.getUser();

    const { error: e } = await supabase.from('provider_services').upsert({
      provider_id: user!.id,
      service_type_id: t.id,
      active: mine[t.id]?.active ?? true,
      labour_price: isQuote ? null : (Number(draft.labour_price) || null),
      parts_price:  isQuote ? null : (Number(draft.parts_price)  || 0),
      parts_label:  isQuote ? null : (draft.parts_label.trim() || null),
      price_min:    isQuote ? Number(draft.price_min) : null,
      price_max:    isQuote ? Number(draft.price_max) : null,
      typical_minutes: Number(draft.typical_minutes) || 60,
      /* null, not 0 - null means "use my profile rate", 0 would mean
         "I work for nothing" */
      hourly_rate:  Number(draft.hourly_rate) || null,
      min_hours:    Number(draft.min_hours)   || null,
      unit_price:   Number(draft.unit_price) || null,
      min_charge:   Number(draft.min_charge) || null,
      unit_binding: draft.unit_binding === true,
      note: draft.note.trim() || null,
      vehicles: draft.vehicles || [],
      route_prices: draft.route_prices || {},
      questions: (draft.questions || []).filter((q:any)=>q.label?.trim()),
      option_prices: {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider_id,service_type_id' });

    if (e) { setError(e.message); return; }

    setMine(await loadProviderServices(user!.id));
    setBaseline(JSON.stringify(draft));
    setSavedAt(new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}));
    setEdit(null);
    } catch (err: any) {
      // Without this the button stays spinning for ever and the provider
      // has no idea anything went wrong.
      setError(err?.message || 'Could not save that. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (t: ServiceType, on: boolean) => {
    const { data:{ user } } = await supabase.auth.getUser();
    setMine(prev => ({ ...prev, [t.id]: { ...(prev[t.id] as any), active: on } }));
    await supabase.from('provider_services').upsert({
      provider_id: user!.id,
      service_type_id: t.id,
      active: on,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider_id,service_type_id' });
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.primary} size="large"/></View>;
  }

  // group by trade so a company with six trades can find things
  const byTrade: Record<string, ServiceType[]> = {};
  types.forEach(t => { (byTrade[t.trade_id || 'other'] ||= []).push(t); });

  return (
    <View style={s.wrap}>
      <View style={s.hdr}>
        <TouchableOpacity onPress={goBack}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>My services</Text>
        <View style={{width:54}}/>
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.intro}>
          These are the jobs clients can book, and what you charge for each.
        </Text>
        <Text style={s.hint}>
          We've filled in typical Malta prices to get you started. Change anything —
          clients see your numbers, not ours.
        </Text>

        {error ? <View style={s.errBox}><Text style={s.errTxt}>⚠️  {error}</Text></View> : null}

        {types.length === 0 && (
          <View style={s.emptyBox}>
            <Text style={s.emptyIcon}>🧰</Text>
            <Text style={s.emptyTitle}>No services to price yet</Text>
            <Text style={s.emptyTxt}>
              Pick your trades first and we'll list the jobs that go with them.
            </Text>
            <TouchableOpacity style={s.emptyBtn}
              onPress={()=>router.push('/(provider)/profile')}>
              <Text style={s.emptyBtnTxt}>Choose my trades</Text>
            </TouchableOpacity>
          </View>
        )}

        {Object.entries(byTrade).map(([tradeId, list])=>{
          const trade = findTrade(tradeId);
          return (
            <View key={tradeId} style={s.group}>
              <Text style={s.groupTitle}>
                {trade?.icon || '•'}  {trade?.name || tradeId}
              </Text>

              {list.map(t=>{
                const own = mine[t.id];
                const on  = own?.active !== false;
                const eff = effectiveService(t, own, prof);
                const isQuote = t.pricing_model === 'quote';
                const isUnit  = t.pricing_model === 'unit';
                const isHourly= (t.pricing_model ?? 'hourly') === 'hourly';
                const open = editing === t.id;

                const q = !isQuote && !isUnit && !isHourly ? fixedQuote({
                  labourPrice: eff.labour, partsPrice: eff.parts,
                  labourCommission: eff.labourCommission,
                }) : null;

                return (
                  <View key={t.id} style={[s.card, !on&&s.cardOff, open&&s.cardOpen]}>
                    <View style={s.cardTop}>
                      <Text style={s.cardIcon}>{t.icon}</Text>
                      <View style={{flex:1}}>
                        <Text style={[s.cardName, !on&&s.dim]}>{t.name}</Text>
                        <Text style={[s.cardDesc, !on&&s.dim]}>{t.description}</Text>

                        {on && (
                          <Text style={s.cardPrice}>
                            {(t as any).is_transport
                              ? (cheapestRoute(own?.route_prices) != null
                                  ? `${(own?.vehicles||[]).length} vehicle${(own?.vehicles||[]).length===1?'':'s'} · from €${cheapestRoute(own?.route_prices)}`
                                  : 'Set your vehicles and prices')
                              : isUnit ? (eff.unitPrice
                                  ? `€${eff.unitPrice}/${eff.unitLabel}`
                                    + (eff.minCharge ? ` · min €${eff.minCharge}` : '')
                                    + (eff.unitBinding ? ' · fixed' : ' · estimate')
                                  : `Set your price per ${eff.unitLabel}`)
                              : isHourly ? (eff.hourlyRate
                                  ? `€${eff.hourlyRate}/hr`
                                    + (eff.ownRate ? '' : ' · from your profile')
                                    + (eff.minHours ? ` · min ${eff.minHours}h` : '')
                                  : 'Set your hourly rate — clients cannot book this yet')
                              : isQuote ? (eff.priceMin && eff.priceMax
                                  ? `€${eff.priceMin} – €${eff.priceMax} · you quote after talking`
                                  : 'Set your range')
                              : `Service €${eff.labour}${eff.parts ? ` + parts €${eff.parts}` : ''} · ${fmtM(eff.minutes)}`}
                          </Text>
                        )}

                        {on && q && (
                          <Text style={s.cardClient}>
                            Client pays €{q.clientPays.toFixed(0)} · you keep €{q.providerGets.toFixed(0)}
                          </Text>
                        )}

                        {on && (own?.questions?.length ?? 0) > 0 && (
                          <Text style={s.cardOpts}>
                            {own!.questions!.length} question
                            {own!.questions!.length>1?'s':''} of your own
                          </Text>
                        )}

                        {on && !!own?.note && (
                          <Text style={s.cardNote}>{own.note}</Text>
                        )}
                      </View>

                      <Switch
                        value={on}
                        onValueChange={(v)=>toggleActive(t, v)}
                        trackColor={{ false:C.border, true:C.green }}
                        thumbColor={C.white}
                      />
                    </View>

                    {/* Hourly services had no edit button at all, which is why
                        one rate on the profile had to cover every trade. */}
                    {on && !open && (
                      <TouchableOpacity style={s.editBtn} onPress={()=>leaveEdit(t)}>
                        <Text style={[s.editTxt,
                          isHourly && !eff.hourlyRate && {color:C.red}]}>
                          {isHourly && !eff.hourlyRate
                            ? 'Set your rate ›'
                            : 'Change my price ›'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {open && (
                      <View style={s.form}>
                        {(t as any).is_transport ? (
                          <RoutePricing
                            vehicles={draft.vehicles || []}
                            prices={draft.route_prices || {}}
                            onChange={(v,p)=>setDraft((d:any)=>({ ...d, vehicles:v, route_prices:p }))}
                          />
                        ) : isUnit ? (
                          <>
                            <Text style={s.formHint}>
                              This work is sold by the {t.unit_label || 'm²'}. The client
                              enters the area before they even see you, so what they
                              compare is your total for their job, not your rate.
                            </Text>

                            <Text style={s.lbl}>Your price per {t.unit_label || 'm²'} (€)</Text>
                            <TextInput style={s.input} value={draft.unit_price}
                              onChangeText={(v)=>setDraft((d:any)=>({...d, unit_price:v.replace(/[^0-9.]/g,'')}))}
                              keyboardType="decimal-pad" placeholder="22"
                              placeholderTextColor={C.muted} />
                            <Text style={s.note}>Your labour only. Materials are separate.</Text>

                            <Text style={s.lbl}>Minimum charge (€)</Text>
                            <TextInput style={s.input} value={draft.min_charge}
                              onChangeText={(v)=>setDraft((d:any)=>({...d, min_charge:v.replace(/[^0-9.]/g,'')}))}
                              keyboardType="decimal-pad" placeholder="150"
                              placeholderTextColor={C.muted} />
                            <Text style={s.note}>
                              A four-square-metre bathroom at €22 is €88 — not worth
                              losing a day over. The minimum is what you'd accept to
                              turn up at all.
                            </Text>

                            <Text style={s.lbl}>Is that price a promise?</Text>
                            <View style={s.row2}>
                              {[
                                { k:true,  l:'Fixed price',
                                  d:'Client books instantly at your rate × their area' },
                                { k:false, l:'Estimate first',
                                  d:'They see the figure, you confirm after photos' },
                              ].map(o=>(
                                <TouchableOpacity key={String(o.k)}
                                  style={[s.bindCard, draft.unit_binding===o.k&&s.bindCardOn]}
                                  onPress={()=>setDraft((d:any)=>({...d, unit_binding:o.k}))}>
                                  <Text style={[s.bindLbl, draft.unit_binding===o.k&&s.bindLblOn]}>
                                    {o.l}
                                  </Text>
                                  <Text style={s.bindDesc}>{o.d}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            <Text style={s.note}>
                              Fixed wins more bookings because there's nothing left to
                              agree. Only choose it where the job really is the same
                              every time — if the floor underneath can surprise you,
                              take the estimate.
                            </Text>

                            {Number(draft.unit_price) > 0 && (() => {
                              const sample = unitLabour({
                                unitPrice: Number(draft.unit_price), quantity: 20,
                                minCharge: Number(draft.min_charge),
                              });
                              const p = fixedQuote({ labourPrice: sample.labour,
                                labourCommission: t.labour_commission });
                              return (
                                <View style={s.previewBox}>
                                  <View style={s.previewRow}>
                                    <Text style={s.previewLbl}>
                                      A 20 {t.unit_label || 'm²'} job — client pays
                                    </Text>
                                    <Text style={s.previewVal}>€{p.clientPays.toFixed(2)}</Text>
                                  </View>
                                  <View style={s.previewRow}>
                                    <Text style={s.previewLbl}>You keep</Text>
                                    <Text style={[s.previewVal,{color:C.green,fontWeight:'800'}]}>
                                      €{p.providerGets.toFixed(2)}
                                    </Text>
                                  </View>
                                  <Text style={s.previewNote}>20% on the work.</Text>
                                </View>
                              );
                            })()}
                          </>
                        ) : isQuote ? (
                          <>
                            <Text style={s.formHint}>
                              You can't price this blind, so give a range. The client
                              messages you first, then you send the real figure and
                              they accept before you go anywhere.
                            </Text>
                            <View style={s.row2}>
                              <View style={{flex:1}}>
                                <Text style={s.lbl}>From (€)</Text>
                                <TextInput style={s.input} value={draft.price_min}
                                  onChangeText={(v)=>setDraft((d:any)=>({...d, price_min:v.replace(/[^0-9.]/g,'')}))}
                                  keyboardType="decimal-pad" placeholder="60"
                                  placeholderTextColor={C.muted} />
                              </View>
                              <View style={{flex:1}}>
                                <Text style={s.lbl}>Up to (€)</Text>
                                <TextInput style={s.input} value={draft.price_max}
                                  onChangeText={(v)=>setDraft((d:any)=>({...d, price_max:v.replace(/[^0-9.]/g,'')}))}
                                  keyboardType="decimal-pad" placeholder="450"
                                  placeholderTextColor={C.muted} />
                              </View>
                            </View>
                          </>
                        ) : isHourly ? (
                          <>
                            <Text style={s.formHint}>
                              This work is charged by time. The rate is per service,
                              not per account — an hour cooking is not an hour
                              cleaning, and nobody should have to charge the same
                              for both.
                            </Text>

                            <Text style={s.lbl}>Your rate for this work (€/hour)</Text>
                            <TextInput style={s.input} value={draft.hourly_rate}
                              onChangeText={(v)=>setDraft((d:any)=>({...d, hourly_rate:v.replace(/[^0-9.]/g,'')}))}
                              keyboardType="decimal-pad"
                              placeholder={prof.hourlyRate ? String(prof.hourlyRate) : '15'}
                              placeholderTextColor={C.muted} />
                            <Text style={s.note}>
                              {prof.hourlyRate
                                ? `Leave it empty and we use the €${prof.hourlyRate}/hr from your profile.`
                                : 'There is no rate on your profile either, so this one is required — without it clients cannot book this service.'}
                            </Text>

                            <Text style={s.lbl}>Minimum hours for this job</Text>
                            <View style={s.pillWrap}>
                              {[1,1.5,2,2.5,3,4].map(h=>(
                                <TouchableOpacity key={h}
                                  style={[s.pill, Number(draft.min_hours)===h&&s.pillOn]}
                                  onPress={()=>setDraft((d:any)=>({...d,
                                    min_hours: Number(draft.min_hours)===h ? '' : String(h)}))}>
                                  <Text style={[s.pillTxt, Number(draft.min_hours)===h&&s.pillTxtOn]}>
                                    {h}h
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            <Text style={s.note}>
                              {prof.minHours
                                ? `Tap the same one again to clear it and fall back to the ${prof.minHours}h on your profile.`
                                : 'Nobody crosses the island for forty minutes of work. This is the shortest job you would take.'}
                            </Text>

                            {Number(draft.hourly_rate || prof.hourlyRate) > 0 && (() => {
                              const r = Number(draft.hourly_rate) || prof.hourlyRate;
                              const hrs = Number(draft.min_hours) || prof.minHours || 2;
                              /* mirrors poji_settle_hourly: nothing on top of the
                                 rate, card fee on the total, 20% off the labour */
                              const exVat  = +(r * hrs).toFixed(2);
                              const stripe = +(exVat * 0.029 + 0.30).toFixed(2);
                              return (
                                <View style={s.previewBox}>
                                  <View style={s.previewRow}>
                                    <Text style={s.previewLbl}>
                                      A {hrs}h job — client pays
                                    </Text>
                                    <Text style={s.previewVal}>€{(exVat + stripe).toFixed(2)}</Text>
                                  </View>
                                  <View style={s.previewRow}>
                                    <Text style={s.previewLbl}>You keep</Text>
                                    <Text style={[s.previewVal,{color:C.green,fontWeight:'800'}]}>
                                      €{(exVat * 0.80).toFixed(2)}
                                    </Text>
                                  </View>
                                  <Text style={s.previewNote}>
                                    20% on the work. Longer jobs bill the real time, to
                                    the nearest quarter hour.
                                  </Text>
                                </View>
                              );
                            })()}
                          </>
                        ) : (
                          <>
                            <Text style={s.lbl}>Your service charge (€)</Text>
                            <TextInput style={s.input} value={draft.labour_price}
                              onChangeText={(v)=>setDraft((d:any)=>({...d, labour_price:v.replace(/[^0-9.]/g,'')}))}
                              keyboardType="decimal-pad" placeholder="30"
                              placeholderTextColor={C.muted} />

                            <Text style={s.lbl}>Parts you supply (€)</Text>
                            <TextInput style={s.input} value={draft.parts_price}
                              onChangeText={(v)=>setDraft((d:any)=>({...d, parts_price:v.replace(/[^0-9.]/g,'')}))}
                              keyboardType="decimal-pad" placeholder="0"
                              placeholderTextColor={C.muted} />
                            <Text style={s.note}>Leave at 0 if the job needs no parts.</Text>

                            {Number(draft.parts_price) > 0 && (
                              <>
                                <Text style={s.lbl}>What the parts are</Text>
                                <TextInput style={s.input} value={draft.parts_label}
                                  onChangeText={(v)=>setDraft((d:any)=>({...d, parts_label:v}))}
                                  placeholder="e.g. 3 cartridges (Pentek)"
                                  placeholderTextColor={C.muted} />
                                <Text style={s.note}>
                                  Clients see this. Be specific — it's often why they
                                  pick one provider over another.
                                </Text>
                              </>
                            )}
                          </>
                        )}

                        {!(t as any).is_transport && (
                        <>
                        <Text style={s.lbl}>What you ask the client</Text>
                        <QuestionEditor
                          value={draft.questions || []}
                          onChange={(q)=>setDraft((d:any)=>({ ...d, questions: q }))}
                        />

                        </>
                        )}

                        {!(t as any).is_transport && (
                        <>
                        <Text style={s.lbl}>How long on site</Text>
                        <View style={s.pillWrap}>
                          {[20,30,45,60,90,120,180].map(m=>(
                            <TouchableOpacity key={m}
                              style={[s.pill, Number(draft.typical_minutes)===m&&s.pillOn]}
                              onPress={()=>setDraft((d:any)=>({...d, typical_minutes:String(m)}))}>
                              <Text style={[s.pillTxt, Number(draft.typical_minutes)===m&&s.pillTxtOn]}>
                                {fmtM(m)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        </>
                        )}

                        <Text style={s.lbl}>Note for clients (optional)</Text>
                        <TextInput style={[s.input,{minHeight:70}]} value={draft.note}
                          onChangeText={(v)=>setDraft((d:any)=>({...d, note:v}))}
                          placeholder="I use Aquafilter cartridges and test the TDS before I leave"
                          placeholderTextColor={C.muted} multiline textAlignVertical="top" />

                        {!isQuote && !isHourly && Number(draft.labour_price) > 0 && (() => {
                          const preview = fixedQuote({
                            labourPrice: Number(draft.labour_price),
                            partsPrice: Number(draft.parts_price) || 0,
                            labourCommission: t.labour_commission,
                          });
                          return (
                            <View style={s.previewBox}>
                              <View style={s.previewRow}>
                                <Text style={s.previewLbl}>Client pays</Text>
                                <Text style={s.previewVal}>€{preview.clientPays.toFixed(2)}</Text>
                              </View>
                              <View style={s.previewRow}>
                                <Text style={s.previewLbl}>You keep</Text>
                                <Text style={[s.previewVal,{color:C.green,fontWeight:'800'}]}>
                                  €{preview.providerGets.toFixed(2)}
                                </Text>
                              </View>
                              <Text style={s.previewNote}>
                                {Math.round((t.labour_commission ?? 0.20)*100)}% on the work,
                                5% on the parts.
                              </Text>
                            </View>
                          );
                        })()}

                        <View style={s.formBtns}>
                          <TouchableOpacity style={s.cancelBtn}
                            onPress={()=>leaveEdit()}>
                            <Text style={s.cancelTxt}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[s.saveBtn, saving&&s.dis]}
                            disabled={saving} onPress={()=>saveOne(t)}>
                            {saving ? <ActivityIndicator color={C.white} size="small"/>
                              : <Text style={s.saveTxt}>Save</Text>}
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        <View style={{height:120}}/>
      </ScrollView>

      {(confirmDiscard || (editing && (dirty || !!error)) || !!savedAt) && (
        <View style={s.sticky}>
          {!!error && editing && !confirmDiscard && (
            <Text style={s.stickyErr}>⚠️  {error}</Text>
          )}

          {confirmDiscard ? (
            <View style={s.stickyRow}>
              <Text style={[s.stickyTxt,{flex:1}]}>
                You changed this but haven't saved it.
              </Text>
              <TouchableOpacity style={s.keepBtn} onPress={()=>{
                leavingScreen.current = false; setConfirm(null);
              }}>
                <Text style={s.keepTxt}>Keep editing</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.discardBtn} onPress={discardNow}>
                <Text style={s.discardTxt}>Discard</Text>
              </TouchableOpacity>
            </View>
          ) : savedAt && !dirty ? (
            <Text style={s.stickySaved}>✓  Saved at {savedAt}</Text>
          ) : (
            <View style={s.stickyRow}>
              <Text style={[s.stickyTxt,{flex:1}]}>Unsaved changes</Text>
              <TouchableOpacity style={[s.stickySave, saving&&s.dis]} disabled={saving}
                onPress={()=>{
                  const t = types.find(x => x.id === editing);
                  if (t) saveOne(t);
                }}>
                {saving ? <ActivityIndicator color={C.white} size="small"/>
                  : <Text style={s.stickySaveTxt}>Save changes</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:C.bg},
  hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
    paddingHorizontal:20,paddingTop:60,paddingBottom:12},
  back:{fontSize:16,color:C.primary,fontWeight:'600',width:54},
  title:{fontSize:17,fontWeight:'700',color:C.dark},
  body:{flex:1,paddingHorizontal:20},
  intro:{fontSize:20,fontWeight:'800',color:C.dark,marginTop:8},
  hint:{fontSize:13,color:C.muted,lineHeight:19,marginTop:6,marginBottom:16},

  group:{marginBottom:22},
  groupTitle:{fontSize:13,fontWeight:'800',color:C.dark,marginBottom:10},

  card:{backgroundColor:C.white,borderRadius:16,padding:14,marginBottom:10,
    borderWidth:1.5,borderColor:C.border,...S.sm},
  cardOff:{backgroundColor:C.bgAlt,borderStyle:'dashed'},
  cardOpen:{borderColor:C.primary},
  cardTop:{flexDirection:'row',gap:12,alignItems:'flex-start'},
  cardIcon:{fontSize:24},
  cardName:{fontSize:15,fontWeight:'700',color:C.dark},
  cardDesc:{fontSize:12,color:C.muted,marginTop:3,lineHeight:17},
  cardPrice:{fontSize:12,fontWeight:'700',color:C.primary,marginTop:6},
  cardClient:{fontSize:11,color:C.muted,marginTop:3},
  cardNote:{fontSize:11,color:C.text,marginTop:5,fontStyle:'italic',lineHeight:16},
  cardOpts:{fontSize:11,color:C.green,fontWeight:'700',marginTop:4},
  dim:{opacity:0.5},
  editBtn:{marginTop:10,paddingTop:10,borderTopWidth:1,borderTopColor:C.bg},
  editTxt:{fontSize:12,color:C.primary,fontWeight:'700'},

  form:{marginTop:12,paddingTop:12,borderTopWidth:1,borderTopColor:C.bg},
  formHint:{fontSize:12,color:C.muted,lineHeight:18,marginBottom:4},
  lbl:{fontSize:11,fontWeight:'700',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.4,marginTop:14,marginBottom:7},
  note:{fontSize:11,color:C.muted,marginTop:6,lineHeight:16},
  input:{backgroundColor:C.bg,borderRadius:11,paddingHorizontal:13,paddingVertical:12,
    fontSize:14,color:C.text,borderWidth:1.5,borderColor:C.border},
  row2:{flexDirection:'row',gap:10},
  pillWrap:{flexDirection:'row',flexWrap:'wrap',gap:7},
  pill:{paddingHorizontal:12,paddingVertical:8,borderRadius:16,backgroundColor:C.bg,
    borderWidth:1.5,borderColor:C.border},
  pillOn:{backgroundColor:C.primary,borderColor:C.primary},
  pillTxt:{fontSize:12,fontWeight:'600',color:C.muted},
  pillTxtOn:{color:C.white},

  optBlock:{marginTop:6},
  optHint:{fontSize:11,color:C.muted,lineHeight:16,marginBottom:8,marginTop:-2},
  optRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
    gap:12,paddingVertical:7},
  optLabel:{flex:1,fontSize:13,color:C.text},
  optInputWrap:{flexDirection:'row',alignItems:'center',backgroundColor:C.white,
    borderRadius:10,borderWidth:1.5,borderColor:C.border,paddingLeft:10,width:104},
  optCurrency:{fontSize:13,color:C.muted,fontWeight:'700'},
  optInput:{flex:1,paddingVertical:9,paddingHorizontal:6,fontSize:14,color:C.text},
  bindCard:{flex:1,padding:12,borderRadius:12,borderWidth:1.5,borderColor:C.border,
    backgroundColor:C.bg},
  bindCardOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  bindLbl:{fontSize:13,fontWeight:'800',color:C.muted},
  bindLblOn:{color:C.primary},
  bindDesc:{fontSize:11,color:C.muted,marginTop:4,lineHeight:15},

  previewBox:{backgroundColor:C.greenLt,borderRadius:11,padding:12,gap:6,marginTop:14,
    borderWidth:1,borderColor:'#A7F3D0'},
  previewRow:{flexDirection:'row',justifyContent:'space-between'},
  previewLbl:{fontSize:12,color:C.text},
  previewVal:{fontSize:14,fontWeight:'700',color:C.dark},
  previewNote:{fontSize:11,color:C.muted},

  formBtns:{flexDirection:'row',gap:10,marginTop:16},
  cancelBtn:{flex:1,borderWidth:1.5,borderColor:C.border,borderRadius:11,
    paddingVertical:12,alignItems:'center',backgroundColor:C.bg},
  cancelTxt:{fontSize:13,fontWeight:'600',color:C.muted},
  saveBtn:{flex:1.4,backgroundColor:C.primary,borderRadius:11,paddingVertical:12,
    alignItems:'center'},
  saveTxt:{fontSize:13,fontWeight:'700',color:C.white},
  dis:{opacity:0.5},

  sticky:{position:'absolute',left:0,right:0,bottom:0,backgroundColor:C.white,
    borderTopWidth:1,borderTopColor:C.border,paddingHorizontal:20,paddingTop:12,
    paddingBottom:22,gap:10,...S.md},
  stickyRow:{flexDirection:'row',alignItems:'center',gap:10},
  stickyTxt:{fontSize:13,fontWeight:'700',color:C.amber},
  stickyErr:{fontSize:12,color:C.red,fontWeight:'600',lineHeight:17},
  stickySaved:{fontSize:13,fontWeight:'700',color:C.green,textAlign:'center'},
  stickySave:{backgroundColor:C.primary,borderRadius:11,paddingVertical:12,
    paddingHorizontal:20,alignItems:'center',minWidth:132},
  stickySaveTxt:{fontSize:13,fontWeight:'700',color:C.white},
  keepBtn:{borderWidth:1.5,borderColor:C.border,borderRadius:11,paddingVertical:11,
    paddingHorizontal:14,backgroundColor:C.white},
  keepTxt:{fontSize:12,fontWeight:'700',color:C.text},
  discardBtn:{borderWidth:1.5,borderColor:C.red,borderRadius:11,paddingVertical:11,
    paddingHorizontal:14,backgroundColor:C.white},
  discardTxt:{fontSize:12,fontWeight:'700',color:C.red},

  errBox:{backgroundColor:C.redLt,borderRadius:12,padding:13,marginBottom:14,
    borderWidth:1,borderColor:'#FECACA'},
  errTxt:{fontSize:13,color:C.red,fontWeight:'600'},

  emptyBox:{backgroundColor:C.white,borderRadius:18,padding:28,alignItems:'center',
    gap:8,borderWidth:1,borderColor:C.border},
  emptyIcon:{fontSize:40},
  emptyTitle:{fontSize:16,fontWeight:'800',color:C.dark},
  emptyTxt:{fontSize:13,color:C.muted,textAlign:'center',lineHeight:19},
  emptyBtn:{backgroundColor:C.primary,borderRadius:12,paddingVertical:12,
    paddingHorizontal:22,marginTop:4},
  emptyBtnTxt:{color:C.white,fontSize:14,fontWeight:'700'},
});
