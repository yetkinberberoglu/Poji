import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator
} from 'react-native';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { validatePhone } from '../constants/malta';

/**
 * Sends a WhatsApp code and checks it.
 * Shows a green confirmed row once done, so it can live inline in a form.
 */
export default function PhoneVerify({
  phone, verified, onVerified,
}: {
  phone: string;
  verified: boolean;
  onVerified: (phone: string) => void;
}) {
  const [stage, setStage]   = useState<'idle'|'sent'>('idle');
  const [code, setCode]     = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');
  const [cooldown, setCool] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCool(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const call = async (body: any) => {
    const { data, error: fnErr } = await supabase.functions.invoke('verify-phone', { body });
    if (fnErr) throw new Error(fnErr.message);
    return data;
  };

  const send = async () => {
    const v = validatePhone(phone);
    if (!v.ok) { setError(v.reason!); return; }
    setBusy(true); setError('');
    try {
      const r = await call({ action:'send', phone: v.value });
      if (!r?.ok) {
        setError(r?.error || 'Could not send the code');
        if (r?.retryIn) setCool(r.retryIn);
      } else {
        setStage('sent'); setCool(60);
      }
    } catch (e: any) {
      setError('Could not send the code. Check the number and try again.');
    }
    setBusy(false);
  };

  const check = async () => {
    if (code.length !== 6) { setError('Enter all six digits'); return; }
    setBusy(true); setError('');
    try {
      const r = await call({ action:'check', code });
      if (!r?.ok) setError(r?.error || 'That code did not work');
      else {
        const v = validatePhone(phone);
        onVerified(v.value || phone);
      }
    } catch {
      setError('Could not check the code. Try again.');
    }
    setBusy(false);
  };

  if (verified) {
    return (
      <View style={s.okRow}>
        <Text style={s.okTick}>✓</Text>
        <View style={{flex:1}}>
          <Text style={s.okTitle}>Number confirmed</Text>
          <Text style={s.okSub}>{phone}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.box}>
      {stage === 'idle' ? (
        <>
          <Text style={s.title}>Confirm this number</Text>
          <Text style={s.desc}>
            We'll WhatsApp you a six-digit code. Job alerts and PINs come to this
            number, so it has to be right.
          </Text>
          {error ? <Text style={s.err}>{error}</Text> : null}
          <TouchableOpacity
            style={[s.btn, (busy || cooldown > 0) && s.btnDis]}
            disabled={busy || cooldown > 0}
            onPress={send}>
            {busy ? <ActivityIndicator color={C.white} size="small" />
              : <Text style={s.btnTxt}>
                  {cooldown > 0 ? `Wait ${cooldown}s` : 'Send me a code'}
                </Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={s.title}>Enter the code</Text>
          <Text style={s.desc}>Sent on WhatsApp to {phone}</Text>

          <TextInput
            style={s.codeInput}
            value={code}
            onChangeText={t => { setCode(t.replace(/[^0-9]/g,'').slice(0,6)); setError(''); }}
            placeholder="— — — — — —"
            placeholderTextColor={C.muted}
            keyboardType="number-pad"
            maxLength={6}
          />

          {error ? <Text style={s.err}>{error}</Text> : null}

          <TouchableOpacity
            style={[s.btn, (busy || code.length !== 6) && s.btnDis]}
            disabled={busy || code.length !== 6}
            onPress={check}>
            {busy ? <ActivityIndicator color={C.white} size="small" />
              : <Text style={s.btnTxt}>Confirm</Text>}
          </TouchableOpacity>

          <View style={s.footRow}>
            <TouchableOpacity onPress={()=>{ setStage('idle'); setCode(''); setError(''); }}>
              <Text style={s.link}>Change number</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={cooldown > 0} onPress={send}>
              <Text style={[s.link, cooldown > 0 && {color:C.muted}]}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  box:{backgroundColor:C.primaryLt,borderRadius:16,padding:16,gap:10,marginTop:10,borderWidth:1,borderColor:C.border},
  title:{fontSize:15,fontWeight:'800',color:C.primary},
  desc:{fontSize:12,color:C.text,lineHeight:18},
  err:{fontSize:12,color:C.red,fontWeight:'700'},
  btn:{backgroundColor:C.primary,borderRadius:12,paddingVertical:13,alignItems:'center',marginTop:2},
  btnDis:{opacity:0.5},
  btnTxt:{color:C.white,fontSize:14,fontWeight:'700'},
  codeInput:{backgroundColor:C.white,borderRadius:12,paddingVertical:14,fontSize:26,fontWeight:'800',color:C.dark,textAlign:'center',letterSpacing:10,borderWidth:2,borderColor:C.primary},
  footRow:{flexDirection:'row',justifyContent:'space-between',marginTop:2},
  link:{fontSize:12,color:C.primary,fontWeight:'700'},
  okRow:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:C.greenLt,borderRadius:14,padding:14,marginTop:10,borderWidth:1,borderColor:'#A7F3D0'},
  okTick:{fontSize:20,color:C.green,fontWeight:'800'},
  okTitle:{fontSize:14,fontWeight:'800',color:C.green},
  okSub:{fontSize:12,color:C.text,marginTop:2},
});
