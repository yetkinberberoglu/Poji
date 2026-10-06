import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Linking
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { loadServiceTypes, fixedQuote, type ServiceType } from '../lib/services';
import { findTrade } from '../constants/trades';
import { getCurrentLocation, reverseGeocode, mapsLink, type Coords } from '../lib/location';
import ServiceQuestions from '../components/ServiceQuestions';
import { missingAnswers, answerAdjustments } from '../lib/services';

const STEPS = ['Problem','Location','Vehicle','Confirm'];

export default function Roadside() {
  const { addBooking, availableTrades, providersFor } = useApp();
  const { trade } = useLocalSearchParams<{trade?: string}>();
  const tradeInfo = findTrade(trade);

  const [step, setStep]     = useState(0);
  const [types, setTypes]   = useState<ServiceType[]>([]);
  const [loadingCat, setLC] = useState(true);
  const [submitting, setSub]= useState(false);
  const [placed, setPlaced] = useState<any>(null);
  const [failed, setFailed] = useState('');

  const [svc, setSvc]         = useState<string|null>(null);
  const [urgent, setUrgent]   = useState(true);
  const [coords, setCoords]   = useState<Coords|null>(null);
  const [locLabel, setLocLbl] = useState('');
  const [locNote, setLocNote] = useState('');
  const [locBusy, setLocBusy] = useState(false);
  const [locDenied, setDenied]= useState(false);
  const [manualAddr, setManual] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [answers, setAnswers] = useState<Record<string,string>>({});

  const type = types.find(t => t.id === svc) || null;
  const isQuoteJob = type?.pricing_model === 'quote';
  const qs0 = (type?.questions || []) as any[];
  const adj = answerAdjustments(qs0, answers);
  const qs = qs0;
  const unanswered = missingAnswers(qs, answers);
  const p = type ? fixedQuote({
    labourPrice: (Number(type.labour_price ?? type.fixed_price) || 0) + adj.labour,
    partsPrice:  (Number(type.parts_price) || 0) + adj.parts,
    calloutFee:  Number(type.callout_fee) || 0,
    urgent,
  }) : null;

  useEffect(() => {
    (async () => {
      // One trade was picked, or we show every roadside trade someone covers
      const t = trade
        ? await loadServiceTypes({ trade })
        : await loadServiceTypes({ trades: availableTrades });

      // Never list a job type nobody can actually do
      const servable = t.filter(x =>
        !x.trade_id || availableTrades.includes(x.trade_id));

      setTypes(servable);
      if (servable.length && !svc) setSvc(servable[0].id);
      setLC(false);
    })();
  }, [trade, availableTrades.length]);

  const askLocation = async () => {
    setLocBusy(true); setDenied(false);
    const c = await getCurrentLocation();
    if (!c) { setDenied(true); setLocBusy(false); return; }
    setCoords(c);
    const label = await reverseGeocode(c);
    setLocLbl(label || `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
    setLocBusy(false);
  };

  // offer to locate as soon as they reach the location step
  useEffect(() => {
    if (step === 1 && !coords && !locDenied && !locBusy) askLocation();
  }, [step]);

  const submit = async () => {
    if (!type) return;
    setSub(true); setFailed('');
    try {
      const now = new Date();
      await addBooking({
        cleanerId: '',
        address: locLabel || manualAddr || 'Roadside',
        date: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,
        time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
        hours: (Number(type.typical_minutes) || 30) / 60,
        numCleaners: 1,
        propertyType: 'vehicle',
        serviceType: type.id,
        total: isQuoteJob ? 0 : (p?.clientPays || 0),
        status: 'pending_pool',
      } as any, {
        multiplier: 1,
        suppliesByCleaner: false,
        hourlyRate: 0,
        extraIds: [],
        propertySize: 'vehicle',
        estimatedMinutes: Number(type.typical_minutes) || 30,
        extrasForChecklist: [],
        pricingModel: isQuoteJob ? 'quote' : 'fixed',
        tradeId: type.trade_id || trade || null,
        calloutFee: Number(type.callout_fee) || 0,
        isUrgent: urgent,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        locationAccuracy: coords?.accuracy ?? null,
        locationNote: locNote || null,
        vehicleInfo: vehicle || null,
        answers,
        releasedToPool: true,
      });

      setPlaced({
        service: type.name,
        icon: type.icon,
        where: locLabel || manualAddr,
        total: isQuoteJob ? 0 : (p?.clientPays || 0),
        isQuote: isQuoteJob,
        urgent,
      });
    } catch (e: any) {
      console.error('Roadside request failed:', e);
      setFailed(e?.message || 'Could not send the request');
    } finally { setSub(false); }
  };

  const canContinue =
    step === 0 ? !!svc :
    step === 1 ? !!coords || !!manualAddr :
    step === 2 ? unanswered.length === 0 :
    true;

  if (placed) {
    return (
      <ScrollView style={s.wrap} contentContainerStyle={{padding:24, paddingTop:70}}>
        <View style={{alignItems:'center', gap:10, marginBottom:22}}>
          <Text style={{fontSize:56}}>{placed.urgent ? '🚨' : '✅'}</Text>
          <Text style={s.doneTitle}>Help is on the way</Text>
          <Text style={s.doneSub}>
            Every provider nearby who can do this has been alerted. The first to
            accept will see your location and head over.
          </Text>
        </View>

        <View style={s.doneCard}>
          {[
            ['Problem', `${placed.icon || ''} ${placed.service}`],
            ['Where',   placed.where || '—'],
            ['Timing',  placed.urgent ? 'Right now' : 'Within a day'],
            ...(placed.isQuote ? [] : [['You pay', `€${Number(placed.total).toFixed(2)}`]]),
          ].map(([l,v])=>(
            <View key={String(l)} style={s.summRow}>
              <Text style={s.summLbl}>{l}</Text>
              <Text style={s.summVal}>{v}</Text>
            </View>
          ))}
        </View>

        <View style={s.doneNote}>
          <Text style={s.doneNoteTitle}>💳  Nothing has been charged</Text>
          <Text style={s.doneNoteTxt}>
            {placed.isQuote
              ? "They'll message you with a price before anyone travels. Decline and the job is cancelled, no fee."
              : "Your card is only held. The money moves after the work is done and you approve it."}
          </Text>
        </View>

        <TouchableOpacity style={s.doneBtn}
          onPress={()=>router.replace('/(tabs)/bookings')}>
          <Text style={s.doneBtnTxt}>Track my request</Text>
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
        <Text style={s.title}>{tradeInfo?.name || 'Roadside help'}</Text>
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

        {/* 0 — what's wrong */}
        {step===0 && (
          <View style={s.step}>
            <Text style={s.stepIntro}>What's happened?</Text>
            <Text style={s.hint}>
              One agreed price. No hourly meter, no surprises.
              {tradeInfo ? ` ${providersFor(tradeInfo.id).length} provider${providersFor(tradeInfo.id).length===1?'':'s'} available.` : ''}
            </Text>

            {loadingCat ? (
              <View style={s.loadingBox}><ActivityIndicator color={C.primary}/></View>
            ) : types.length === 0 ? (
              <View style={s.noneBox}>
                <Text style={s.noneIcon}>{tradeInfo?.icon || '🛞'}</Text>
                <Text style={s.noneTitle}>Nobody covers this yet</Text>
                <Text style={s.noneTxt}>
                  We're signing up providers across Malta. Tell us what you need
                  and we'll message you when someone can do it.
                </Text>
                <TouchableOpacity style={s.noneBtn} onPress={()=>router.push('/request')}>
                  <Text style={s.noneBtnTxt}>Tell us what you need</Text>
                </TouchableOpacity>
              </View>
            ) : types.map(t=>{
              const on = svc === t.id;
              const byQuote = t.pricing_model === 'quote';
              const q  = fixedQuote({
                labourPrice: Number(t.labour_price ?? t.fixed_price) || 0,
                partsPrice:  Number(t.parts_price) || 0,
                calloutFee:  Number(t.callout_fee) || 0,
                urgent,
              });
              return (
                <TouchableOpacity key={t.id} style={[s.card, on&&s.cardOn]} onPress={()=>setSvc(t.id)}>
                  <Text style={s.cardIcon}>{t.icon}</Text>
                  <View style={{flex:1}}>
                    <Text style={s.cardName}>{t.name}</Text>
                    <Text style={s.cardDesc}>{t.description}</Text>
                    <Text style={s.cardTime}>Usually about {t.typical_minutes} min on site</Text>
                  </View>
                  <View style={{alignItems:'flex-end'}}>
                    {byQuote ? (
                      <>
                        <Text style={[s.cardPrice, on&&{color:C.primary}]}>
                          {t.price_min && t.price_max ? `€${t.price_min}–${t.price_max}` : '—'}
                        </Text>
                        <Text style={s.cardPriceSub}>they quote</Text>
                      </>
                    ) : (
                      <>
                        <Text style={[s.cardPrice, on&&{color:C.primary}]}>€{q.clientPays.toFixed(0)}</Text>
                        <Text style={s.cardPriceSub}>all in</Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}

            <Text style={s.lbl}>How soon?</Text>
            <View style={s.urgRow}>
              {[
                { k:true,  l:'Right now',    d:'Nearest provider comes straight away' },
                { k:false, l:'Within a day', d:'Cheaper — you agree a time together' },
              ].map(o=>(
                <TouchableOpacity key={String(o.k)}
                  style={[s.urgCard, urgent===o.k&&s.urgCardOn]}
                  onPress={()=>setUrgent(o.k)}>
                  <Text style={[s.urgLbl, urgent===o.k&&s.urgLblOn]}>{o.l}</Text>
                  <Text style={s.urgDesc}>{o.d}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {urgent && (
              <Text style={s.urgNote}>Immediate callouts carry a 25% surcharge.</Text>
            )}
          </View>
        )}

        {/* 1 — where are you */}
        {step===1 && (
          <View style={s.step}>
            <Text style={s.stepIntro}>Where are you?</Text>
            <Text style={s.hint}>
              We send your exact position so the provider drives straight to you.
              It goes only to the provider who accepts, and is deleted after 90 days.
            </Text>

            {locBusy ? (
              <View style={s.locBox}>
                <ActivityIndicator color={C.primary}/>
                <Text style={s.locBusyTxt}>Finding your position…</Text>
              </View>
            ) : coords ? (
              <View style={s.locFound}>
                <View style={s.locFoundHead}>
                  <Text style={s.locPin}>📍</Text>
                  <View style={{flex:1}}>
                    <Text style={s.locLabel}>{locLabel}</Text>
                    <Text style={s.locCoords}>
                      {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                      {coords.accuracy ? ` · ±${Math.round(coords.accuracy)}m` : ''}
                    </Text>
                  </View>
                </View>
                <View style={s.locBtns}>
                  <TouchableOpacity style={s.locBtn}
                    onPress={()=>Linking.openURL(mapsLink(coords))}>
                    <Text style={s.locBtnTxt}>🗺  Check on map</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.locBtn} onPress={askLocation}>
                    <Text style={s.locBtnTxt}>↻  Update</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={s.locDenied}>
                <Text style={s.locDeniedTitle}>
                  {locDenied ? 'We couldn\'t get your position' : 'Share your location'}
                </Text>
                <Text style={s.locDeniedTxt}>
                  {locDenied
                    ? 'Allow location in your browser, or type where you are below.'
                    : 'This is the fastest way for someone to reach you.'}
                </Text>
                <TouchableOpacity style={s.locCta} onPress={askLocation}>
                  <Text style={s.locCtaTxt}>📍  Use my location</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={s.lbl}>Or describe where you are</Text>
            <TextInput style={s.input} value={manualAddr} onChangeText={setManual}
              placeholder="e.g. Coast Road, near the Bahar ic-Caghaq turning"
              placeholderTextColor={C.muted} />

            <Text style={s.lbl}>Anything that helps them find you?</Text>
            <TextInput style={[s.input,{minHeight:80}]} value={locNote} onChangeText={setLocNote}
              placeholder="Hard shoulder, hazards on, silver car behind a white van…"
              placeholderTextColor={C.muted} multiline textAlignVertical="top" />
          </View>
        )}

        {/* 2 — the car */}
        {step===2 && (
          <View style={s.step}>
            <Text style={s.stepIntro}>Your vehicle</Text>
            <Text style={s.hint}>
              So they turn up with the right parts and tools.
            </Text>
            <Text style={s.lbl}>Make, model and plate</Text>
            <TextInput style={s.input} value={vehicle} onChangeText={setVehicle}
              placeholder="e.g. Toyota Yaris 2018, ABC 123"
              placeholderTextColor={C.muted} />

            {qs.length > 0 && (
              <>
                <ServiceQuestions questions={qs} answers={answers}
                  onChange={(id,v)=>setAnswers(a=>({...a,[id]:v}))} />

                {!isQuoteJob && adj.lines.length > 0 && p && (
                  <View style={s.runningBox}>
                    {adj.lines.map(x=>(
                      <View key={x.label} style={s.runningRow}>
                        <Text style={s.runningLbl}>{x.label}</Text>
                        <Text style={s.runningVal}>+€{x.amount.toFixed(2)}</Text>
                      </View>
                    ))}
                    <View style={s.runningTotal}>
                      <Text style={s.runningTotalLbl}>Running total</Text>
                      <Text style={s.runningTotalVal}>€{p.clientPays.toFixed(2)}</Text>
                    </View>
                  </View>
                )}
              </>
            )}
            <Text style={s.smallNote}>
              Optional, but it saves a phone call.
            </Text>
          </View>
        )}

        {/* 3 — confirm */}
        {step===3 && type && p && (
          <View style={s.step}>
            <Text style={s.stepIntro}>Send the request</Text>

            <View style={s.summCard}>
              {[
                ['Problem',  `${type.icon}  ${type.name}`],
                ['Where',    locLabel || manualAddr || '—'],
                ['Vehicle',  vehicle || 'Not given'],
                ['Timing',   urgent ? 'Right now' : 'Within a day'],
                ['On site',  `about ${type.typical_minutes} min`],
                ...qs.filter((q:any)=>answers[q.id]).map((q:any)=>[q.label, answers[q.id]]),
              ].map(([l,v])=>(
                <View key={l} style={s.summRow}>
                  <Text style={s.summLbl}>{l}</Text>
                  <Text style={s.summVal}>{v}</Text>
                </View>
              ))}
            </View>

            {isQuoteJob ? (
              <View style={s.quoteCard}>
                <Text style={s.quoteTitle}>💬  They'll quote you</Text>
                <Text style={s.quoteTxt}>
                  This one depends on the vehicle and the lock, so nobody can price it
                  blind. Send the request, answer their questions, and they'll give you
                  a figure before anyone travels.
                </Text>
                {type?.price_min && type?.price_max && (
                  <Text style={s.quoteRange}>
                    Usually between €{type.price_min} and €{type.price_max}.
                  </Text>
                )}
              </View>
            ) : (
            <View style={s.priceCard}>
              <Text style={s.priceTitle}>Fixed price</Text>
              {[
                ['Job',          `€${(p.labour - adj.labour).toFixed(2)}`],
                ...adj.lines.map(x=>[x.label, `€${x.amount.toFixed(2)}`]),
                ['Callout',      `€${p.callout.toFixed(2)}`],
                ...(p.urgentFee ? [['Immediate callout (25%)', `€${p.urgentFee.toFixed(2)}`]] : []),
                ['VAT 18%',      `€${p.vat.toFixed(2)}`],
                ['Card fee',     `€${p.stripeFee.toFixed(2)}`],
              ].map(([l,v])=>(
                <View key={String(l)} style={s.priceRow}>
                  <Text style={s.priceLbl}>{l}</Text>
                  <Text style={s.priceVal}>{v}</Text>
                </View>
              ))}
              <View style={s.totalRow}>
                <Text style={s.totalLbl}>You pay</Text>
                <Text style={s.totalVal}>€{p.clientPays.toFixed(2)}</Text>
              </View>
            </View>
            )}

            {failed ? (
              <View style={s.failBox}>
                <Text style={s.failTitle}>⚠️  Couldn't send that</Text>
                <Text style={s.failTxt}>{failed}</Text>
              </View>
            ) : null}

            <View style={s.fixedNote}>
              <Text style={s.fixedTitle}>🔒  This price is fixed</Text>
              <Text style={s.fixedTxt}>
                No timer and no hourly rate. If the job turns out to need parts
                beyond the standard fix, your provider quotes you separately before
                doing anything.
              </Text>
              <Text style={s.fixedTxt}>
                Nothing is charged until the work is done and you confirm it.
              </Text>
            </View>
          </View>
        )}

        <View style={{height:24}}/>
      </ScrollView>

      <View style={s.footer}>
        <View style={{flex:1}}>
          {isQuoteJob ? (
            <>
              <Text style={s.footerLbl}>Price</Text>
              <Text style={s.footerQuote}>After you talk</Text>
            </>
          ) : p ? (
            <>
              <Text style={s.footerLbl}>{urgent ? 'Right now · Fixed' : 'Fixed price'}</Text>
              <Text style={s.footerVal}>€{p.clientPays.toFixed(2)}</Text>
            </>
          ) : (
            <Text style={s.footerStep}>{STEPS[step]}</Text>
          )}
        </View>
        <TouchableOpacity
          style={[s.nextBtn, (!canContinue||submitting)&&s.nextBtnDis, step===STEPS.length-1&&s.sosBtn]}
          disabled={!canContinue||submitting}
          onPress={()=>step<STEPS.length-1?setStep(step+1):submit()}>
          {submitting ? <ActivityIndicator color={C.white}/> :
            <Text style={s.nextBtnTxt}>
              {!canContinue
                ? (step===0 ? 'Pick a problem' : 'Share or type where you are')
                : unanswered.length > 0 ? 'Answer the questions above'
                : step===2 && !vehicle && qs.length === 0 ? 'Skip  →'
                : step<STEPS.length-1 ? 'Continue  →'
                : isQuoteJob ? '💬  Send request' : '🚨  Send request'}
            </Text>}
        </TouchableOpacity>
      </View>
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
  dotOn:{backgroundColor:C.amber,borderColor:C.amber},
  dotTxt:{fontSize:11,fontWeight:'700',color:C.muted},
  dotTxtOn:{color:C.white},
  dotLbl:{fontSize:10,color:C.muted,fontWeight:'600'},
  dotLblOn:{color:C.amber},
  body:{flex:1,paddingHorizontal:20},
  step:{paddingBottom:16},
  stepIntro:{fontSize:22,fontWeight:'800',color:C.dark,marginTop:8,marginBottom:6},
  hint:{fontSize:13,color:C.muted,marginBottom:14,lineHeight:18},
  lbl:{fontSize:12,fontWeight:'700',color:C.muted,textTransform:'uppercase',letterSpacing:0.5,marginTop:24,marginBottom:8},
  smallNote:{fontSize:12,color:C.muted,marginTop:8},
  input:{backgroundColor:C.white,borderRadius:14,paddingHorizontal:16,paddingVertical:14,fontSize:15,color:C.text,borderWidth:1.5,borderColor:C.border},
  loadingBox:{paddingVertical:30,alignItems:'center'},

  noneBox:{backgroundColor:C.white,borderRadius:18,padding:28,alignItems:'center',gap:8,
    borderWidth:1,borderColor:C.border},
  noneIcon:{fontSize:42},
  noneTitle:{fontSize:16,fontWeight:'800',color:C.dark},
  noneTxt:{fontSize:13,color:C.muted,textAlign:'center',lineHeight:19},
  noneBtn:{backgroundColor:C.primary,borderRadius:12,paddingVertical:12,paddingHorizontal:22,marginTop:6},
  noneBtnTxt:{color:C.white,fontSize:14,fontWeight:'700'},
  card:{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:16,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginBottom:10,...S.sm},
  cardOn:{borderColor:C.amber,backgroundColor:C.amberLt,borderWidth:2},
  cardIcon:{fontSize:28},
  cardName:{fontSize:15,fontWeight:'700',color:C.dark},
  cardDesc:{fontSize:12,color:C.muted,marginTop:2,lineHeight:17},
  cardTime:{fontSize:11,color:C.muted,marginTop:4},
  cardPrice:{fontSize:20,fontWeight:'800',color:C.dark},
  cardPriceSub:{fontSize:10,color:C.muted},

  urgRow:{flexDirection:'row',gap:10},
  urgCard:{flex:1,padding:14,borderRadius:14,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white},
  urgCardOn:{borderColor:C.amber,backgroundColor:C.amberLt},
  urgLbl:{fontSize:14,fontWeight:'800',color:C.muted},
  urgLblOn:{color:C.amber},
  urgDesc:{fontSize:11,color:C.muted,marginTop:4,lineHeight:15},
  urgNote:{fontSize:11,color:C.amber,fontWeight:'700',marginTop:10},

  locBox:{backgroundColor:C.white,borderRadius:16,padding:28,alignItems:'center',gap:10,borderWidth:1,borderColor:C.border},
  locBusyTxt:{fontSize:13,color:C.muted},
  locFound:{backgroundColor:C.greenLt,borderRadius:16,padding:16,gap:12,borderWidth:1,borderColor:'#A7F3D0'},
  locFoundHead:{flexDirection:'row',gap:10,alignItems:'flex-start'},
  locPin:{fontSize:22},
  locLabel:{fontSize:15,fontWeight:'700',color:C.dark,lineHeight:20},
  locCoords:{fontSize:11,color:C.muted,marginTop:3},
  locBtns:{flexDirection:'row',gap:8},
  locBtn:{flex:1,backgroundColor:C.white,borderRadius:10,paddingVertical:10,alignItems:'center',borderWidth:1,borderColor:C.border},
  locBtnTxt:{fontSize:12,fontWeight:'700',color:C.text},
  locDenied:{backgroundColor:C.white,borderRadius:16,padding:18,gap:8,borderWidth:1.5,borderStyle:'dashed',borderColor:C.border},
  locDeniedTitle:{fontSize:15,fontWeight:'800',color:C.dark},
  locDeniedTxt:{fontSize:13,color:C.muted,lineHeight:18},
  locCta:{backgroundColor:C.primary,borderRadius:12,paddingVertical:13,alignItems:'center',marginTop:4},
  locCtaTxt:{color:C.white,fontSize:14,fontWeight:'700'},

  summCard:{backgroundColor:C.white,borderRadius:16,padding:16,marginBottom:14,...S.sm,borderWidth:1,borderColor:C.border},
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
  totalVal:{fontSize:20,fontWeight:'800',color:C.amber},
  fixedNote:{backgroundColor:C.amberLt,borderRadius:14,padding:16,gap:8,borderWidth:1,borderColor:'#FDE68A'},
  fixedTitle:{fontSize:14,fontWeight:'800',color:C.amber},
  fixedTxt:{fontSize:12,color:C.text,lineHeight:18},

  failBox:{backgroundColor:C.redLt,borderRadius:14,padding:14,gap:5,marginBottom:14,
    borderWidth:1,borderColor:'#FECACA'},
  failTitle:{fontSize:14,fontWeight:'800',color:C.red},
  failTxt:{fontSize:12,color:C.red,lineHeight:18},
  doneTitle:{fontSize:26,fontWeight:'800',color:C.dark,textAlign:'center'},
  doneSub:{fontSize:14,color:C.muted,textAlign:'center',lineHeight:21},
  doneCard:{backgroundColor:C.white,borderRadius:16,padding:16,marginBottom:14,
    borderWidth:1,borderColor:C.border,...S.sm},
  doneNote:{backgroundColor:C.primaryLt,borderRadius:16,padding:16,gap:6,marginBottom:20,
    borderWidth:1,borderColor:C.border},
  doneNoteTitle:{fontSize:15,fontWeight:'800',color:C.primary},
  doneNoteTxt:{fontSize:13,color:C.text,lineHeight:19},
  doneBtn:{backgroundColor:C.primary,borderRadius:16,paddingVertical:17,alignItems:'center',...S.md},
  doneBtnTxt:{color:C.white,fontSize:16,fontWeight:'700'},
  footer:{flexDirection:'row',alignItems:'center',paddingHorizontal:20,paddingVertical:16,backgroundColor:C.white,borderTopWidth:1,borderTopColor:C.border,gap:16},
  footerLbl:{fontSize:11,color:C.muted},
  footerVal:{fontSize:20,fontWeight:'800',color:C.dark},
  footerStep:{fontSize:13,color:C.muted,fontWeight:'600'},
  footerQuote:{fontSize:16,fontWeight:'800',color:C.teal},
  runningBox:{backgroundColor:C.white,borderRadius:12,padding:13,gap:6,marginTop:18,
    borderWidth:1,borderColor:C.border},
  runningRow:{flexDirection:'row',justifyContent:'space-between'},
  runningLbl:{fontSize:12,color:C.muted},
  runningVal:{fontSize:12,color:C.text,fontWeight:'700'},
  runningTotal:{flexDirection:'row',justifyContent:'space-between',paddingTop:8,marginTop:2,
    borderTopWidth:1,borderTopColor:C.border},
  runningTotalLbl:{fontSize:13,fontWeight:'800',color:C.dark},
  runningTotalVal:{fontSize:16,fontWeight:'800',color:C.amber},
  quoteCard:{backgroundColor:C.tealLt,borderRadius:16,padding:16,gap:8,marginBottom:14,
    borderWidth:1,borderColor:'#BAE6FD'},
  quoteTitle:{fontSize:15,fontWeight:'800',color:C.teal},
  quoteTxt:{fontSize:13,color:C.text,lineHeight:19},
  quoteRange:{fontSize:13,color:C.teal,fontWeight:'700'},
  nextBtn:{flex:1.6,backgroundColor:C.primary,borderRadius:14,paddingVertical:16,alignItems:'center',...S.md},
  sosBtn:{backgroundColor:C.red},
  nextBtnDis:{backgroundColor:C.muted},
  nextBtnTxt:{color:C.white,fontSize:15,fontWeight:'700'},
});
