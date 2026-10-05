import {
  View, Text, StyleSheet, TouchableOpacity, Switch, Platform, ActivityIndicator
} from 'react-native';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { enablePush, disablePush, pushState, type PushState } from '../lib/push';

const QUIET = [
  { k:'off',   label:'Always on',  from:null,      to:null },
  { k:'night', label:'22:00–07:00',from:'22:00:00',to:'07:00:00' },
  { k:'late',  label:'23:00–08:00',from:'23:00:00',to:'08:00:00' },
];

/**
 * Turning notifications on, and deciding which ones.
 * A provider who misses a job offer earns nothing, so this matters more
 * to them than it does to a client.
 */
export default function PushSettings({ role }: { role: 'client' | 'cleaner' }) {
  const [state, setState] = useState<PushState>('unsupported');
  const [busy, setBusy]   = useState(false);
  const [prefs, setPrefs] = useState({
    push_enabled:true, push_jobs:true, push_messages:true, push_money:true,
    quiet_from:null as string|null, quiet_to:null as string|null,
  });
  const [loading, setLoad] = useState(true);

  useEffect(() => {
    setState(pushState());
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { setLoad(false); return; }
      const { data } = await supabase.from('profiles')
        .select('push_enabled, push_jobs, push_messages, push_money, quiet_from, quiet_to')
        .eq('id', user.id).maybeSingle();
      if (data) setPrefs(p => ({ ...p, ...data }));
      setLoad(false);
    })();
  }, []);

  const save = async (patch: Partial<typeof prefs>) => {
    setPrefs(p => ({ ...p, ...patch }));
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('profiles').update(patch).eq('id', user.id);
  };

  const turnOn = async () => {
    setBusy(true);
    const ok = await enablePush();
    setState(pushState());
    if (ok) await save({ push_enabled: true });
    setBusy(false);
  };

  const turnOff = async () => {
    setBusy(true);
    await disablePush();
    await save({ push_enabled: false });
    setState(pushState());
    setBusy(false);
  };

  if (loading) {
    return <View style={s.loading}><ActivityIndicator color={C.primary} size="small" /></View>;
  }

  const quietKey = !prefs.quiet_from ? 'off'
    : QUIET.find(q => q.from === prefs.quiet_from)?.k || 'off';

  // ── not available here ──
  if (state === 'unsupported') {
    return (
      <View style={s.box}>
        <Text style={s.title}>🔔  Notifications</Text>
        <Text style={s.txt}>
          {Platform.OS === 'web'
            ? 'Add Poji to your home screen first, then open it from there — notifications only work from the installed app.'
            : 'Not available on this device.'}
        </Text>
      </View>
    );
  }

  // ── refused in the browser ──
  if (state === 'denied') {
    return (
      <View style={s.boxWarn}>
        <Text style={s.title}>🔕  Notifications are blocked</Text>
        <Text style={s.txt}>
          {role === 'cleaner'
            ? "You won't hear about new jobs, and the first provider to accept takes them."
            : "You won't be told when your provider is on the way or at the door."}
        </Text>
        <Text style={s.txtSmall}>
          Turn them back on in your browser settings for po-ji.com, then reload.
        </Text>
      </View>
    );
  }

  // ── not asked yet ──
  if (state !== 'granted' || !prefs.push_enabled) {
    return (
      <View style={s.boxCall}>
        <Text style={s.title}>🔔  Turn on notifications</Text>
        <Text style={s.txt}>
          {role === 'cleaner'
            ? 'A job offer is yours for five minutes, then it goes to everyone. Without notifications you will miss most of them.'
            : "So you know the moment a provider accepts, sets off, or is standing at your door."}
        </Text>
        <TouchableOpacity style={[s.btn, busy&&s.dis]} disabled={busy} onPress={turnOn}>
          {busy ? <ActivityIndicator color={C.white} size="small" />
            : <Text style={s.btnTxt}>Turn them on</Text>}
        </TouchableOpacity>
      </View>
    );
  }

  // ── on, with the switches ──
  return (
    <View style={s.box}>
      <View style={s.head}>
        <Text style={s.title}>🔔  Notifications</Text>
        <TouchableOpacity onPress={turnOff} disabled={busy}>
          <Text style={s.off}>Turn off</Text>
        </TouchableOpacity>
      </View>

      {[
        { k:'push_jobs' as const,
          label: role === 'cleaner' ? 'Job offers and changes' : 'Your bookings',
          hint:  role === 'cleaner' ? 'New work, cancellations, time changes'
                                    : 'Accepted, on the way, at the door' },
        { k:'push_messages' as const, label:'Messages', hint:'When the other side writes' },
        { k:'push_money' as const,
          label: role === 'cleaner' ? 'Quotes and payments' : 'Quotes and bills',
          hint:  role === 'cleaner' ? 'Quote answers, parts approved, money released'
                                    : 'Prices to approve, parts, final bills' },
      ].map(row => (
        <View key={row.k} style={s.row}>
          <View style={{flex:1}}>
            <Text style={s.rowLabel}>{row.label}</Text>
            <Text style={s.rowHint}>{row.hint}</Text>
          </View>
          <Switch
            value={prefs[row.k] !== false}
            onValueChange={(v)=>save({ [row.k]: v } as any)}
            trackColor={{ false:C.border, true:C.green }}
            thumbColor={C.white}
          />
        </View>
      ))}

      <Text style={s.lbl}>Quiet hours</Text>
      <View style={s.chips}>
        {QUIET.map(q=>(
          <TouchableOpacity key={q.k} style={[s.chip, quietKey===q.k&&s.chipOn]}
            onPress={()=>save({ quiet_from:q.from, quiet_to:q.to })}>
            <Text style={[s.chipTxt, quietKey===q.k&&s.chipTxtOn]}>{q.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.quietNote}>
        Someone standing at your door still gets through.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  loading:{paddingVertical:20,alignItems:'center'},
  box:{marginHorizontal:20,marginTop:12,backgroundColor:C.white,borderRadius:16,
    padding:16,gap:10,borderWidth:1,borderColor:C.border,...S.sm},
  boxCall:{marginHorizontal:20,marginTop:12,backgroundColor:C.primaryLt,borderRadius:16,
    padding:16,gap:10,borderWidth:1.5,borderColor:C.primary},
  boxWarn:{marginHorizontal:20,marginTop:12,backgroundColor:C.amberLt,borderRadius:16,
    padding:16,gap:8,borderWidth:1,borderColor:'#FDE68A'},
  head:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  title:{fontSize:15,fontWeight:'800',color:C.dark},
  off:{fontSize:12,color:C.red,fontWeight:'700'},
  txt:{fontSize:13,color:C.text,lineHeight:19},
  txtSmall:{fontSize:12,color:C.muted,lineHeight:17},
  btn:{backgroundColor:C.primary,borderRadius:13,paddingVertical:14,alignItems:'center',marginTop:2},
  btnTxt:{color:C.white,fontSize:15,fontWeight:'700'},
  dis:{opacity:0.6},
  row:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:9,
    borderTopWidth:1,borderTopColor:C.bg},
  rowLabel:{fontSize:14,fontWeight:'700',color:C.text},
  rowHint:{fontSize:11,color:C.muted,marginTop:2},
  lbl:{fontSize:11,fontWeight:'700',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.4,marginTop:8},
  chips:{flexDirection:'row',gap:7,flexWrap:'wrap'},
  chip:{paddingHorizontal:13,paddingVertical:8,borderRadius:16,backgroundColor:C.bg,
    borderWidth:1.5,borderColor:C.border},
  chipOn:{backgroundColor:C.primary,borderColor:C.primary},
  chipTxt:{fontSize:12,fontWeight:'600',color:C.muted},
  chipTxtOn:{color:C.white},
  quietNote:{fontSize:11,color:C.muted,lineHeight:16},
});
