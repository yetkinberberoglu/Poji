import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { MALTA_LOCALITIES } from '../constants/malta';
import { supabase } from '../lib/supabase';
import PhoneVerify from '../components/PhoneVerify';
import Picker from '../components/Picker';
import { validatePhone } from '../constants/malta';

export default function ClientSetup() {
  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError]     = useState('');

  const [f, setF] = useState<any>({
    first_name:'', last_name:'', phone:'',
    default_address:'', default_locality:'',
    whatsapp_opt_in:true, phone_verified:false,
  });

  const set = (k:string, v:any) => {
    setF((p:any)=>({
      ...p, [k]: v,
      ...(k === 'phone' ? { phone_verified: false } : {}),
    }));
    setMissing([]); setError('');
  };

  useEffect(() => {
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/auth'); return; }

      const { data } = await supabase.from('client_profiles').select('*').eq('id', user.id).maybeSingle();
      if (data) {
        setF((p:any)=>({ ...p, ...Object.fromEntries(Object.entries(data).filter(([_,v])=>v!==null)) }));
        if (data.onboarding_done) { router.replace('/(tabs)/home'); return; }
      } else {
        const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
        if (prof?.full_name) {
          const parts = prof.full_name.split(' ');
          setF((p:any)=>({ ...p, first_name: parts[0]||'', last_name: parts.slice(1).join(' ')||'' }));
        }
      }
    })();
  }, []);

  const validate = (s:number): string[] => {
    const m:string[] = [];
    if (s===0) {
      if (!f.first_name) m.push('First name');
      if (!f.last_name)  m.push('Last name');
      const ph = validatePhone(f.phone);
      if (!ph.ok) m.push(ph.reason!);
      else if (!f.phone_verified) m.push('Confirm your mobile with the code we send');
    }
    if (s===1) {
      if (!f.default_address)  m.push('Your address');
      if (!f.default_locality) m.push('Your locality');
    }
    return m;
  };

  const save = async (done:boolean) => {
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { error: e } = await supabase.from('client_profiles').upsert({
      id: user.id,
      first_name: f.first_name,
      last_name: f.last_name,
      phone: validatePhone(f.phone).value || f.phone,
      phone_verified: !!f.phone_verified,
      email: user.email,
      default_address: f.default_address,
      default_locality: f.default_locality,
      whatsapp_opt_in: f.whatsapp_opt_in,
      onboarding_done: done,
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
    setLoading(true);
    const ok = await save(step === 1);
    setLoading(false);
    if (!ok) return;
    if (step === 0) setStep(1);
    else router.replace('/(tabs)/home');
  };

  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <View style={s.wrap}>
        <View style={s.hdr}>
          {step > 0 ? (
            <TouchableOpacity onPress={()=>setStep(step-1)}>
              <Text style={s.back}>← Back</Text>
            </TouchableOpacity>
          ) : <View style={{width:60}} />}
          <Text style={s.title}>Welcome to Poji</Text>
          <Text style={s.stepNum}>{step+1}/2</Text>
        </View>

        <View style={s.progress}>
          {['Your details','Your home'].map((x,i)=>(
            <View key={x} style={s.pItem}>
              <View style={[s.dot, i<=step&&s.dotOn]}>
                <Text style={[s.dotTxt, i<=step&&s.dotTxtOn]}>{i<step?'✓':i+1}</Text>
              </View>
              <Text style={[s.dotLbl, i===step&&s.dotLblOn]}>{x}</Text>
            </View>
          ))}
        </View>

        <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
          {missing.length > 0 && (
            <View style={s.errBox}>
              <Text style={s.errTitle}>Please complete these fields:</Text>
              {missing.map(m => <Text key={m} style={s.errItem}>•  {m}</Text>)}
            </View>
          )}
          {error ? <View style={s.errBox}><Text style={s.errItem}>⚠️  {error}</Text></View> : null}

          {step===0 && (
            <View style={s.step}>
              <Text style={s.intro}>
                We just need a few details so your cleaner knows who to expect and how to reach you.
              </Text>

              <View style={s.row2}>
                <View style={{flex:1}}>
                  <Text style={s.lbl}>First name</Text>
                  <TextInput style={s.input} value={f.first_name} onChangeText={(t:string)=>set('first_name',t)}
                    placeholder="Yetkin" placeholderTextColor={C.muted} autoCapitalize="words" />
                </View>
                <View style={{flex:1}}>
                  <Text style={s.lbl}>Last name</Text>
                  <TextInput style={s.input} value={f.last_name} onChangeText={(t:string)=>set('last_name',t)}
                    placeholder="Berberoglu" placeholderTextColor={C.muted} autoCapitalize="words" />
                </View>
              </View>

              <Text style={s.lbl}>Mobile number</Text>
              <TextInput style={s.input} value={f.phone} onChangeText={(t:string)=>set('phone',t)}
                placeholder="+356 7900 0000" placeholderTextColor={C.muted} keyboardType="phone-pad" />
              <Text style={s.hint}>
                Your provider uses this to reach you on the day. We also send your
                job PIN here.
              </Text>

              {validatePhone(f.phone).ok && (
                <PhoneVerify
                  phone={validatePhone(f.phone).value || f.phone}
                  verified={!!f.phone_verified}
                  onVerified={(v)=>{ setF((p:any)=>({...p, phone:v, phone_verified:true})); setMissing([]); }}
                />
              )}

              <TouchableOpacity style={[s.optCard, f.whatsapp_opt_in&&s.optCardOn]}
                onPress={()=>set('whatsapp_opt_in', !f.whatsapp_opt_in)}>
                <View style={[s.check, f.whatsapp_opt_in&&s.checkOn]}>
                  {f.whatsapp_opt_in && <Text style={s.checkTxt}>✓</Text>}
                </View>
                <View style={{flex:1}}>
                  <Text style={s.optLabel}>Send me WhatsApp updates</Text>
                  <Text style={s.optDesc}>
                    Booking confirmed, cleaner on the way, job finished. No marketing.
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {step===1 && (
            <View style={s.step}>
              <Text style={s.intro}>
                We'll use this as your default address. You can change it on any booking.
              </Text>

              <Text style={s.lbl}>Address</Text>
              <TextInput style={s.input} value={f.default_address} onChangeText={(t:string)=>set('default_address',t)}
                placeholder="Flat 4, 12 Tower Road" placeholderTextColor={C.muted} />

              <Text style={s.lbl}>Locality</Text>
              <Picker
                value={f.default_locality}
                options={MALTA_LOCALITIES}
                onChange={(v)=>set('default_locality', v)}
                placeholder="Where is it?"
                title="Locality"
              />

              <View style={s.summary}>
                <Text style={s.summaryTitle}>You're all set</Text>
                {[
                  ['Name',  `${f.first_name} ${f.last_name}`],
                  ['Phone', f.phone],
                  ['Home',  `${f.default_address}${f.default_locality?', '+f.default_locality:''}`],
                  ['WhatsApp', f.whatsapp_opt_in ? 'On' : 'Off'],
                ].map(([k,v])=>(
                  <View key={k} style={s.summaryRow}>
                    <Text style={s.summaryKey}>{k}</Text>
                    <Text style={s.summaryVal}>{v || '—'}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          <View style={{height:24}} />
        </ScrollView>

        <View style={s.footer}>
          <TouchableOpacity style={[s.btn, loading&&s.btnDis]} onPress={next} disabled={loading}>
            {loading ? <ActivityIndicator color={C.white} />
              : <Text style={s.btnTxt}>{step===0 ? 'Continue  →' : '✓  Start booking'}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:60,paddingBottom:12},
  back:{fontSize:16,color:C.primary,fontWeight:'600',width:60},
  title:{fontSize:17,fontWeight:'700',color:C.dark},
  stepNum:{fontSize:13,color:C.muted,width:60,textAlign:'right'},
  progress:{flexDirection:'row',paddingHorizontal:60,marginBottom:14},
  pItem:{flex:1,alignItems:'center',gap:6},
  dot:{width:30,height:30,borderRadius:15,backgroundColor:C.bgAlt,borderWidth:2,borderColor:C.border,alignItems:'center',justifyContent:'center'},
  dotOn:{backgroundColor:C.primary,borderColor:C.primary},
  dotTxt:{fontSize:12,fontWeight:'700',color:C.muted},
  dotTxtOn:{color:C.white},
  dotLbl:{fontSize:11,color:C.muted,fontWeight:'600'},
  dotLblOn:{color:C.primary},
  body:{flex:1,paddingHorizontal:20},
  step:{paddingBottom:16},
  intro:{fontSize:14,color:C.muted,lineHeight:21,marginTop:8},
  lbl:{fontSize:12,fontWeight:'700',color:C.muted,textTransform:'uppercase',letterSpacing:0.5,marginTop:20,marginBottom:8},
  hint:{fontSize:12,color:C.muted,marginTop:6,lineHeight:17},
  input:{backgroundColor:C.white,borderRadius:14,paddingHorizontal:16,paddingVertical:14,fontSize:15,color:C.text,borderWidth:1.5,borderColor:C.border},
  row2:{flexDirection:'row',gap:12},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
  chip:{paddingHorizontal:14,paddingVertical:10,borderRadius:12,backgroundColor:C.white,borderWidth:1.5,borderColor:C.border},
  chipOn:{backgroundColor:C.primary,borderColor:C.primary},
  chipTxt:{fontSize:13,fontWeight:'600',color:C.muted},
  chipTxtOn:{color:C.white},
  optCard:{flexDirection:'row',alignItems:'flex-start',gap:12,padding:16,borderRadius:14,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginTop:24},
  optCardOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  check:{width:24,height:24,borderRadius:7,borderWidth:2,borderColor:C.border,alignItems:'center',justifyContent:'center',marginTop:1},
  checkOn:{backgroundColor:C.primary,borderColor:C.primary},
  checkTxt:{color:C.white,fontSize:14,fontWeight:'800'},
  optLabel:{fontSize:14,fontWeight:'700',color:C.dark},
  optDesc:{fontSize:12,color:C.muted,marginTop:4,lineHeight:18},
  summary:{backgroundColor:C.white,borderRadius:16,padding:16,marginTop:24,borderWidth:1,borderColor:C.border,...S.sm},
  summaryTitle:{fontSize:15,fontWeight:'800',color:C.dark,marginBottom:10},
  summaryRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:7,borderBottomWidth:1,borderBottomColor:C.bg,gap:12},
  summaryKey:{fontSize:13,color:C.muted,fontWeight:'600'},
  summaryVal:{fontSize:13,color:C.text,fontWeight:'700',flex:1,textAlign:'right'},
  errBox:{backgroundColor:C.redLt,borderRadius:12,padding:14,marginTop:12,borderWidth:1,borderColor:'#FECACA'},
  errTitle:{fontSize:13,color:C.red,fontWeight:'800',marginBottom:6},
  errItem:{fontSize:13,color:C.red,fontWeight:'600',lineHeight:20},
  footer:{paddingHorizontal:20,paddingVertical:16,backgroundColor:C.white,borderTopWidth:1,borderTopColor:C.border},
  btn:{backgroundColor:C.primary,borderRadius:16,paddingVertical:17,alignItems:'center',...S.md},
  btnDis:{opacity:0.6},
  btnTxt:{color:C.white,fontSize:16,fontWeight:'700'},
});
