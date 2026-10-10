import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Switch,
} from 'react-native';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { loadTrades } from '../constants/trades';

type Cat = {
  id: string; name: string; icon: string; description: string;
  colour: string; urgent: boolean; sort_order: number; active: boolean;
};

type Trade = {
  id: string; category_id: string; name: string; icon: string;
  description: string; pricing: string; roadside: boolean; live: boolean;
  sort_order: number; active: boolean;
  requires_proof: boolean; proof_label: string;
};

type Req = {
  provider_id: string; first_name: string; last_name: string;
  verification_status: string;
  trade_id: string; trade_name: string; icon: string;
  requires_proof: boolean; proof_label: string | null;
  documents: string[] | null;
  status: string; requested_at: string; note: string | null;
  reason: { years?: string; letter?: string } | null;
  held_trades: string[] | null;
};

type Usage = { services: number; providers: number; bookings: number };

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);

/**
 * Trades used to live in a constants file, which meant adding one needed a
 * deploy. They live in the database now, and this is where they are kept.
 *
 * Nothing is deleted while anything points at it. A trade id is written into
 * every service, every provider's categories and every past booking; removing
 * it would orphan all three. Switching a trade off hides it from clients and
 * stops new bookings while leaving the history intact.
 */
export default function AdminTrades() {
  const [cats, setCats]     = useState<Cat[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoad]  = useState(true);
  const [busy, setBusy]     = useState<string|null>(null);
  const [error, setError]   = useState('');
  const [usage, setUsage]   = useState<Record<string, Usage>>({});

  const [editCat, setEditCat]     = useState<Partial<Cat>|null>(null);
  const [editTrade, setEditTrade] = useState<Partial<Trade>|null>(null);
  const [isNew, setIsNew]         = useState(false);

  /* Providers asking for a trade. A trade used to be a tick box on their
     own profile, which meant a tiler could become a chef in one tap. Now
     they ask and this is where it is answered. */
  const [reqs, setReqs]         = useState<Req[]>([]);
  const [reqBusy, setReqBusy]   = useState<string|null>(null);
  const [rejectFor, setReject]  = useState<string|null>(null);
  const [rejectWhy, setWhy]     = useState('');

  const loadReqs = async () => {
    const { data, error: e } = await supabase.rpc('trade_requests', { p_status: 'pending' });
    if (e) { setError(e.message); return; }
    setReqs((data || []) as Req[]);
  };

  const decide = async (r: Req, approve: boolean, note?: string) => {
    const key = `${r.provider_id}:${r.trade_id}`;
    setReqBusy(key); setError('');
    const { error: e } = await supabase.rpc('decide_trade', {
      p_provider: r.provider_id,
      p_trade:    r.trade_id,
      p_approve:  approve,
      p_note:     note || null,
    });
    setReqBusy(null);
    if (e) { setError(e.message); return; }
    setReject(null); setWhy('');
    await loadReqs();
  };

  const load = async () => {
    const [c, t] = await Promise.all([
      supabase.from('trade_categories').select('*').order('sort_order'),
      supabase.from('trades').select('*').order('sort_order'),
    ]);
    if (c.error) setError(c.error.message);
    if (t.error) setError(t.error.message);
    setCats((c.data || []) as Cat[]);
    setTrades((t.data || []) as Trade[]);
    setLoad(false);
  };

  useEffect(() => { load(); loadReqs(); }, []);

  const checkUsage = async (id: string) => {
    const { data } = await supabase.rpc('trade_usage', { p_trade: id });
    if (data) setUsage(u => ({ ...u, [id]: data as Usage }));
    return data as Usage | null;
  };

  const saveCat = async () => {
    if (!editCat) return;
    const id = (editCat.id || '').trim();
    if (!id)            { setError('Give the category an id'); return; }
    if (!editCat.name)  { setError('Give the category a name'); return; }

    setBusy('cat'); setError('');
    const { error: e } = await supabase.from('trade_categories').upsert({
      id,
      name: editCat.name,
      icon: editCat.icon || '•',
      description: editCat.description || '',
      colour: editCat.colour || '#4F46E5',
      urgent: !!editCat.urgent,
      sort_order: Number(editCat.sort_order) || 99,
      active: editCat.active !== false,
    });
    setBusy(null);
    if (e) { setError(e.message); return; }
    setEditCat(null);
    await load(); await loadTrades(true);
  };

  const saveTrade = async () => {
    if (!editTrade) return;
    const id = (editTrade.id || '').trim();
    if (!id)                     { setError('Give the trade an id'); return; }
    if (!editTrade.name)         { setError('Give the trade a name'); return; }
    if (!editTrade.category_id)  { setError('Pick a category'); return; }

    setBusy('trade'); setError('');
    const { error: e } = await supabase.from('trades').upsert({
      id,
      category_id: editTrade.category_id,
      name: editTrade.name,
      icon: editTrade.icon || '•',
      description: editTrade.description || '',
      pricing: editTrade.pricing === 'fixed' ? 'fixed' : 'hourly',
      roadside: !!editTrade.roadside,
      live: !!editTrade.live,
      requires_proof: !!editTrade.requires_proof,
      proof_label: (editTrade.proof_label || '').trim() || null,
      sort_order: Number(editTrade.sort_order) || 99,
      active: editTrade.active !== false,
      updated_at: new Date().toISOString(),
    });
    setBusy(null);
    if (e) { setError(e.message); return; }
    setEditTrade(null);
    await load(); await loadTrades(true);
  };

  const toggleTrade = async (t: Trade, on: boolean) => {
    if (!on) {
      const u = await checkUsage(t.id);
      // switching off is reversible, so we warn rather than block
      if (u && (u.services || u.providers || u.bookings)) {
        setError(
          `${t.name} is switched off. ${u.services} service${u.services===1?'':'s'}, ` +
          `${u.providers} provider${u.providers===1?'':'s'} and ${u.bookings} booking` +
          `${u.bookings===1?'':'s'} still point at it — they keep working, but clients ` +
          `will not see this trade and cannot book it.`
        );
      }
    } else setError('');

    setBusy(t.id);
    const { error: e } = await supabase.from('trades')
      .update({ active: on, updated_at: new Date().toISOString() }).eq('id', t.id);
    setBusy(null);
    if (e) { setError(e.message); return; }
    await load(); await loadTrades(true);
  };

  const removeTrade = async (t: Trade) => {
    const u = await checkUsage(t.id);
    if (u && (u.services || u.providers || u.bookings)) {
      setError(
        `Cannot delete ${t.name}: ${u.services} service${u.services===1?'':'s'}, ` +
        `${u.providers} provider${u.providers===1?'':'s'} and ${u.bookings} booking` +
        `${u.bookings===1?'':'s'} refer to it. Switch it off instead — deleting would ` +
        `leave all of them pointing at nothing.`
      );
      return;
    }
    setBusy(t.id);
    const { error: e } = await supabase.from('trades').delete().eq('id', t.id);
    setBusy(null);
    if (e) { setError(e.message); return; }
    await load(); await loadTrades(true);
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.primary} size="large"/></View>;
  }

  return (
    <View style={s.wrap}>
      <View style={s.hdr}>
        <TouchableOpacity onPress={()=>router.back()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Trades</Text>
        <View style={{width:54}}/>
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.intro}>What Poji covers</Text>
        <Text style={s.hint}>
          Clients browse by category. A trade needs at least one service under
          it before anyone can book, so add the services too.
        </Text>

        {error ? (
          <View style={s.errBox}>
            <Text style={s.errTxt}>{error}</Text>
            <TouchableOpacity onPress={()=>setError('')}>
              <Text style={s.errX}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── who is asking for a trade ── */}
        {reqs.length > 0 && (
          <View style={s.queue}>
            <Text style={s.queueTitle}>
              ⏳  {reqs.length === 1 ? 'One provider is waiting'
                                     : `${reqs.length} providers are waiting`}
            </Text>
            <Text style={s.queueHint}>
              Approving puts the trade on their profile and starts sending them
              jobs in it. Rejecting tells them why.
            </Text>

            {reqs.map(r=>{
              const key  = `${r.provider_id}:${r.trade_id}`;
              const busyR = reqBusy === key;
              const name = `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Provider';
              const docs = r.documents?.length || 0;
              return (
                <View key={key} style={s.reqCard}>
                  <Text style={s.reqWho}>{name}</Text>
                  <Text style={s.reqWhat}>
                    {r.icon}  {r.trade_name}
                    {'  ·  '}
                    {new Date(r.requested_at).toLocaleDateString('en-GB',
                      {day:'numeric', month:'short'})}
                    {r.reason?.years ? `  ·  ${r.reason.years}` : ''}
                  </Text>

                  {/* What they already do. A plumber asking to be a chef
                      should read as exactly that. */}
                  {!!r.held_trades?.length && (
                    <Text style={s.reqHolds}>
                      Already approved for: {r.held_trades
                        .map(id => trades.find(t=>t.id===id)?.name || id)
                        .join(', ')}
                    </Text>
                  )}

                  {r.reason?.letter ? (
                    <View style={s.letterBox}>
                      <Text style={s.letterTxt}>{r.reason.letter}</Text>
                    </View>
                  ) : (
                    <View style={s.reqWarn}>
                      <Text style={s.reqWarnTxt}>
                        No letter on this request — it predates us asking for one.
                      </Text>
                    </View>
                  )}

                  {r.verification_status !== 'approved' && (
                    <View style={s.reqWarn}>
                      <Text style={s.reqWarnTxt}>
                        ⚠️  This account is not verified yet ({r.verification_status
                          || 'basic'}). Granting a trade will not let them take jobs
                        until it is.
                      </Text>
                    </View>
                  )}

                  {r.requires_proof && (
                    <View style={docs ? s.reqProofOk : s.reqWarn}>
                      <Text style={docs ? s.reqProofOkTxt : s.reqWarnTxt}>
                        📄  Needs {r.proof_label || 'proof of qualification'} —
                        {docs ? ` ${docs} file${docs>1?'s':''} attached`
                              : ' nothing attached yet'}
                      </Text>
                    </View>
                  )}

                  {rejectFor === key ? (
                    <View style={s.rejBox}>
                      <Text style={s.lbl}>Why not</Text>
                      <TextInput style={s.input} value={rejectWhy}
                        onChangeText={setWhy} multiline
                        placeholder="They see this, so make it something they can act on"
                        placeholderTextColor={C.muted} />
                      <View style={s.reqBtns}>
                        <TouchableOpacity style={s.cancelBtn}
                          onPress={()=>{setReject(null);setWhy('');}}>
                          <Text style={s.cancelTxt}>Back</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.rejBtn, busyR&&s.dis]}
                          disabled={busyR || !rejectWhy.trim()}
                          onPress={()=>decide(r, false, rejectWhy.trim())}>
                          <Text style={s.rejTxt}>Send rejection</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={s.reqBtns}>
                      <TouchableOpacity style={[s.rejBtn, busyR&&s.dis]}
                        disabled={busyR} onPress={()=>{setReject(key);setWhy('');}}>
                        <Text style={s.rejTxt}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.okBtn, busyR&&s.dis]}
                        disabled={busyR} onPress={()=>decide(r, true)}>
                        {busyR ? <ActivityIndicator color={C.white} size="small"/>
                          : <Text style={s.okTxt}>Approve</Text>}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── category form ── */}
        {editCat ? (
          <View style={s.form}>
            <Text style={s.formTitle}>
              {isNew ? 'New category' : `Edit ${editCat.name}`}
            </Text>

            {isNew && (
              <>
                <Text style={s.lbl}>Id</Text>
                <TextInput style={s.input} value={editCat.id || ''}
                  onChangeText={v=>setEditCat(c=>({...c, id: slug(v)}))}
                  placeholder="outdoor" placeholderTextColor={C.muted} />
                <Text style={s.note}>
                  Lower case, no spaces. This never changes afterwards — it is
                  written into every service and booking underneath it.
                </Text>
              </>
            )}

            <Text style={s.lbl}>Name</Text>
            <TextInput style={s.input} value={editCat.name || ''}
              onChangeText={v=>setEditCat(c=>({...c, name:v}))}
              placeholder="Outdoor & property" placeholderTextColor={C.muted} />

            <Text style={s.lbl}>Icon</Text>
            <TextInput style={s.input} value={editCat.icon || ''}
              onChangeText={v=>setEditCat(c=>({...c, icon:v}))}
              placeholder="🌿" placeholderTextColor={C.muted} />

            <Text style={s.lbl}>One line for clients</Text>
            <TextInput style={s.input} value={editCat.description || ''}
              onChangeText={v=>setEditCat(c=>({...c, description:v}))}
              placeholder="Gardens, pools, solar, moving" placeholderTextColor={C.muted} />

            <View style={s.row2}>
              <View style={{flex:1}}>
                <Text style={s.lbl}>Colour</Text>
                <TextInput style={s.input} value={editCat.colour || ''}
                  onChangeText={v=>setEditCat(c=>({...c, colour:v}))}
                  placeholder="#059669" placeholderTextColor={C.muted} />
              </View>
              <View style={{flex:1}}>
                <Text style={s.lbl}>Order</Text>
                <TextInput style={s.input} value={String(editCat.sort_order ?? '')}
                  onChangeText={v=>setEditCat(c=>({...c, sort_order: Number(v.replace(/[^0-9]/g,'')) }))}
                  keyboardType="number-pad" placeholder="6" placeholderTextColor={C.muted} />
              </View>
            </View>

            <View style={s.switchRow}>
              <View style={{flex:1}}>
                <Text style={s.switchLbl}>Emergency category</Text>
                <Text style={s.note}>Shown first and styled as urgent</Text>
              </View>
              <Switch value={!!editCat.urgent}
                onValueChange={v=>setEditCat(c=>({...c, urgent:v}))}
                trackColor={{false:C.border, true:C.amber}} thumbColor={C.white}/>
            </View>

            <View style={s.formBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={()=>{setEditCat(null);setError('');}}>
                <Text style={s.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, busy==='cat'&&s.dis]}
                disabled={busy==='cat'} onPress={saveCat}>
                {busy==='cat' ? <ActivityIndicator color={C.white} size="small"/>
                  : <Text style={s.saveTxt}>Save category</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* ── trade form ── */}
        {editTrade ? (
          <View style={s.form}>
            <Text style={s.formTitle}>
              {isNew ? 'New trade' : `Edit ${editTrade.name}`}
            </Text>

            {isNew && (
              <>
                <Text style={s.lbl}>Id</Text>
                <TextInput style={s.input} value={editTrade.id || ''}
                  onChangeText={v=>setEditTrade(t=>({...t, id: slug(v)}))}
                  placeholder="plasterer" placeholderTextColor={C.muted} />
                <Text style={s.note}>
                  Lower case, no spaces, and permanent. Services and provider
                  profiles store this exact string.
                </Text>
              </>
            )}

            <Text style={s.lbl}>Category</Text>
            <View style={s.chips}>
              {cats.map(c=>(
                <TouchableOpacity key={c.id}
                  style={[s.chip, editTrade.category_id===c.id&&s.chipOn]}
                  onPress={()=>setEditTrade(t=>({...t, category_id:c.id}))}>
                  <Text style={[s.chipTxt, editTrade.category_id===c.id&&s.chipTxtOn]}>
                    {c.icon} {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.lbl}>Name</Text>
            <TextInput style={s.input} value={editTrade.name || ''}
              onChangeText={v=>setEditTrade(t=>({...t, name:v}))}
              placeholder="Plasterer" placeholderTextColor={C.muted} />

            <Text style={s.lbl}>Icon</Text>
            <TextInput style={s.input} value={editTrade.icon || ''}
              onChangeText={v=>setEditTrade(t=>({...t, icon:v}))}
              placeholder="🧰" placeholderTextColor={C.muted} />

            <Text style={s.lbl}>One line for clients</Text>
            <TextInput style={s.input} value={editTrade.description || ''}
              onChangeText={v=>setEditTrade(t=>({...t, description:v}))}
              placeholder="Skimming, rendering, cornice" placeholderTextColor={C.muted} />

            <Text style={s.lbl}>Usual pricing</Text>
            <View style={s.chips}>
              {['hourly','fixed'].map(p=>(
                <TouchableOpacity key={p}
                  style={[s.chip, (editTrade.pricing||'hourly')===p&&s.chipOn]}
                  onPress={()=>setEditTrade(t=>({...t, pricing:p}))}>
                  <Text style={[s.chipTxt, (editTrade.pricing||'hourly')===p&&s.chipTxtOn]}>
                    {p === 'hourly' ? 'By the hour' : 'Fixed price'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.note}>
              A hint for the trade card only. Each service sets its own model.
            </Text>

            <Text style={s.lbl}>Order within the category</Text>
            <TextInput style={s.input} value={String(editTrade.sort_order ?? '')}
              onChangeText={v=>setEditTrade(t=>({...t, sort_order: Number(v.replace(/[^0-9]/g,'')) }))}
              keyboardType="number-pad" placeholder="9" placeholderTextColor={C.muted} />

            <View style={s.switchRow}>
              <View style={{flex:1}}>
                <Text style={s.switchLbl}>Roadside</Text>
                <Text style={s.note}>
                  Asks for GPS and goes through the callout flow instead of an address
                </Text>
              </View>
              <Switch value={!!editTrade.roadside}
                onValueChange={v=>setEditTrade(t=>({...t, roadside:v}))}
                trackColor={{false:C.border, true:C.amber}} thumbColor={C.white}/>
            </View>

            <View style={s.switchRow}>
              <View style={{flex:1}}>
                <Text style={s.switchLbl}>Bookable now</Text>
                <Text style={s.note}>
                  Off means clients can register interest but not book. Leave it off
                  until you have a provider who actually covers it.
                </Text>
              </View>
              <Switch value={!!editTrade.live}
                onValueChange={v=>setEditTrade(t=>({...t, live:v}))}
                trackColor={{false:C.border, true:C.green}} thumbColor={C.white}/>
            </View>

            <View style={s.switchRow}>
              <View style={{flex:1}}>
                <Text style={s.switchLbl}>Needs proof</Text>
                <Text style={s.note}>
                  A provider cannot be granted this trade without a document.
                  Whether a trade is licensed in Malta is a legal question — check
                  it rather than assuming.
                </Text>
              </View>
              <Switch value={!!editTrade.requires_proof}
                onValueChange={v=>setEditTrade(t=>({...t, requires_proof:v}))}
                trackColor={{false:C.border, true:C.red}} thumbColor={C.white}/>
            </View>

            {!!editTrade.requires_proof && (
              <>
                <Text style={s.lbl}>What they need to show</Text>
                <TextInput style={s.input} value={editTrade.proof_label || ''}
                  onChangeText={v=>setEditTrade(t=>({...t, proof_label:v}))}
                  placeholder="a food handling certificate"
                  placeholderTextColor={C.muted} />
                <Text style={s.note}>
                  This sentence is shown to the provider when they ask for the
                  trade, so write it as the thing they need to find.
                </Text>
              </>
            )}

            <View style={s.formBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={()=>{setEditTrade(null);setError('');}}>
                <Text style={s.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, busy==='trade'&&s.dis]}
                disabled={busy==='trade'} onPress={saveTrade}>
                {busy==='trade' ? <ActivityIndicator color={C.white} size="small"/>
                  : <Text style={s.saveTxt}>Save trade</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {!editCat && !editTrade && (
          <View style={s.addRow}>
            <TouchableOpacity style={s.addBtn}
              onPress={()=>{ setIsNew(true); setEditTrade({ pricing:'hourly', active:true, sort_order:99 }); }}>
              <Text style={s.addTxt}>+  Trade</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.addBtn, s.addBtnAlt]}
              onPress={()=>{ setIsNew(true); setEditCat({ active:true, sort_order:99, colour:'#4F46E5' }); }}>
              <Text style={[s.addTxt, {color:C.accent}]}>+  Category</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── the list ── */}
        {cats.map(c=>{
          const mine = trades.filter(t => t.category_id === c.id);
          return (
            <View key={c.id} style={s.group}>
              <TouchableOpacity style={s.groupHead}
                onPress={()=>{ setIsNew(false); setEditCat(c); setEditTrade(null); }}>
                <Text style={[s.groupTitle, !c.active && s.off]}>
                  {c.icon}  {c.name}
                </Text>
                <Text style={s.groupEdit}>
                  {mine.length} trade{mine.length===1?'':'s'}  ›
                </Text>
              </TouchableOpacity>

              {mine.map(t=>(
                <View key={t.id} style={[s.card, !t.active&&s.cardOff]}>
                  <Text style={s.cardIcon}>{t.icon}</Text>
                  <TouchableOpacity style={{flex:1}}
                    onPress={()=>{ setIsNew(false); setEditTrade(t); setEditCat(null); }}>
                    <Text style={[s.cardName, !t.active&&s.off]}>{t.name}</Text>
                    <Text style={s.cardDesc}>{t.description}</Text>
                    <View style={s.tags}>
                      <Text style={s.tag}>{t.id}</Text>
                      {t.live     && <Text style={[s.tag, s.tagLive]}>bookable</Text>}
                      {t.roadside && <Text style={[s.tag, s.tagRoad]}>roadside</Text>}
                      {usage[t.id] && (
                        <Text style={s.tag}>
                          {usage[t.id].services} svc · {usage[t.id].providers} prov
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>

                  <View style={{alignItems:'flex-end', gap:6}}>
                    <Switch value={t.active}
                      onValueChange={(v)=>toggleTrade(t, v)}
                      trackColor={{false:C.border, true:C.green}} thumbColor={C.white}/>
                    {!t.active && (
                      <TouchableOpacity onPress={()=>removeTrade(t)} disabled={busy===t.id}>
                        <Text style={s.del}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}

              {mine.length === 0 && (
                <Text style={s.emptyGroup}>Nothing in here yet.</Text>
              )}
            </View>
          );
        })}

        <View style={{height:60}}/>
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

  addRow:{flexDirection:'row',gap:10,marginBottom:20},
  addBtn:{flex:1,backgroundColor:C.primaryLt,borderRadius:12,paddingVertical:13,
    alignItems:'center',borderWidth:1.5,borderColor:C.border},
  addBtnAlt:{backgroundColor:'#F3E8FF',borderColor:'#E9D5FF'},
  addTxt:{fontSize:14,fontWeight:'700',color:C.primary},

  group:{marginBottom:22},
  groupHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
    marginBottom:10},
  groupTitle:{fontSize:14,fontWeight:'800',color:C.dark},
  groupEdit:{fontSize:12,color:C.muted,fontWeight:'600'},
  emptyGroup:{fontSize:12,color:C.muted,fontStyle:'italic',paddingLeft:4},

  card:{flexDirection:'row',alignItems:'flex-start',gap:12,backgroundColor:C.white,
    borderRadius:14,padding:13,marginBottom:9,borderWidth:1.5,borderColor:C.border,...S.sm},
  cardOff:{backgroundColor:C.bgAlt,borderStyle:'dashed'},
  cardIcon:{fontSize:22},
  cardName:{fontSize:14,fontWeight:'700',color:C.dark},
  cardDesc:{fontSize:12,color:C.muted,marginTop:2,lineHeight:17},
  off:{opacity:0.5,textDecorationLine:'line-through'},
  tags:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:6},
  tag:{fontSize:10,fontWeight:'700',color:C.muted,backgroundColor:C.bg,
    paddingHorizontal:7,paddingVertical:2,borderRadius:7,overflow:'hidden'},
  tagLive:{color:C.green,backgroundColor:C.greenLt},
  tagRoad:{color:C.amber,backgroundColor:C.amberLt},
  del:{fontSize:11,color:C.red,fontWeight:'700'},

  form:{backgroundColor:C.white,borderRadius:16,padding:16,marginBottom:20,
    borderWidth:2,borderColor:C.primary,...S.md},
  formTitle:{fontSize:16,fontWeight:'800',color:C.dark},
  lbl:{fontSize:11,fontWeight:'700',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.4,marginTop:14,marginBottom:7},
  note:{fontSize:11,color:C.muted,marginTop:6,lineHeight:16},
  input:{backgroundColor:C.bg,borderRadius:11,paddingHorizontal:13,paddingVertical:12,
    fontSize:14,color:C.text,borderWidth:1.5,borderColor:C.border},
  row2:{flexDirection:'row',gap:10},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:7},
  chip:{paddingHorizontal:12,paddingVertical:9,borderRadius:11,backgroundColor:C.bg,
    borderWidth:1.5,borderColor:C.border},
  chipOn:{backgroundColor:C.primary,borderColor:C.primary},
  chipTxt:{fontSize:12,fontWeight:'600',color:C.muted},
  chipTxtOn:{color:C.white},
  switchRow:{flexDirection:'row',alignItems:'center',gap:12,marginTop:16},
  switchLbl:{fontSize:13,fontWeight:'700',color:C.dark},

  formBtns:{flexDirection:'row',gap:10,marginTop:20},
  cancelBtn:{flex:1,borderWidth:1.5,borderColor:C.border,borderRadius:11,
    paddingVertical:12,alignItems:'center',backgroundColor:C.bg},
  cancelTxt:{fontSize:13,fontWeight:'600',color:C.muted},
  saveBtn:{flex:1.4,backgroundColor:C.primary,borderRadius:11,paddingVertical:12,
    alignItems:'center'},
  saveTxt:{fontSize:13,fontWeight:'700',color:C.white},
  dis:{opacity:0.5},

  queue:{backgroundColor:C.amberLt,borderRadius:16,padding:14,marginBottom:18,
    gap:8,borderWidth:1.5,borderColor:'#FDE68A'},
  queueTitle:{fontSize:15,fontWeight:'800',color:C.amber},
  queueHint:{fontSize:12,color:C.text,lineHeight:17},
  reqCard:{backgroundColor:C.white,borderRadius:12,padding:12,gap:6,
    borderWidth:1,borderColor:C.border},
  reqWho:{fontSize:14,fontWeight:'800',color:C.dark},
  reqWhat:{fontSize:12,color:C.muted},
  reqHolds:{fontSize:11,color:C.primary,fontWeight:'700'},
  letterBox:{backgroundColor:C.bg,borderRadius:10,padding:11,
    borderWidth:1,borderColor:C.border},
  letterTxt:{fontSize:13,color:C.text,lineHeight:19},
  reqWarn:{backgroundColor:C.redLt,borderRadius:9,padding:9,
    borderWidth:1,borderColor:'#FECACA'},
  reqWarnTxt:{fontSize:11,color:C.red,lineHeight:16,fontWeight:'600'},
  reqProofOk:{backgroundColor:C.greenLt,borderRadius:9,padding:9,
    borderWidth:1,borderColor:'#A7F3D0'},
  reqProofOkTxt:{fontSize:11,color:C.green,lineHeight:16,fontWeight:'600'},
  reqBtns:{flexDirection:'row',gap:9,marginTop:4},
  rejBox:{gap:4,marginTop:4},
  rejBtn:{flex:1,borderWidth:1.5,borderColor:C.red,borderRadius:11,
    paddingVertical:11,alignItems:'center',backgroundColor:C.white},
  rejTxt:{fontSize:13,fontWeight:'700',color:C.red},
  okBtn:{flex:1.3,backgroundColor:C.green,borderRadius:11,paddingVertical:11,
    alignItems:'center'},
  okTxt:{fontSize:13,fontWeight:'700',color:C.white},

  errBox:{flexDirection:'row',alignItems:'flex-start',gap:10,backgroundColor:C.amberLt,
    borderRadius:12,padding:13,marginBottom:16,borderWidth:1,borderColor:'#FDE68A'},
  errTxt:{flex:1,fontSize:12,color:C.amber,fontWeight:'600',lineHeight:18},
  errX:{fontSize:14,color:C.amber,fontWeight:'800'},
});
