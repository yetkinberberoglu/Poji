import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator
} from 'react-native';
import { useState } from 'react';
import { C, S } from '../constants/theme';
import { fixedQuote } from '../lib/services';

const money = (n:number) => '€' + (Number(n)||0).toFixed(2);

/**
 * Jobs nobody can price blind — a locked car, a dead washing machine.
 * The two sides talk first, then the provider sends a figure and the
 * client accepts before anyone sets off.
 */
export default function QuotePanel({
  booking, role, range, onSend, onRespond, busy,
}: {
  booking: any;
  role: 'provider' | 'client';
  range?: { min?: number|null; max?: number|null };
  onSend?: (labour: number, parts: number, note: string) => void;
  onRespond?: (accept: boolean) => void;
  busy?: boolean;
}) {
  const [open, setOpen]     = useState(false);
  const [labour, setLabour] = useState('');
  const [parts, setParts]   = useState('');
  const [note, setNote]     = useState('');
  const [error, setError]   = useState('');

  const quoted = booking.status === 'quoted' && booking.quoteAmount != null;

  // ── already quoted ──
  if (quoted) {
    const q = fixedQuote({
      labourPrice: Number(booking.quoteAmount) || 0,
      partsPrice:  Number(booking.quoteParts) || 0,
    });

    if (role === 'provider') {
      return (
        <View style={s.sentBox}>
          <Text style={s.sentTitle}>⏳  Quote sent — waiting on the client</Text>
          <View style={s.sumRow}>
            <Text style={s.sumLbl}>Your work</Text>
            <Text style={s.sumVal}>{money(Number(booking.quoteAmount))}</Text>
          </View>
          {Number(booking.quoteParts) > 0 && (
            <View style={s.sumRow}>
              <Text style={s.sumLbl}>Parts</Text>
              <Text style={s.sumVal}>{money(Number(booking.quoteParts))}</Text>
            </View>
          )}
          <View style={s.sumRow}>
            <Text style={s.sumLbl}>You keep</Text>
            <Text style={[s.sumVal,{color:C.green,fontWeight:'800'}]}>
              {money(q.providerGets)}
            </Text>
          </View>
          {!!booking.quoteNote && (
            <Text style={s.sentNote}>"{booking.quoteNote}"</Text>
          )}
          <Text style={s.sentHint}>
            Don't travel until they accept. If they decline, the job is cancelled
            and nobody is charged.
          </Text>
        </View>
      );
    }

    return (
      <View style={s.offerBox}>
        <Text style={s.offerTitle}>💬  Your provider has quoted</Text>

        <View style={s.offerCard}>
          {[
            ['The work', money(q.labour)],
            ...(q.parts > 0 ? [['Parts', money(q.parts)]] : []),
            ['VAT 18%', money(q.vat)],
            ['Card fee', money(q.stripeFee)],
          ].map(([l,v])=>(
            <View key={String(l)} style={s.offerRow}>
              <Text style={s.offerLbl}>{l}</Text>
              <Text style={s.offerVal}>{v}</Text>
            </View>
          ))}
          <View style={s.offerTotal}>
            <Text style={s.offerTotalLbl}>You pay</Text>
            <Text style={s.offerTotalVal}>{money(q.clientPays)}</Text>
          </View>
        </View>

        {!!booking.quoteNote && (
          <View style={s.noteBox}>
            <Text style={s.noteTxt}>"{booking.quoteNote}"</Text>
          </View>
        )}

        <Text style={s.offerHint}>
          Nothing is charged until the work is done and you approve it. Decline and
          the job is cancelled — no fee, nobody travels.
        </Text>

        <View style={s.btnRow}>
          <TouchableOpacity style={[s.noBtn, busy&&s.dis]} disabled={busy}
            onPress={()=>onRespond?.(false)}>
            <Text style={s.noTxt}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.yesBtn, busy&&s.dis]} disabled={busy}
            onPress={()=>onRespond?.(true)}>
            {busy ? <ActivityIndicator color={C.white} size="small"/>
              : <Text style={s.yesTxt}>Accept {money(q.clientPays)}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── client waiting for a quote ──
  if (role === 'client') {
    return (
      <View style={s.waitBox}>
        <Text style={s.waitTitle}>💬  Your provider will quote you</Text>
        <Text style={s.waitTxt}>
          This job can't be priced sight unseen. Message them with the details —
          they'll send a figure and you decide before anyone travels.
        </Text>
        {range?.min && range?.max && (
          <Text style={s.waitRange}>
            They work in the range {money(range.min)} – {money(range.max)}.
          </Text>
        )}
      </View>
    );
  }

  // ── provider writing a quote ──
  const preview = Number(labour) > 0 ? fixedQuote({
    labourPrice: Number(labour),
    partsPrice: Number(parts) || 0,
  }) : null;

  const send = () => {
    const l = Number(labour);
    if (!l || l <= 0)  { setError('What are you charging for the work?'); return; }
    if (l > 5000)      { setError('That looks very high — check the figure'); return; }
    onSend?.(l, Number(parts) || 0, note.trim());
  };

  if (!open) {
    return (
      <View style={s.promptBox}>
        <Text style={s.promptTitle}>💬  Talk first, then quote</Text>
        <Text style={s.promptTxt}>
          Ask whatever you need to price this properly. When you know the figure,
          send it — the client accepts before you travel.
        </Text>
        {range?.min && range?.max && (
          <Text style={s.promptRange}>
            Your listed range: {money(range.min)} – {money(range.max)}
          </Text>
        )}
        <TouchableOpacity style={s.openBtn} onPress={()=>setOpen(true)}>
          <Text style={s.openTxt}>Send a quote</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.formBox}>
      <Text style={s.formTitle}>Your quote</Text>

      <Text style={s.lbl}>For the work (€)</Text>
      <TextInput style={s.input} value={labour}
        onChangeText={(t)=>{setLabour(t.replace(/[^0-9.]/g,''));setError('');}}
        keyboardType="decimal-pad" placeholder="180" placeholderTextColor={C.muted} autoFocus />

      <Text style={s.lbl}>Parts, if any (€)</Text>
      <TextInput style={s.input} value={parts}
        onChangeText={(t)=>setParts(t.replace(/[^0-9.]/g,''))}
        keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.muted} />

      <Text style={s.lbl}>Explain the price</Text>
      <TextInput style={[s.input,{minHeight:80}]} value={note} onChangeText={setNote}
        placeholder="Mercedes with a transponder key — needs decoding and programming, about two hours"
        placeholderTextColor={C.muted} multiline textAlignVertical="top" />
      <Text style={s.note}>
        People accept a price they understand. Say what makes this job what it is.
      </Text>

      {preview && (
        <View style={s.previewBox}>
          <View style={s.previewRow}>
            <Text style={s.previewLbl}>Client pays</Text>
            <Text style={s.previewVal}>{money(preview.clientPays)}</Text>
          </View>
          <View style={s.previewRow}>
            <Text style={s.previewLbl}>You keep</Text>
            <Text style={[s.previewVal,{color:C.green,fontWeight:'800'}]}>
              {money(preview.providerGets)}
            </Text>
          </View>
          <Text style={s.previewNote}>20% on the work, 5% on the parts.</Text>
        </View>
      )}

      {error ? <Text style={s.err}>{error}</Text> : null}

      <View style={s.btnRow}>
        <TouchableOpacity style={s.cancelBtn} onPress={()=>{setOpen(false);setError('');}}>
          <Text style={s.cancelTxt}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.sendBtn, busy&&s.dis]} disabled={busy} onPress={send}>
          {busy ? <ActivityIndicator color={C.white} size="small"/>
            : <Text style={s.sendTxt}>Send quote</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  promptBox:{backgroundColor:C.tealLt,borderRadius:14,padding:14,gap:8,
    borderWidth:1,borderColor:'#BAE6FD'},
  promptTitle:{fontSize:14,fontWeight:'800',color:C.teal},
  promptTxt:{fontSize:12,color:C.text,lineHeight:18},
  promptRange:{fontSize:12,color:C.teal,fontWeight:'700'},
  openBtn:{backgroundColor:C.teal,borderRadius:12,paddingVertical:13,alignItems:'center',marginTop:4},
  openTxt:{fontSize:14,fontWeight:'700',color:C.white},

  formBox:{backgroundColor:C.white,borderRadius:14,padding:14,
    borderWidth:1.5,borderColor:C.teal},
  formTitle:{fontSize:14,fontWeight:'800',color:C.dark},
  lbl:{fontSize:11,fontWeight:'700',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.4,marginTop:14,marginBottom:7},
  input:{backgroundColor:C.bg,borderRadius:11,paddingHorizontal:13,paddingVertical:12,
    fontSize:14,color:C.text,borderWidth:1.5,borderColor:C.border},
  note:{fontSize:11,color:C.muted,marginTop:6,lineHeight:16},
  err:{fontSize:12,color:C.red,fontWeight:'700',marginTop:10},

  previewBox:{backgroundColor:C.greenLt,borderRadius:11,padding:12,gap:6,marginTop:14,
    borderWidth:1,borderColor:'#A7F3D0'},
  previewRow:{flexDirection:'row',justifyContent:'space-between'},
  previewLbl:{fontSize:12,color:C.text},
  previewVal:{fontSize:14,fontWeight:'700',color:C.dark},
  previewNote:{fontSize:11,color:C.muted},

  sentBox:{backgroundColor:C.tealLt,borderRadius:14,padding:14,gap:7,
    borderWidth:1,borderColor:'#BAE6FD'},
  sentTitle:{fontSize:14,fontWeight:'800',color:C.teal},
  sumRow:{flexDirection:'row',justifyContent:'space-between'},
  sumLbl:{fontSize:12,color:C.text},
  sumVal:{fontSize:13,fontWeight:'700',color:C.dark},
  sentNote:{fontSize:12,color:C.text,fontStyle:'italic',lineHeight:17,marginTop:2},
  sentHint:{fontSize:11,color:C.muted,lineHeight:16,marginTop:2},

  waitBox:{backgroundColor:C.tealLt,borderRadius:14,padding:14,gap:6,
    borderWidth:1,borderColor:'#BAE6FD'},
  waitTitle:{fontSize:14,fontWeight:'800',color:C.teal},
  waitTxt:{fontSize:12,color:C.text,lineHeight:18},
  waitRange:{fontSize:12,color:C.teal,fontWeight:'700',marginTop:2},

  offerBox:{backgroundColor:C.tealLt,borderRadius:14,padding:14,gap:10,
    borderWidth:1.5,borderColor:C.teal},
  offerTitle:{fontSize:14,fontWeight:'800',color:C.teal},
  offerCard:{backgroundColor:C.white,borderRadius:11,padding:12,
    borderWidth:1,borderColor:C.border},
  offerRow:{flexDirection:'row',justifyContent:'space-between',marginBottom:6},
  offerLbl:{fontSize:12,color:C.muted},
  offerVal:{fontSize:12,color:C.text,fontWeight:'600'},
  offerTotal:{flexDirection:'row',justifyContent:'space-between',paddingTop:9,marginTop:3,
    borderTopWidth:1,borderTopColor:C.border},
  offerTotalLbl:{fontSize:14,fontWeight:'800',color:C.dark},
  offerTotalVal:{fontSize:18,fontWeight:'800',color:C.teal},
  noteBox:{backgroundColor:C.white,borderRadius:10,padding:11,
    borderWidth:1,borderColor:C.border},
  noteTxt:{fontSize:12,color:C.text,lineHeight:18,fontStyle:'italic'},
  offerHint:{fontSize:11,color:C.text,lineHeight:16},

  btnRow:{flexDirection:'row',gap:10,marginTop:12},
  noBtn:{flex:1,borderWidth:1.5,borderColor:C.red,borderRadius:12,paddingVertical:12,
    alignItems:'center',backgroundColor:C.white},
  noTxt:{color:C.red,fontWeight:'700',fontSize:13},
  yesBtn:{flex:1.6,backgroundColor:C.green,borderRadius:12,paddingVertical:12,
    alignItems:'center'},
  yesTxt:{color:C.white,fontWeight:'700',fontSize:13},
  cancelBtn:{flex:1,borderWidth:1.5,borderColor:C.border,borderRadius:12,
    paddingVertical:12,alignItems:'center',backgroundColor:C.bg},
  cancelTxt:{fontSize:13,fontWeight:'600',color:C.muted},
  sendBtn:{flex:1.6,backgroundColor:C.teal,borderRadius:12,paddingVertical:12,
    alignItems:'center'},
  sendTxt:{fontSize:13,fontWeight:'700',color:C.white},
  dis:{opacity:0.5},
});
