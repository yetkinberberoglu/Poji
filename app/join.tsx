import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator
} from 'react-native';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { CATEGORIES, tradesIn, findTrade } from '../constants/trades';
import { MALTA_MAIN, GOZO_LOCALITIES, validatePhone } from '../constants/malta';
import { MultiPicker } from '../components/Picker';
import PhoneVerify from '../components/PhoneVerify';
import AvailabilityGrid from '../components/AvailabilityGrid';
import { DEFAULT_AVAILABILITY, countSlots, type Availability } from '../lib/availability';

const STEPS = ['Your trades', 'Where', 'When', 'Your rate'];

/**
 * The two-minute version of signing up.
 * Enough to show someone the work in their area — nothing more.
 * ID and bank details come later, once they can see it's worth it.
 */
export default function Join() {
  const [step, setStep]       = useState(0);
  const [busy, setBusy]       = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError]     = useState('');
  const [checking, setCheck]  = useState(true);

  const [f, setF] = useState<any>({
    first_name:'', last_name:'', phone:'', phone_verified:false,
    categories:[] as string[],
    covers_all_malta:false, covers_all_gozo:false,
    service_areas:[] as string[],
    hourly_rate:'', min_hours:'2',
    accepts_urgent:false, service_radius_km:'15',
    availability: DEFAULT_AVAILABILITY as Availability,
    notice_hours:'12',
  });

  const set = (k:string, v:any) => {
    setF((p:any)=>({
      ...p, [k]: v,
      ...(k === 'phone' ? { phone_verified:false } : {}),
    }));
    setMissing([]); setError('');
  };

  const myTrades  = f.categories.map((id:string)=>findTrade(id)).filter(Boolean);
  const hasHourly = myTrades.some((t:any)=>t.pricing === 'hourly');
  const hasRoad   = myTrades.some((t:any)=>t.roadside);

  // already started? pick up where they left off
  useEffect(() => {
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/auth'); return; }

      const { data } = await supabase.from('cleaner_profiles')
        .select('*').eq('id', user.id).maybeSingle();

      if (data?.signup_stage && data.signup_stage !== 'basic') {
        router.replace('/(provider)/jobs'); return;
      }

      if (data) {
        setF((p:any)=>({
          ...p,
          ...Object.fromEntries(Object.entries(data).filter(([_,v])=>v!==null)),
          hourly_rate: data.hourly_rate ? String(data.hourly_rate) : '',
          min_hours:   String(data.min_hours ?? 2),
          categories:  data.categories || [],
          service_areas: data.service_areas || [],
          availability: data.availability || DEFAULT_AVAILABILITY,
          notice_hours: String(data.notice_hours ?? 12),
        }));
      } else {
        const { data: prof } = await supabase.from('profiles')
          .select('full_name, phone, phone_verified').eq('id', user.id).maybeSingle();
        const parts = (prof?.full_name || '').split(' ');
        setF((p:any)=>({
          ...p,
          first_name: parts[0] || '',
          last_name:  parts.slice(1).join(' ') || '',
          phone:      prof?.phone || '',
          phone_verified: !!prof?.phone_verified,
        }));
      }
      setCheck(false);
    })();
  }, []);

  const validate = (s:number): string[] => {
    const m: string[] = [];
    if (s===0) {
      if (!f.first_name.trim()) m.push('Your first name');
      if (!f.last_name.trim())  m.push('Your last name');
      const ph = validatePhone(f.phone);
      if (!ph.ok) m.push(ph.reason!);
      else if (!f.phone_verified) m.push('Confirm your number with the code');
      if (!f.categories.length) m.push('Pick at least one trade');
    }
    if (s===1) {
      if (!f.covers_all_malta && !f.covers_all_gozo && f.service_areas.length === 0)
        m.push('Where you work');
    }
    if (s===2) {
      if (countSlots(f.availability) === 0) m.push('Tick at least one time slot');
    }
    if (s===3) {
      if (hasHourly) {
        if (!f.hourly_rate || Number(f.hourly_rate) <= 0) m.push('Your hourly rate');
        else if (Number(f.hourly_rate) < 8) m.push('That is below the Malta minimum wage');
      }
    }
    return m;
  };

  const save = async (final: boolean) => {
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) return false;

    const areas = f.covers_all_malta && f.covers_all_gozo ? ['All Malta','All Gozo']
      : f.covers_all_malta ? ['All Malta', ...f.service_areas.filter((a:string)=>GOZO_LOCALITIES.includes(a))]
      : f.covers_all_gozo  ? ['All Gozo',  ...f.service_areas.filter((a:string)=>MALTA_MAIN.includes(a))]
      : f.service_areas;

    const { error: e } = await supabase.from('cleaner_profiles').upsert({
      id: user.id,
      first_name: f.first_name.trim(),
      last_name:  f.last_name.trim(),
      phone: validatePhone(f.phone).value || f.phone,
      phone_verified: !!f.phone_verified,
      categories: f.categories,
      covers_all_malta: !!f.covers_all_malta,
      covers_all_gozo:  !!f.covers_all_gozo,
      service_areas: areas.length ? areas : ['Malta'],
      hourly_rate: Number(f.hourly_rate) || 0,
      min_hours:   Number(f.min_hours) || 2,
      accepts_urgent: !!f.accepts_urgent,
      availability: f.availability,
      notice_hours: Number(f.notice_hours) || 12,
      service_radius_km: Number(f.service_radius_km) || 15,
      signup_stage: 'basic',
      verification_status: 'basic',
      available: false,          // can't take work until verified
      updated_at: new Date().toISOString(),
    });

    if (e) { setError(e.message); return false; }

    await supabase.from('profiles')
      .update({ full_name: `${f.first_name} ${f.last_name}`.trim() })
      .eq('id', user.id);

    return true;
  };

  const next = async () => {
    const m = validate(step);
    if (m.length) { setMissing(m); return; }
    setBusy(true);
    const ok = await save(step === STEPS.length - 1);
    setBusy(false);
    if (!ok) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else router.replace('/(provider)/jobs');
  };

  if (checking) {
    return <View style={s.center}><ActivityIndicator color={C.primary} size="large" /></View>;
  }

  return (
    <View style={s.wrap}>
      <View style={s.hdr}>
        <TouchableOpacity onPress={()=>step>0?setStep(step-1):router.back()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Join as a provider</Text>
        <Text style={s.stepNum}>{step+1}/{STEPS.length}</Text>
      </View>

      <View style={s.progress}>
        {STEPS.map((x,i)=>(
          <View key={x} style={s.pItem}>
            <View style={[s.bar, i<=step&&s.barOn]} />
            <Text style={[s.pLbl, i===step&&s.pLblOn]}>{x}</Text>
          </View>
        ))}
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
        {missing.length > 0 && (
          <View style={s.errBox}>
            {missing.map(m => <Text key={m} style={s.errItem}>•  {m}</Text>)}
          </View>
        )}
        {error ? <View style={s.errBox}><Text style={s.errItem}>⚠️  {error}</Text></View> : null}

        {/* ── 0 · who and what ── */}
        {step===0 && (
          <View style={s.step}>
            <Text style={s.intro}>Let's get you listed</Text>
            <Text style={s.hint}>
              Two minutes. We'll show you the work in your area before asking for
              anything else.
            </Text>

            <View style={s.row2}>
              <View style={{flex:1}}>
                <Text style={s.lbl}>First name</Text>
                <TextInput style={s.input} value={f.first_name}
                  onChangeText={(t:string)=>set('first_name',t)}
                  placeholder="Maria" placeholderTextColor={C.muted} autoCapitalize="words" />
              </View>
              <View style={{flex:1}}>
                <Text style={s.lbl}>Last name</Text>
                <TextInput style={s.input} value={f.last_name}
                  onChangeText={(t:string)=>set('last_name',t)}
                  placeholder="Sciberras" placeholderTextColor={C.muted} autoCapitalize="words" />
              </View>
            </View>

            <Text style={s.lbl}>Mobile number</Text>
            <TextInput style={s.input} value={f.phone}
              onChangeText={(t:string)=>set('phone',t)}
              placeholder="+356 7900 0000" placeholderTextColor={C.muted}
              keyboardType="phone-pad" />
            <Text style={s.note}>Job alerts come here on WhatsApp.</Text>

            {validatePhone(f.phone).ok && (
              <PhoneVerify
                phone={validatePhone(f.phone).value || f.phone}
                verified={!!f.phone_verified}
                onVerified={(v)=>{ setF((p:any)=>({...p, phone:v, phone_verified:true})); setMissing([]); }}
              />
            )}

            <Text style={s.lbl}>What work do you do?</Text>
            <Text style={s.note}>Everything you're qualified for. You can change this later.</Text>

            {f.categories.length > 0 && (
              <View style={s.pickedBar}>
                <Text style={s.pickedTxt}>
                  {f.categories.length} selected
                </Text>
                <TouchableOpacity onPress={()=>set('categories', [])}>
                  <Text style={s.pickedClear}>Clear</Text>
                </TouchableOpacity>
              </View>
            )}

            {CATEGORIES.map(cat=>{
              const items  = tradesIn(cat.id);
              const chosen = items.filter(t=>f.categories.includes(t.id)).length;
              return (
                <View key={cat.id} style={s.group}>
                  <View style={s.groupHead}>
                    <Text style={s.groupTitle}>{cat.icon}  {cat.name}</Text>
                    {chosen>0 && (
                      <View style={s.count}><Text style={s.countTxt}>{chosen}</Text></View>
                    )}
                  </View>
                  <View style={s.pillWrap}>
                    {items.map(t=>{
                      const on = f.categories.includes(t.id);
                      return (
                        <TouchableOpacity key={t.id} style={[s.pill, on&&s.pillOn]}
                          onPress={()=>set('categories', on
                            ? f.categories.filter((x:string)=>x!==t.id)
                            : [...f.categories, t.id])}>
                          <Text style={[s.pillTxt, on&&s.pillTxtOn]}>
                            {on?'✓ ':''}{t.icon}  {t.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── 1 · where ── */}
        {step===1 && (
          <View style={s.step}>
            <Text style={s.intro}>Where will you work?</Text>
            <Text style={s.hint}>
              Only jobs in these areas reach you. Be realistic about what you'd drive to.
            </Text>

            <TouchableOpacity style={[s.checkRow, f.covers_all_malta&&s.checkRowOn]}
              onPress={()=>set('covers_all_malta', !f.covers_all_malta)}>
              <View style={[s.check, f.covers_all_malta&&s.checkOn]}>
                {f.covers_all_malta && <Text style={s.checkTxt}>✓</Text>}
              </View>
              <View style={{flex:1}}>
                <Text style={s.optLbl}>All of Malta</Text>
                <Text style={s.optDesc}>Every locality on the main island</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[s.checkRow, f.covers_all_gozo&&s.checkRowOn]}
              onPress={()=>set('covers_all_gozo', !f.covers_all_gozo)}>
              <View style={[s.check, f.covers_all_gozo&&s.checkOn]}>
                {f.covers_all_gozo && <Text style={s.checkTxt}>✓</Text>}
              </View>
              <View style={{flex:1}}>
                <Text style={s.optLbl}>All of Gozo and Comino</Text>
                <Text style={s.optDesc}>Including the ferry crossing</Text>
              </View>
            </TouchableOpacity>

            {!(f.covers_all_malta && f.covers_all_gozo) && (
              <>
                <Text style={s.lbl}>
                  {f.covers_all_malta ? 'Add Gozo localities'
                    : f.covers_all_gozo ? 'Add Malta localities'
                    : 'Or pick specific areas'}
                </Text>
                <MultiPicker
                  values={f.service_areas}
                  options={
                    f.covers_all_malta ? GOZO_LOCALITIES :
                    f.covers_all_gozo  ? MALTA_MAIN :
                    [...MALTA_MAIN, ...GOZO_LOCALITIES]
                  }
                  onChange={(v)=>set('service_areas', v)}
                  placeholder="Choose areas"
                  title="Where do you work?"
                />
              </>
            )}

            {hasRoad && (
              <View style={s.roadBox}>
                <Text style={s.roadTitle}>🛞  Roadside callouts</Text>
                <TouchableOpacity style={s.checkRowPlain}
                  onPress={()=>set('accepts_urgent', !f.accepts_urgent)}>
                  <View style={[s.check, f.accepts_urgent&&s.checkOn]}>
                    {f.accepts_urgent && <Text style={s.checkTxt}>✓</Text>}
                  </View>
                  <View style={{flex:1}}>
                    <Text style={s.optLbl}>I take emergencies</Text>
                    <Text style={s.optDesc}>Drop everything and go. Pays 25% more.</Text>
                  </View>
                </TouchableOpacity>
                <Text style={s.lbl}>How far will you drive?</Text>
                <View style={s.pillWrap}>
                  {[5,10,15,25,40].map(km=>(
                    <TouchableOpacity key={km}
                      style={[s.pill, Number(f.service_radius_km)===km&&s.pillOn]}
                      onPress={()=>set('service_radius_km', String(km))}>
                      <Text style={[s.pillTxt, Number(f.service_radius_km)===km&&s.pillTxtOn]}>
                        {km} km
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── 2 · hours ── */}
        {step===2 && (
          <View style={s.step}>
            <Text style={s.intro}>When can you work?</Text>
            <Text style={s.hint}>
              Only jobs in these slots reach you. Change it any time — most people
              adjust it after a week or two.
            </Text>

            <View style={{marginTop:16}}>
              <AvailabilityGrid
                value={f.availability}
                onChange={(v)=>set('availability', v)}
              />
            </View>

            <Text style={s.lbl}>How much notice do you need?</Text>
            <View style={s.pillWrap}>
              {[2,6,12,24,48].map(h=>(
                <TouchableOpacity key={h} style={[s.pill, Number(f.notice_hours)===h&&s.pillOn]}
                  onPress={()=>set('notice_hours', String(h))}>
                  <Text style={[s.pillTxt, Number(f.notice_hours)===h&&s.pillTxtOn]}>
                    {h < 24 ? `${h}h` : `${h/24} day${h>24?'s':''}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.note}>
              A job starting sooner than this won't be offered to you.
            </Text>
          </View>
        )}

        {/* ── 3 · rate ── */}
        {step===3 && (
          <View style={s.step}>
            <Text style={s.intro}>What do you charge?</Text>

            {hasHourly ? (
              <>
                <Text style={s.hint}>
                  You set this. Poji adds VAT for the client and keeps 20%.
                </Text>

                <Text style={s.lbl}>Hourly rate (EUR)</Text>
                <TextInput style={s.inputBig} value={String(f.hourly_rate)}
                  onChangeText={(t:string)=>set('hourly_rate',t.replace(/[^0-9.]/g,''))}
                  placeholder="—" placeholderTextColor={C.muted} keyboardType="decimal-pad" />
                <Text style={s.note}>
                  What people charge in Malta: cleaning €12–18, gardening €15–22,
                  handyman €20–30, electrician and plumber €30–45, specialists €40–60.
                </Text>

                {Number(f.hourly_rate) > 0 && (
                  <View style={s.calcBox}>
                    <View style={s.calcRow}>
                      <Text style={s.calcLbl}>Client pays per hour</Text>
                      <Text style={s.calcVal}>€{(Number(f.hourly_rate)*1.18).toFixed(2)}</Text>
                    </View>
                    <View style={s.calcRow}>
                      <Text style={s.calcLbl}>You keep</Text>
                      <Text style={[s.calcVal,{color:C.green,fontWeight:'800'}]}>
                        €{(Number(f.hourly_rate)*0.8).toFixed(2)}
                      </Text>
                    </View>
                    <View style={s.calcRow}>
                      <Text style={s.calcLbl}>A 4-hour job earns you</Text>
                      <Text style={[s.calcVal,{color:C.green,fontWeight:'800'}]}>
                        €{(Number(f.hourly_rate)*0.8*4).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                )}

                <Text style={s.lbl}>Minimum hours per job</Text>
                <View style={s.pillWrap}>
                  {[1,1.5,2,2.5,3,4].map(h=>(
                    <TouchableOpacity key={h} style={[s.pill, Number(f.min_hours)===h&&s.pillOn]}
                      onPress={()=>set('min_hours', String(h))}>
                      <Text style={[s.pillTxt, Number(f.min_hours)===h&&s.pillTxtOn]}>{h}h</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <View style={s.fixedBox}>
                <Text style={s.fixedTitle}>Your trades are fixed-price</Text>
                <Text style={s.fixedTxt}>
                  Callout work pays a set amount per job, not by the hour. You see the
                  price before you accept anything — no rate to set here.
                </Text>
              </View>
            )}

            <View style={s.nextBox}>
              <Text style={s.nextTitle}>What happens next</Text>
              {[
                ['You see the jobs', 'Open work in your areas, with what each pays'],
                ['Verify when ready', 'ID and a photo before your first job'],
                ['Add your bank', 'Only when you are due a payout'],
              ].map(([a,b])=>(
                <View key={a} style={s.nextRow}>
                  <Text style={s.nextDot}>•</Text>
                  <View style={{flex:1}}>
                    <Text style={s.nextA}>{a}</Text>
                    <Text style={s.nextB}>{b}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{height:28}} />
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={[s.btn, busy&&s.btnDis]} onPress={next} disabled={busy}>
          {busy ? <ActivityIndicator color={C.white} />
            : <Text style={s.btnTxt}>
                {step < STEPS.length-1 ? 'Continue  →' : 'Show me the work  →'}
              </Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:C.bg},
  hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
    paddingHorizontal:20,paddingTop:60,paddingBottom:14},
  back:{fontSize:16,color:C.primary,fontWeight:'600'},
  title:{fontSize:17,fontWeight:'700',color:C.dark},
  stepNum:{fontSize:13,color:C.muted},
  progress:{flexDirection:'row',paddingHorizontal:20,gap:8,marginBottom:10},
  pItem:{flex:1,gap:6},
  bar:{height:4,borderRadius:2,backgroundColor:C.border},
  barOn:{backgroundColor:C.primary},
  pLbl:{fontSize:10,color:C.muted,fontWeight:'600'},
  pLblOn:{color:C.primary},
  body:{flex:1,paddingHorizontal:20},
  step:{paddingBottom:16},
  intro:{fontSize:24,fontWeight:'800',color:C.dark,marginTop:10},
  hint:{fontSize:13,color:C.muted,lineHeight:19,marginTop:6,marginBottom:6},
  lbl:{fontSize:12,fontWeight:'700',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.5,marginTop:22,marginBottom:8},
  note:{fontSize:12,color:C.muted,lineHeight:17,marginTop:6},
  input:{backgroundColor:C.white,borderRadius:14,paddingHorizontal:16,paddingVertical:14,
    fontSize:15,color:C.text,borderWidth:1.5,borderColor:C.border},
  inputBig:{backgroundColor:C.white,borderRadius:14,paddingVertical:18,fontSize:28,
    fontWeight:'800',color:C.dark,borderWidth:2,borderColor:C.primary,textAlign:'center'},
  row2:{flexDirection:'row',gap:12},

  pickedBar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
    backgroundColor:C.primaryLt,borderRadius:12,paddingHorizontal:14,paddingVertical:10,
    marginTop:12,marginBottom:6,borderWidth:1,borderColor:C.border},
  pickedTxt:{fontSize:13,fontWeight:'800',color:C.primary},
  pickedClear:{fontSize:12,color:C.muted,fontWeight:'700'},
  group:{marginTop:14},
  groupHead:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8},
  groupTitle:{fontSize:13,fontWeight:'800',color:C.dark},
  count:{backgroundColor:C.primary,minWidth:20,height:20,borderRadius:10,
    alignItems:'center',justifyContent:'center',paddingHorizontal:6},
  countTxt:{fontSize:11,fontWeight:'800',color:C.white},
  pillWrap:{flexDirection:'row',flexWrap:'wrap',gap:8},
  pill:{paddingHorizontal:12,paddingVertical:9,borderRadius:20,backgroundColor:C.white,
    borderWidth:1.5,borderColor:C.border},
  pillOn:{backgroundColor:C.primary,borderColor:C.primary},
  pillTxt:{fontSize:12,fontWeight:'600',color:C.muted},
  pillTxtOn:{color:C.white},

  checkRow:{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:14,
    borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginTop:10},
  checkRowOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  checkRowPlain:{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderRadius:12,
    borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginTop:8},
  check:{width:22,height:22,borderRadius:7,borderWidth:2,borderColor:C.border,
    alignItems:'center',justifyContent:'center'},
  checkOn:{backgroundColor:C.primary,borderColor:C.primary},
  checkTxt:{color:C.white,fontSize:13,fontWeight:'800'},
  optLbl:{fontSize:14,fontWeight:'700',color:C.dark},
  optDesc:{fontSize:12,color:C.muted,marginTop:2},

  roadBox:{backgroundColor:C.amberLt,borderRadius:16,padding:16,marginTop:20,
    borderWidth:1,borderColor:'#FDE68A'},
  roadTitle:{fontSize:14,fontWeight:'800',color:C.amber},

  calcBox:{backgroundColor:C.bgAlt,borderRadius:14,padding:14,gap:8,marginTop:14,
    borderWidth:1,borderColor:C.border},
  calcRow:{flexDirection:'row',justifyContent:'space-between'},
  calcLbl:{fontSize:13,color:C.muted},
  calcVal:{fontSize:14,fontWeight:'700',color:C.dark},

  fixedBox:{backgroundColor:C.amberLt,borderRadius:16,padding:16,gap:6,marginTop:10,
    borderWidth:1,borderColor:'#FDE68A'},
  fixedTitle:{fontSize:15,fontWeight:'800',color:C.amber},
  fixedTxt:{fontSize:13,color:C.text,lineHeight:19},

  nextBox:{backgroundColor:C.white,borderRadius:16,padding:16,gap:10,marginTop:24,
    borderWidth:1,borderColor:C.border,...S.sm},
  nextTitle:{fontSize:15,fontWeight:'800',color:C.dark},
  nextRow:{flexDirection:'row',gap:10},
  nextDot:{fontSize:14,color:C.primary,fontWeight:'800'},
  nextA:{fontSize:13,fontWeight:'700',color:C.text},
  nextB:{fontSize:12,color:C.muted,marginTop:2,lineHeight:16},

  errBox:{backgroundColor:C.redLt,borderRadius:12,padding:14,marginTop:12,
    borderWidth:1,borderColor:'#FECACA',gap:2},
  errItem:{fontSize:13,color:C.red,fontWeight:'600',lineHeight:20},

  footer:{paddingHorizontal:20,paddingVertical:16,backgroundColor:C.white,
    borderTopWidth:1,borderTopColor:C.border},
  btn:{backgroundColor:C.primary,borderRadius:16,paddingVertical:17,alignItems:'center',...S.md},
  btnDis:{opacity:0.6},
  btnTxt:{color:C.white,fontSize:16,fontWeight:'700'},
});
