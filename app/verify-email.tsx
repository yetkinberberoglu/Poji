import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator
} from 'react-native';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';
import Logo from '../components/Logo';

export default function VerifyEmail() {
  const [email, setEmail]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [sent, setSent]     = useState(false);
  const [error, setError]   = useState('');
  const [cooldown, setCool] = useState(0);

  useEffect(() => {
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/auth'); return; }
      if (user.email_confirmed_at) { router.replace('/'); return; }
      setEmail(user.email || '');
    })();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(()=>setCool(c=>c-1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // poll — they'll click the link in another tab or on their phone
  useEffect(() => {
    const iv = setInterval(async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      if (user?.email_confirmed_at) { clearInterval(iv); router.replace('/'); }
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  const resend = async () => {
    setBusy(true); setError('');
    const { error: e } = await supabase.auth.resend({ type:'signup', email });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setSent(true); setCool(60);
  };

  const check = async () => {
    setBusy(true);
    const { data:{ user } } = await supabase.auth.getUser();
    setBusy(false);
    if (user?.email_confirmed_at) router.replace('/');
    else setError("Not confirmed yet — open the link in the email first.");
  };

  return (
    <View style={s.wrap}>
      <Logo size={64} />
      <Text style={s.icon}>📧</Text>
      <Text style={s.title}>Confirm your email</Text>
      <Text style={s.txt}>
        We sent a link to{'\n'}
        <Text style={s.email}>{email}</Text>
      </Text>
      <Text style={s.sub}>
        Open it and you'll come straight back here. Check your spam folder if it's
        not there after a minute.
      </Text>

      {error ? <Text style={s.err}>{error}</Text> : null}
      {sent  ? <Text style={s.ok}>Sent again — have another look.</Text> : null}

      <TouchableOpacity style={[s.btn, busy&&s.btnDis]} disabled={busy} onPress={check}>
        {busy ? <ActivityIndicator color={C.white}/> : <Text style={s.btnTxt}>I've confirmed it</Text>}
      </TouchableOpacity>

      <TouchableOpacity disabled={busy || cooldown>0} onPress={resend}>
        <Text style={[s.link, cooldown>0 && {color:C.muted}]}>
          {cooldown>0 ? `Resend in ${cooldown}s` : 'Send the email again'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={async()=>{
        try { await supabase.auth.signOut({scope:'local'}); } catch(e) {}
        router.replace('/auth');
      }}>
        <Text style={s.ghost}>Use a different email</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg,alignItems:'center',justifyContent:'center',padding:32,gap:12},
  icon:{fontSize:48,marginTop:8},
  title:{fontSize:24,fontWeight:'800',color:C.dark},
  txt:{fontSize:15,color:C.text,textAlign:'center',lineHeight:23},
  email:{fontWeight:'800',color:C.primary},
  sub:{fontSize:13,color:C.muted,textAlign:'center',lineHeight:19},
  err:{fontSize:13,color:C.red,fontWeight:'700',textAlign:'center'},
  ok:{fontSize:13,color:C.green,fontWeight:'700',textAlign:'center'},
  btn:{backgroundColor:C.primary,borderRadius:16,paddingVertical:16,paddingHorizontal:36,marginTop:8,...S.md},
  btnDis:{opacity:0.6},
  btnTxt:{color:C.white,fontSize:16,fontWeight:'700'},
  link:{fontSize:14,color:C.primary,fontWeight:'700',marginTop:6},
  ghost:{fontSize:13,color:C.muted,fontWeight:'600',marginTop:10},
});
