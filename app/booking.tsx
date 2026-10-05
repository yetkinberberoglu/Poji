import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Modal
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { useApp } from '../context/AppContext';
import Avatar from '../components/Avatar';
import { canTakeJob } from '../lib/availability';
import ServiceQuestions from '../components/ServiceQuestions';
import { supabase } from '../lib/supabase';
import {
  loadServiceTypes, loadServiceExtras, loadPropertySizes, loadTasksFor,
  groupTasks, quote, fixedQuote, estimateHours,
  loadServicePrices, effectiveService, missingAnswers, answerAdjustments,
  type ServiceType, type ServiceExtra, type PropertySize, type ProviderService
} from '../lib/services';

const TIMES = [
  '07:00','08:00','09:00','10:00','11:00','12:00',
  '13:00','14:00','15:00','16:00','17:00','18:00',
];

const DAYS_AHEAD = 30;
const LEAD_HOURS = 2;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const buildDays = () => {
  const out: any[] = [];
  const today = new Date(); today.setHours(0,0,0,0);
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({
      value: iso(d),
      dayName: d.toLocaleDateString('en-GB', { weekday:'short' }),
      dayNum: d.getDate(),
      month: d.toLocaleDateString('en-GB', { month:'short' }),
      isToday: i === 0,
      isTomorrow: i === 1,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    });
  }
  return out;
};

const slotAvailable = (dateValue: string, time: string) => {
  const now = new Date();
  if (dateValue !== iso(now)) return true;
  const [h, m] = time.split(':').map(Number);
  const slot = new Date();
  slot.setHours(h, m, 0, 0);
  return slot.getTime() - now.getTime() >= LEAD_HOURS * 3600 * 1000;
};

const fmtH = (h:number) => h % 1 === 0 ? `${h}h` : `${Math.floor(h)}h 30m`;
const fmtM = (m:number) => m >= 60
  ? (m % 60 === 0 ? `${m/60}h` : `${Math.floor(m/60)}h ${m%60}m`)
  : `${m}m`;

export default function BookingScreen() {
  const { addBooking, cleaners } = useApp();
  const params = useLocalSearchParams<{cleanerId?: string; cleanerName?: string; trade?: string}>();

  const [step, setStep]    = useState(0);
  const [loading, setLoad] = useState(false);
  const [placed, setPlaced]= useState<any>(null);
  const [failed, setFailed]= useState('');

  const [types, setTypes]   = useState<ServiceType[]>([]);
  const [extras, setExtras] = useState<ServiceExtra[]>([]);
  const [sizes, setSizes]   = useState<PropertySize[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [prices, setPrices] = useState<Record<string, ProviderService>>({});
  const [hasTasks, setHasTasks] = useState<Record<string, boolean>>({});

  const [svc, setSvc]             = useState<string>('');
  const [chosenExtras, setChosen] = useState<string[]>([]);
  const [suppliesByCleaner, setSupplies] = useState(false);
  const [size, setSize]           = useState('1bed');
  const [address, setAddr]        = useState('');
  const [notes, setNotes]         = useState('');
  const [answers, setAnswers]     = useState<Record<string,string>>({});
  const [savedAddr, setSavedAddr] = useState<{line:string; locality:string}|null>(null);
  const [useSaved, setUseSaved]   = useState(true);
  const [loadingAddr, setLoadingAddr] = useState(true);
  const [num, setNum]   = useState(1);
  const [pickedCleaner, setPicked] = useState<string|null>(params.cleanerId || null);
  const [lockedToCleaner, setLocked] = useState<boolean>(!!params.cleanerId);
  const [days] = useState(buildDays);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [manualHours, setManualHours] = useState<number|null>(null);

  const [showTasks, setShowTasks]   = useState<string|null>(null);
  const [taskGroups, setTaskGroups] = useState<Record<string,string[]>>({});

  const svcType = types.find(t => t.id === svc);
  const sizeObj = sizes.find(z => z.id === size);

  /** Everything below branches on this. */
  const model = svcType?.pricing_model ?? 'hourly';
  const isFixed = model === 'fixed';
  const isQuote = model === 'quote';

  const STEPS = isQuote
    ? ['Service','Address','Provider','When','Confirm']
    : isFixed
    ? ['Service','Address','Provider','When','Confirm']
    : ['Service','Place','Extras','Provider','When','Confirm'];

  // which screen is which, by name rather than number
  const stepName = STEPS[step];

  const multiplier  = svcType?.multiplier ?? 1;
  const baseMinutes = svcType?.base_minutes ?? 120;
  const sizeFactor  = sizeObj?.factor ?? 1;
  const svcMinHours = svcType?.min_hours ?? 3;

  const showExtras = !isFixed && !isQuote;
  const selectedExtras = showExtras ? extras.filter(e => chosenExtras.includes(e.id)) : [];
  const extraMinutes   = selectedExtras.reduce((s,e)=>s+Number(e.extra_minutes),0);

  const teamSizeOf = (c: any) => {
    const n = Number(c?.teamSize);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };

  // team size only matters for hourly work
  const flat = !isQuote && !showExtras;

  /** Does this provider cover the trade the chosen service belongs to? */
  const offersService = (c: any) => {
    if (!svcType) return true;
    const own = prices[c.id];
    if (own) return own.active !== false;            // they've priced it
    const trade = svcType.trade_id;
    if (!trade) return true;
    return (c.categories || []).includes(trade);     // falls back to the trade
  };

  const allCapable = cleaners
    .filter(offersService)
    .filter(c => flat || isQuote || teamSizeOf(c) >= num);
  const capable = lockedToCleaner
    ? allCapable.filter(c => c.id === params.cleanerId)
    : allCapable;

  const lockedCleaner  = cleaners.find(c => c.id === params.cleanerId) || null;
  const lockedCapacity = lockedCleaner ? teamSizeOf(lockedCleaner) : 0;
  const cleaner = cleaners.find(c => c.id === pickedCleaner) || null;

  const cleanerMin = (cleaner as any)?.minHours ?? 2;
  const minHours   = Math.max(svcMinHours, cleanerMin);
  const est = estimateHours({ baseMinutes, sizeFactor, extraMinutes, minHours, numCleaners: num });
  const hours = manualHours ?? est.hours;

  const baseRate = cleaner?.rate ?? 0;

  // Two completely different sums
  const hourlyQuote = quote({ baseRate, hours, numCleaners: num, multiplier, suppliesByCleaner });
  const effFor = (providerId?: string|null) =>
    svcType ? effectiveService(svcType, providerId ? prices[providerId] : null) : null;

  const myEff = effFor(pickedCleaner);

  const adj = answerAdjustments(svcType?.questions as any, answers);

  const flatQuote = fixedQuote({
    labourPrice: (myEff?.labour ?? Number(svcType?.labour_price) ?? 0) + adj.labour,
    partsPrice:  (myEff?.parts  ?? Number(svcType?.parts_price)  ?? 0) + adj.parts,
    calloutFee:  Number(svcType?.callout_fee) || 0,
  });

  const total = isQuote ? 0 : isFixed ? flatQuote.clientPays : hourlyQuote.clientPays;

  /** What this provider would charge for this exact job */
  const quoteFor = (c: any) => {
    const eff = effFor(c.id);

    if (isQuote) {
      return {
        total: null as number|null,
        label: eff?.priceMin && eff?.priceMax
          ? `€${eff.priceMin}–${eff.priceMax}` : 'Quote first',
      };
    }

    if (isFixed) {
      const q = fixedQuote({
        labourPrice: (eff?.labour || 0) + adj.labour,
        partsPrice:  (eff?.parts  || 0) + adj.parts,
      });
      return { total: q.clientPays, label: fmtM(eff?.minutes || 60) };
    }
    const cMin = Math.max(svcMinHours, c.minHours ?? 2);
    const e = estimateHours({ baseMinutes, sizeFactor, extraMinutes, minHours: cMin, numCleaners: num });
    const q = quote({ baseRate: c.rate, hours: e.hours, numCleaners: num, multiplier, suppliesByCleaner });
    return { total: q.clientPays, label: fmtH(e.hours) };
  };

  useEffect(() => {
    (async () => {
      const chosen = cleaners.find(c => c.id === (params.cleanerId || ''));
      const theirTrades = (chosen as any)?.categories || [];
      const tradeFilter = params.trade
        ? { trade: params.trade }
        : theirTrades.length ? { trades: theirTrades } : {};

      const [t, e, z] = await Promise.all([
        loadServiceTypes(tradeFilter), loadServiceExtras(), loadPropertySizes(),
      ]);
      setTypes(t); setExtras(e); setSizes(z);
      if (t.length && !t.find(x => x.id === svc)) setSvc(t[0].id);

      // only offer "what's included" where there is actually a list
      const { data: taskRows } = await supabase
        .from('service_tasks').select('service_type_id')
        .in('service_type_id', t.map(x => x.id));
      const found: Record<string, boolean> = {};
      (taskRows || []).forEach((r:any) => { found[r.service_type_id] = true; });
      setHasTasks(found);

      setCatLoading(false);
    })();
  }, [params.cleanerId, params.trade, cleaners.length]);

  useEffect(() => {
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { setLoadingAddr(false); return; }
      const { data } = await supabase
        .from('client_profiles').select('default_address, default_locality')
        .eq('id', user.id).maybeSingle();
      if (data?.default_address) {
        setSavedAddr({ line: data.default_address, locality: data.default_locality || '' });
        setAddr(`${data.default_address}${data.default_locality ? ', ' + data.default_locality : ''}`);
        setUseSaved(true);
      } else setUseSaved(false);
      setLoadingAddr(false);
    })();
  }, []);

  useEffect(() => {
    if (!svc) { setPrices({}); return; }
    loadServicePrices(svc).then(setPrices);
  }, [svc]);

  useEffect(() => { setAnswers({}); }, [svc]);

  useEffect(() => { setManualHours(null); }, [svc, size, chosenExtras, num]);
  useEffect(() => { if (date && time && !slotAvailable(date, time)) setTime(''); }, [date]);
  useEffect(() => {
    if (pickedCleaner && !allCapable.find(c => c.id === pickedCleaner)) setPicked(null);
  }, [num, cleaners]);

  // switching service can change the shape of the flow — don't strand them
  useEffect(() => { if (step >= STEPS.length) setStep(STEPS.length - 1); }, [isFixed]);

  const openTasks = async (typeId: string) => {
    const tasks = await loadTasksFor(typeId);
    setTaskGroups(groupTasks(tasks));
    setShowTasks(typeId);
  };

  const toggleExtra = (id: string) =>
    setChosen(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  const confirm = async () => {
    if (!cleaner || !svcType) return;
    setLoad(true);
    setFailed('');
    try {
      await addBooking({
        cleanerId: cleaner.id,
        address: address || '12 Tower Road, Sliema',
        date: date || iso(new Date()),
        time: time || '10:00',
        hours: isFixed ? (myEff?.minutes || 60) / 60 : hours,
        numCleaners: (isFixed || isQuote) ? 1 : num,
        propertyType: (isFixed || isQuote) ? 'n/a' : size,
        serviceType: svc,
        total,
        status: 'pending',
      } as any, {
        multiplier: (isFixed || isQuote) ? 1 : multiplier,
        suppliesByCleaner: (isFixed || isQuote) ? false : suppliesByCleaner,
        hourlyRate: (isFixed || isQuote) ? 0 : baseRate,
        extraIds: showExtras ? chosenExtras : [],
        propertySize: (isFixed || isQuote) ? 'n/a' : size,
        estimatedMinutes: (isFixed || isQuote)
          ? (myEff?.minutes || 60)
          : est.totalMinutes,
        extrasForChecklist: selectedExtras,
        tradeId: svcType.trade_id || params.trade || null,
        pricingModel: isQuote ? 'quote' : isFixed ? 'fixed' : 'hourly',
        labourTotal: isFixed ? flatQuote.labourSide : null,
        partsTotal:  isFixed ? flatQuote.parts : 0,
        locationNote: notes.trim() || null,
        answers,
      });

      setPlaced({
        providerName: cleaner.name,
        service: svcType.name,
        icon: svcType.icon,
        date, time, address,
        total,
        isQuote,
      });
    } catch (e: any) {
      // Alert.alert does nothing on web, so say it on the page instead
      console.error('Booking failed:', e);
      setFailed(e?.message || e?.error_description || String(e) || 'Something went wrong');
    }
    finally { setLoad(false); }
  };

  const qs = (svcType?.questions || []) as any[];
  const unanswered = missingAnswers(qs, answers);

  const canContinue =
    stepName === 'Service'  ? !!svc :
    stepName === 'Place'    ? !!address && unanswered.length === 0 :
    stepName === 'Address'  ? !!address && unanswered.length === 0 :
    stepName === 'Provider' ? !!pickedCleaner :
    stepName === 'When'     ? !!date && !!time :
    true;

  const blockedMsg =
    stepName === 'Service'  ? 'Pick a service' :
    (stepName === 'Place' || stepName === 'Address')
      ? (!address ? 'Enter an address first' : 'Answer the questions above') :
    stepName === 'Provider' ? 'Pick a provider to continue' :
    stepName === 'When'     ? 'Pick a date and time' : '';

  /* ─────────── shared blocks ─────────── */

  const AddressBlock = (
    <>
      {loadingAddr ? (
        <View style={s.loadingBox}><ActivityIndicator color={C.primary}/></View>
      ) : (
        <>
          {savedAddr && (
            <TouchableOpacity style={[s.addrCard, useSaved&&s.addrCardOn]}
              onPress={()=>{ setUseSaved(true);
                setAddr(`${savedAddr.line}${savedAddr.locality?', '+savedAddr.locality:''}`); }}>
              <View style={[s.radio, useSaved&&s.radioOn]}>
                {useSaved && <View style={s.radioDot}/>}
              </View>
              <View style={{flex:1}}>
                <View style={s.addrHead}>
                  <Text style={s.addrLabel}>🏠  My home</Text>
                  <View style={s.defaultTag}><Text style={s.defaultTagTxt}>Default</Text></View>
                </View>
                <Text style={s.addrLine}>{savedAddr.line}</Text>
                {!!savedAddr.locality && <Text style={s.addrLocality}>{savedAddr.locality}</Text>}
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.addrCard, !useSaved&&s.addrCardOn]}
            onPress={()=>{ setUseSaved(false); if (savedAddr) setAddr(''); }}>
            <View style={[s.radio, !useSaved&&s.radioOn]}>
              {!useSaved && <View style={s.radioDot}/>}
            </View>
            <View style={{flex:1}}>
              <Text style={s.addrLabel}>📍  A different address</Text>
              <Text style={s.addrHint}>Office, holiday let, a friend's place…</Text>
            </View>
          </TouchableOpacity>
          {!useSaved && (
            <TextInput style={[s.input,{marginTop:10}]}
              placeholder="e.g. 12 Tower Road, Sliema" placeholderTextColor={C.muted}
              value={address} onChangeText={setAddr} autoFocus />
          )}
        </>
      )}
    </>
  );

  if (placed) {
    return (
      <ScrollView style={s.wrap} contentContainerStyle={{padding:24, paddingTop:70}}>
        <View style={s.doneTop}>
          <Text style={s.doneIcon}>{placed.isQuote ? '💬' : '✅'}</Text>
          <Text style={s.doneTitle}>
            {placed.isQuote ? 'Request sent' : 'Request sent'}
          </Text>
          <Text style={s.doneSub}>
            {placed.providerName.split(' ')[0]} has been notified on WhatsApp.
            {placed.isQuote
              ? " They'll message you to understand the job, then send a price."
              : " You'll hear back as soon as they accept — usually within the hour."}
          </Text>
        </View>

        <View style={s.doneCard}>
          {[
            ['Service', `${placed.icon || ''} ${placed.service}`],
            ['Provider', placed.providerName],
            ['Date', placed.date
              ? new Date(placed.date+'T00:00:00').toLocaleDateString('en-GB',
                  {weekday:'long', day:'numeric', month:'long'})
              : '—'],
            ['Time', placed.time || '—'],
            ['Address', placed.address || '—'],
          ].map(([l,v])=>(
            <View key={String(l)} style={s.doneRow}>
              <Text style={s.doneLbl}>{l}</Text>
              <Text style={s.doneVal}>{v}</Text>
            </View>
          ))}
          {!placed.isQuote && (
            <View style={s.doneTotalRow}>
              <Text style={s.doneTotalLbl}>
                {isFixed ? 'Agreed price' : 'Estimated'}
              </Text>
              <Text style={s.doneTotalVal}>€{Number(placed.total).toFixed(2)}</Text>
            </View>
          )}
        </View>

        <View style={s.payBox}>
          <Text style={s.payTitle}>💳  Nothing has been charged</Text>
          <Text style={s.payTxt}>
            Your card is only held, not debited. The money moves to your provider
            after the work is done and you approve it.
          </Text>
          <View style={s.paySteps}>
            {[
              ['Now',          'Card held. No money taken.'],
              ['They accept',  'You get a message and a PIN for the day.'],
              ['Work is done', 'You see what was done and approve it.'],
              ['Then',         'Payment is released. Six hours and it approves itself.'],
            ].map(([a,b])=>(
              <View key={a} style={s.payRow}>
                <Text style={s.payDot}>•</Text>
                <View style={{flex:1}}>
                  <Text style={s.payA}>{a}</Text>
                  <Text style={s.payB}>{b}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={s.cancelBox}>
          <Text style={s.cancelTitle}>Changed your mind?</Text>
          {[
            ['Before they accept',            'Free — cancel from your bookings'],
            ['More than 12 hours before',     'Free'],
            ['Less than 12 hours before',     'Up to one hour at their rate'],
            ['Nobody home when they arrive',  'The callout is chargeable'],
          ].map(([a,b])=>(
            <View key={a} style={s.cancelRow}>
              <Text style={s.cancelA}>{a}</Text>
              <Text style={s.cancelB}>{b}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={s.doneBtn}
          onPress={()=>router.replace('/(tabs)/bookings')}>
          <Text style={s.doneBtnTxt}>View my booking</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.doneGhost}
          onPress={()=>router.replace('/(tabs)/home')}>
          <Text style={s.doneGhostTxt}>Back to home</Text>
        </TouchableOpacity>

        <View style={{height:40}}/>
      </ScrollView>
    );
  }

  return (
    <View style={s.wrap}>
      <View style={s.hdr}>
        <TouchableOpacity onPress={()=>step>0?setStep(step-1):router.back()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Book a service</Text>
        <Text style={s.stepNum}>{step+1}/{STEPS.length}</Text>
      </View>

      <View style={s.progress}>
        {STEPS.map((x,i)=>(
          <View key={x} style={s.progressItem}>
            <View style={[s.dot, i<=step&&s.dotOn]}>
              <Text style={[s.dotTxt, i<=step&&s.dotTxtOn]}>{i<step?'✓':i+1}</Text>
            </View>
            <Text style={[s.dotLbl, i===step&&s.dotLblOn]}>{x}</Text>
          </View>
        ))}
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>

        {/* ══ SERVICE ══ */}
        {stepName === 'Service' && (
          <View style={s.step}>
            {catLoading ? (
              <View style={s.loadingBox}><ActivityIndicator color={C.primary}/></View>
            ) : (
              <>
                <Text style={s.stepIntro}>
                  What do you need{cleaner ? ` from ${cleaner.name.split(' ')[0]}` : ''}?
                </Text>

                {types.length === 0 && (
                  <View style={s.noSvcBox}>
                    <Text style={s.noSvcIcon}>🤔</Text>
                    <Text style={s.noSvcTitle}>No services listed yet</Text>
                    <Text style={s.noSvcTxt}>
                      This provider hasn't set up their service list. Try another
                      provider, or let us know and we'll chase them.
                    </Text>
                  </View>
                )}

                {types.map(t=>{
                  const on = svc===t.id;
                  const m = t.pricing_model ?? 'hourly';
                  const fixed  = m === 'fixed';
                  const byQuote= m === 'quote';
                  const q = fixed ? fixedQuote({
                    labourPrice: Number(t.labour_price) || 0,
                    partsPrice:  Number(t.parts_price)  || 0,
                    calloutFee:  Number(t.callout_fee)  || 0,
                  }) : null;
                  return (
                    <TouchableOpacity key={t.id} style={[s.svcCard, on&&s.svcCardOn]}
                      onPress={()=>setSvc(t.id)}>
                      <View style={s.svcTop}>
                        <Text style={s.svcIcon}>{t.icon}</Text>
                        <View style={{flex:1}}>
                          <Text style={s.svcName}>{t.name}</Text>
                          <Text style={s.svcDesc}>{t.description}</Text>

                          {fixed && q && (
                            <View style={s.svcBreak}>
                              <Text style={s.svcBreakRow}>
                                Service €{q.labour.toFixed(0)}
                                {q.parts > 0 ? `  ·  ${t.parts_label || 'Parts'} €${q.parts.toFixed(0)}` : ''}
                              </Text>
                              <Text style={s.svcBreakSub}>
                                Typical price — each provider sets their own
                              </Text>
                            </View>
                          )}

                          {byQuote && (
                            <View style={s.svcBreak}>
                              <Text style={s.svcBreakSub}>
                                {t.quote_prompt || 'Your provider quotes after you describe the job.'}
                              </Text>
                            </View>
                          )}
                        </View>

                        {fixed && q ? (
                          <View style={{alignItems:'flex-end'}}>
                            <Text style={[s.svcPrice, on&&{color:C.primary}]}>
                              €{q.clientPays.toFixed(0)}
                            </Text>
                            <Text style={s.svcPriceSub}>typical</Text>
                          </View>
                        ) : byQuote && t.price_min && t.price_max ? (
                          <View style={{alignItems:'flex-end'}}>
                            <Text style={[s.svcRange, on&&{color:C.primary}]}>
                              €{t.price_min}–{t.price_max}
                            </Text>
                            <Text style={s.svcPriceSub}>they quote</Text>
                          </View>
                        ) : (
                          <View style={[s.radio, on&&s.radioOn]}>
                            {on && <View style={s.radioDot}/>}
                          </View>
                        )}
                      </View>

                      {hasTasks[t.id] && (
                        <TouchableOpacity style={s.svcFoot} onPress={()=>openTasks(t.id)}>
                          <Text style={s.svcLink}>What's included? ›</Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })}

                {isQuote && (
                  <View style={s.fixedNote}>
                    <Text style={s.fixedNoteTxt}>
                      💬  You'll message your provider first. They send a price, you
                      accept or decline — nobody travels until you've agreed.
                    </Text>
                  </View>
                )}

                {isFixed && (
                  <View style={s.fixedNote}>
                    <Text style={s.fixedNoteTxt}>
                      🔒  These prices are fixed. If the job turns out to need parts
                      beyond what's listed, your provider quotes you separately before
                      doing anything.
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* ══ PLACE — hourly only ══ */}
        {stepName === 'Place' && (
          <View style={s.step}>
            <Text style={s.stepIntro}>Tell us about the place</Text>

            <Text style={s.lbl}>How big is it?</Text>
            <View style={s.sizeGrid}>
              {sizes.map(z=>(
                <TouchableOpacity key={z.id} style={[s.sizeCard, size===z.id&&s.sizeCardOn]}
                  onPress={()=>setSize(z.id)}>
                  <Text style={s.sizeIcon}>{z.icon}</Text>
                  <Text style={[s.sizeName, size===z.id&&s.sizeNameOn]}>{z.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.lbl}>Where should we come?</Text>
            {AddressBlock}

            {qs.length > 0 && (
              <>
                <Text style={s.lbl}>A few details</Text>
                <ServiceQuestions questions={qs} answers={answers}
                  onChange={(id,v)=>setAnswers(a=>({...a,[id]:v}))} />
              </>
            )}
          </View>
        )}

        {/* ══ ADDRESS — fixed-price jobs ══ */}
        {stepName === 'Address' && (
          <View style={s.step}>
            <Text style={s.stepIntro}>Where is it?</Text>
            <Text style={s.hint}>
              Your provider only sees this once they've accepted the job.
            </Text>
            {AddressBlock}

            {qs.length > 0 && (
              <>
                <ServiceQuestions questions={qs} answers={answers}
                  onChange={(id,v)=>setAnswers(a=>({...a,[id]:v}))} />

                {isFixed && adj.lines.length > 0 && (
                  <View style={s.runningBox}>
                    {adj.lines.map(x=>(
                      <View key={x.label} style={s.runningRow}>
                        <Text style={s.runningLbl}>{x.label}</Text>
                        <Text style={s.runningVal}>+€{x.amount.toFixed(2)}</Text>
                      </View>
                    ))}
                    <View style={s.runningTotal}>
                      <Text style={s.runningTotalLbl}>Running total</Text>
                      <Text style={s.runningTotalVal}>€{flatQuote.clientPays.toFixed(2)}</Text>
                    </View>
                  </View>
                )}
              </>
            )}

            <Text style={s.lbl}>Anything else they should know?</Text>
            <TextInput style={[s.input,{minHeight:90}]} value={notes} onChangeText={setNotes}
              placeholder={
                svcType?.trade_id === 'water'
                  ? 'e.g. under-sink unit, 3 stages, the tap drips'
                  : 'Make and model, where it is, how to get in'
              }
              placeholderTextColor={C.muted} multiline textAlignVertical="top" />
            <Text style={s.note}>
              Optional, but it helps them arrive with the right thing.
            </Text>
          </View>
        )}

        {/* ══ EXTRAS — hourly only ══ */}
        {stepName === 'Extras' && (
          <View style={s.step}>
            <Text style={s.stepIntro}>Anything extra?</Text>
            <Text style={s.hint}>
              Each one adds time to the job. Skip this step if you don't need any.
            </Text>

            {extras.map(e=>{
              const on = chosenExtras.includes(e.id);
              return (
                <TouchableOpacity key={e.id} style={[s.extraRow, on&&s.extraRowOn]}
                  onPress={()=>toggleExtra(e.id)}>
                  <View style={[s.check, on&&s.checkOn]}>
                    {on && <Text style={s.checkTxt}>✓</Text>}
                  </View>
                  <Text style={s.extraIcon}>{e.icon}</Text>
                  <View style={{flex:1}}>
                    <Text style={s.extraName}>{e.name}</Text>
                    <Text style={s.extraDesc}>{e.description}</Text>
                  </View>
                  <Text style={s.extraMins}>+{e.extra_minutes}m</Text>
                </TouchableOpacity>
              );
            })}

            <Text style={s.lbl}>Cleaning materials</Text>
            <View style={s.supplyRow}>
              {[{k:false,l:'I provide them',d:'Nothing added'},
                {k:true, l:'Provider brings them',d:'Small hourly surcharge'}].map(o=>(
                <TouchableOpacity key={String(o.k)}
                  style={[s.supplyCard, suppliesByCleaner===o.k&&s.supplyCardOn]}
                  onPress={()=>setSupplies(o.k)}>
                  <Text style={[s.supplyLbl, suppliesByCleaner===o.k&&s.supplyLblOn]}>{o.l}</Text>
                  <Text style={s.supplyDesc}>{o.d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ══ PROVIDER ══ */}
        {stepName === 'Provider' && (
          <View style={s.step}>
            {lockedToCleaner && lockedCleaner && (
              <View style={s.lockBanner}>
                <Text style={s.lockTxt}>
                  You're booking <Text style={{fontWeight:'800'}}>{lockedCleaner.name}</Text>
                  {!isFixed && (lockedCapacity > 1
                    ? ` — they can send up to ${lockedCapacity} people.`
                    : ' — they work solo.')}
                </Text>
                <TouchableOpacity onPress={()=>{ setLocked(false); setPicked(null); }}>
                  <Text style={s.lockLink}>Compare other providers ›</Text>
                </TouchableOpacity>
              </View>
            )}

            {!isFixed && (
              <>
                <Text style={s.stepIntro}>How many people?</Text>
                <View style={s.chips}>
                  {[1,2,3].map(n=>{
                    const pool = lockedToCleaner
                      ? (lockedCapacity >= n ? 1 : 0)
                      : cleaners.filter(c => teamSizeOf(c) >= n).length;
                    const off = pool === 0;
                    return (
                      <TouchableOpacity key={n}
                        style={[s.chip, num===n&&s.chipOn, off&&s.chipOff]}
                        disabled={off} onPress={()=>setNum(n)}>
                        <Text style={[s.chipTxt, num===n&&s.chipTxtOn, off&&s.chipTxtOff]}>
                          {n} {n===1?'person':'people'}
                        </Text>
                        {n>1 && !lockedToCleaner && pool>0 && (
                          <Text style={[s.chipSub, num===n&&s.chipTxtOn]}>{pool} available</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {num > 1 && (
                  <Text style={s.teamNote}>
                    👥 The work is shared, so the job finishes sooner.
                  </Text>
                )}
              </>
            )}

            <Text style={[s.lbl, isFixed && {marginTop:8}]}>
              {lockedToCleaner ? 'Your provider' : 'Choose your provider'}
            </Text>
            <Text style={s.hint}>
              {isQuote
                ? "Nobody can price this without seeing it. Pick someone, message them, and they'll send a figure before anyone travels."
                : isFixed
                ? 'Each provider sets their own price and supplies their own parts.'
                : `Only providers who can send ${num} ${num===1?'person':'people'} are shown. Each sets their own rate.`}
            </Text>

            {capable.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyIcon}>👥</Text>
                <Text style={s.emptyTxt}>
                  {lockedToCleaner
                    ? `${lockedCleaner?.name || 'This provider'} can't cover this`
                    : 'Nobody available'}
                </Text>
                <Text style={s.emptySub}>Try a different option for this job.</Text>
                {lockedToCleaner && (
                  <TouchableOpacity style={s.emptyBtn}
                    onPress={()=>{ setLocked(false); setPicked(null); }}>
                    <Text style={s.emptyBtnTxt}>Compare other providers</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : capable.map(c=>{
              const on = pickedCleaner === c.id;
              const q  = quoteFor(c as any);
              const free = (!date || !time) ? { ok:true } : canTakeJob({
                availability: (c as any).availability,
                notice_hours: (c as any).noticeHours,
                timeOff: (c as any).timeOff,
              }, date, time);
              return (
                <TouchableOpacity key={c.id}
                  style={[s.clCard, on&&s.clCardOn, !free.ok&&s.clCardOff]}
                  disabled={!free.ok}
                  onPress={()=>setPicked(c.id)}>
                  <Avatar photoUrl={(c as any).photoUrl} initials={c.initials} color={c.color} size={50} />
                  <View style={{flex:1}}>
                    <View style={s.clNameRow}>
                      <Text style={s.clName}>{c.name}</Text>
                      {c.verified && <View style={s.verBadge}><Text style={s.verTxt}>✓</Text></View>}
                      {(c as any).insured && <Text style={s.insDot}>🛡</Text>}
                    </View>
                    <Text style={s.clMeta}>
                      ⭐ {c.rating}
                      {isFixed ? '' : ` · €${c.rate}/hr`}
                      {' · '}{teamSizeOf(c)===1 ? 'solo' : `team of ${teamSizeOf(c)}`}
                    </Text>
                    <Text style={s.clAreas}>{c.areas.slice(0,3).join(' · ')}</Text>
                    {!free.ok && (
                      <Text style={s.clBusy}>
                        {(free as any).reason === 'away' ? 'Away on that date'
                          : (free as any).reason === 'short_notice' ? 'Needs more notice'
                          : "Doesn't work that slot"}
                      </Text>
                    )}
                  </View>
                  <View style={{alignItems:'flex-end'}}>
                    {q.total != null ? (
                      <>
                        <Text style={[s.clTotal, on&&{color:C.primary}]}>€{q.total.toFixed(0)}</Text>
                        <Text style={s.clHours}>{q.label}</Text>
                      </>
                    ) : (
                      <>
                        <Text style={[s.clRange, on&&{color:C.primary}]}>{q.label}</Text>
                        <Text style={s.clHours}>they quote</Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ══ WHEN ══ */}
        {stepName === 'When' && (
          <View style={s.step}>
            <Text style={s.stepIntro}>When should we come?</Text>

            {isFixed ? (
              <View style={s.estBox}>
                <Text style={s.estTitle}>
                  ⏱  About {fmtM(Number(svcType?.typical_minutes) || 60)} on site
                </Text>
                <Text style={s.estNote}>
                  Fixed price — the clock doesn't change what you pay.
                </Text>
              </View>
            ) : (
              <View style={s.estBox}>
                <Text style={s.estTitle}>⏱  We estimate {fmtH(hours)}</Text>
                <View style={s.estRows}>
                  <View style={s.estRow}>
                    <Text style={s.estLbl}>{svcType?.name} · {sizeObj?.name}</Text>
                    <Text style={s.estVal}>{Math.round(baseMinutes*sizeFactor)}m</Text>
                  </View>
                  {selectedExtras.map(e=>(
                    <View key={e.id} style={s.estRow}>
                      <Text style={s.estLbl}>{e.icon}  {e.name}</Text>
                      <Text style={s.estVal}>+{e.extra_minutes}m</Text>
                    </View>
                  ))}
                  {num > 1 && (
                    <View style={s.estRow}>
                      <Text style={s.estLbl}>Split across {num} people</Text>
                      <Text style={s.estVal}>÷{num}</Text>
                    </View>
                  )}
                </View>
                {est.wasRaised && (
                  <Text style={s.estNote}>Raised to the {minHours}h minimum for this service.</Text>
                )}
                <TouchableOpacity onPress={()=>setManualHours(manualHours===null ? est.hours : null)}>
                  <Text style={s.adjustTxt}>
                    {manualHours===null ? 'Adjust the hours myself' : 'Use our estimate'}
                  </Text>
                </TouchableOpacity>
                {manualHours !== null && (
                  <View style={s.chips}>
                    {[2,2.5,3,3.5,4,5,6,7,8].filter(h=>h>=minHours).map(h=>(
                      <TouchableOpacity key={h} style={[s.chip, hours===h&&s.chipOn]}
                        onPress={()=>setManualHours(h)}>
                        <Text style={[s.chipTxt, hours===h&&s.chipTxtOn]}>{fmtH(h)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            <Text style={s.lbl}>Pick a day</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.dayStrip}>
              {days.map(d=>{
                const on = date === d.value;
                const anySlot = TIMES.some(t => slotAvailable(d.value, t));
                return (
                  <TouchableOpacity key={d.value}
                    style={[s.dayCard, on&&s.dayCardOn, !anySlot&&s.dayCardOff]}
                    disabled={!anySlot}
                    onPress={()=>setDate(d.value)}>
                    <Text style={[s.dayName, on&&s.dayOnTxt, !anySlot&&s.dayOffTxt]}>
                      {d.isToday ? 'Today' : d.isTomorrow ? 'Tmrw' : d.dayName}
                    </Text>
                    <Text style={[s.dayNum, on&&s.dayOnTxt, !anySlot&&s.dayOffTxt]}>{d.dayNum}</Text>
                    <Text style={[s.dayMonth, on&&s.dayOnTxt, !anySlot&&s.dayOffTxt]}>{d.month}</Text>
                    {d.isWeekend && <View style={[s.weekendDot, on&&{backgroundColor:C.white}]} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {date ? (
              <>
                <Text style={s.lbl}>Start time</Text>
                <View style={s.chips}>
                  {TIMES.map(ti=>{
                    const ok = slotAvailable(date, ti);
                    return (
                      <TouchableOpacity key={ti}
                        style={[s.chip, time===ti&&s.chipOn, !ok&&s.chipOff]}
                        disabled={!ok} onPress={()=>setTime(ti)}>
                        <Text style={[s.chipTxt, time===ti&&s.chipTxtOn, !ok&&s.chipTxtOff]}>{ti}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {date === iso(new Date()) && (
                  <Text style={s.leadNote}>
                    Same-day bookings need at least {LEAD_HOURS} hours' notice.
                  </Text>
                )}
              </>
            ) : (
              <View style={s.pickDayBox}>
                <Text style={s.pickDayTxt}>Choose a day above to see available times.</Text>
              </View>
            )}
          </View>
        )}

        {/* ══ CONFIRM ══ */}
        {stepName === 'Confirm' && cleaner && svcType && (
          <View style={s.step}>
            <Text style={s.confirmTitle}>Booking Summary</Text>

            <View style={s.cleanerCard}>
              <Avatar photoUrl={(cleaner as any).photoUrl} initials={cleaner.initials}
                color={cleaner.color} size={52} />
              <View style={{flex:1}}>
                <Text style={s.cleanerName}>{cleaner.name}</Text>
                <Text style={s.cleanerSub}>
                  {isFixed ? 'Fixed price' : `€${baseRate}/hr base`} · {cleaner.areas?.[0]||'Malta'}
                </Text>
              </View>
            </View>

            <View style={s.summCard}>
              {[
                ['Service',  `${svcType.icon || ''} ${svcType.name || ''}`],
                ...(isFixed ? [] : [['Property', `${sizeObj?.icon || ''} ${sizeObj?.name || ''}`]]),
                ['Address',  address || '—'],
                ['Date',     date ? new Date(date+'T00:00:00').toLocaleDateString('en-GB',
                               {weekday:'long', day:'numeric', month:'long'}) : '—'],
                ['Time',     time || '—'],
                ['On site',  isFixed
                               ? `about ${fmtM(Number(svcType.typical_minutes) || 60)}`
                               : `${fmtH(hours)} × ${num} ${num===1?'person':'people'}`],
                ...(isFixed ? [] : [['Materials', suppliesByCleaner ? 'Provider brings them' : 'Client provides']]),
                ...qs.filter((q:any)=>answers[q.id]).map((q:any)=>[q.label, answers[q.id]]),
                ...(notes ? [['Your note', notes]] : []),
              ].map(([l,v])=>(
                <View key={String(l)} style={s.summRow}>
                  <Text style={s.summLbl}>{l}</Text>
                  <Text style={s.summVal}>{v}</Text>
                </View>
              ))}
            </View>

            {!isFixed && selectedExtras.length > 0 && (
              <View style={s.summCard}>
                <Text style={s.summHead}>Extras included</Text>
                {selectedExtras.map(e=>(
                  <View key={e.id} style={s.summRow}>
                    <Text style={s.summLbl}>{e.icon}  {e.name}</Text>
                    <Text style={s.summVal}>+{e.extra_minutes}m</Text>
                  </View>
                ))}
              </View>
            )}

            {isQuote ? (
              <View style={s.quoteCard}>
                <Text style={s.quoteTitle}>💬  Price comes next</Text>
                <Text style={s.quoteTxt}>
                  {cleaner.name.split(' ')[0]} will message you to understand the job,
                  then send a price. You accept or decline before anyone travels —
                  there's no charge either way.
                </Text>
                {myEff?.priceMin && myEff?.priceMax && (
                  <Text style={s.quoteRange}>
                    They usually charge between €{myEff.priceMin} and €{myEff.priceMax}.
                  </Text>
                )}
              </View>
            ) : (
            <View style={s.priceCard}>
              <Text style={s.priceTitle}>Price breakdown</Text>

              {isFixed ? (
                <>
                  {[
                    ['Service charge', `€${(flatQuote.labour - adj.labour).toFixed(2)}`],
                    ...adj.lines.filter(x=>x.kind==='labour')
                      .map(x=>[x.label, `€${x.amount.toFixed(2)}`]),
                    ...(flatQuote.callout > 0 ? [['Callout', `€${flatQuote.callout.toFixed(2)}`]] : []),
                    ...(flatQuote.parts - adj.parts > 0
                      ? [[svcType.parts_label || 'Parts', `€${(flatQuote.parts - adj.parts).toFixed(2)}`]] : []),
                    ...adj.lines.filter(x=>x.kind==='parts')
                      .map(x=>[x.label, `€${x.amount.toFixed(2)}`]),
                    ['VAT 18%',   `€${flatQuote.vat.toFixed(2)}`],
                    ['Card fee',  `€${flatQuote.stripeFee.toFixed(2)}`],
                  ].map(([l,v])=>(
                    <View key={String(l)} style={s.priceRow}>
                      <Text style={s.priceLbl}>{l}</Text>
                      <Text style={s.priceVal}>{v}</Text>
                    </View>
                  ))}
                  <View style={s.totalRow}>
                    <Text style={s.totalLbl}>Total</Text>
                    <Text style={s.totalVal}>€{flatQuote.clientPays.toFixed(2)}</Text>
                  </View>
                </>
              ) : (
                <>
                  {[
                    ['Base rate', `€${baseRate.toFixed(2)}/hr`],
                    [`${svcType.name} rate  ×${multiplier}`, `€${(baseRate*multiplier).toFixed(2)}/hr`],
                    ...(suppliesByCleaner ? [['Materials surcharge', '+€2.00/hr']] : []),
                    [`${fmtH(hours)} × ${num}`, `€${hourlyQuote.exVat.toFixed(2)}`],
                    ['VAT 18% (agency)', `€${hourlyQuote.vat.toFixed(2)}`],
                    ['Card fee', `€${hourlyQuote.stripeFee.toFixed(2)}`],
                  ].map(([l,v])=>(
                    <View key={String(l)} style={s.priceRow}>
                      <Text style={s.priceLbl}>{l}</Text>
                      <Text style={s.priceVal}>{v}</Text>
                    </View>
                  ))}
                  <View style={s.totalRow}>
                    <Text style={s.totalLbl}>Estimated total</Text>
                    <Text style={s.totalVal}>€{hourlyQuote.clientPays.toFixed(2)}</Text>
                  </View>
                </>
              )}
            </View>
            )}

            {hasTasks[svc] && (
              <TouchableOpacity style={s.scopeBtn} onPress={()=>openTasks(svc)}>
                <Text style={s.scopeBtnTxt}>📋  See the full task list</Text>
              </TouchableOpacity>
            )}

            {failed ? (
              <View style={s.failBox}>
                <Text style={s.failTitle}>⚠️  Couldn't send that</Text>
                <Text style={s.failTxt}>{failed}</Text>
              </View>
            ) : null}

            <View style={s.holdBox}>
              <Text style={s.holdTitle}>💳  Your card is held, not charged</Text>
              <Text style={s.holdTxt}>
                Money only moves after the work is done and you approve it. If nobody
                accepts, the hold is released.
              </Text>
            </View>

            <View style={s.finalBox}>
              <Text style={s.finalTitle}>
                {isQuote ? '💬  Nothing is agreed yet'
                  : isFixed ? '🔒  This price is fixed'
                  : '💡  How the final price is set'}
              </Text>
              {isQuote ? (
                <>
                  <Text style={s.finalTxt}>
                    Sending this opens a conversation. Describe the job, answer their
                    questions, and they'll quote you.
                  </Text>
                  <Text style={s.finalTxt}>
                    You're free to decline. The job is cancelled and nothing is charged.
                  </Text>
                </>
              ) : isFixed ? (
                <>
                  <Text style={s.finalTxt}>
                    No timer, no hourly rate. If the job needs parts beyond what's
                    listed, your provider quotes you separately and you decide before
                    they carry on.
                  </Text>
                  <Text style={s.finalTxt}>
                    Nothing is charged until the work is done and you confirm it.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={s.finalTxt}>
                    This is an estimate based on {fmtH(hours)}. Your provider starts the
                    timer with your PIN and stops it when the work is done.
                  </Text>
                  <Text style={s.finalTxt}>
                    You pay for the time actually worked — less if it finishes early.
                  </Text>
                </>
              )}
            </View>
          </View>
        )}

        <View style={{height:24}} />
      </ScrollView>

      <View style={s.footer}>
        <View style={{flex:1}}>
          {isQuote ? (
            <>
              <Text style={s.footerLbl}>Price</Text>
              <Text style={s.footerQuote}>After you talk</Text>
            </>
          ) : (stepName === 'Provider' || stepName === 'When' || stepName === 'Confirm') && cleaner ? (
            <>
              <Text style={s.footerLbl}>
                {isFixed ? 'Fixed price' : `${fmtH(hours)} · Estimated`}
              </Text>
              <Text style={s.footerVal}>€{total.toFixed(2)}</Text>
            </>
          ) : isFixed && svcType ? (
            <>
              <Text style={s.footerLbl}>Fixed price</Text>
              <Text style={s.footerVal}>€{flatQuote.clientPays.toFixed(2)}</Text>
            </>
          ) : (
            <Text style={s.footerStep}>{stepName}</Text>
          )}
        </View>
        <TouchableOpacity
          style={[s.nextBtn, (!canContinue||loading)&&s.nextBtnDis]}
          onPress={()=>step<STEPS.length-1?setStep(step+1):confirm()}
          disabled={!canContinue||loading}
        >
          {loading ? <ActivityIndicator color={C.white}/> :
            <Text style={s.nextBtnTxt}>
              {!canContinue ? blockedMsg
                : stepName === 'Extras' && chosenExtras.length===0 ? 'Skip  →'
                : step<STEPS.length-1 ? 'Continue  →'
                : isQuote ? '💬  Send request' : '✓  Confirm booking'}
            </Text>}
        </TouchableOpacity>
      </View>

      <Modal visible={!!showTasks} animationType="slide" transparent
        onRequestClose={()=>setShowTasks(null)}>
        <View style={s.modalWrap}>
          <View style={s.modalCard}>
            <View style={s.modalHdr}>
              <Text style={s.modalTitle}>
                {types.find(t=>t.id===showTasks)?.icon} {types.find(t=>t.id===showTasks)?.name}
              </Text>
              <TouchableOpacity onPress={()=>setShowTasks(null)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalBody}>
              <Text style={s.modalIntro}>
                Your provider ticks each of these off when the job is done. You see the
                completed list before approving.
              </Text>
              {Object.entries(taskGroups).map(([area, tasks])=>(
                <View key={area} style={s.taskGroup}>
                  <Text style={s.taskArea}>{area}</Text>
                  {tasks.map(t=>(
                    <View key={t} style={s.taskRow}>
                      <Text style={s.taskBullet}>✓</Text>
                      <Text style={s.taskTxt}>{t}</Text>
                    </View>
                  ))}
                </View>
              ))}
              <View style={{height:20}}/>
            </ScrollView>
            <TouchableOpacity style={s.modalBtn} onPress={()=>setShowTasks(null)}>
              <Text style={s.modalBtnTxt}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:60,paddingBottom:12},
  back:{fontSize:16,color:C.primary,fontWeight:'600'},
  title:{fontSize:17,fontWeight:'700',color:C.dark},
  stepNum:{fontSize:13,color:C.muted},
  progress:{flexDirection:'row',paddingHorizontal:10,marginBottom:14},
  progressItem:{flex:1,alignItems:'center',gap:4},
  dot:{width:26,height:26,borderRadius:13,backgroundColor:C.bgAlt,borderWidth:2,borderColor:C.border,alignItems:'center',justifyContent:'center'},
  dotOn:{backgroundColor:C.primary,borderColor:C.primary},
  dotTxt:{fontSize:10,fontWeight:'700',color:C.muted},
  dotTxtOn:{color:C.white},
  dotLbl:{fontSize:9,color:C.muted,fontWeight:'600'},
  dotLblOn:{color:C.primary},
  body:{flex:1,paddingHorizontal:20},
  step:{paddingBottom:16},
  stepIntro:{fontSize:22,fontWeight:'800',color:C.dark,marginTop:8,marginBottom:6},
  loadingBox:{paddingVertical:30,alignItems:'center'},
  lbl:{fontSize:12,fontWeight:'700',color:C.muted,textTransform:'uppercase',letterSpacing:0.5,marginTop:24,marginBottom:8},
  hint:{fontSize:13,color:C.muted,marginBottom:12,lineHeight:18},
  note:{fontSize:12,color:C.muted,marginTop:8,lineHeight:17},
  input:{backgroundColor:C.white,borderRadius:14,paddingHorizontal:16,paddingVertical:14,fontSize:15,color:C.text,borderWidth:1.5,borderColor:C.border},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
  chip:{paddingHorizontal:16,paddingVertical:11,borderRadius:12,backgroundColor:C.white,borderWidth:1.5,borderColor:C.border,alignItems:'center'},
  chipOn:{backgroundColor:C.primary,borderColor:C.primary},
  chipTxt:{fontSize:13,fontWeight:'600',color:C.muted},
  chipTxtOn:{color:C.white},
  chipOff:{backgroundColor:C.bg,borderColor:C.border,opacity:0.4},
  chipTxtOff:{color:C.muted},
  chipSub:{fontSize:10,color:C.muted,marginTop:2},
  teamNote:{fontSize:12,color:C.accent,fontWeight:'700',marginTop:10,lineHeight:17},

  svcCard:{padding:14,borderRadius:16,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginBottom:10},
  svcCardOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  svcTop:{flexDirection:'row',gap:12,alignItems:'flex-start'},
  svcIcon:{fontSize:26},
  svcName:{fontSize:15,fontWeight:'700',color:C.dark},
  svcDesc:{fontSize:12,color:C.muted,marginTop:3,lineHeight:17},
  svcBreak:{marginTop:7},
  svcBreakRow:{fontSize:12,color:C.text,fontWeight:'600'},
  svcBreakSub:{fontSize:11,color:C.muted,marginTop:2},
  svcPrice:{fontSize:20,fontWeight:'800',color:C.dark},
  svcRange:{fontSize:15,fontWeight:'800',color:C.dark},
  svcPriceSub:{fontSize:10,color:C.muted},
  svcFoot:{marginTop:10,paddingTop:10,borderTopWidth:1,borderTopColor:C.bg},
  svcLink:{fontSize:12,color:C.primary,fontWeight:'700'},
  fixedNote:{backgroundColor:C.amberLt,borderRadius:14,padding:14,marginTop:6,borderWidth:1,borderColor:'#FDE68A'},
  fixedNoteTxt:{fontSize:12,color:C.text,lineHeight:18},
  noSvcBox:{backgroundColor:C.white,borderRadius:16,padding:26,alignItems:'center',gap:8,borderWidth:1,borderColor:C.border},
  noSvcIcon:{fontSize:38},
  noSvcTitle:{fontSize:16,fontWeight:'800',color:C.dark},
  noSvcTxt:{fontSize:13,color:C.muted,textAlign:'center',lineHeight:19},

  supplyRow:{flexDirection:'row',gap:10},
  supplyCard:{flex:1,padding:14,borderRadius:14,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white},
  supplyCardOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  supplyLbl:{fontSize:13,fontWeight:'700',color:C.muted},
  supplyLblOn:{color:C.primary},
  supplyDesc:{fontSize:11,color:C.muted,marginTop:3},

  extraRow:{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderRadius:14,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginBottom:8},
  extraRowOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  check:{width:22,height:22,borderRadius:7,borderWidth:2,borderColor:C.border,alignItems:'center',justifyContent:'center'},
  checkOn:{backgroundColor:C.primary,borderColor:C.primary},
  checkTxt:{color:C.white,fontSize:13,fontWeight:'800'},
  extraIcon:{fontSize:20},
  extraName:{fontSize:14,fontWeight:'700',color:C.dark},
  extraDesc:{fontSize:11,color:C.muted,marginTop:2},
  extraMins:{fontSize:13,fontWeight:'800',color:C.primary},

  sizeGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},
  sizeCard:{flexBasis:'31%',flexGrow:1,alignItems:'center',paddingVertical:14,borderRadius:14,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,gap:4},
  sizeCardOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  sizeIcon:{fontSize:22},
  sizeName:{fontSize:12,fontWeight:'700',color:C.muted},
  sizeNameOn:{color:C.primary},

  addrCard:{flexDirection:'row',alignItems:'flex-start',gap:12,padding:14,borderRadius:14,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginBottom:10},
  addrCardOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  radio:{width:22,height:22,borderRadius:11,borderWidth:2,borderColor:C.border,alignItems:'center',justifyContent:'center',marginTop:2},
  radioOn:{borderColor:C.primary},
  radioDot:{width:10,height:10,borderRadius:5,backgroundColor:C.primary},
  addrHead:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:3},
  addrLabel:{fontSize:14,fontWeight:'700',color:C.dark},
  defaultTag:{backgroundColor:C.greenLt,paddingHorizontal:8,paddingVertical:2,borderRadius:10},
  defaultTagTxt:{fontSize:10,fontWeight:'700',color:C.green},
  addrLine:{fontSize:13,color:C.text,lineHeight:19},
  addrLocality:{fontSize:12,color:C.muted,marginTop:1},
  addrHint:{fontSize:12,color:C.muted,marginTop:3},

  lockBanner:{backgroundColor:C.primaryLt,borderRadius:14,padding:14,gap:8,marginTop:8,marginBottom:4,borderWidth:1,borderColor:C.border},
  lockTxt:{fontSize:13,color:C.text,lineHeight:19},
  lockLink:{fontSize:12,color:C.primary,fontWeight:'700'},

  clCard:{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:16,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginBottom:10,...S.sm},
  clCardOn:{borderColor:C.primary,backgroundColor:C.primaryLt,borderWidth:2},
  clCardOff:{opacity:0.42},
  clBusy:{fontSize:11,color:C.amber,fontWeight:'700',marginTop:3},
  clNameRow:{flexDirection:'row',alignItems:'center',gap:8},
  clName:{fontSize:15,fontWeight:'700',color:C.dark},
  verBadge:{backgroundColor:C.greenLt,width:19,height:19,borderRadius:10,alignItems:'center',justifyContent:'center'},
  verTxt:{fontSize:10,color:C.green,fontWeight:'700'},
  insDot:{fontSize:12},
  clMeta:{fontSize:12,color:C.muted,marginTop:3},
  clAreas:{fontSize:11,color:C.muted,marginTop:2},
  clTotal:{fontSize:20,fontWeight:'800',color:C.dark},
  clRange:{fontSize:15,fontWeight:'800',color:C.dark},
  clHours:{fontSize:11,color:C.muted,marginTop:1},

  emptyBox:{backgroundColor:C.white,borderRadius:16,padding:28,alignItems:'center',borderWidth:1,borderColor:C.border,gap:6},
  emptyIcon:{fontSize:38},
  emptyTxt:{fontSize:15,fontWeight:'700',color:C.dark},
  emptySub:{fontSize:13,color:C.muted,textAlign:'center'},
  emptyBtn:{marginTop:10,backgroundColor:C.primary,borderRadius:12,paddingVertical:11,paddingHorizontal:20},
  emptyBtnTxt:{color:C.white,fontSize:13,fontWeight:'700'},

  estBox:{backgroundColor:C.primaryLt,borderRadius:16,padding:16,marginTop:8,borderWidth:1,borderColor:C.border,gap:10},
  estTitle:{fontSize:17,fontWeight:'800',color:C.primary},
  estRows:{gap:5},
  estRow:{flexDirection:'row',justifyContent:'space-between',gap:10},
  estLbl:{fontSize:12,color:C.text,flex:1},
  estVal:{fontSize:12,color:C.text,fontWeight:'700'},
  estNote:{fontSize:11,color:C.amber,fontWeight:'700'},
  adjustTxt:{fontSize:12,color:C.primary,fontWeight:'700',textDecorationLine:'underline'},

  dayStrip:{gap:8,paddingVertical:4,paddingRight:20},
  dayCard:{width:62,paddingVertical:12,borderRadius:14,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,alignItems:'center',gap:2},
  dayCardOn:{backgroundColor:C.primary,borderColor:C.primary},
  dayCardOff:{opacity:0.35},
  dayName:{fontSize:11,fontWeight:'700',color:C.muted},
  dayNum:{fontSize:20,fontWeight:'800',color:C.dark},
  dayMonth:{fontSize:10,color:C.muted,fontWeight:'600'},
  dayOnTxt:{color:C.white},
  dayOffTxt:{color:C.muted},
  weekendDot:{width:4,height:4,borderRadius:2,backgroundColor:C.amber,marginTop:2},
  pickDayBox:{backgroundColor:C.bgAlt,borderRadius:12,padding:16,marginTop:20,borderWidth:1,borderColor:C.border},
  pickDayTxt:{fontSize:13,color:C.muted,textAlign:'center'},
  leadNote:{fontSize:11,color:C.amber,fontWeight:'700',marginTop:10},

  confirmTitle:{fontSize:22,fontWeight:'800',color:C.dark,marginBottom:16,marginTop:8},
  cleanerCard:{flexDirection:'row',alignItems:'center',gap:14,backgroundColor:C.white,borderRadius:16,padding:14,marginBottom:14,borderWidth:1,borderColor:C.border},
  cleanerName:{fontSize:15,fontWeight:'700',color:C.dark},
  cleanerSub:{fontSize:12,color:C.muted,marginTop:3},
  summCard:{backgroundColor:C.white,borderRadius:16,padding:16,marginBottom:14,...S.sm,borderWidth:1,borderColor:C.border},
  summHead:{fontSize:12,fontWeight:'800',color:C.muted,textTransform:'uppercase',letterSpacing:0.5,marginBottom:8},
  summRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:8,borderBottomWidth:1,borderBottomColor:C.bg,gap:12},
  summLbl:{fontSize:13,color:C.muted,fontWeight:'600'},
  summVal:{fontSize:13,color:C.text,fontWeight:'600',flex:1,textAlign:'right'},
  priceCard:{backgroundColor:C.white,borderRadius:16,padding:16,marginBottom:14,...S.sm,borderWidth:1,borderColor:C.border},
  priceTitle:{fontSize:15,fontWeight:'700',color:C.dark,marginBottom:12},
  priceRow:{flexDirection:'row',justifyContent:'space-between',marginBottom:7,gap:10},
  priceLbl:{fontSize:12,color:C.muted,flex:1},
  priceVal:{fontSize:12,color:C.text,fontWeight:'600'},
  totalRow:{flexDirection:'row',justifyContent:'space-between',marginTop:10,paddingTop:10,borderTopWidth:1,borderTopColor:C.border},
  totalLbl:{fontSize:15,fontWeight:'700',color:C.dark},
  totalVal:{fontSize:18,fontWeight:'800',color:C.primary},
  scopeBtn:{backgroundColor:C.bgAlt,borderRadius:12,paddingVertical:13,alignItems:'center',marginBottom:14,borderWidth:1,borderColor:C.border},
  scopeBtnTxt:{fontSize:13,color:C.primary,fontWeight:'700'},
  finalBox:{backgroundColor:C.greenLt,borderRadius:14,padding:16,gap:8,borderWidth:1,borderColor:'#A7F3D0'},
  finalTitle:{fontSize:14,fontWeight:'800',color:C.green},
  finalTxt:{fontSize:12,color:C.text,lineHeight:18},

  failBox:{backgroundColor:C.redLt,borderRadius:14,padding:14,gap:5,marginBottom:14,
    borderWidth:1,borderColor:'#FECACA'},
  failTitle:{fontSize:14,fontWeight:'800',color:C.red},
  failTxt:{fontSize:12,color:C.red,lineHeight:18},
  runningBox:{backgroundColor:C.bgAlt,borderRadius:12,padding:13,gap:6,marginTop:18,
    borderWidth:1,borderColor:C.border},
  runningRow:{flexDirection:'row',justifyContent:'space-between'},
  runningLbl:{fontSize:12,color:C.muted},
  runningVal:{fontSize:12,color:C.text,fontWeight:'700'},
  runningTotal:{flexDirection:'row',justifyContent:'space-between',paddingTop:8,marginTop:2,
    borderTopWidth:1,borderTopColor:C.border},
  runningTotalLbl:{fontSize:13,fontWeight:'800',color:C.dark},
  runningTotalVal:{fontSize:16,fontWeight:'800',color:C.primary},
  holdBox:{backgroundColor:C.primaryLt,borderRadius:14,padding:14,gap:6,marginBottom:14,
    borderWidth:1,borderColor:C.border},
  holdTitle:{fontSize:14,fontWeight:'800',color:C.primary},
  holdTxt:{fontSize:12,color:C.text,lineHeight:18},

  doneTop:{alignItems:'center',gap:10,marginBottom:22},
  doneIcon:{fontSize:56},
  doneTitle:{fontSize:26,fontWeight:'800',color:C.dark},
  doneSub:{fontSize:14,color:C.muted,textAlign:'center',lineHeight:21},
  doneCard:{backgroundColor:C.white,borderRadius:16,padding:16,marginBottom:14,
    borderWidth:1,borderColor:C.border,...S.sm},
  doneRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:8,
    borderBottomWidth:1,borderBottomColor:C.bg,gap:12},
  doneLbl:{fontSize:13,color:C.muted,fontWeight:'600'},
  doneVal:{fontSize:13,color:C.text,fontWeight:'600',flex:1,textAlign:'right'},
  doneTotalRow:{flexDirection:'row',justifyContent:'space-between',paddingTop:12,marginTop:4,
    borderTopWidth:1,borderTopColor:C.border},
  doneTotalLbl:{fontSize:15,fontWeight:'700',color:C.dark},
  doneTotalVal:{fontSize:20,fontWeight:'800',color:C.primary},

  payBox:{backgroundColor:C.primaryLt,borderRadius:16,padding:16,gap:10,marginBottom:14,
    borderWidth:1,borderColor:C.border},
  payTitle:{fontSize:15,fontWeight:'800',color:C.primary},
  payTxt:{fontSize:13,color:C.text,lineHeight:19},
  paySteps:{gap:9,marginTop:2},
  payRow:{flexDirection:'row',gap:10},
  payDot:{fontSize:14,color:C.primary,fontWeight:'800'},
  payA:{fontSize:13,fontWeight:'700',color:C.text},
  payB:{fontSize:12,color:C.muted,marginTop:2,lineHeight:16},

  cancelBox:{backgroundColor:C.white,borderRadius:16,padding:16,gap:4,marginBottom:20,
    borderWidth:1,borderColor:C.border},
  cancelTitle:{fontSize:14,fontWeight:'800',color:C.dark,marginBottom:6},
  cancelRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:6,gap:12},
  cancelA:{fontSize:12,color:C.text,flex:1},
  cancelB:{fontSize:12,color:C.muted,fontWeight:'600',textAlign:'right'},

  doneBtn:{backgroundColor:C.primary,borderRadius:16,paddingVertical:17,alignItems:'center',...S.md},
  doneBtnTxt:{color:C.white,fontSize:16,fontWeight:'700'},
  doneGhost:{paddingVertical:14,alignItems:'center'},
  doneGhostTxt:{color:C.muted,fontSize:14,fontWeight:'600'},

  footer:{flexDirection:'row',alignItems:'center',paddingHorizontal:20,paddingVertical:16,backgroundColor:C.white,borderTopWidth:1,borderTopColor:C.border,gap:16},
  footerLbl:{fontSize:11,color:C.muted},
  footerVal:{fontSize:20,fontWeight:'800',color:C.dark},
  footerStep:{fontSize:13,color:C.muted,fontWeight:'600'},
  footerQuote:{fontSize:16,fontWeight:'800',color:C.teal},
  quoteCard:{backgroundColor:C.tealLt,borderRadius:16,padding:16,gap:8,marginBottom:14,
    borderWidth:1,borderColor:'#BAE6FD'},
  quoteTitle:{fontSize:15,fontWeight:'800',color:C.teal},
  quoteTxt:{fontSize:13,color:C.text,lineHeight:19},
  quoteRange:{fontSize:13,color:C.teal,fontWeight:'700'},
  nextBtn:{flex:1.6,backgroundColor:C.primary,borderRadius:14,paddingVertical:16,alignItems:'center',...S.md},
  nextBtnDis:{backgroundColor:C.muted},
  nextBtnTxt:{color:C.white,fontSize:15,fontWeight:'700'},

  modalWrap:{flex:1,backgroundColor:'rgba(0,0,0,0.45)',justifyContent:'flex-end'},
  modalCard:{backgroundColor:C.bg,borderTopLeftRadius:24,borderTopRightRadius:24,maxHeight:'85%',paddingBottom:16},
  modalHdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:20,borderBottomWidth:1,borderBottomColor:C.border},
  modalTitle:{fontSize:18,fontWeight:'800',color:C.dark},
  modalClose:{fontSize:20,color:C.muted,fontWeight:'700'},
  modalBody:{paddingHorizontal:20},
  modalIntro:{fontSize:13,color:C.muted,lineHeight:19,marginVertical:16},
  taskGroup:{marginBottom:18},
  taskArea:{fontSize:12,fontWeight:'800',color:C.primary,textTransform:'uppercase',letterSpacing:0.6,marginBottom:8},
  taskRow:{flexDirection:'row',gap:10,paddingVertical:5,alignItems:'flex-start'},
  taskBullet:{fontSize:12,color:C.green,fontWeight:'800',marginTop:1},
  taskTxt:{fontSize:13,color:C.text,flex:1,lineHeight:19},
  modalBtn:{marginHorizontal:20,backgroundColor:C.primary,borderRadius:14,paddingVertical:15,alignItems:'center'},
  modalBtnTxt:{color:C.white,fontSize:15,fontWeight:'700'},
});
