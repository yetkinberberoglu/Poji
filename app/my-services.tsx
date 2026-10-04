import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Switch
} from 'react-native';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { findTrade } from '../constants/trades';
import {
  loadServiceTypes, loadProviderServices, seedProviderServices,
  effectiveService, fixedQuote,
  type ServiceType, type ProviderService,
} from '../lib/services';

const fmtM = (m:number) => m >= 60
  ? (m % 60 === 0 ? `${m/60}h` : `${Math.floor(m/60)}h ${m%60}m`)
  : `${m}m`;

/**
 * A provider's own price list. Seeded from the platform defaults so
 * nobody starts with an empty screen, then edited to suit how they work.
 */
export default function MyServices() {
  const [types, setTypes] = useState<ServiceType[]>([]);
  const [mine, setMine]   = useState<Record<string, ProviderService>>({});
  const [trades, setTrades] = useState<string[]>([]);
  const [loading, setLoad] = useState(true);
  const [editing, setEdit] = useState<string|null>(null);
  const [saving, setSaving]= useState(false);
  const [error, setError]  = useState('');

  const [draft, setDraft] = useState<any>({});

  const load = async () => {
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/auth'); return; }

    const { data: prof } = await supabase.from('cleaner_profiles')
      .select('categories').eq('id', user.id).maybeSingle();
    const cats = prof?.categories || [];
    setTrades(cats);

    if (cats.length) {
      await seedProviderServices(user.id, cats);
      const t = await loadServiceTypes({ trades: cats });
      setTypes(t);
    }

    setMine(await loadProviderServices(user.id));
    setLoad(false);
  };

  useEffect(() => { load(); }, []);

  const startEdit = (t: ServiceType) => {
    const own = mine[t.id];
    const eff = effectiveService(t, own);
    setDraft({
      labour_price: String(eff.labour || ''),
      parts_price:  String(eff.parts || ''),
      parts_label:  eff.partsLabel || '',
      price_min:    eff.priceMin != null ? String(eff.priceMin) : '',
      price_max:    eff.priceMax != null ? String(eff.priceMax) : '',
      typical_minutes: String(eff.minutes),
      note: own?.note || '',
    });
    setEdit(t.id);
    setError('');
  };

  const saveOne = async (t: ServiceType) => {
    const isQuote = t.pricing_model === 'quote';

    if (isQuote) {
      const lo = Number(draft.price_min), hi = Number(draft.price_max);
      if (!lo || !hi)  { setError('Give a price range'); return; }
      if (hi < lo)     { setError('The top of the range is below the bottom'); return; }
    } else if (t.pricing_model === 'fixed') {
      if (!Number(draft.labour_price)) { setError('Set your service charge'); return; }
    }

    setSaving(true);
    const { data:{ user } } = await supabase.auth.getUser();

    const { error: e } = await supabase.from('provider_services').upsert({
      provider_id: user!.id,
      service_type_id: t.id,
      active: mine[t.id]?.active ?? true,
      labour_price: isQuote ? null : (Number(draft.labour_price) || null),
      parts_price:  isQuote ? null : (Number(draft.parts_price)  || 0),
      parts_label:  isQuote ? null : (draft.parts_label.trim() || null),
      price_min:    isQuote ? Number(draft.price_min) : null,
      price_max:    isQuote ? Number(draft.price_max) : null,
      typical_minutes: Number(draft.typical_minutes) || 60,
      note: draft.note.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider_id,service_type_id' });

    setSaving(false);
    if (e) { setError(e.message); return; }

    setMine(await loadProviderServices(user!.id));
    setEdit(null);
  };

  const toggleActive = async (t: ServiceType, on: boolean) => {
    const { data:{ user } } = await supabase.auth.getUser();
    setMine(prev => ({ ...prev, [t.id]: { ...(prev[t.id] as any), active: on } }));
    await supabase.from('provider_services').upsert({
      provider_id: user!.id,
      service_type_id: t.id,
      active: on,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider_id,service_type_id' });
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.primary} size="large"/></View>;
  }

  // group by trade so a company with six trades can find things
  const byTrade: Record<string, ServiceType[]> = {};
  types.forEach(t => { (byTrade[t.trade_id || 'other'] ||= []).push(t); });

  return (
    <View style={s.wrap}>
      <View style={s.hdr}>
        <TouchableOpacity onPress={()=>router.back()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>My services</Text>
        <View style={{width:54}}/>
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.intro}>
          These are the jobs clients can book, and what you charge for each.
        </Text>
        <Text style={s.hint}>
          We've filled in typical Malta prices to get you started. Change anything —
          clients see your numbers, not ours.
        </Text>

        {error ? <View style={s.errBox}><Text style={s.errTxt}>⚠️  {error}</Text></View> : null}

        {types.length === 0 && (
          <View style={s.emptyBox}>
            <Text style={s.emptyIcon}>🧰</Text>
            <Text style={s.emptyTitle}>No services to price yet</Text>
            <Text style={s.emptyTxt}>
              Pick your trades first and we'll list the jobs that go with them.
            </Text>
            <TouchableOpacity style={s.emptyBtn}
              onPress={()=>router.push('/(provider)/profile')}>
              <Text style={s.emptyBtnTxt}>Choose my trades</Text>
            </TouchableOpacity>
          </View>
        )}

        {Object.entries(byTrade).map(([tradeId, list])=>{
          const trade = findTrade(tradeId);
          return (
            <View key={tradeId} style={s.group}>
              <Text style={s.groupTitle}>
                {trade?.icon || '•'}  {trade?.name || tradeId}
              </Text>

              {list.map(t=>{
                const own = mine[t.id];
                const on  = own?.active !== false;
                const eff = effectiveService(t, own);
                const isQuote = t.pricing_model === 'quote';
                const isHourly= (t.pricing_model ?? 'hourly') === 'hourly';
                const open = editing === t.id;

                const q = !isQuote && !isHourly ? fixedQuote({
                  labourPrice: eff.labour, partsPrice: eff.parts,
                }) : null;

                return (
                  <View key={t.id} style={[s.card, !on&&s.cardOff, open&&s.cardOpen]}>
                    <View style={s.cardTop}>
                      <Text style={s.cardIcon}>{t.icon}</Text>
                      <View style={{flex:1}}>
                        <Text style={[s.cardName, !on&&s.dim]}>{t.name}</Text>
                        <Text style={[s.cardDesc, !on&&s.dim]}>{t.description}</Text>

                        {on && (
                          <Text style={s.cardPrice}>
                            {isHourly ? 'Charged at your hourly rate'
                              : isQuote ? (eff.priceMin && eff.priceMax
                                  ? `€${eff.priceMin} – €${eff.priceMax} · you quote after talking`
                                  : 'Set your range')
                              : `Service €${eff.labour}${eff.parts ? ` + parts €${eff.parts}` : ''} · ${fmtM(eff.minutes)}`}
                          </Text>
                        )}

                        {on && q && (
                          <Text style={s.cardClient}>
                            Client pays €{q.clientPays.toFixed(0)} · you keep €{q.providerGets.toFixed(0)}
                          </Text>
                        )}

                        {on && !!own?.note && (
                          <Text style={s.cardNote}>{own.note}</Text>
                        )}
                      </View>

                      <Switch
                        value={on}
                        onValueChange={(v)=>toggleActive(t, v)}
                        trackColor={{ false:C.border, true:C.green }}
                        thumbColor={C.white}
                      />
                    </View>

                    {on && !isHourly && !open && (
                      <TouchableOpacity style={s.editBtn} onPress={()=>startEdit(t)}>
                        <Text style={s.editTxt}>Change my price ›</Text>
                      </TouchableOpacity>
                    )}

                    {open && (
                      <View style={s.form}>
                        {isQuote ? (
                          <>
                            <Text style={s.formHint}>
                              You can't price this blind, so give a range. The client
                              messages you first, then you send the real figure and
                              they accept before you go anywhere.
                            </Text>
                            <View style={s.row2}>
                              <View style={{flex:1}}>
                                <Text style={s.lbl}>From (€)</Text>
                                <TextInput style={s.input} value={draft.price_min}
                                  onChangeText={(v)=>setDraft((d:any)=>({...d, price_min:v.replace(/[^0-9.]/g,'')}))}
                                  keyboardType="decimal-pad" placeholder="60"
                                  placeholderTextColor={C.muted} />
                              </View>
                              <View style={{flex:1}}>
                                <Text style={s.lbl}>Up to (€)</Text>
                                <TextInput style={s.input} value={draft.price_max}
                                  onChangeText={(v)=>setDraft((d:any)=>({...d, price_max:v.replace(/[^0-9.]/g,'')}))}
                                  keyboardType="decimal-pad" placeholder="450"
                                  placeholderTextColor={C.muted} />
                              </View>
                            </View>
                          </>
                        ) : (
                          <>
                            <Text style={s.lbl}>Your service charge (€)</Text>
                            <TextInput style={s.input} value={draft.labour_price}
                              onChangeText={(v)=>setDraft((d:any)=>({...d, labour_price:v.replace(/[^0-9.]/g,'')}))}
                              keyboardType="decimal-pad" placeholder="30"
                              placeholderTextColor={C.muted} />

                            <Text style={s.lbl}>Parts you supply (€)</Text>
                            <TextInput style={s.input} value={draft.parts_price}
                              onChangeText={(v)=>setDraft((d:any)=>({...d, parts_price:v.replace(/[^0-9.]/g,'')}))}
                              keyboardType="decimal-pad" placeholder="0"
                              placeholderTextColor={C.muted} />
                            <Text style={s.note}>Leave at 0 if the job needs no parts.</Text>

                            {Number(draft.parts_price) > 0 && (
                              <>
                                <Text style={s.lbl}>What the parts are</Text>
                                <TextInput style={s.input} value={draft.parts_label}
                                  onChangeText={(v)=>setDraft((d:any)=>({...d, parts_label:v}))}
                                  placeholder="e.g. 3 cartridges (Pentek)"
                                  placeholderTextColor={C.muted} />
                                <Text style={s.note}>
                                  Clients see this. Be specific — it's often why they
                                  pick one provider over another.
                                </Text>
                              </>
                            )}
                          </>
                        )}

                        <Text style={s.lbl}>How long on site</Text>
                        <View style={s.pillWrap}>
                          {[20,30,45,60,90,120,180].map(m=>(
                            <TouchableOpacity key={m}
                              style={[s.pill, Number(draft.typical_minutes)===m&&s.pillOn]}
                              onPress={()=>setDraft((d:any)=>({...d, typical_minutes:String(m)}))}>
                              <Text style={[s.pillTxt, Number(draft.typical_minutes)===m&&s.pillTxtOn]}>
                                {fmtM(m)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <Text style={s.lbl}>Note for clients (optional)</Text>
                        <TextInput style={[s.input,{minHeight:70}]} value={draft.note}
                          onChangeText={(v)=>setDraft((d:any)=>({...d, note:v}))}
                          placeholder="I use Aquafilter cartridges and test the TDS before I leave"
                          placeholderTextColor={C.muted} multiline textAlignVertical="top" />

                        {!isQuote && Number(draft.labour_price) > 0 && (() => {
                          const preview = fixedQuote({
                            labourPrice: Number(draft.labour_price),
                            partsPrice: Number(draft.parts_price) || 0,
                          });
                          return (
                            <View style={s.previewBox}>
                              <View style={s.previewRow}>
                                <Text style={s.previewLbl}>Client pays</Text>
                                <Text style={s.previewVal}>€{preview.clientPays.toFixed(2)}</Text>
                              </View>
                              <View style={s.previewRow}>
                                <Text style={s.previewLbl}>You keep</Text>
                                <Text style={[s.previewVal,{color:C.green,fontWeight:'800'}]}>
                                  €{preview.providerGets.toFixed(2)}
                                </Text>
                              </View>
                              <Text style={s.previewNote}>
                                20% on the work, 5% on the parts.
                              </Text>
                            </View>
                          );
                        })()}

                        <View style={s.formBtns}>
                          <TouchableOpacity style={s.cancelBtn}
                            onPress={()=>{setEdit(null);setError('');}}>
                            <Text style={s.cancelTxt}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[s.saveBtn, saving&&s.dis]}
                            disabled={saving} onPress={()=>saveOne(t)}>
                            {saving ? <ActivityIndicator color={C.white} size="small"/>
                              : <Text style={s.saveTxt}>Save</Text>}
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        <View style={{height:40}}/>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:C.bg},
  hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
    paddingHorizontal:20,paddingTop:60,paddingBottom:12},
  back:{fontSize:16,color:C.primary,fontWeight:'600',width:54},
  title:{fontSize:17,fontWeight:'700',color:C.dark},
  body:{flex:1,paddingHorizontal:20},
  intro:{fontSize:20,fontWeight:'800',color:C.dark,marginTop:8},
  hint:{fontSize:13,color:C.muted,lineHeight:19,marginTop:6,marginBottom:16},

  group:{marginBottom:22},
  groupTitle:{fontSize:13,fontWeight:'800',color:C.dark,marginBottom:10},

  card:{backgroundColor:C.white,borderRadius:16,padding:14,marginBottom:10,
    borderWidth:1.5,borderColor:C.border,...S.sm},
  cardOff:{backgroundColor:C.bgAlt,borderStyle:'dashed'},
  cardOpen:{borderColor:C.primary},
  cardTop:{flexDirection:'row',gap:12,alignItems:'flex-start'},
  cardIcon:{fontSize:24},
  cardName:{fontSize:15,fontWeight:'700',color:C.dark},
  cardDesc:{fontSize:12,color:C.muted,marginTop:3,lineHeight:17},
  cardPrice:{fontSize:12,fontWeight:'700',color:C.primary,marginTop:6},
  cardClient:{fontSize:11,color:C.muted,marginTop:3},
  cardNote:{fontSize:11,color:C.text,marginTop:5,fontStyle:'italic',lineHeight:16},
  dim:{opacity:0.5},
  editBtn:{marginTop:10,paddingTop:10,borderTopWidth:1,borderTopColor:C.bg},
  editTxt:{fontSize:12,color:C.primary,fontWeight:'700'},

  form:{marginTop:12,paddingTop:12,borderTopWidth:1,borderTopColor:C.bg},
  formHint:{fontSize:12,color:C.muted,lineHeight:18,marginBottom:4},
  lbl:{fontSize:11,fontWeight:'700',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.4,marginTop:14,marginBottom:7},
  note:{fontSize:11,color:C.muted,marginTop:6,lineHeight:16},
  input:{backgroundColor:C.bg,borderRadius:11,paddingHorizontal:13,paddingVertical:12,
    fontSize:14,color:C.text,borderWidth:1.5,borderColor:C.border},
  row2:{flexDirection:'row',gap:10},
  pillWrap:{flexDirection:'row',flexWrap:'wrap',gap:7},
  pill:{paddingHorizontal:12,paddingVertical:8,borderRadius:16,backgroundColor:C.bg,
    borderWidth:1.5,borderColor:C.border},
  pillOn:{backgroundColor:C.primary,borderColor:C.primary},
  pillTxt:{fontSize:12,fontWeight:'600',color:C.muted},
  pillTxtOn:{color:C.white},

  previewBox:{backgroundColor:C.greenLt,borderRadius:11,padding:12,gap:6,marginTop:14,
    borderWidth:1,borderColor:'#A7F3D0'},
  previewRow:{flexDirection:'row',justifyContent:'space-between'},
  previewLbl:{fontSize:12,color:C.text},
  previewVal:{fontSize:14,fontWeight:'700',color:C.dark},
  previewNote:{fontSize:11,color:C.muted},

  formBtns:{flexDirection:'row',gap:10,marginTop:16},
  cancelBtn:{flex:1,borderWidth:1.5,borderColor:C.border,borderRadius:11,
    paddingVertical:12,alignItems:'center',backgroundColor:C.bg},
  cancelTxt:{fontSize:13,fontWeight:'600',color:C.muted},
  saveBtn:{flex:1.4,backgroundColor:C.primary,borderRadius:11,paddingVertical:12,
    alignItems:'center'},
  saveTxt:{fontSize:13,fontWeight:'700',color:C.white},
  dis:{opacity:0.5},

  errBox:{backgroundColor:C.redLt,borderRadius:12,padding:13,marginBottom:14,
    borderWidth:1,borderColor:'#FECACA'},
  errTxt:{fontSize:13,color:C.red,fontWeight:'600'},

  emptyBox:{backgroundColor:C.white,borderRadius:18,padding:28,alignItems:'center',
    gap:8,borderWidth:1,borderColor:C.border},
  emptyIcon:{fontSize:40},
  emptyTitle:{fontSize:16,fontWeight:'800',color:C.dark},
  emptyTxt:{fontSize:13,color:C.muted,textAlign:'center',lineHeight:19},
  emptyBtn:{backgroundColor:C.primary,borderRadius:12,paddingVertical:12,
    paddingHorizontal:22,marginTop:4},
  emptyBtnTxt:{color:C.white,fontSize:14,fontWeight:'700'},
});
