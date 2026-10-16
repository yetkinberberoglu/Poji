import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { routeHome } from '../lib/route-home';
import Logo from '../components/Logo';

/**
 * Setting a new password, from either direction.
 *
 * Two ways somebody arrives here, and they need different proof:
 *
 *   recovery   They clicked the link in a reset email. The link itself
 *              is the proof - they can read that mailbox - so no old
 *              password is asked for. They almost certainly cannot
 *              remember it, which is why they are here.
 *
 *   signed in  They opened it from their profile. The current password
 *              IS asked for, and checked, because Supabase will change a
 *              password on the strength of the session alone. Anybody
 *              who got hold of an unlocked phone or a borrowed laptop
 *              could otherwise lock the owner out of their own account
 *              in four taps.
 *
 * Until this screen existed, "Forgot password?" sent an email whose link
 * signed the person in and dropped them on the home screen. It read as
 * working. It was a single-use login: the password was never changed, so
 * the next sign-in failed exactly as before.
 */
export default function SetPassword() {
  const params = useLocalSearchParams<{ recovery?: string }>();
  const recovery = params.recovery === '1';

  const [email, setEmail]   = useState('');
  const [current, setCur]   = useState('');
  const [next, setNext]     = useState('');
  const [again, setAgain]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');
  const [done, setDone]     = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      /* No session means the recovery link has expired or was opened in
         a different browser from the one that asked for it. Saying so is
         kinder than a blank form that fails on submit. */
      if (!user) { router.replace('/auth'); return; }
      setEmail(user.email || '');
    })();
  }, []);

  const problem = (): string => {
    if (!recovery && !current) return 'Enter your current password.';
    if (next.length < 8)       return 'The new password needs at least 8 characters.';
    if (next !== again)        return 'The two new passwords do not match.';
    if (!recovery && next === current) return 'That is the password you already have.';
    return '';
  };

  const save = async () => {
    setError('');
    const p = problem();
    if (p) { setError(p); return; }

    setBusy(true);

    /* Checked by signing in with it, which is the only way to verify a
       password against Supabase from the client. It costs one request
       and it is what stops a borrowed session changing the password. */
    if (!recovery) {
      const { error: wrong } = await supabase.auth.signInWithPassword({
        email, password: current,
      });
      if (wrong) {
        setBusy(false);
        setError('That current password is not right.');
        return;
      }
    }

    const { error: failed } = await supabase.auth.updateUser({ password: next });
    setBusy(false);

    if (failed) {
      setError(failed.message || 'That did not save. Try again.');
      return;
    }

    setDone(true);
  };

  if (done) {
    return (
      <View style={s.wrap}>
        <View style={s.doneBox}>
          <Text style={s.doneIcon}>✓</Text>
          <Text style={s.doneTitle}>Password changed</Text>
          <Text style={s.doneTxt}>
            Use the new one next time you sign in. You are still signed in here.
          </Text>
          <TouchableOpacity style={s.primary} onPress={()=>routeHome()}>
            <Text style={s.primaryTxt}>Carry on</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex:1 }}
      behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={s.wrap} contentContainerStyle={s.container}
        keyboardShouldPersistTaps="handled">

        <View style={s.logoWrap}>
          <View style={s.logoShadow}><Logo size={64} /></View>
          <Text style={s.title}>
            {recovery ? 'Choose a new password' : 'Change your password'}
          </Text>
          {!!email && <Text style={s.sub}>{email}</Text>}
        </View>

        {recovery && (
          <View style={s.note}>
            <Text style={s.noteTxt}>
              You got here from the link in your email, so there is no need to
              remember the old password.
            </Text>
          </View>
        )}

        <View style={s.card}>
          {!recovery && (
            <>
              <Text style={s.lbl}>Current password</Text>
              <TextInput style={s.input} value={current} onChangeText={setCur}
                secureTextEntry autoComplete="current-password"
                placeholder="The one you use now" placeholderTextColor={C.muted} />
            </>
          )}

          <Text style={s.lbl}>New password</Text>
          <TextInput style={s.input} value={next} onChangeText={setNext}
            secureTextEntry autoComplete="new-password"
            placeholder="At least 8 characters" placeholderTextColor={C.muted} />

          <Text style={s.lbl}>New password again</Text>
          <TextInput style={s.input} value={again} onChangeText={setAgain}
            secureTextEntry autoComplete="new-password"
            placeholder="Type it once more" placeholderTextColor={C.muted} />

          {!!error && (
            <View style={s.errBox}><Text style={s.errTxt}>⚠️  {error}</Text></View>
          )}

          <TouchableOpacity style={[s.primary, busy&&{opacity:0.6}]}
            disabled={busy} onPress={save}>
            {busy ? <ActivityIndicator color={C.white} />
                  : <Text style={s.primaryTxt}>Save new password</Text>}
          </TouchableOpacity>

          {!recovery && (
            <TouchableOpacity style={s.cancel} onPress={()=>router.back()}>
              <Text style={s.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  container:{paddingHorizontal:20,paddingTop:56,paddingBottom:40,gap:20,
    maxWidth:520,width:'100%',alignSelf:'center'},
  logoWrap:{alignItems:'center',gap:8},
  logoShadow:{...S.sm},
  title:{fontSize:22,fontWeight:'800',color:C.dark,textAlign:'center'},
  sub:{fontSize:13,color:C.muted},

  note:{backgroundColor:C.primaryLt,borderRadius:12,padding:13,
    borderWidth:1,borderColor:C.border},
  noteTxt:{fontSize:12,color:C.text,lineHeight:18},

  card:{backgroundColor:C.white,borderRadius:18,padding:18,gap:6,
    borderWidth:1,borderColor:C.border,...S.sm},
  lbl:{fontSize:11,fontWeight:'700',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.5,marginTop:8},
  input:{backgroundColor:C.bg,borderRadius:12,paddingHorizontal:14,paddingVertical:12,
    fontSize:15,color:C.text,borderWidth:1.5,borderColor:C.border},

  errBox:{backgroundColor:C.redLt,borderRadius:10,padding:11,marginTop:12,
    borderWidth:1,borderColor:'#FECACA'},
  errTxt:{fontSize:12,color:C.red,fontWeight:'600'},

  primary:{backgroundColor:C.primary,borderRadius:14,paddingVertical:15,
    alignItems:'center',marginTop:16},
  primaryTxt:{color:C.white,fontWeight:'700',fontSize:15},
  cancel:{alignItems:'center',paddingVertical:12},
  cancelTxt:{color:C.muted,fontWeight:'600',fontSize:14},

  doneBox:{flex:1,justifyContent:'center',alignItems:'center',paddingHorizontal:30,gap:10},
  doneIcon:{fontSize:44,color:C.green},
  doneTitle:{fontSize:22,fontWeight:'800',color:C.dark},
  doneTxt:{fontSize:14,color:C.muted,textAlign:'center',lineHeight:21},
});
