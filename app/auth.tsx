import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { C, S } from '../constants/theme';

export default function Auth() {
  const [mode, setMode]         = useState('login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole]         = useState('client');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  const clear = () => { setError(''); setSuccess(''); };

  const handleLogin = async () => {
    clear();
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) setError(err.message.includes('Invalid') ? 'Wrong email or password.' : err.message);
  };

  const handleRegister = async () => {
    clear();
    if (!fullName || !email || !password) { setError('Please fill in all fields.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    const { data, error: err } = await supabase.auth.signUp({
      email, password, options: { data: { full_name: fullName, role } },
    });
    if (err) { setLoading(false); setError(err.message); return; }
    if (data.user) {
      await supabase.from('profiles').upsert({ id: data.user.id, full_name: fullName, role });
    }
    setLoading(false);
    setSuccess('Account created! You can now log in.');
    setMode('login');
  };

  const handleReset = async () => {
    clear();
    if (!email) { setError('Enter your email first.'); return; }
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    setSuccess('Reset email sent! Check your inbox.');
  };

  return (
    <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={s.wrap} contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">

        <View style={s.logoWrap}>
          <View style={s.logo}><Text style={s.logoTxt}>P</Text></View>
          <Text style={s.brand}>Poji</Text>
          <Text style={s.sub}>Malta's home services marketplace</Text>
        </View>

        <View style={s.tabRow}>
          {['login','register'].map(m => (
            <TouchableOpacity key={m} style={[s.tab, mode===m && s.tabActive]} onPress={() => { setMode(m); clear(); }}>
              <Text style={[s.tabTxt, mode===m && s.tabTxtActive]}>{m==='login'?'Log In':'Sign Up'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {error  ? <View style={s.errorBox}><Text style={s.errorIcon}>⚠️</Text><Text style={s.errorTxt}>{error}</Text></View>  : null}
        {success? <View style={s.successBox}><Text style={s.successIcon}>✅</Text><Text style={s.successTxt}>{success}</Text></View>: null}

        <View style={s.form}>
          {mode==='register' && (
            <>
              <View style={s.field}>
                <Text style={s.label}>Full Name</Text>
                <TextInput style={s.input} placeholder="e.g. Yetkin Berberoglu" placeholderTextColor={C.muted}
                  value={fullName} onChangeText={(t:string)=>{setFullName(t);clear();}} autoCapitalize="words" />
              </View>
              <View style={s.field}>
                <Text style={s.label}>I am a...</Text>
                <View style={s.roleRow}>
                  {[{k:'client',icon:'👤',lbl:'Client',desc:'I need cleaning'},
                    {k:'cleaner',icon:'🧹',lbl:'Cleaner',desc:'I provide cleaning'}].map(r => (
                    <TouchableOpacity key={r.k} style={[s.roleBtn, role===r.k && s.roleBtnOn]} onPress={()=>setRole(r.k)}>
                      <Text style={s.roleIcon}>{r.icon}</Text>
                      <Text style={[s.roleLbl, role===r.k && s.roleLblOn]}>{r.lbl}</Text>
                      <Text style={s.roleDesc}>{r.desc}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}

          <View style={s.field}>
            <Text style={s.label}>Email</Text>
            <TextInput style={s.input} placeholder="you@example.com" placeholderTextColor={C.muted}
              value={email} onChangeText={(t:string)=>{setEmail(t);clear();}} autoCapitalize="none" keyboardType="email-address" />
          </View>

          <View style={s.field}>
            <Text style={s.label}>Password</Text>
            <TextInput style={s.input} placeholder="Min. 6 characters" placeholderTextColor={C.muted}
              value={password} onChangeText={(t:string)=>{setPassword(t);clear();}} secureTextEntry />
          </View>

          <TouchableOpacity style={[s.btn, loading && s.btnDis]}
            onPress={mode==='login'?handleLogin:handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color={C.white} /> :
              <Text style={s.btnTxt}>{mode==='login'?'Log In  →':'Create Account  →'}</Text>}
          </TouchableOpacity>

          {mode==='login' && (
            <TouchableOpacity style={s.forgot} onPress={handleReset}>
              <Text style={s.forgotTxt}>Forgot password?</Text>
            </TouchableOpacity>
          )}
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  container:{padding:24,paddingTop:80,paddingBottom:48,gap:16},
  logoWrap:{alignItems:'center',marginBottom:8},
  logo:{width:80,height:80,borderRadius:24,backgroundColor:C.primary,alignItems:'center',justifyContent:'center',marginBottom:14,...S.md},
  logoTxt:{color:C.white,fontSize:38,fontWeight:'800'},
  brand:{fontSize:34,fontWeight:'800',color:C.dark},
  sub:{fontSize:14,color:C.muted,marginTop:4},
  tabRow:{flexDirection:'row',backgroundColor:C.bgAlt,borderRadius:14,padding:4,borderWidth:1,borderColor:C.border},
  tab:{flex:1,paddingVertical:12,alignItems:'center',borderRadius:11},
  tabActive:{backgroundColor:C.white,...S.sm},
  tabTxt:{fontSize:15,fontWeight:'600',color:C.muted},
  tabTxtActive:{color:C.primary,fontWeight:'700'},
  errorBox:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:C.redLt,borderRadius:12,padding:14,borderWidth:1,borderColor:'#FECACA'},
  errorIcon:{fontSize:18},
  errorTxt:{flex:1,fontSize:14,color:C.red,fontWeight:'600',lineHeight:20},
  successBox:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:C.greenLt,borderRadius:12,padding:14,borderWidth:1,borderColor:'#A7F3D0'},
  successIcon:{fontSize:18},
  successTxt:{flex:1,fontSize:14,color:C.green,fontWeight:'600',lineHeight:20},
  form:{gap:14},
  field:{gap:6},
  label:{fontSize:13,fontWeight:'700',color:C.text},
  input:{backgroundColor:C.white,borderRadius:14,paddingHorizontal:16,paddingVertical:14,fontSize:15,color:C.text,borderWidth:1.5,borderColor:C.border},
  roleRow:{flexDirection:'row',gap:12},
  roleBtn:{flex:1,backgroundColor:C.white,borderRadius:16,padding:16,alignItems:'center',borderWidth:2,borderColor:C.border,gap:4},
  roleBtnOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  roleIcon:{fontSize:28},
  roleLbl:{fontSize:15,fontWeight:'700',color:C.muted},
  roleLblOn:{color:C.primary},
  roleDesc:{fontSize:11,color:C.muted,textAlign:'center'},
  btn:{backgroundColor:C.primary,borderRadius:16,paddingVertical:18,alignItems:'center',marginTop:4,...S.md},
  btnDis:{backgroundColor:C.muted},
  btnTxt:{color:C.white,fontSize:17,fontWeight:'700'},
  forgot:{alignItems:'center',paddingVertical:4},
  forgotTxt:{fontSize:13,color:C.primary,fontWeight:'600'},
});
