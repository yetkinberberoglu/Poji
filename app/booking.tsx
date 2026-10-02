import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Modal
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { useApp } from '../context/AppContext';
import Avatar from '../components/Avatar';
import { supabase } from '../lib/supabase';
import {
  loadServiceTypes, loadServiceExtras, loadPropertySizes, loadTasksFor,
  groupTasks, quote, estimateHours,
  type ServiceType, type ServiceExtra, type PropertySize
} from '../lib/services';

const TIMES = [
  '07:00','08:00','09:00','10:00','11:00','12:00',
  '13:00','14:00','15:00','16:00','17:00','18:00',
];

/** How far ahead clients can book */
const DAYS_AHEAD = 30;
/** Cleaners need a little notice before a job starts */
const LEAD_HOURS = 2;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const buildDays = () => {
  const out: { value:string; dayName:string; dayNum:number; month:string; isToday:boolean; isTomorrow:boolean; isWeekend:boolean }[] = [];
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

/** A slot today is only bookable if it's far enough in the future */
const slotAvailable = (dateValue: string, time: string) => {
  const now = new Date();
  if (dateValue !== iso(now)) return true;
  const [h, m] = time.split(':').map(Number);
  const slot = new Date();
  slot.setHours(h, m, 0, 0);
  return slot.getTime() - now.getTime() >= LEAD_HOURS * 3600 * 1000;
};
const STEPS = ['Service','Place','Extras','Cleaner','When','Confirm'];

const fmtH = (h:number) => h % 1 === 0 ? `${h}h` : `${Math.floor(h)}h 30m`;

export default function BookingScreen() {
  const { addBooking, cleaners } = useApp();
  const params = useLocalSearchParams<{cleanerId?: string; cleanerName?: string; trade?: string}>();

  const [step, setStep]    = useState(0);
  const [loading, setLoad] = useState(false);

  const [types, setTypes]   = useState<ServiceType[]>([]);
  const [extras, setExtras] = useState<ServiceExtra[]>([]);
  const [sizes, setSizes]   = useState<PropertySize[]>([]);
  const [catLoading, setCatLoading] = useState(true);

  const [svc, setSvc]             = useState<string>('');
  const [chosenExtras, setChosen] = useState<string[]>([]);
  const [suppliesByCleaner, setSupplies] = useState(false);
  const [size, setSize]           = useState('1bed');
  const [address, setAddr]        = useState('');
  const [savedAddr, setSavedAddr] = useState<{line:string; locality:string}|null>(null);
  const [useSaved, setUseSaved]   = useState(true);
  const [loadingAddr, setLoadingAddr] = useState(true);
  const [num, setNum]   = useState(1);
  const [pickedCleaner, setPicked] = useState<string|null>(params.cleanerId || null);
  const [lockedToCleaner, setLocked] = useState<boolean>(!!params.cleanerId);
  const [days] = useState(buildDays);
  const [monthOffset, setMonthOffset] = useState(0);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [manualHours, setManualHours] = useState<number|null>(null);

  const [showTasks, setShowTasks]   = useState<string|null>(null);
  const [taskGroups, setTaskGroups] = useState<Record<string,string[]>>({});

  const svcType = types.find(t => t.id === svc);
  const sizeObj = sizes.find(z => z.id === size);

  const multiplier  = svcType?.multiplier ?? 1;
  const baseMinutes = svcType?.base_minutes ?? 120;
  const sizeFactor  = sizeObj?.factor ?? 1;
  const svcMinHours = svcType?.min_hours ?? 3;

  // extras only make sense for hourly home services
  const showExtras = !!svcType && (svcType.pricing_model ?? 'hourly') === 'hourly';
  const selectedExtras = showExtras ? extras.filter(e => chosenExtras.includes(e.id)) : [];
  const extraMinutes   = selectedExtras.reduce((s,e)=>s+Number(e.extra_minutes),0);

  // cleaners who can send this many people
  const teamSizeOf = (c: any) => {
    const n = Number(c?.teamSize);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };

  const allCapable = cleaners.filter(c => teamSizeOf(c) >= num);

  // If the client came in from one cleaner's profile, keep them on that cleaner
  const capable = lockedToCleaner
    ? allCapable.filter(c => c.id === params.cleanerId)
    : allCapable;

  const lockedCleaner = cleaners.find(c => c.id === params.cleanerId) || null;
  const lockedCapacity = lockedCleaner ? teamSizeOf(lockedCleaner) : 0;
  const cleaner = cleaners.find(c => c.id === pickedCleaner) || null;

  // hours depend on the chosen cleaner's minimum
  const cleanerMin = (cleaner as any)?.minHours ?? 2;
  const minHours   = Math.max(svcMinHours, cleanerMin);
  const est = estimateHours({ baseMinutes, sizeFactor, extraMinutes, minHours, numCleaners: num });
  const hours = manualHours ?? est.hours;

  const baseRate = cleaner?.rate ?? 0;
  const p = quote({ baseRate, hours, numCleaners: num, multiplier, suppliesByCleaner });

  /** what a given cleaner would charge for this exact job */
  const quoteFor = (c: any) => {
    const cMin = Math.max(svcMinHours, c.minHours ?? 2);
    const e = estimateHours({ baseMinutes, sizeFactor, extraMinutes, minHours: cMin, numCleaners: num });
    const q = quote({ baseRate: c.rate, hours: e.hours, numCleaners: num, multiplier, suppliesByCleaner });
    return { hours: e.hours, total: q.clientPays };
  };

  useEffect(() => {
    (async () => {
      // Which trade are we booking? Either passed in, or taken from the
      // provider's own registered trades.
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

  useEffect(() => { setManualHours(null); }, [svc, size, chosenExtras, num]);

  useEffect(() => {
    if (date && time && !slotAvailable(date, time)) setTime('');
  }, [date]);

  // drop a cleaner who can no longer cover the team size
  useEffect(() => {
    if (pickedCleaner && !allCapable.find(c => c.id === pickedCleaner)) setPicked(null);
  }, [num, cleaners]);

  const openTasks = async (typeId: string) => {
    const tasks = await loadTasksFor(typeId);
    setTaskGroups(groupTasks(tasks));
    setShowTasks(typeId);
  };

  const toggleExtra = (id: string) =>
    setChosen(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  const confirm = async () => {
    if (!cleaner) return;
    setLoad(true);
    try {
      await addBooking({
        cleanerId: cleaner.id,
        address: address || '12 Tower Road, Sliema',
        date: date || iso(new Date()),
        time: time || '10:00',
        hours, numCleaners: num,
        propertyType: size, serviceType: svc,
        total: p.clientPays, status: 'pending',
      } as any, {
        multiplier, suppliesByCleaner, hourlyRate: baseRate,
        extraIds: chosenExtras, propertySize: size,
        estimatedMinutes: est.totalMinutes,
        tradeId: svcType?.trade_id || params.trade || null,
        extrasForChecklist: selectedExtras,
      });
      Alert.alert('✅ Booking Confirmed!','Your cleaner has been notified.',[
        {text:'View Bookings', onPress:()=>router.replace('/(tabs)/bookings')},
      ]);
    } catch { Alert.alert('Error','Something went wrong. Please try again.'); }
    finally { setLoad(false); }
  };

  const canContinue =
    step === 1 ? !!address :
    step === 3 ? !!pickedCleaner :
    step === 4 ? !!date && !!time :
    true;

  const blockedMsg =
    step === 1 ? 'Enter an address first' :
    step === 3 ? 'Pick a cleaner to continue' :
    step === 4 ? 'Pick a date and time' : '';

  return (
    <View style={s.wrap}>
      <View style={s.hdr}>
        <TouchableOpacity onPress={()=>step>0?setStep(step-1):router.back()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Book a Cleaner</Text>
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

        {/* ── 0 · SERVICE — no prices here ── */}
        {step===0 && (
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
                  return (
                    <TouchableOpacity key={t.id} style={[s.svcCard, on&&s.svcCardOn]}
                      onPress={()=>setSvc(t.id)}>
                      <View style={s.svcTop}>
                        <Text style={s.svcIcon}>{t.icon}</Text>
                        <View style={{flex:1}}>
                          <Text style={s.svcName}>{t.name}</Text>
                          <Text style={s.svcDesc}>{t.description}</Text>
                        </View>
                        <View style={[s.radio, on&&s.radioOn]}>
                          {on && <View style={s.radioDot}/>}
                        </View>
                      </View>
                      <TouchableOpacity style={s.svcFoot} onPress={()=>openTasks(t.id)}>
                        <Text style={s.svcLink}>What's included? ›</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </View>
        )}

        {/* ── 1 · PLACE ── */}
        {step===1 && (
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

            <Text style={s.lbl}>Where should we clean?</Text>
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
          </View>
        )}

        {/* ── 2 · EXTRAS ── */}
        {step===2 && !showExtras && (
          <View style={s.step}>
            <Text style={s.stepIntro}>Materials</Text>
            <Text style={s.hint}>
              Who supplies what's needed for the job?
            </Text>
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

        {step===2 && showExtras && (
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
                {k:true, l:'Cleaner brings them',d:'Small hourly surcharge'}].map(o=>(
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

        {/* ── 3 · CLEANER — first time prices appear ── */}
        {step===3 && (
          <View style={s.step}>
            {lockedToCleaner && lockedCleaner && (
              <View style={s.lockBanner}>
                <Text style={s.lockTxt}>
                  You're booking <Text style={{fontWeight:'800'}}>{lockedCleaner.name}</Text>
                  {lockedCapacity > 1
                    ? ` — they can send up to ${lockedCapacity} cleaners.`
                    : ' — they work solo.'}
                </Text>
                <TouchableOpacity onPress={()=>{ setLocked(false); setPicked(null); }}>
                  <Text style={s.lockLink}>Compare other cleaners ›</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={s.stepIntro}>How many cleaners?</Text>
            <View style={s.chips}>
              {[1,2,3].map(n=>{
                const pool  = lockedToCleaner
                  ? (lockedCapacity >= n ? 1 : 0)
                  : cleaners.filter(c => teamSizeOf(c) >= n).length;
                const off = pool === 0;
                return (
                  <TouchableOpacity key={n}
                    style={[s.chip, num===n&&s.chipOn, off&&s.chipOff]}
                    disabled={off} onPress={()=>setNum(n)}>
                    <Text style={[s.chipTxt, num===n&&s.chipTxtOn, off&&s.chipTxtOff]}>
                      {n} {n===1?'cleaner':'cleaners'}
                    </Text>
                    {n>1 && !lockedToCleaner && pool>0 && (
                      <Text style={[s.chipSub, num===n&&s.chipTxtOn]}>{pool} available</Text>
                    )}
                    {n>1 && lockedToCleaner && off && (
                      <Text style={[s.chipSub,{color:C.muted}]}>not offered</Text>
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

            <Text style={s.lbl}>
              {lockedToCleaner ? 'Your cleaner' : 'Choose your cleaner'}
            </Text>
            <Text style={s.hint}>
              {lockedToCleaner
                ? 'Tap the card to confirm this is the price for your job.'
                : `Only cleaners who can send ${num} ${num===1?'person':'people'} are shown. Each sets their own rate.`}
            </Text>

            {capable.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyIcon}>👥</Text>
                <Text style={s.emptyTxt}>
                  {lockedToCleaner
                    ? `${lockedCleaner?.name || 'This cleaner'} can't send ${num} people`
                    : `No one can send ${num} cleaners`}
                </Text>
                <Text style={s.emptySub}>
                  {lockedToCleaner
                    ? 'Pick fewer cleaners, or compare other providers.'
                    : 'Try fewer cleaners for this job.'}
                </Text>
                {lockedToCleaner && (
                  <TouchableOpacity style={s.emptyBtn}
                    onPress={()=>{ setLocked(false); setPicked(null); }}>
                    <Text style={s.emptyBtnTxt}>Compare other cleaners</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : capable.map(c=>{
              const on = pickedCleaner === c.id;
              const q  = quoteFor(c as any);
              return (
                <TouchableOpacity key={c.id} style={[s.clCard, on&&s.clCardOn]}
                  onPress={()=>setPicked(c.id)}>
                  <Avatar photoUrl={(c as any).photoUrl} initials={c.initials} color={c.color} size={50} />
                  <View style={{flex:1}}>
                    <View style={s.clNameRow}>
                      <Text style={s.clName}>{c.name}</Text>
                      {c.verified && <View style={s.verBadge}><Text style={s.verTxt}>✓</Text></View>}
                      {(c as any).insured && <Text style={s.insDot}>🛡</Text>}
                    </View>
                    <Text style={s.clMeta}>
                      ⭐ {c.rating} · €{c.rate}/hr · {teamSizeOf(c)===1 ? 'solo' : `team of ${teamSizeOf(c)}`}
                    </Text>
                    <Text style={s.clAreas}>{c.areas.slice(0,3).join(' · ')}</Text>
                  </View>
                  <View style={{alignItems:'flex-end'}}>
                    <Text style={[s.clTotal, on&&{color:C.primary}]}>€{q.total.toFixed(0)}</Text>
                    <Text style={s.clHours}>{fmtH(q.hours)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── 4 · WHEN ── */}
        {step===4 && (
          <View style={s.step}>
            <Text style={s.stepIntro}>When should we come?</Text>

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
                    <Text style={s.estLbl}>Split across {num} cleaners</Text>
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
                <Text style={s.hint}>
                  The job runs about {fmtH(hours)}, so it would finish around{' '}
                  {time ? (() => {
                    const [h,m] = time.split(':').map(Number);
                    const end = new Date(); end.setHours(h, m + hours*60, 0, 0);
                    return end.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
                  })() : '—'}.
                </Text>
                <View style={s.chips}>
                  {TIMES.map(ti=>{
                    const ok = slotAvailable(date, ti);
                    return (
                      <TouchableOpacity key={ti}
                        style={[s.chip, time===ti&&s.chipOn, !ok&&s.chipOff]}
                        disabled={!ok}
                        onPress={()=>setTime(ti)}>
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

        {/* ── 5 · CONFIRM ── */}
        {step===5 && cleaner && (
          <View style={s.step}>
            <Text style={s.confirmTitle}>Booking Summary</Text>

            <View style={s.cleanerCard}>
              <Avatar photoUrl={(cleaner as any).photoUrl} initials={cleaner.initials} color={cleaner.color} size={52} />
              <View style={{flex:1}}>
                <Text style={s.cleanerName}>{cleaner.name}</Text>
                <Text style={s.cleanerSub}>€{baseRate}/hr base · {cleaner.areas?.[0]||'Malta'}</Text>
              </View>
            </View>

            <View style={s.summCard}>
              {[
                ['Service',   `${svcType?.icon || ''} ${svcType?.name || ''}`],
                ['Property',  `${sizeObj?.icon || ''} ${sizeObj?.name || ''}`],
                ['Address',   address || '—'],
                ['Date',      date ? new Date(date+'T00:00:00').toLocaleDateString('en-GB',
                                {weekday:'long', day:'numeric', month:'long'}) : '—'],
                ['Time',      time || '—'],
                ['Duration',  `${fmtH(hours)} × ${num} cleaner${num>1?'s':''}`],
                ['Materials', suppliesByCleaner ? 'Cleaner brings them' : 'Client provides'],
              ].map(([l,v])=>(
                <View key={l} style={s.summRow}>
                  <Text style={s.summLbl}>{l}</Text>
                  <Text style={s.summVal}>{v}</Text>
                </View>
              ))}
            </View>

            {selectedExtras.length > 0 && (
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

            <View style={s.priceCard}>
              <Text style={s.priceTitle}>Price breakdown</Text>
              {[
                ['Base rate', `€${baseRate.toFixed(2)}/hr`],
                [`${svcType?.name} rate  ×${multiplier}`, `€${(baseRate*multiplier).toFixed(2)}/hr`],
                ...(suppliesByCleaner ? [['Materials surcharge', '+€2.00/hr']] : []),
                [`${fmtH(hours)} × ${num} cleaner${num>1?'s':''}`, `€${p.exVat.toFixed(2)}`],
                ['VAT 18% (agency)', `€${p.vat.toFixed(2)}`],
                ['Stripe fee', `€${p.stripeFee.toFixed(2)}`],
                ['──────────────', '──────'],
                ['Cleaner gets (80%)', `€${p.cleanerGets.toFixed(2)}`],
                ['Platform (20%)', `€${p.platform.toFixed(2)}`],
              ].map(([l,v])=>(
                <View key={String(l)} style={s.priceRow}>
                  <Text style={s.priceLbl}>{l}</Text>
                  <Text style={s.priceVal}>{v}</Text>
                </View>
              ))}
              <View style={s.totalRow}>
                <Text style={s.totalLbl}>Estimated total</Text>
                <Text style={s.totalVal}>€{p.clientPays.toFixed(2)}</Text>
              </View>
            </View>

            <TouchableOpacity style={s.scopeBtn} onPress={()=>openTasks(svc)}>
              <Text style={s.scopeBtnTxt}>📋  See the full task list for this clean</Text>
            </TouchableOpacity>

            <View style={s.finalBox}>
              <Text style={s.finalTitle}>💡  How the final price is set</Text>
              <Text style={s.finalTxt}>
                This is an estimate based on {fmtH(hours)}. Your cleaner starts the timer
                with your PIN and stops it when the work is done.
              </Text>
              <Text style={s.finalTxt}>
                You pay for the time actually worked — less if it finishes early.
                Your card is only charged once you've approved the completed checklist.
              </Text>
            </View>
          </View>
        )}

        <View style={{height:24}} />
      </ScrollView>

      <View style={s.footer}>
        <View style={{flex:1}}>
          {step >= 3 && cleaner ? (
            <>
              <Text style={s.footerLbl}>{fmtH(hours)} · Estimated</Text>
              <Text style={s.footerVal}>€{p.clientPays.toFixed(2)}</Text>
            </>
          ) : (
            <Text style={s.footerStep}>{STEPS[step]}</Text>
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
                : step===2 && chosenExtras.length===0 ? 'Skip  →'
                : step<STEPS.length-1 ? 'Continue  →'
                : '✓  Confirm & Pay'}
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
                Your cleaner ticks each of these off when the job is done. You see the
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

  noSvcBox:{backgroundColor:C.white,borderRadius:16,padding:26,alignItems:'center',gap:8,borderWidth:1,borderColor:C.border},
  noSvcIcon:{fontSize:38},
  noSvcTitle:{fontSize:16,fontWeight:'800',color:C.dark},
  noSvcTxt:{fontSize:13,color:C.muted,textAlign:'center',lineHeight:19},
  svcCard:{padding:14,borderRadius:16,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginBottom:10},
  svcCardOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  svcTop:{flexDirection:'row',gap:12,alignItems:'flex-start'},
  svcIcon:{fontSize:26},
  svcName:{fontSize:15,fontWeight:'700',color:C.dark},
  svcDesc:{fontSize:12,color:C.muted,marginTop:3,lineHeight:17},
  svcFoot:{marginTop:10,paddingTop:10,borderTopWidth:1,borderTopColor:C.bg},
  svcLink:{fontSize:12,color:C.primary,fontWeight:'700'},

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

  clCard:{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:16,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginBottom:10,...S.sm},
  clCardOn:{borderColor:C.primary,backgroundColor:C.primaryLt,borderWidth:2},
  clAv:{width:50,height:50,borderRadius:25,alignItems:'center',justifyContent:'center'},
  clIn:{fontSize:17,fontWeight:'800'},
  clNameRow:{flexDirection:'row',alignItems:'center',gap:8},
  clName:{fontSize:15,fontWeight:'700',color:C.dark},
  verBadge:{backgroundColor:C.greenLt,width:19,height:19,borderRadius:10,alignItems:'center',justifyContent:'center'},
  verTxt:{fontSize:10,color:C.green,fontWeight:'700'},
  insDot:{fontSize:12},
  clMeta:{fontSize:12,color:C.muted,marginTop:3},
  clAreas:{fontSize:11,color:C.muted,marginTop:2},
  clTotal:{fontSize:20,fontWeight:'800',color:C.dark},
  clHours:{fontSize:11,color:C.muted,marginTop:1},

  lockBanner:{backgroundColor:C.primaryLt,borderRadius:14,padding:14,gap:8,marginTop:8,marginBottom:4,borderWidth:1,borderColor:C.border},
  lockTxt:{fontSize:13,color:C.text,lineHeight:19},
  lockLink:{fontSize:12,color:C.primary,fontWeight:'700'},
  emptyBtn:{marginTop:10,backgroundColor:C.primary,borderRadius:12,paddingVertical:11,paddingHorizontal:20},
  emptyBtnTxt:{color:C.white,fontSize:13,fontWeight:'700'},
  emptyBox:{backgroundColor:C.white,borderRadius:16,padding:28,alignItems:'center',borderWidth:1,borderColor:C.border,gap:6},
  emptyIcon:{fontSize:38},
  emptyTxt:{fontSize:15,fontWeight:'700',color:C.dark},
  emptySub:{fontSize:13,color:C.muted,textAlign:'center'},

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
  dateBtn:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:13,paddingHorizontal:16,borderRadius:12,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginBottom:8},
  dateBtnOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  dateTxt:{fontSize:14,fontWeight:'600',color:C.muted},
  dateTxtOn:{color:C.primary},
  dateTick:{fontSize:16,color:C.primary,fontWeight:'700'},

  confirmTitle:{fontSize:22,fontWeight:'800',color:C.dark,marginBottom:16,marginTop:8},
  cleanerCard:{flexDirection:'row',alignItems:'center',gap:14,backgroundColor:C.white,borderRadius:16,padding:14,marginBottom:14,borderWidth:1,borderColor:C.border},
  cleanerAv:{width:52,height:52,borderRadius:26,alignItems:'center',justifyContent:'center'},
  cleanerIn:{fontSize:18,fontWeight:'800'},
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

  footer:{flexDirection:'row',alignItems:'center',paddingHorizontal:20,paddingVertical:16,backgroundColor:C.white,borderTopWidth:1,borderTopColor:C.border,gap:16},
  footerLbl:{fontSize:11,color:C.muted},
  footerVal:{fontSize:20,fontWeight:'800',color:C.dark},
  footerStep:{fontSize:13,color:C.muted,fontWeight:'600'},
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
