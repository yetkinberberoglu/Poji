import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator
} from 'react-native';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import {
  loadParts, addPart, removePart, respondToParts, partsSummary,
  PARTS_COMMISSION, type BookingPart,
} from '../lib/services';

const money = (n:number) => '€' + (Number(n)||0).toFixed(2);

/**
 * Parts added during a job.
 * Providers propose; the client approves before anything is charged.
 */
export default function PartsPanel({
  bookingId, role, onChange, locked,
}: {
  bookingId: string;
  role: 'provider' | 'client';
  onChange?: () => void;
  locked?: boolean;     // job finished — no more changes
}) {
  const [parts, setParts]   = useState<BookingPart[]>([]);
  const [loading, setLoad]  = useState(true);
  const [busy, setBusy]     = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError]   = useState('');

  const [name, setName]   = useState('');
  const [qty, setQty]     = useState('1');
  const [price, setPrice] = useState('');
  const [note, setNote]   = useState('');

  const refresh = async () => {
    const list = await loadParts(bookingId);
    setParts(list);
    setLoad(false);
    onChange?.();
  };

  useEffect(() => { refresh(); }, [bookingId]);

  const sum = partsSummary(parts);

  const submit = async () => {
    const q = Number(qty) || 1;
    const p = Number(price);
    if (!name.trim())      { setError('What is the part called?'); return; }
    if (!p || p <= 0)      { setError('Enter the price'); return; }
    if (p > 2000)          { setError('That looks very high — check the price'); return; }

    setBusy(true); setError('');
    try {
      await addPart(bookingId, { name, qty: q, unitPrice: p, note });
      setName(''); setQty('1'); setPrice(''); setNote('');
      setAdding(false);
      await refresh();
    } catch (e:any) { setError(e.message || 'Could not add that'); }
    setBusy(false);
  };

  const drop = async (id: string) => {
    setBusy(true);
    try { await removePart(id); await refresh(); }
    catch (e:any) { setError(e.message); }
    setBusy(false);
  };

  const respond = async (accept: boolean) => {
    setBusy(true); setError('');
    try { await respondToParts(bookingId, accept); await refresh(); }
    catch (e:any) { setError(e.message); }
    setBusy(false);
  };

  if (loading) {
    return <View style={s.loading}><ActivityIndicator color={C.primary} size="small" /></View>;
  }

  // nothing to show on the client side until the provider adds something
  if (role === 'client' && parts.length === 0) return null;

  return (
    <View style={s.box}>
      <View style={s.head}>
        <Text style={s.title}>🔩  Parts and materials</Text>
        {sum.approvedTotal > 0 && (
          <Text style={s.headTotal}>{money(sum.approvedTotal)}</Text>
        )}
      </View>

      {parts.length === 0 && role === 'provider' && !adding && (
        <Text style={s.empty}>
          Needed a part for this job? Add it and the client approves it before
          anything is charged.
        </Text>
      )}

      {/* ── the list ── */}
      {parts.map(p => (
        <View key={p.id} style={[
          s.row,
          p.status === 'proposed' && s.rowPending,
          p.status === 'rejected' && s.rowRejected,
        ]}>
          <View style={{flex:1}}>
            <Text style={[s.rowName, p.status==='rejected' && s.strike]}>
              {p.name}
              {Number(p.qty) !== 1 ? `  ×${p.qty}` : ''}
            </Text>
            {!!p.note && <Text style={s.rowNote}>{p.note}</Text>}
            <Text style={s.rowState}>
              {p.status === 'proposed' ? 'Waiting for the client'
                : p.status === 'approved' ? '✓ Approved'
                : '✕ Declined'}
            </Text>
          </View>

          <View style={{alignItems:'flex-end', gap:4}}>
            <Text style={[s.rowPrice, p.status==='rejected' && s.strike]}>
              {money(p.total)}
            </Text>
            {role === 'provider' && p.status === 'proposed' && !locked && (
              <TouchableOpacity onPress={()=>drop(p.id)} disabled={busy}>
                <Text style={s.remove}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      {/* ── client decides ── */}
      {role === 'client' && sum.hasPending && (
        <View style={s.decide}>
          <Text style={s.decideTitle}>
            Your provider needs {sum.proposed.length === 1 ? 'a part' : 'some parts'}
          </Text>
          <Text style={s.decideTxt}>
            {money(sum.proposedTotal)} on top of the labour. Nothing is charged
            until you agree.
          </Text>
          <View style={s.decideRow}>
            <TouchableOpacity style={[s.noBtn, busy&&s.dis]} disabled={busy}
              onPress={()=>respond(false)}>
              <Text style={s.noTxt}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.yesBtn, busy&&s.dis]} disabled={busy}
              onPress={()=>respond(true)}>
              {busy ? <ActivityIndicator color={C.white} size="small" />
                : <Text style={s.yesTxt}>Approve {money(sum.proposedTotal)}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── provider adds ── */}
      {role === 'provider' && !locked && (
        adding ? (
          <View style={s.form}>
            <Text style={s.lbl}>Part</Text>
            <TextInput style={s.input} value={name} onChangeText={t=>{setName(t);setError('');}}
              placeholder="e.g. RO membrane filter" placeholderTextColor={C.muted} autoFocus />

            <View style={s.formRow}>
              <View style={{width:90}}>
                <Text style={s.lbl}>Qty</Text>
                <TextInput style={s.input} value={qty} onChangeText={setQty}
                  keyboardType="decimal-pad" placeholder="1" placeholderTextColor={C.muted} />
              </View>
              <View style={{flex:1}}>
                <Text style={s.lbl}>Price each (€)</Text>
                <TextInput style={s.input} value={price}
                  onChangeText={t=>{setPrice(t.replace(/[^0-9.]/g,''));setError('');}}
                  keyboardType="decimal-pad" placeholder="35.00" placeholderTextColor={C.muted} />
              </View>
            </View>

            <Text style={s.lbl}>Note for the client (optional)</Text>
            <TextInput style={s.input} value={note} onChangeText={setNote}
              placeholder="Old one was cracked — showed you the photo"
              placeholderTextColor={C.muted} />

            {Number(price) > 0 && (
              <View style={s.calc}>
                <View style={s.calcRow}>
                  <Text style={s.calcLbl}>Client pays</Text>
                  <Text style={s.calcVal}>
                    {money((Number(qty)||1) * Number(price))}
                  </Text>
                </View>
                <View style={s.calcRow}>
                  <Text style={s.calcLbl}>You keep ({((1-PARTS_COMMISSION)*100).toFixed(0)}%)</Text>
                  <Text style={[s.calcVal,{color:C.green}]}>
                    {money((Number(qty)||1) * Number(price) * (1-PARTS_COMMISSION))}
                  </Text>
                </View>
              </View>
            )}

            {error ? <Text style={s.err}>{error}</Text> : null}

            <View style={s.formBtns}>
              <TouchableOpacity style={s.cancelBtn}
                onPress={()=>{ setAdding(false); setError(''); }}>
                <Text style={s.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.addBtn, busy&&s.dis]} disabled={busy} onPress={submit}>
                {busy ? <ActivityIndicator color={C.white} size="small" />
                  : <Text style={s.addTxt}>Add part</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={s.addRow} onPress={()=>setAdding(true)}>
            <Text style={s.addRowTxt}>＋  Add a part</Text>
          </TouchableOpacity>
        )
      )}

      {/* ── provider's share ── */}
      {role === 'provider' && sum.approvedTotal > 0 && (
        <View style={s.share}>
          <View style={s.shareRow}>
            <Text style={s.shareLbl}>Parts approved</Text>
            <Text style={s.shareVal}>{money(sum.approvedTotal)}</Text>
          </View>
          <View style={s.shareRow}>
            <Text style={s.shareLbl}>You keep</Text>
            <Text style={[s.shareVal,{color:C.green,fontWeight:'800'}]}>
              {money(sum.providerGets)}
            </Text>
          </View>
        </View>
      )}

      {error && role === 'client' ? <Text style={s.err}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  box:{backgroundColor:C.white,borderRadius:14,padding:14,gap:10,borderWidth:1,borderColor:C.border},
  loading:{paddingVertical:16,alignItems:'center'},
  head:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  title:{fontSize:14,fontWeight:'800',color:C.dark},
  headTotal:{fontSize:15,fontWeight:'800',color:C.primary},
  empty:{fontSize:12,color:C.muted,lineHeight:18},

  row:{flexDirection:'row',gap:12,padding:12,borderRadius:12,backgroundColor:C.bg,
    borderWidth:1,borderColor:C.border},
  rowPending:{backgroundColor:C.amberLt,borderColor:'#FDE68A'},
  rowRejected:{opacity:0.55},
  rowName:{fontSize:14,fontWeight:'700',color:C.dark},
  rowNote:{fontSize:11,color:C.muted,marginTop:3,lineHeight:16},
  rowState:{fontSize:11,color:C.muted,marginTop:4,fontWeight:'600'},
  rowPrice:{fontSize:15,fontWeight:'800',color:C.dark},
  strike:{textDecorationLine:'line-through'},
  remove:{fontSize:11,color:C.red,fontWeight:'700'},

  decide:{backgroundColor:C.amberLt,borderRadius:12,padding:14,gap:6,
    borderWidth:1,borderColor:'#FDE68A'},
  decideTitle:{fontSize:14,fontWeight:'800',color:C.amber},
  decideTxt:{fontSize:12,color:C.text,lineHeight:18},
  decideRow:{flexDirection:'row',gap:10,marginTop:4},
  noBtn:{flex:1,borderWidth:1.5,borderColor:C.red,borderRadius:12,paddingVertical:12,alignItems:'center'},
  noTxt:{color:C.red,fontWeight:'700',fontSize:13},
  yesBtn:{flex:1.6,backgroundColor:C.green,borderRadius:12,paddingVertical:12,alignItems:'center'},
  yesTxt:{color:C.white,fontWeight:'700',fontSize:13},
  dis:{opacity:0.5},

  addRow:{borderRadius:12,paddingVertical:13,alignItems:'center',borderWidth:1.5,
    borderStyle:'dashed',borderColor:C.border,backgroundColor:C.bg},
  addRowTxt:{fontSize:13,fontWeight:'700',color:C.primary},

  form:{gap:4,backgroundColor:C.bg,borderRadius:12,padding:12,borderWidth:1,borderColor:C.border},
  formRow:{flexDirection:'row',gap:10},
  lbl:{fontSize:11,fontWeight:'700',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.4,marginTop:10,marginBottom:6},
  input:{backgroundColor:C.white,borderRadius:10,paddingHorizontal:12,paddingVertical:11,
    fontSize:14,color:C.text,borderWidth:1.5,borderColor:C.border},
  calc:{backgroundColor:C.white,borderRadius:10,padding:11,gap:6,marginTop:12,
    borderWidth:1,borderColor:C.border},
  calcRow:{flexDirection:'row',justifyContent:'space-between'},
  calcLbl:{fontSize:12,color:C.muted},
  calcVal:{fontSize:13,fontWeight:'700',color:C.dark},
  err:{fontSize:12,color:C.red,fontWeight:'700',marginTop:8},
  formBtns:{flexDirection:'row',gap:10,marginTop:14},
  cancelBtn:{flex:1,borderWidth:1.5,borderColor:C.border,borderRadius:12,
    paddingVertical:12,alignItems:'center',backgroundColor:C.white},
  cancelTxt:{fontSize:13,fontWeight:'600',color:C.muted},
  addBtn:{flex:1.4,backgroundColor:C.primary,borderRadius:12,paddingVertical:12,alignItems:'center'},
  addTxt:{fontSize:13,fontWeight:'700',color:C.white},

  share:{backgroundColor:C.greenLt,borderRadius:12,padding:12,gap:6,
    borderWidth:1,borderColor:'#A7F3D0'},
  shareRow:{flexDirection:'row',justifyContent:'space-between'},
  shareLbl:{fontSize:12,color:C.text,fontWeight:'600'},
  shareVal:{fontSize:13,fontWeight:'700',color:C.dark},
});
