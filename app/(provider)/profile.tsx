import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Switch
} from 'react-native';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { C, S } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { CATEGORIES, tradesIn, findTrade } from '../../constants/trades';
import { MALTA_MAIN, GOZO_LOCALITIES, validateIban, formatIban } from '../../constants/malta';
import { MultiPicker } from '../../components/Picker';
import Avatar from '../../components/Avatar';

type Section = 'trades' | 'rates' | 'areas' | 'about' | 'payment' | null;

export default function ProviderProfile() {
  const [open, setOpen]     = useState<Section>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSaved] = useState<string|null>(null);
  const [error, setError]   = useState('');
  const [loading, setLoad]  = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string|null>(null);

  const [f, setF] = useState<any>({
    first_name:'', last_name:'', status:'draft',
    categories:[] as string[],
    hourly_rate:'15', min_hours:'2', brings_own_supplies:false,
    accepts_urgent:false, service_radius_km:'15',
    covers_all_malta:false, covers_all_gozo:false,
    service_areas:[] as string[],
    bio:'', available:true, away_until:'', away_note:'',
    iban:'', bank_name:'', account_holder:'',
    has_insurance:false, insurance_provider:'', insurance_expiry:'',
    profile_photo_url:'',
  });

  const set = (k:string, v:any) => { setF((p:any)=>({...p,[k]:v})); setError(''); };

  const myTrades  = f.categories.map((id:string)=>findTrade(id)).filter(Boolean);
  const hasHourly = myTrades.some((t:any)=>t.pricing === 'hourly');
  const hasRoad   = myTrades.some((t:any)=>t.roadside);

  useEffect(() => {
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/auth'); return; }
      const { data } = await supabase.from('cleaner_profiles')
        .select('*').eq('id', user.id).maybeSingle();
      if (data) {
        setF((p:any)=>({
          ...p,
          ...Object.fromEntries(Object.entries(data).filter(([_,v])=>v!==null)),
          status: data.verification_status,
          hourly_rate: String(data.hourly_rate ?? 15),
          min_hours:   String(data.min_hours ?? 2),
          service_radius_km: String(data.service_radius_km ?? 15),
          categories: data.categories || [],
          service_areas: data.service_areas || [],
          available: data.available !== false,
        }));
        if (data.profile_photo_url) {
          const { data: signed } = await supabase.storage
            .from('verification-docs')
            .createSignedUrl(data.profile_photo_url, 3600);
          if (signed?.signedUrl) setPhotoUrl(signed.signedUrl);
        }
      }
      setLoad(false);
    })();
  }, []);

  const save = async (patch: Record<string, any>, closeAfter = true) => {
    setSaving(true); setError('');
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error: e } = await supabase.from('cleaner_profiles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    setSaving(false);
    if (e) { setError(e.message); return; }
    setSaved(new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}));
    if (closeAfter) setOpen(null);
  };

  const toggleAvailable = async (v: boolean) => {
    set('available', v);
    await save({ available: v }, false);
  };

  const signOut = async () => {
    try { await supabase.auth.signOut({ scope:'local' }); } catch(e) {}
    router.replace('/auth');
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.primary} size="large" /></View>;
  }

  const areaLabel = f.covers_all_malta && f.covers_all_gozo ? 'All of Malta and Gozo'
    : f.covers_all_malta ? 'All of Malta'
    : f.covers_all_gozo  ? 'All of Gozo'
    : f.service_areas.length ? `${f.service_areas.length} areas`
    : 'Not set';

  return (
    <ScrollView style={s.wrap} showsVerticalScrollIndicator={false}>

      {/* ── header ── */}
      <View style={s.hero}>
        <Avatar photoUrl={photoUrl} initials={
          `${f.first_name?.[0]||''}${f.last_name?.[0]||''}`.toUpperCase() || '?'
        } size={78} />
        <Text style={s.name}>{f.first_name} {f.last_name}</Text>
        <View style={[s.statusPill,
          f.status==='approved' ? s.statusOk : f.status==='rejected' ? s.statusBad : s.statusWait]}>
          <Text style={[s.statusTxt,
            f.status==='approved' ? {color:C.green} : f.status==='rejected' ? {color:C.red} : {color:C.amber}]}>
            {f.status==='approved' ? '✓ Verified'
              : f.status==='rejected' ? '⚠️ Needs changes'
              : '⏳ Under review'}
          </Text>
        </View>
      </View>

      {savedAt && <Text style={s.savedNote}>Saved at {savedAt}</Text>}
      {error ? <View style={s.errBox}><Text style={s.errTxt}>⚠️  {error}</Text></View> : null}

      {/* ── availability ── */}
      <View style={s.availCard}>
        <View style={{flex:1}}>
          <Text style={s.availTitle}>
            {f.available ? 'Taking work' : 'Not taking work'}
          </Text>
          <Text style={s.availTxt}>
            {f.available
              ? "You appear in search and get job alerts."
              : "You're hidden from clients. Jobs you've already accepted are unaffected."}
          </Text>
        </View>
        <Switch
          value={f.available}
          onValueChange={toggleAvailable}
          trackColor={{ false:C.border, true:C.green }}
          thumbColor={C.white}
        />
      </View>

      {/* ══ TRADES ══ */}
      <Row
        icon="🛠️" title="What you do"
        value={f.categories.length ? `${f.categories.length} trade${f.categories.length>1?'s':''}` : 'None set'}
        open={open==='trades'} onPress={()=>setOpen(open==='trades'?null:'trades')}
      />
      {open==='trades' && (
        <View style={s.panel}>
          <Text style={s.panelHint}>
            Tick everything you're qualified for. Clients only see the trades you pick,
            and you only get alerts for those.
          </Text>

          {CATEGORIES.map(cat=>{
            const items  = tradesIn(cat.id);
            const chosen = items.filter(t=>f.categories.includes(t.id)).length;
            return (
              <View key={cat.id} style={s.tradeGroup}>
                <View style={s.tradeHead}>
                  <Text style={s.tradeHeadTxt}>{cat.icon}  {cat.name}</Text>
                  {chosen>0 && (
                    <View style={s.countPill}><Text style={s.countTxt}>{chosen}</Text></View>
                  )}
                </View>
                <View style={s.pillWrap}>
                  {items.map(t=>{
                    const on = f.categories.includes(t.id);
                    return (
                      <TouchableOpacity key={t.id} style={[s.pill, on&&s.pillOn]}
                        onPress={()=>set('categories', on
                          ? f.categories.filter((x:string)=>x!==t.id)
                          : [...f.categories, t.id])}>
                        <Text style={[s.pillTxt, on&&s.pillTxtOn]}>
                          {on?'✓ ':''}{t.icon}  {t.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {hasRoad && (
            <View style={s.roadBox}>
              <TouchableOpacity style={s.checkRow}
                onPress={()=>set('accepts_urgent', !f.accepts_urgent)}>
                <View style={[s.check, f.accepts_urgent&&s.checkOn]}>
                  {f.accepts_urgent && <Text style={s.checkTxt}>✓</Text>}
                </View>
                <View style={{flex:1}}>
                  <Text style={s.optLbl}>Emergency callouts</Text>
                  <Text style={s.optDesc}>Drop everything and go. Pays 25% more.</Text>
                </View>
              </TouchableOpacity>
              <Text style={s.lbl}>Travel radius</Text>
              <View style={s.pillWrap}>
                {[5,10,15,25,40].map(km=>(
                  <TouchableOpacity key={km}
                    style={[s.pill, Number(f.service_radius_km)===km&&s.pillOn]}
                    onPress={()=>set('service_radius_km', String(km))}>
                    <Text style={[s.pillTxt, Number(f.service_radius_km)===km&&s.pillTxtOn]}>
                      {km} km
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <SaveBtn busy={saving} onPress={()=>save({
            categories: f.categories.length ? f.categories : ['cleaning'],
            accepts_urgent: !!f.accepts_urgent,
            service_radius_km: Number(f.service_radius_km) || 15,
          })} />
        </View>
      )}

      {/* ══ RATES ══ */}
      {hasHourly && (
        <>
          <Row
            icon="💶" title="Rate and minimum"
            value={`€${f.hourly_rate}/hr · min ${f.min_hours}h`}
            open={open==='rates'} onPress={()=>setOpen(open==='rates'?null:'rates')}
          />
          {open==='rates' && (
            <View style={s.panel}>
              <Text style={s.lbl}>Hourly rate (EUR)</Text>
              <TextInput style={s.inputBig} value={String(f.hourly_rate)}
                onChangeText={(t:string)=>set('hourly_rate', t.replace(/[^0-9.]/g,''))}
                keyboardType="decimal-pad" />

              <View style={s.calcBox}>
                <View style={s.calcRow}>
                  <Text style={s.calcLbl}>Client pays per hour</Text>
                  <Text style={s.calcVal}>€{(Number(f.hourly_rate||0)*1.18).toFixed(2)}</Text>
                </View>
                <View style={s.calcRow}>
                  <Text style={s.calcLbl}>You keep</Text>
                  <Text style={[s.calcVal,{color:C.green}]}>
                    €{(Number(f.hourly_rate||0)*0.8).toFixed(2)}
                  </Text>
                </View>
              </View>

              <Text style={s.lbl}>Minimum hours per job</Text>
              <View style={s.pillWrap}>
                {[1,1.5,2,2.5,3,4].map(h=>(
                  <TouchableOpacity key={h} style={[s.pill, Number(f.min_hours)===h&&s.pillOn]}
                    onPress={()=>set('min_hours', String(h))}>
                    <Text style={[s.pillTxt, Number(f.min_hours)===h&&s.pillTxtOn]}>{h}h</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.lbl}>Materials</Text>
              <View style={s.pillWrap}>
                {[{k:true,l:'I bring them'},{k:false,l:'Client provides'}].map(o=>(
                  <TouchableOpacity key={String(o.k)}
                    style={[s.pill, f.brings_own_supplies===o.k&&s.pillOn]}
                    onPress={()=>set('brings_own_supplies', o.k)}>
                    <Text style={[s.pillTxt, f.brings_own_supplies===o.k&&s.pillTxtOn]}>{o.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <SaveBtn busy={saving} onPress={()=>save({
                hourly_rate: Number(f.hourly_rate) || 15,
                min_hours:   Number(f.min_hours) || 2,
                brings_own_supplies: !!f.brings_own_supplies,
              })} />
            </View>
          )}
        </>
      )}

      {/* ══ AREAS ══ */}
      <Row
        icon="📍" title="Where you work" value={areaLabel}
        open={open==='areas'} onPress={()=>setOpen(open==='areas'?null:'areas')}
      />
      {open==='areas' && (
        <View style={s.panel}>
          <TouchableOpacity style={s.checkRow} onPress={()=>set('covers_all_malta', !f.covers_all_malta)}>
            <View style={[s.check, f.covers_all_malta&&s.checkOn]}>
              {f.covers_all_malta && <Text style={s.checkTxt}>✓</Text>}
            </View>
            <View style={{flex:1}}>
              <Text style={s.optLbl}>All of Malta</Text>
              <Text style={s.optDesc}>Every locality on the main island</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={s.checkRow} onPress={()=>set('covers_all_gozo', !f.covers_all_gozo)}>
            <View style={[s.check, f.covers_all_gozo&&s.checkOn]}>
              {f.covers_all_gozo && <Text style={s.checkTxt}>✓</Text>}
            </View>
            <View style={{flex:1}}>
              <Text style={s.optLbl}>All of Gozo and Comino</Text>
              <Text style={s.optDesc}>Including the ferry crossing</Text>
            </View>
          </TouchableOpacity>

          {(!f.covers_all_malta || !f.covers_all_gozo) && (
            <>
              <Text style={s.lbl}>
                {f.covers_all_malta ? 'Pick Gozo localities' :
                 f.covers_all_gozo  ? 'Pick Malta localities' : 'Or pick specific areas'}
              </Text>
              <MultiPicker
                values={f.service_areas}
                options={
                  f.covers_all_malta ? GOZO_LOCALITIES :
                  f.covers_all_gozo  ? MALTA_MAIN :
                  [...MALTA_MAIN, ...GOZO_LOCALITIES]
                }
                onChange={(v)=>set('service_areas', v)}
                placeholder="Choose areas"
                title="Where do you work?"
              />
            </>
          )}

          <SaveBtn busy={saving} onPress={()=>{
            const areas = f.covers_all_malta && f.covers_all_gozo ? ['All Malta','All Gozo']
              : f.covers_all_malta ? ['All Malta', ...f.service_areas.filter((a:string)=>GOZO_LOCALITIES.includes(a))]
              : f.covers_all_gozo  ? ['All Gozo',  ...f.service_areas.filter((a:string)=>MALTA_MAIN.includes(a))]
              : f.service_areas;
            save({
              covers_all_malta: !!f.covers_all_malta,
              covers_all_gozo:  !!f.covers_all_gozo,
              service_areas: areas.length ? areas : ['Malta'],
            });
          }} />
        </View>
      )}

      {/* ══ ABOUT ══ */}
      <Row
        icon="📝" title="About you"
        value={f.bio ? `${f.bio.length} characters` : 'Not written'}
        open={open==='about'} onPress={()=>setOpen(open==='about'?null:'about')}
      />
      {open==='about' && (
        <View style={s.panel}>
          <Text style={s.panelHint}>
            This is what a client reads before booking you. Honest and specific beats
            long and vague.
          </Text>
          <TextInput style={[s.input,{minHeight:120}]} value={f.bio}
            onChangeText={(t:string)=>set('bio',t)}
            placeholder="Eight years in hotel housekeeping. Thorough with kitchens and bathrooms, always on time."
            placeholderTextColor={C.muted} multiline textAlignVertical="top" />
          <SaveBtn busy={saving} onPress={()=>save({ bio: f.bio.trim() })} />
        </View>
      )}

      {/* ══ PAYMENT ══ */}
      <Row
        icon="🏦" title="Getting paid"
        value={f.iban ? formatIban(f.iban).slice(0,13) + '…' : 'Not set'}
        open={open==='payment'} onPress={()=>setOpen(open==='payment'?null:'payment')}
      />
      {open==='payment' && (
        <View style={s.panel}>
          <Text style={s.lbl}>Account holder</Text>
          <TextInput style={s.input} value={f.account_holder}
            onChangeText={(t:string)=>set('account_holder',t)}
            placeholder="As your bank has it" placeholderTextColor={C.muted} />

          <Text style={s.lbl}>IBAN</Text>
          <TextInput style={s.input} value={f.iban}
            onChangeText={(t:string)=>set('iban', t.toUpperCase())}
            onBlur={()=>set('iban', formatIban(f.iban))}
            placeholder="MT84 MALT …" placeholderTextColor={C.muted} autoCapitalize="characters" />
          {f.iban.length > 4 && (() => {
            const r = validateIban(f.iban);
            return <Text style={[s.note,{color: r.ok ? C.green : C.red}]}>
              {r.ok ? '✓ Checks out' : r.reason}
            </Text>;
          })()}

          <Text style={s.lbl}>Bank</Text>
          <TextInput style={s.input} value={f.bank_name}
            onChangeText={(t:string)=>set('bank_name',t)}
            placeholder="BOV, HSBC, Revolut…" placeholderTextColor={C.muted} />

          <SaveBtn busy={saving}
            disabled={!validateIban(f.iban).ok}
            onPress={()=>save({
              iban: f.iban.replace(/\s+/g,'').toUpperCase(),
              bank_name: f.bank_name.trim(),
              account_holder: f.account_holder.trim(),
            })} />
        </View>
      )}

      {/* ══ static links ══ */}
      <Text style={s.sectionTitle}>Account</Text>

      <TouchableOpacity style={s.linkRow} onPress={()=>router.push('/onboarding')}>
        <Text style={s.linkIcon}>📄</Text>
        <View style={{flex:1}}>
          <Text style={s.linkTitle}>Documents and identity</Text>
          <Text style={s.linkSub}>ID, selfie, work permit, insurance</Text>
        </View>
        <Text style={s.chev}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.linkRow} onPress={()=>router.push('/legal?doc=terms')}>
        <Text style={s.linkIcon}>⚖️</Text>
        <View style={{flex:1}}>
          <Text style={s.linkTitle}>Terms of Service</Text>
          <Text style={s.linkSub}>Commission, cancellations, responsibilities</Text>
        </View>
        <Text style={s.chev}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.linkRow} onPress={()=>router.push('/legal?doc=privacy')}>
        <Text style={s.linkIcon}>🛡</Text>
        <View style={{flex:1}}>
          <Text style={s.linkTitle}>Privacy Notice</Text>
          <Text style={s.linkSub}>What we hold and for how long</Text>
        </View>
        <Text style={s.chev}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.signOut} onPress={signOut}>
        <Text style={s.signOutTxt}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={s.version}>Poji · Malta</Text>
      <View style={{height:40}}/>
    </ScrollView>
  );
}

function Row({icon, title, value, open, onPress}: any) {
  return (
    <TouchableOpacity style={[s.row, open&&s.rowOpen]} onPress={onPress}>
      <Text style={s.rowIcon}>{icon}</Text>
      <View style={{flex:1}}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.rowValue}>{value}</Text>
      </View>
      <Text style={[s.chev, open&&{transform:[{rotate:'90deg'}]}]}>›</Text>
    </TouchableOpacity>
  );
}

function SaveBtn({busy, onPress, disabled}: any) {
  return (
    <TouchableOpacity style={[s.saveBtn, (busy||disabled)&&s.saveDis]}
      disabled={busy||disabled} onPress={onPress}>
      {busy ? <ActivityIndicator color={C.white} size="small" />
        : <Text style={s.saveTxt}>Save changes</Text>}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:C.bg},
  hero:{alignItems:'center',paddingTop:60,paddingBottom:20,backgroundColor:C.white,
    borderBottomWidth:1,borderBottomColor:C.border,gap:10},
  name:{fontSize:21,fontWeight:'800',color:C.dark},
  statusPill:{paddingHorizontal:14,paddingVertical:5,borderRadius:20,borderWidth:1},
  statusOk:{backgroundColor:C.greenLt,borderColor:'#A7F3D0'},
  statusWait:{backgroundColor:C.amberLt,borderColor:'#FDE68A'},
  statusBad:{backgroundColor:C.redLt,borderColor:'#FECACA'},
  statusTxt:{fontSize:12,fontWeight:'800'},
  savedNote:{fontSize:11,color:C.green,fontWeight:'700',textAlign:'center',marginTop:10},
  errBox:{marginHorizontal:20,marginTop:12,backgroundColor:C.redLt,borderRadius:12,padding:12,
    borderWidth:1,borderColor:'#FECACA'},
  errTxt:{fontSize:13,color:C.red,fontWeight:'600'},

  availCard:{flexDirection:'row',alignItems:'center',gap:14,marginHorizontal:20,marginTop:18,
    backgroundColor:C.white,borderRadius:16,padding:16,borderWidth:1,borderColor:C.border,...S.sm},
  availTitle:{fontSize:15,fontWeight:'800',color:C.dark},
  availTxt:{fontSize:12,color:C.muted,marginTop:3,lineHeight:17},

  row:{flexDirection:'row',alignItems:'center',gap:14,marginHorizontal:20,marginTop:10,
    backgroundColor:C.white,borderRadius:16,padding:16,borderWidth:1,borderColor:C.border},
  rowOpen:{borderColor:C.primary,borderBottomLeftRadius:0,borderBottomRightRadius:0,marginBottom:0},
  rowIcon:{fontSize:22},
  rowTitle:{fontSize:15,fontWeight:'700',color:C.dark},
  rowValue:{fontSize:12,color:C.muted,marginTop:3},
  chev:{fontSize:22,color:C.border},

  panel:{marginHorizontal:20,backgroundColor:C.white,borderBottomLeftRadius:16,
    borderBottomRightRadius:16,padding:16,paddingTop:4,borderWidth:1,borderTopWidth:0,
    borderColor:C.primary,gap:4},
  panelHint:{fontSize:12,color:C.muted,lineHeight:18,marginBottom:10,marginTop:8},
  lbl:{fontSize:11,fontWeight:'700',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.5,marginTop:16,marginBottom:8},
  note:{fontSize:12,fontWeight:'700',marginTop:6},
  input:{backgroundColor:C.bg,borderRadius:12,paddingHorizontal:14,paddingVertical:13,
    fontSize:15,color:C.text,borderWidth:1.5,borderColor:C.border},
  inputBig:{backgroundColor:C.bg,borderRadius:12,paddingVertical:16,fontSize:26,fontWeight:'800',
    color:C.dark,borderWidth:2,borderColor:C.primary,textAlign:'center'},

  tradeGroup:{marginBottom:14},
  tradeHead:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8},
  tradeHeadTxt:{fontSize:13,fontWeight:'800',color:C.dark},
  countPill:{backgroundColor:C.primary,minWidth:20,height:20,borderRadius:10,
    alignItems:'center',justifyContent:'center',paddingHorizontal:6},
  countTxt:{fontSize:11,fontWeight:'800',color:C.white},
  pillWrap:{flexDirection:'row',flexWrap:'wrap',gap:8},
  pill:{paddingHorizontal:12,paddingVertical:9,borderRadius:20,backgroundColor:C.bg,
    borderWidth:1.5,borderColor:C.border},
  pillOn:{backgroundColor:C.primary,borderColor:C.primary},
  pillTxt:{fontSize:12,fontWeight:'600',color:C.muted},
  pillTxtOn:{color:C.white},

  checkRow:{flexDirection:'row',alignItems:'center',gap:12,padding:13,borderRadius:12,
    borderWidth:1.5,borderColor:C.border,backgroundColor:C.bg,marginTop:8},
  check:{width:22,height:22,borderRadius:7,borderWidth:2,borderColor:C.border,
    alignItems:'center',justifyContent:'center'},
  checkOn:{backgroundColor:C.primary,borderColor:C.primary},
  checkTxt:{color:C.white,fontSize:13,fontWeight:'800'},
  optLbl:{fontSize:14,fontWeight:'700',color:C.dark},
  optDesc:{fontSize:11,color:C.muted,marginTop:2},

  roadBox:{backgroundColor:C.amberLt,borderRadius:14,padding:14,marginTop:6,
    borderWidth:1,borderColor:'#FDE68A'},
  calcBox:{backgroundColor:C.bgAlt,borderRadius:12,padding:12,gap:7,marginTop:10,
    borderWidth:1,borderColor:C.border},
  calcRow:{flexDirection:'row',justifyContent:'space-between'},
  calcLbl:{fontSize:12,color:C.muted},
  calcVal:{fontSize:13,fontWeight:'700',color:C.dark},

  saveBtn:{backgroundColor:C.primary,borderRadius:12,paddingVertical:14,alignItems:'center',marginTop:20},
  saveDis:{opacity:0.5},
  saveTxt:{color:C.white,fontSize:14,fontWeight:'700'},

  sectionTitle:{fontSize:12,fontWeight:'800',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.7,paddingHorizontal:20,marginTop:28,marginBottom:10},
  linkRow:{flexDirection:'row',alignItems:'center',gap:14,marginHorizontal:20,marginBottom:8,
    backgroundColor:C.white,borderRadius:14,padding:15,borderWidth:1,borderColor:C.border},
  linkIcon:{fontSize:20},
  linkTitle:{fontSize:14,fontWeight:'700',color:C.text},
  linkSub:{fontSize:11,color:C.muted,marginTop:2},

  signOut:{marginHorizontal:20,marginTop:16,borderWidth:1.5,borderColor:C.red,
    borderRadius:14,paddingVertical:14,alignItems:'center'},
  signOutTxt:{color:C.red,fontWeight:'700',fontSize:15},
  version:{textAlign:'center',fontSize:12,color:C.muted,marginTop:14},
});
