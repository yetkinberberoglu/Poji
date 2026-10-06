import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator
} from 'react-native';
import { useState } from 'react';
import { C } from '../constants/theme';
import { supabase } from '../lib/supabase';

/**
 * A promo code, checked on the server. The client can type anything;
 * only the database decides what it's worth.
 */
export default function PromoField({
  total, applied, onApply, onClear,
}: {
  total: number;
  applied: { code:string; label:string; discount:number } | null;
  onApply: (p: { code:string; label:string; discount:number }) => void;
  onClear: () => void;
}) {
  const [open, setOpen]   = useState(false);
  const [code, setCode]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  const check = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setBusy(true); setError('');
    try {
      const { data, error: e } = await supabase.rpc('check_promo', {
        p_code: c, p_total: total,
      });
      if (e) throw new Error(e.message);
      if (!data?.ok) { setError(data?.error || 'That code is not valid'); }
      else {
        onApply({ code: data.code, label: data.label, discount: Number(data.discount) });
        setOpen(false); setCode('');
      }
    } catch (err: any) {
      setError(err?.message || 'Could not check that code');
    }
    setBusy(false);
  };

  if (applied) {
    return (
      <View style={s.onBox}>
        <Text style={s.onTick}>🎟</Text>
        <View style={{flex:1}}>
          <Text style={s.onCode}>{applied.code}</Text>
          <Text style={s.onLabel}>{applied.label}</Text>
        </View>
        <Text style={s.onAmount}>−€{applied.discount.toFixed(2)}</Text>
        <TouchableOpacity onPress={onClear}>
          <Text style={s.remove}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!open) {
    return (
      <TouchableOpacity style={s.link} onPress={()=>setOpen(true)}>
        <Text style={s.linkTxt}>🎟  Have a promo code?</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.box}>
      <View style={s.row}>
        <TextInput
          style={s.input}
          value={code}
          onChangeText={(t)=>{ setCode(t.toUpperCase()); setError(''); }}
          placeholder="POJI20"
          placeholderTextColor={C.muted}
          autoCapitalize="characters"
          autoFocus
          onSubmitEditing={check}
        />
        <TouchableOpacity style={[s.btn, (!code.trim()||busy)&&s.dis]}
          disabled={!code.trim()||busy} onPress={check}>
          {busy ? <ActivityIndicator color={C.white} size="small" />
            : <Text style={s.btnTxt}>Apply</Text>}
        </TouchableOpacity>
      </View>
      {error ? <Text style={s.err}>{error}</Text> : null}
      <TouchableOpacity onPress={()=>{ setOpen(false); setError(''); }}>
        <Text style={s.cancel}>Never mind</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  link:{paddingVertical:12,alignItems:'center'},
  linkTxt:{fontSize:13,color:C.primary,fontWeight:'700'},
  box:{backgroundColor:C.white,borderRadius:14,padding:13,gap:9,marginBottom:14,
    borderWidth:1.5,borderColor:C.primary},
  row:{flexDirection:'row',gap:9},
  input:{flex:1,backgroundColor:C.bg,borderRadius:11,paddingHorizontal:14,paddingVertical:12,
    fontSize:15,fontWeight:'700',color:C.dark,borderWidth:1.5,borderColor:C.border,
    letterSpacing:1},
  btn:{backgroundColor:C.primary,borderRadius:11,paddingHorizontal:20,justifyContent:'center'},
  btnTxt:{color:C.white,fontSize:14,fontWeight:'700'},
  dis:{opacity:0.5},
  err:{fontSize:12,color:C.red,fontWeight:'600'},
  cancel:{fontSize:12,color:C.muted,fontWeight:'600',textAlign:'center'},

  onBox:{flexDirection:'row',alignItems:'center',gap:11,backgroundColor:C.greenLt,
    borderRadius:14,padding:13,marginBottom:14,borderWidth:1,borderColor:'#A7F3D0'},
  onTick:{fontSize:19},
  onCode:{fontSize:14,fontWeight:'800',color:C.green,letterSpacing:1},
  onLabel:{fontSize:11,color:C.text,marginTop:1},
  onAmount:{fontSize:15,fontWeight:'800',color:C.green},
  remove:{fontSize:14,color:C.muted,fontWeight:'800',paddingHorizontal:4},
});
