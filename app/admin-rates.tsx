import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { LABOUR_COMMISSION, CLIENT_FEE } from '../lib/services';

/**
 * Special rates: a commission for one provider, or a service fee for one
 * client, for a period.
 *
 * Its own screen rather than another section of admin.tsx, which is
 * already seventy kilobytes and does seven jobs.
 *
 * The rate is never applied retroactively. A booking freezes what it was
 * priced at, so ending a deal today leaves every job already taken at
 * the rate it was agreed on - which is why ending one is safe and does
 * not need a warning.
 */

type Kind = 'provider_commission' | 'client_fee';

type Deal = {
  id: string;
  kind: Kind;
  subject_id: string;
  service_type_id: string | null;
  rate: number;
  starts_on: string;
  ends_on: string | null;
  note: string | null;
  created_at: string;
};

type Person = { id: string; name: string; role: string };
type Svc    = { id: string; name: string; labour_commission: number | null };

const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
};

const pretty = (iso: string | null) =>
  !iso ? 'open-ended'
       : new Date(iso + 'T00:00:00').toLocaleDateString('en-GB',
           { day:'numeric', month:'short', year:'numeric' });

export default function AdminRates() {
  const [loading, setLoad] = useState(true);
  const [denied, setDenied] = useState(false);

  const [deals, setDeals]   = useState<Deal[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [svcs, setSvcs]     = useState<Svc[]>([]);

  const [kind, setKind]       = useState<Kind>('provider_commission');
  const [search, setSearch]   = useState('');
  const [subject, setSubject] = useState<Person | null>(null);
  const [svcId, setSvcId]     = useState('');          // '' means every service
  const [pct, setPct]         = useState('5');
  const [from, setFrom]       = useState(today());
  const [to, setTo]           = useState('');
  const [note, setNote]       = useState('');

  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/auth'); return; }

    const { data: me } = await supabase.from('profiles')
      .select('role').eq('id', user.id).maybeSingle();
    if (me?.role !== 'admin') { setDenied(true); setLoad(false); return; }

    const [d, p, cp, st] = await Promise.all([
      supabase.from('rate_overrides').select('*').order('created_at', { ascending:false }),
      supabase.from('profiles').select('id, full_name, role'),
      supabase.from('cleaner_profiles').select('id, first_name, last_name'),
      supabase.from('service_types').select('id, name, labour_commission').order('name'),
    ]);

    /* A provider's own names live on cleaner_profiles and are often the
       only ones filled in, so those win where they exist. */
    const names = new Map<string,string>();
    (cp.data || []).forEach((c:any) => {
      const n = `${c.first_name || ''} ${c.last_name || ''}`.trim();
      if (n) names.set(c.id, n);
    });

    setDeals((d.data || []) as Deal[]);
    setPeople(((p.data || []) as any[]).map(r => ({
      id: r.id,
      name: names.get(r.id) || r.full_name || '(no name)',
      role: r.role || 'client',
    })));
    setSvcs((st.data || []) as Svc[]);
    setLoad(false);
  };

  useEffect(() => { load(); }, []);

  /* A commission belongs to a provider and a fee to a client, so the
     list to search depends on which kind is being written. Choosing the
     wrong sort of person is a mistake the screen should not allow
     rather than one it reports. */
  const wantRole = kind === 'provider_commission' ? 'cleaner' : 'client';
  const matches  = !search.trim() ? [] : people
    .filter(p => p.role === wantRole)
    .filter(p => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 8);

  const nameOf = (id: string) =>
    people.find(p => p.id === id)?.name || id.slice(0, 8);
  const svcOf  = (id: string | null) =>
    !id ? 'All services' : (svcs.find(x => x.id === id)?.name || id);

  /** What this deal replaces, so a percentage means something. */
  const normally = (d: Deal) => {
    if (d.kind === 'client_fee') return CLIENT_FEE * 100;
    const own = d.service_type_id
      ? svcs.find(x => x.id === d.service_type_id)?.labour_commission
      : null;
    return (Number(own) > 0 ? Number(own) : LABOUR_COMMISSION) * 100;
  };

  const problem = (): string => {
    if (!subject) return 'Choose who this applies to.';
    const n = Number(pct);
    if (!isFinite(n) || n < 0 || n > 100) return 'The rate has to be between 0 and 100.';
    if (!from) return 'Give it a start date.';
    if (to && to < from) return 'The end date is before the start date.';
    return '';
  };

  const save = async () => {
    setError(''); setSaved('');
    const p = problem();
    if (p) { setError(p); return; }

    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { error: failed } = await supabase.from('rate_overrides').insert({
      kind,
      subject_id: subject!.id,
      service_type_id: svcId || null,
      rate: Number((Number(pct) / 100).toFixed(4)),
      starts_on: from,
      ends_on: to || null,
      note: note.trim() || null,
      created_by: user?.id || null,
    });

    setBusy(false);
    if (failed) { setError(failed.message); return; }

    setSaved(`${subject!.name} is on ${pct}% ${kind === 'client_fee' ? 'service fee' : 'commission'}.`);
    setSubject(null); setSearch(''); setSvcId(''); setNote(''); setTo('');
    await load();
  };

  const endToday = async (id: string) => {
    setBusy(true);
    await supabase.from('rate_overrides').update({ ends_on: today() }).eq('id', id);
    setBusy(false);
    await load();
  };

  const remove = async (id: string) => {
    setBusy(true);
    await supabase.from('rate_overrides').delete().eq('id', id);
    setBusy(false);
    await load();
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.primary} /></View>;
  }

  if (denied) {
    return (
      <View style={s.center}>
        <Text style={s.deniedTxt}>This screen is for admins.</Text>
        <TouchableOpacity style={s.back} onPress={()=>router.replace('/')}>
          <Text style={s.backTxt}>←  Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const t = today();
  const inForce   = deals.filter(d => d.starts_on <= t && (!d.ends_on || d.ends_on >= t));
  const scheduled = deals.filter(d => d.starts_on > t);
  const ended     = deals.filter(d => !!d.ends_on && d.ends_on < t);

  const row = (d: Deal, live: boolean) => (
    <View key={d.id} style={s.deal}>
      <View style={{flex:1, gap:3}}>
        <Text style={s.dealWho}>{nameOf(d.subject_id)}</Text>
        <Text style={s.dealWhat}>
          {d.kind === 'client_fee' ? 'Service fee' : 'Commission'} · {svcOf(d.service_type_id)}
        </Text>
        <Text style={s.dealWhen}>
          {pretty(d.starts_on)} → {pretty(d.ends_on)}
        </Text>
        {!!d.note && <Text style={s.dealNote}>"{d.note}"</Text>}
      </View>

      <View style={{alignItems:'flex-end', gap:6}}>
        <Text style={s.dealRate}>{(d.rate * 100).toFixed(2).replace(/\.00$/,'')}%</Text>
        <Text style={s.dealWas}>normally {normally(d).toFixed(0)}%</Text>
        <View style={{flexDirection:'row', gap:6}}>
          {live && !d.ends_on && (
            <TouchableOpacity style={s.smallBtn} disabled={busy}
              onPress={()=>endToday(d.id)}>
              <Text style={s.smallTxt}>End today</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.smallBtn, s.smallDanger]} disabled={busy}
            onPress={()=>remove(d.id)}>
            <Text style={[s.smallTxt, {color:C.red}]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const DateField = ({ value, onChange, min }: any) => (
    Platform.OS === 'web' ? (
      // @ts-ignore — a native date input on web beats free text
      <input type="date" value={value} min={min}
        onChange={(e:any)=>onChange(e.target.value)}
        style={{
          backgroundColor:'#fff', borderRadius:12, padding:12, fontSize:14,
          color:'#374151', border:`1.5px solid ${C.border}`, width:'100%',
          fontFamily:'inherit', boxSizing:'border-box',
        }} />
    ) : (
      <TextInput style={s.input} value={value} onChangeText={onChange}
        placeholder="YYYY-MM-DD" placeholderTextColor={C.muted} />
    )
  );

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.container}>
      <TouchableOpacity style={s.back} onPress={()=>router.push('/admin')}>
        <Text style={s.backTxt}>←  Admin</Text>
      </TouchableOpacity>

      <Text style={s.h1}>Special rates</Text>
      <Text style={s.lede}>
        A lower commission for a provider you are bringing on, or a waived service
        fee for a client. Dated, so it ends by itself. Nothing already booked
        changes: every job keeps the rate it was priced at.
      </Text>

      {/* ── new deal ── */}
      <View style={s.card}>
        <Text style={s.cardTitle}>New rate</Text>

        <View style={s.kindRow}>
          {([
            ['provider_commission', '🛠  Provider commission'],
            ['client_fee',          '🏠  Client service fee'],
          ] as [Kind, string][]).map(([k, label]) => (
            <TouchableOpacity key={k}
              style={[s.kindBtn, kind===k && s.kindOn]}
              onPress={()=>{ setKind(k); setSubject(null); setSearch(''); }}>
              <Text style={[s.kindTxt, kind===k && s.kindTxtOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.lbl}>
          {kind === 'provider_commission' ? 'Which provider' : 'Which client'}
        </Text>

        {subject ? (
          <View style={s.chosen}>
            <Text style={s.chosenTxt}>{subject.name}</Text>
            <TouchableOpacity onPress={()=>{ setSubject(null); setSearch(''); }}>
              <Text style={s.chosenClear}>change</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TextInput style={s.input} value={search} onChangeText={setSearch}
              placeholder="Start typing a name" placeholderTextColor={C.muted} />
            {matches.map(p => (
              <TouchableOpacity key={p.id} style={s.match} onPress={()=>setSubject(p)}>
                <Text style={s.matchTxt}>{p.name}</Text>
              </TouchableOpacity>
            ))}
            {!!search.trim() && matches.length === 0 && (
              <Text style={s.none}>
                Nobody by that name with a {wantRole === 'cleaner' ? 'provider' : 'client'} account.
              </Text>
            )}
          </>
        )}

        <Text style={s.lbl}>Which services</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{gap:7, paddingVertical:2}}>
          <TouchableOpacity style={[s.pill, svcId==='' && s.pillOn]}
            onPress={()=>setSvcId('')}>
            <Text style={[s.pillTxt, svcId==='' && s.pillTxtOn]}>All services</Text>
          </TouchableOpacity>
          {svcs.map(sv => (
            <TouchableOpacity key={sv.id} style={[s.pill, svcId===sv.id && s.pillOn]}
              onPress={()=>setSvcId(sv.id)}>
              <Text style={[s.pillTxt, svcId===sv.id && s.pillTxtOn]}>{sv.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={s.lbl}>Rate</Text>
        <View style={s.pctRow}>
          <TextInput style={[s.input, {flex:1}]} value={pct} onChangeText={setPct}
            keyboardType="decimal-pad" placeholder="5" placeholderTextColor={C.muted} />
          <Text style={s.pctSign}>%</Text>
        </View>
        <Text style={s.hint}>
          {kind === 'provider_commission'
            ? `Instead of ${(LABOUR_COMMISSION*100).toFixed(0)}%, or the service's own rate where it has one. Zero means Poji takes nothing from their labour.`
            : `Instead of ${(CLIENT_FEE*100).toFixed(0)}%. Zero means this client pays no service fee.`}
        </Text>

        <View style={s.dates}>
          <View style={{flex:1}}>
            <Text style={s.lbl}>From</Text>
            <DateField value={from} onChange={setFrom} />
          </View>
          <View style={{flex:1}}>
            <Text style={s.lbl}>Until (optional)</Text>
            <DateField value={to} onChange={setTo} min={from} />
          </View>
        </View>

        <Text style={s.lbl}>Note to yourself</Text>
        <TextInput style={s.input} value={note} onChangeText={setNote}
          placeholder="Founding provider, first six months"
          placeholderTextColor={C.muted} />

        {!!error && <View style={s.errBox}><Text style={s.errTxt}>⚠️  {error}</Text></View>}
        {!!saved && <View style={s.okBox}><Text style={s.okTxt}>✓  {saved}</Text></View>}

        <TouchableOpacity style={[s.primary, busy&&{opacity:0.6}]} disabled={busy}
          onPress={save}>
          {busy ? <ActivityIndicator color={C.white} />
                : <Text style={s.primaryTxt}>Save this rate</Text>}
        </TouchableOpacity>
      </View>

      {/* ── what exists ── */}
      {[
        ['In force now', inForce,   true ] as const,
        ['Starting later', scheduled, false] as const,
        ['Finished', ended, false] as const,
      ].map(([title, list, live]) => (
        <View key={title} style={s.section}>
          <Text style={s.sectionTitle}>{title} · {list.length}</Text>
          {list.length === 0
            ? <Text style={s.none}>Nothing here.</Text>
            : list.map(d => row(d, live))}
        </View>
      ))}

      <View style={{height:40}} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  container:{paddingHorizontal:20,paddingTop:48,paddingBottom:20,gap:16,
    maxWidth:860,width:'100%',alignSelf:'center'},
  center:{flex:1,alignItems:'center',justifyContent:'center',gap:14,backgroundColor:C.bg},
  deniedTxt:{fontSize:15,color:C.muted,fontWeight:'600'},

  back:{alignSelf:'flex-start',paddingVertical:6},
  backTxt:{fontSize:14,color:C.primary,fontWeight:'700'},

  h1:{fontSize:26,fontWeight:'800',color:C.dark},
  lede:{fontSize:13,color:C.muted,lineHeight:20},

  card:{backgroundColor:C.white,borderRadius:18,padding:18,gap:4,
    borderWidth:1,borderColor:C.border,...S.sm},
  cardTitle:{fontSize:15,fontWeight:'800',color:C.dark,marginBottom:8},

  kindRow:{flexDirection:'row',gap:8,marginBottom:6},
  kindBtn:{flex:1,paddingVertical:11,borderRadius:12,alignItems:'center',
    backgroundColor:C.bgAlt,borderWidth:1.5,borderColor:C.border},
  kindOn:{backgroundColor:C.primaryLt,borderColor:C.primary},
  kindTxt:{fontSize:12,fontWeight:'700',color:C.muted},
  kindTxtOn:{color:C.primary},

  lbl:{fontSize:11,fontWeight:'700',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.5,marginTop:12,marginBottom:4},
  input:{backgroundColor:C.bg,borderRadius:12,paddingHorizontal:14,paddingVertical:12,
    fontSize:14,color:C.text,borderWidth:1.5,borderColor:C.border},
  hint:{fontSize:11,color:C.muted,marginTop:5,lineHeight:16},

  match:{paddingVertical:10,paddingHorizontal:14,borderBottomWidth:1,
    borderBottomColor:C.bg},
  matchTxt:{fontSize:14,color:C.text,fontWeight:'600'},
  none:{fontSize:12,color:C.muted,paddingVertical:8},

  chosen:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
    backgroundColor:C.primaryLt,borderRadius:12,paddingHorizontal:14,paddingVertical:12,
    borderWidth:1,borderColor:C.border},
  chosenTxt:{fontSize:14,fontWeight:'700',color:C.primary},
  chosenClear:{fontSize:12,color:C.muted,fontWeight:'600'},

  pill:{paddingHorizontal:12,paddingVertical:8,borderRadius:16,backgroundColor:C.bgAlt,
    borderWidth:1,borderColor:C.border},
  pillOn:{backgroundColor:C.primary,borderColor:C.primary},
  pillTxt:{fontSize:11,fontWeight:'700',color:C.muted},
  pillTxtOn:{color:C.white},

  pctRow:{flexDirection:'row',alignItems:'center',gap:10},
  pctSign:{fontSize:17,fontWeight:'800',color:C.muted},

  dates:{flexDirection:'row',gap:12},

  errBox:{backgroundColor:C.redLt,borderRadius:10,padding:11,marginTop:14,
    borderWidth:1,borderColor:'#FECACA'},
  errTxt:{fontSize:12,color:C.red,fontWeight:'600'},
  okBox:{backgroundColor:C.greenLt,borderRadius:10,padding:11,marginTop:14,
    borderWidth:1,borderColor:'#A7F3D0'},
  okTxt:{fontSize:12,color:C.green,fontWeight:'700'},

  primary:{backgroundColor:C.primary,borderRadius:14,paddingVertical:15,
    alignItems:'center',marginTop:16},
  primaryTxt:{color:C.white,fontWeight:'700',fontSize:15},

  section:{backgroundColor:C.white,borderRadius:18,padding:16,gap:10,
    borderWidth:1,borderColor:C.border,...S.sm},
  sectionTitle:{fontSize:11,fontWeight:'800',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.8},

  deal:{flexDirection:'row',gap:12,paddingVertical:12,borderTopWidth:1,
    borderTopColor:C.bg},
  dealWho:{fontSize:14,fontWeight:'800',color:C.dark},
  dealWhat:{fontSize:12,color:C.text},
  dealWhen:{fontSize:11,color:C.muted},
  dealNote:{fontSize:11,color:C.muted,fontStyle:'italic'},
  dealRate:{fontSize:20,fontWeight:'800',color:C.primary},
  dealWas:{fontSize:10,color:C.muted},

  smallBtn:{paddingHorizontal:10,paddingVertical:6,borderRadius:9,
    backgroundColor:C.bgAlt,borderWidth:1,borderColor:C.border},
  smallDanger:{borderColor:'#FECACA'},
  smallTxt:{fontSize:11,fontWeight:'700',color:C.muted},
});
