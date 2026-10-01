import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator
} from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { C, S } from '../constants/theme';
import { CATEGORIES, tradesIn } from '../constants/trades';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';

export default function RequestService() {
  const { availableTrades } = useApp();
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote]     = useState('');
  const [busy, setBusy]     = useState(false);
  const [done, setDone]     = useState(false);

  // only offer what we can't already do
  const missing = CATEGORIES
    .map(cat => ({ cat, items: tradesIn(cat.id).filter(t => !availableTrades.includes(t.id)) }))
    .filter(g => g.items.length > 0);

  const toggle = (id: string) =>
    setPicked(p => p.includes(id) ? p.filter(x=>x!==id) : [...p, id]);

  const submit = async () => {
    if (!picked.length && !note.trim()) return;
    setBusy(true);
    try {
      const { data:{ user } } = await supabase.auth.getUser();
      const rows = picked.length
        ? picked.map(id => ({
            user_id: user?.id ?? null,
            category_id: id,
            category_name: tradesIn('')
              .concat(...CATEGORIES.map(c=>tradesIn(c.id)))
              .find(t=>t.id===id)?.name || id,
            note: note.trim() || null,
          }))
        : [{ user_id: user?.id ?? null, category_id: 'other',
             category_name: 'Other', note: note.trim() }];
      await supabase.from('service_interest').insert(rows);
    } catch (e) { /* the thank-you is the point */ }
    setBusy(false);
    setDone(true);
  };

  if (done) {
    return (
      <View style={s.doneWrap}>
        <Text style={s.doneIcon}>👂</Text>
        <Text style={s.doneTitle}>Thanks — noted</Text>
        <Text style={s.doneTxt}>
          We bring new trades on in the order people ask for them.
          You'll get a message the moment someone covers what you need.
        </Text>
        <TouchableOpacity style={s.doneBtn} onPress={()=>router.replace('/(tabs)/home')}>
          <Text style={s.doneBtnTxt}>Back to home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <View style={s.hdr}>
        <TouchableOpacity onPress={()=>router.back()}><Text style={s.back}>← Back</Text></TouchableOpacity>
        <Text style={s.title}>Request a service</Text>
        <View style={{width:54}}/>
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.intro}>What do you need?</Text>
        <Text style={s.hint}>
          Pick anything below, or just describe it. We use these requests to decide
          which trades to sign up next.
        </Text>

        {missing.map(({cat, items})=>(
          <View key={cat.id} style={s.group}>
            <Text style={s.groupTitle}>{cat.icon}  {cat.name}</Text>
            <View style={s.wrap2}>
              {items.map(t=>{
                const on = picked.includes(t.id);
                return (
                  <TouchableOpacity key={t.id} style={[s.pill, on&&s.pillOn]}
                    onPress={()=>toggle(t.id)}>
                    <Text style={[s.pillTxt, on&&s.pillTxtOn]}>
                      {on ? '✓ ' : ''}{t.icon}  {t.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        <Text style={s.lbl}>Anything else?</Text>
        <TextInput style={s.input} value={note} onChangeText={setNote}
          placeholder="e.g. I need someone to fit a water softener in Sliema"
          placeholderTextColor={C.muted} multiline textAlignVertical="top" />

        <View style={{height:20}}/>
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.btn, (busy || (!picked.length && !note.trim())) && s.btnDis]}
          disabled={busy || (!picked.length && !note.trim())}
          onPress={submit}>
          {busy ? <ActivityIndicator color={C.white}/> :
            <Text style={s.btnTxt}>
              {picked.length ? `Send request (${picked.length})` : 'Send request'}
            </Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:60,paddingBottom:12},
  back:{fontSize:16,color:C.primary,fontWeight:'600',width:54},
  title:{fontSize:17,fontWeight:'700',color:C.dark},
  body:{flex:1,paddingHorizontal:20},
  intro:{fontSize:24,fontWeight:'800',color:C.dark,marginTop:8},
  hint:{fontSize:13,color:C.muted,marginTop:6,marginBottom:20,lineHeight:19},
  group:{marginBottom:18},
  groupTitle:{fontSize:13,fontWeight:'800',color:C.dark,marginBottom:8},
  wrap2:{flexDirection:'row',flexWrap:'wrap',gap:8},
  pill:{paddingHorizontal:12,paddingVertical:9,borderRadius:20,backgroundColor:C.white,borderWidth:1.5,borderColor:C.border},
  pillOn:{backgroundColor:C.primary,borderColor:C.primary},
  pillTxt:{fontSize:12,fontWeight:'600',color:C.muted},
  pillTxtOn:{color:C.white},
  lbl:{fontSize:12,fontWeight:'700',color:C.muted,textTransform:'uppercase',letterSpacing:0.5,marginTop:10,marginBottom:8},
  input:{backgroundColor:C.white,borderRadius:14,padding:16,fontSize:15,color:C.text,borderWidth:1.5,borderColor:C.border,minHeight:100},
  footer:{paddingHorizontal:20,paddingVertical:16,backgroundColor:C.white,borderTopWidth:1,borderTopColor:C.border},
  btn:{backgroundColor:C.primary,borderRadius:16,paddingVertical:17,alignItems:'center',...S.md},
  btnDis:{backgroundColor:C.muted},
  btnTxt:{color:C.white,fontSize:16,fontWeight:'700'},
  doneWrap:{flex:1,backgroundColor:C.bg,alignItems:'center',justifyContent:'center',padding:32,gap:14},
  doneIcon:{fontSize:64},
  doneTitle:{fontSize:26,fontWeight:'800',color:C.dark},
  doneTxt:{fontSize:14,color:C.muted,textAlign:'center',lineHeight:21},
  doneBtn:{backgroundColor:C.primary,borderRadius:16,paddingVertical:15,paddingHorizontal:32,marginTop:10},
  doneBtnTxt:{color:C.white,fontSize:15,fontWeight:'700'},
});
