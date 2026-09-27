import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Modal
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import {
  loadServiceTypes, loadServiceExtras, loadPropertySizes, loadTasksFor,
  groupTasks, quote, estimateHours,
  type ServiceType, type ServiceExtra, type PropertySize
} from '../lib/services';

const DATE_LABELS = ['Mon 1 Sep','Tue 2 Sep','Wed 3 Sep','Thu 4 Sep','Fri 5 Sep','Sat 6 Sep','Sun 7 Sep'];
const DATE_VALUES: Record<string,string> = {
  'Mon 1 Sep':'2026-09-01','Tue 2 Sep':'2026-09-02','Wed 3 Sep':'2026-09-03',
  'Thu 4 Sep':'2026-09-04','Fri 5 Sep':'2026-09-05','Sat 6 Sep':'2026-09-06','Sun 7 Sep':'2026-09-07'
};
const TIMES = ['08:00','09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00'];
const STEPS = ['Service','Home','Date & Time','Confirm'];

const fmtH = (h:number) => h % 1 === 0 ? `${h}h` : `${Math.floor(h)}h 30m`;

export default function BookingScreen() {
  const { addBooking, cleaners } = useApp();
  const params = useLocalSearchParams<{cleanerId?: string; cleanerName?: string}>();

  const [step, setStep]    = useState(0);
  const [loading, setLoad] = useState(false);

  const [types, setTypes]   = useState<ServiceType[]>([]);
  const [extras, setExtras] = useState<ServiceExtra[]>([]);
  const [sizes, setSizes]   = useState<PropertySize[]>([]);
  const [catLoading, setCatLoading] = useState(true);

  const [svc, setSvc]             = useState('standard');
  const [chosenExtras, setChosen] = useState<string[]>([]);
  const [suppliesByCleaner, setSupplies] = useState(false);
  const [size, setSize]           = useState('1bed');
  const [address, setAddr]        = useState('');
  const [savedAddr, setSavedAddr] = useState<{line:string; locality:string}|null>(null);
  const [useSaved, setUseSaved]   = useState(true);
  const [loadingAddr, setLoadingAddr] = useState(true);
  const [num, setNum]   = useState(1);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [manualHours, setManualHours] = useState<number|null>(null);

  const [showTasks, setShowTasks]   = useState<string|null>(null);
  const [taskGroups, setTaskGroups] = useState<Record<string,string[]>>({});

  const cleanerId   = params.cleanerId || cleaners[0]?.id || '';
  const cleanerName = params.cleanerName || cleaners[0]?.name || 'Cleaner';
  const cleaner     = cleaners.find(c=>c.id===cleanerId) || cleaners[0];

  const baseRate = cleaner?.rate ?? 15;
  const maxTeam  = (cleaner as any)?.teamSize ?? 1;
  const svcType  = types.find(t => t.id === svc);
  const sizeObj  = sizes.find(z => z.id === size);

  const multiplier  = svcType?.multiplier ?? 1;
  const baseMinutes = svcType?.base_minutes ?? 120;
  const sizeFactor  = sizeObj?.factor ?? 1;
  const svcMinHours = svcType?.min_hours ?? 3;
  const cleanerMin  = (cleaner as any)?.minHours ?? 2;
  const minHours    = Math.max(svcMinHours, cleanerMin);

  const selectedExtras = extras.filter(e => chosenExtras.includes(e.id));
  const extraMinutes   = selectedExtras.reduce((s,e)=>s+Number(e.extra_minutes),0);

  const est = estimateHours({
    baseMinutes, sizeFactor, extraMinutes, minHours, numCleaners: num,
  });
  const hours = manualHours ?? est.hours;

  const p = quote({ baseRate, hours, numCleaners: num, multiplier, suppliesByCleaner });

  useEffect(() => {
    (async () => {
      const [t, e, z] = await Promise.all([
        loadServiceTypes(), loadServiceExtras(), loadPropertySizes(),
      ]);
      setTypes(t); setExtras(e); setSizes(z);
      setCatLoading(false);
    })();
  }, []);

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

  // any change to scope resets a manual override
  useEffect(() => { setManualHours(null); }, [svc, size, chosenExtras, num]);
  useEffect(() => { if (num > maxTeam) setNum(maxTeam); }, [maxTeam]);

  const openTasks = async (typeId: string) => {
    const tasks = await loadTasksFor(typeId);
    setTaskGroups(groupTasks(tasks));
    setShowTasks(typeId);
  };

  const toggleExtra = (id: string) =>
    setChosen(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  const confirm = async () => {
    setLoad(true);
    try {
      await addBooking({
        cleanerId,
        address: address || '12 Tower Road, Sliema',
        date: DATE_VALUES[date] || '2026-09-01',
        time: time || '10:00',
        hours, numCleaners: num,
        propertyType: size, serviceType: svc,
        total: p.clientPays, status: 'pending',
      } as any, {
        multiplier, suppliesByCleaner, hourlyRate: baseRate,
        extraIds: chosenExtras, propertySize: size,
        estimatedMinutes: est.totalMinutes,
        extrasForChecklist: selectedExtras,
      });
      Alert.alert('✅ Booking Confirmed!','Your cleaner has been notified.',[
        {text:'View Bookings', onPress:()=>router.replace('/(tabs)/bookings')},
      ]);
    } catch { Alert.alert('Error','Something went wrong. Please try again.'); }
    finally { setLoad(false); }
  };

  const canContinue = step === 1 ? !!address : true;

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

        {/* ── STEP 0 — service + extras ── */}
        {step===0 && (
          <View style={s.step}>
            {catLoading ? (
              <View style={s.loadingBox}><ActivityIndicator color={C.primary}/></View>
            ) : (
              <>
                <Text style={s.lbl}>What kind of clean?</Text>
                {types.map(t=>{
                  const on = svc===t.id;
                  const rate = (baseRate*t.multiplier + (suppliesByCleaner?2:0)).toFixed(2);
                  return (
                    <TouchableOpacity key={t.id} style={[s.svcCard, on&&s.svcCardOn]}
                      onPress={()=>setSvc(t.id)}>
                      <View style={s.svcTop}>
                        <Text style={s.svcIcon}>{t.icon}</Text>
                        <View style={{flex:1}}>
                          <Text style={s.svcName}>{t.name}</Text>
                          <Text style={s.svcDesc}>{t.description}</Text>
                        </View>
                        <View style={s.svcPrice}>
                          <Text style={s.svcRate}>€{rate}</Text>
                          <Text style={s.svcUnit}>/hr</Text>
                        </View>
                      </View>
                      <View style={s.svcFoot}>
                        <Text style={s.svcMin}>~{Math.round(t.base_minutes/60*10)/10}h for a 1-bed</Text>
                        <TouchableOpacity onPress={()=>openTasks(t.id)}>
                          <Text style={s.svcLink}>What's included? ›</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                <Text style={s.lbl}>Cleaning materials</Text>
                <View style={s.supplyRow}>
                  {[{k:false,l:'I provide them',d:'No extra charge'},
                    {k:true, l:'Cleaner brings them',d:'+€2 per hour'}].map(o=>(
                    <TouchableOpacity key={String(o.k)}
                      style={[s.supplyCard, suppliesByCleaner===o.k&&s.supplyCardOn]}
                      onPress={()=>setSupplies(o.k)}>
                      <Text style={[s.supplyLbl, suppliesByCleaner===o.k&&s.supplyLblOn]}>{o.l}</Text>
                      <Text style={s.supplyDesc}>{o.d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.lbl}>Anything extra?</Text>
                <Text style={s.hint}>
                  Each one adds time to the job — you pay for the extra time, not a separate fee.
                </Text>
                {extras.map(e=>{
                  const on = chosenExtras.includes(e.id);
                  const cost = (e.extra_minutes/60) * (baseRate*multiplier + (suppliesByCleaner?2:0));
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
                      <View style={{alignItems:'flex-end'}}>
                        <Text style={s.extraMins}>+{e.extra_minutes}m</Text>
                        <Text style={s.extraCost}>≈ €{cost.toFixed(0)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </View>
        )}

        {/* ── STEP 1 — home details ── */}
        {step===1 && (
          <View style={s.step}>
            <Text style={s.lbl}>How big is the place?</Text>
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

            <Text style={s.lbl}>How many cleaners?</Text>
            {maxTeam > 1
              ? <Text style={s.teamNote}>👥 {cleaner?.name?.split(' ')[0]} can send up to {maxTeam} — the job finishes faster</Text>
              : <Text style={s.hint}>{cleaner?.name?.split(' ')[0] || 'This cleaner'} works solo</Text>}
            <View style={s.chips}>
              {[1,2,3,4].map(n=>{
                const blocked = n > maxTeam;
                return (
                  <TouchableOpacity key={n}
                    style={[s.chip, num===n&&s.chipOn, blocked&&s.chipOff]}
                    disabled={blocked} onPress={()=>setNum(n)}>
                    <Text style={[s.chipTxt, num===n&&s.chipTxtOn, blocked&&s.chipTxtOff]}>{n}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* live estimate */}
            <View style={s.estBox}>
              <Text style={s.estTitle}>⏱  We estimate {fmtH(hours)}</Text>
              <Text style={s.estIntro}>
                You'll only pay for the hours actually worked.
              </Text>
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
                <Text style={s.estNote}>
                  Raised to the {minHours}h minimum for this service.
                </Text>
              )}
              <TouchableOpacity style={s.adjustBtn}
                onPress={()=>setManualHours(manualHours===null ? est.hours : null)}>
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
          </View>
        )}

        {/* ── STEP 2 — date & time ── */}
        {step===2 && (
          <View style={s.step}>
            <Text style={s.lbl}>Select date</Text>
            {DATE_LABELS.map(d=>(
              <TouchableOpacity key={d} style={[s.dateBtn, date===d&&s.dateBtnOn]} onPress={()=>setDate(d)}>
                <Text style={[s.dateTxt, date===d&&s.dateTxtOn]}>{d}</Text>
                {date===d && <Text style={s.dateTick}>✓</Text>}
              </TouchableOpacity>
            ))}
            <Text style={s.lbl}>Start time</Text>
            <Text style={s.hint}>The job should take about {fmtH(hours)}.</Text>
            <View style={s.chips}>
              {TIMES.map(ti=>(
                <TouchableOpacity key={ti} style={[s.chip, time===ti&&s.chipOn]} onPress={()=>setTime(ti)}>
                  <Text style={[s.chipTxt, time===ti&&s.chipTxtOn]}>{ti}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── STEP 3 — confirm ── */}
        {step===3 && (
          <View style={s.step}>
            <Text style={s.confirmTitle}>Booking Summary</Text>

            <View style={s.cleanerCard}>
              <View style={[s.cleanerAv, {backgroundColor:(cleaner?.color||C.primary)+'22'}]}>
                <Text style={[s.cleanerIn, {color:cleaner?.color||C.primary}]}>{cleaner?.initials||'?'}</Text>
              </View>
              <View style={{flex:1}}>
                <Text style={s.cleanerName}>{cleanerName}</Text>
                <Text style={s.cleanerSub}>€{baseRate}/hr base · {cleaner?.areas?.[0]||'Malta'}</Text>
              </View>
            </View>

            <View style={s.summCard}>
              {[
                ['Service',   `${svcType?.icon || ''} ${svcType?.name || ''}`],
                ['Property',  `${sizeObj?.icon || ''} ${sizeObj?.name || ''}`],
                ['Address',   address || '—'],
                ['Date',      date || '—'],
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
                [`Base rate`, `€${baseRate.toFixed(2)}/hr`],
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
                If the job finishes early you pay less. If it genuinely needs longer, your
                cleaner asks you first — nothing is added without your approval.
              </Text>
              <Text style={s.finalTxt}>
                Your card is only charged once you've seen the completed checklist and
                approved the work.
              </Text>
            </View>
          </View>
        )}

        <View style={{height:24}} />
      </ScrollView>

      <View style={s.footer}>
        <View>
          <Text style={s.footerLbl}>
            {step < 3 ? `${fmtH(hours)} · Estimated` : `${fmtH(hours)} · Total`}
          </Text>
          <Text style={s.footerVal}>
            {step < 3 ? `~€${p.clientPays.toFixed(0)}` : `€${p.clientPays.toFixed(2)}`}
          </Text>
        </View>
        <TouchableOpacity
          style={[s.nextBtn, (!canContinue||loading)&&s.nextBtnDis]}
          onPress={()=>step<STEPS.length-1?setStep(step+1):confirm()}
          disabled={!canContinue||loading}
        >
          {loading ? <ActivityIndicator color={C.white}/> :
            <Text style={s.nextBtnTxt}>{step<STEPS.length-1?'Continue  →':'✓  Confirm & Pay'}</Text>}
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
  progress:{flexDirection:'row',paddingHorizontal:16,marginBottom:14},
  progressItem:{flex:1,alignItems:'center',gap:5},
  dot:{width:28,height:28,borderRadius:14,backgroundColor:C.bgAlt,borderWidth:2,borderColor:C.border,alignItems:'center',justifyContent:'center'},
  dotOn:{backgroundColor:C.primary,borderColor:C.primary},
  dotTxt:{fontSize:11,fontWeight:'700',color:C.muted},
  dotTxtOn:{color:C.white},
  dotLbl:{fontSize:10,color:C.muted,fontWeight:'600'},
  dotLblOn:{color:C.primary},
  body:{flex:1,paddingHorizontal:20},
  step:{paddingBottom:16},
  loadingBox:{paddingVertical:30,alignItems:'center'},
  lbl:{fontSize:12,fontWeight:'700',color:C.muted,textTransform:'uppercase',letterSpacing:0.5,marginTop:20,marginBottom:8},
  hint:{fontSize:12,color:C.muted,marginBottom:10,lineHeight:17},
  input:{backgroundColor:C.white,borderRadius:14,paddingHorizontal:16,paddingVertical:14,fontSize:15,color:C.text,borderWidth:1.5,borderColor:C.border},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
  chip:{paddingHorizontal:14,paddingVertical:10,borderRadius:12,backgroundColor:C.white,borderWidth:1.5,borderColor:C.border},
  chipOn:{backgroundColor:C.primary,borderColor:C.primary},
  chipTxt:{fontSize:13,fontWeight:'600',color:C.muted},
  chipTxtOn:{color:C.white},
  chipOff:{backgroundColor:C.bg,borderColor:C.border,opacity:0.4},
  chipTxtOff:{color:C.muted},
  teamNote:{fontSize:12,color:C.accent,fontWeight:'700',marginBottom:10,lineHeight:17},

  svcCard:{padding:14,borderRadius:16,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginBottom:10},
  svcCardOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  svcTop:{flexDirection:'row',gap:12,alignItems:'flex-start'},
  svcIcon:{fontSize:26},
  svcName:{fontSize:15,fontWeight:'700',color:C.dark},
  svcDesc:{fontSize:12,color:C.muted,marginTop:3,lineHeight:17},
  svcPrice:{alignItems:'flex-end'},
  svcRate:{fontSize:17,fontWeight:'800',color:C.primary},
  svcUnit:{fontSize:11,color:C.muted},
  svcFoot:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:10,paddingTop:10,borderTopWidth:1,borderTopColor:C.bg},
  svcMin:{fontSize:12,color:C.muted,fontWeight:'600'},
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
  extraCost:{fontSize:10,color:C.muted,marginTop:1},

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

  estBox:{backgroundColor:C.primaryLt,borderRadius:16,padding:16,marginTop:24,borderWidth:1,borderColor:C.border,gap:10},
  estTitle:{fontSize:17,fontWeight:'800',color:C.primary},
  estIntro:{fontSize:12,color:C.text,lineHeight:17,marginTop:-4},
  estRows:{gap:5},
  estRow:{flexDirection:'row',justifyContent:'space-between',gap:10},
  estLbl:{fontSize:12,color:C.text,flex:1},
  estVal:{fontSize:12,color:C.text,fontWeight:'700'},
  estNote:{fontSize:11,color:C.amber,fontWeight:'700'},
  adjustBtn:{alignSelf:'flex-start'},
  adjustTxt:{fontSize:12,color:C.primary,fontWeight:'700',textDecorationLine:'underline'},

  dateBtn:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:13,paddingHorizontal:16,borderRadius:12,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginBottom:8},
  dateBtnOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  dateTxt:{fontSize:14,fontWeight:'600',color:C.muted},
  dateTxtOn:{color:C.primary},
  dateTick:{fontSize:16,color:C.primary,fontWeight:'700'},

  confirmTitle:{fontSize:20,fontWeight:'800',color:C.dark,marginBottom:16,marginTop:8},
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
  note:{backgroundColor:C.greenLt,borderRadius:12,padding:14},
  noteTxt:{fontSize:13,color:C.green,lineHeight:20},

  footer:{flexDirection:'row',alignItems:'center',paddingHorizontal:20,paddingVertical:16,backgroundColor:C.white,borderTopWidth:1,borderTopColor:C.border,gap:16},
  footerLbl:{fontSize:11,color:C.muted},
  footerVal:{fontSize:20,fontWeight:'800',color:C.dark},
  nextBtn:{flex:1,backgroundColor:C.primary,borderRadius:14,paddingVertical:16,alignItems:'center',...S.md},
  nextBtnDis:{backgroundColor:C.muted},
  nextBtnTxt:{color:C.white,fontSize:16,fontWeight:'700'},

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
