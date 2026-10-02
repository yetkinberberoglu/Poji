import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Linking, Platform
} from 'react-native';
import { router } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { findTrade, TRADES } from '../constants/trades';
import { nextPenalty, PENALTIES } from '../lib/moderation';
import { notify } from '../lib/notify';

const TABS = ['Overview','Applications','Clients','Providers','Bookings','Disputes','Flagged'];

const APP_STATUS: Record<string,{label:string;color:string;bg:string}> = {
  draft:        {label:'Draft',        color:C.muted, bg:C.bgAlt},
  submitted:    {label:'Submitted',    color:C.amber, bg:C.amberLt},
  under_review: {label:'Under review', color:C.teal,  bg:C.tealLt},
  approved:     {label:'Approved',     color:C.green, bg:C.greenLt},
  rejected:     {label:'Rejected',     color:C.red,   bg:C.redLt},
};

const BK_STATUS: Record<string,{label:string;color:string;bg:string}> = {
  pending:               {label:'Pending',       color:C.amber,  bg:C.amberLt},
  pending_pool:          {label:'In pool',       color:C.accent, bg:'#F3E8FF'},
  reschedule_proposed:   {label:'Time offered',  color:C.teal,   bg:C.tealLt},
  accepted:              {label:'Accepted',      color:C.green,  bg:C.greenLt},
  en_route:              {label:'En route',      color:C.teal,   bg:C.tealLt},
  arrived:               {label:'Arrived',       color:C.amber,  bg:C.amberLt},
  in_progress:           {label:'In progress',   color:C.primary,bg:C.primaryLt},
  awaiting_confirmation: {label:'Awaiting',      color:C.teal,   bg:C.tealLt},
  completed:             {label:'Completed',     color:C.green,  bg:C.greenLt},
  disputed:              {label:'Disputed',      color:C.red,    bg:C.redLt},
  cancelled:             {label:'Cancelled',     color:C.red,    bg:C.redLt},
};


const prettyDate = (d?: string) => {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((dt.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return dt.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
};

const money = (n:number) => '€' + (Number(n)||0).toLocaleString('en-MT',{minimumFractionDigits:2,maximumFractionDigits:2});
const dayjs = (d:string) => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}) : '—';
const daysAgo = (d:string) => d ? Math.floor((Date.now()-new Date(d).getTime())/86400000) : 9999;

export default function Admin() {
  const [tab, setTab]            = useState(0);
  const [apps, setApps]          = useState<any[]>([]);
  const [profiles, setProfiles]  = useState<any[]>([]);
  const [bookings, setBookings]  = useState<any[]>([]);
  const [reviews, setReviews]    = useState<any[]>([]);
  const [flagged, setFlagged]    = useState<any[]>([]);
  const [violations, setViol]    = useState<any[]>([]);
  const [penaltyFor, setPenalty] = useState<string|null>(null);
  const [penaltyNote, setPNote]  = useState('');
  const [loading, setLoading]    = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [busy, setBusy]          = useState<string|null>(null);
  const [expanded, setExpanded]  = useState<string|null>(null);
  const [rejectFor, setRejectFor]= useState<string|null>(null);
  const [rejectText, setRejectTxt] = useState('');
  const [search, setSearch]      = useState('');
  const [tradeFilter, setTradeF] = useState<string|null>(null);
  const [notAdmin, setNotAdmin]  = useState(false);

  const load = async () => {
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/auth'); return; }

    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (me?.role !== 'admin') { setNotAdmin(true); setLoading(false); return; }

    const [a, p, b, r, fl, vi] = await Promise.all([
      supabase.from('cleaner_profiles').select('*').order('submitted_at',{ascending:false}),
      supabase.from('profiles').select('*'),
      supabase.from('bookings').select('*').order('created_at',{ascending:false}),
      supabase.from('reviews').select('*'),
      supabase.from('messages').select('*').eq('flagged', true)
        .order('created_at', { ascending:false }).limit(100),
      supabase.from('violations').select('*').order('created_at', { ascending:false }),
    ]);

    setApps(a.data||[]); setProfiles(p.data||[]);
    setBookings(b.data||[]); setReviews(r.data||[]);
    setFlagged(fl.data||[]); setViol(vi.data||[]);
    setLoading(false);
  };

  useEffect(()=>{ load(); },[]);
  const onRefresh = async () => { setRefresh(true); await load(); setRefresh(false); };

  // ── Derived stats ──
  const stats = useMemo(()=>{
    const completed = bookings.filter(b=>b.status==='completed');
    const cancelled = bookings.filter(b=>b.status==='cancelled');
    const disputed  = bookings.filter(b=>b.status==='disputed');
    const active    = bookings.filter(b=>!['completed','cancelled','disputed'].includes(b.status));

    const gmv        = completed.reduce((s,b)=>s+Number(b.price_ex_vat||0),0);
    const commission = completed.reduce((s,b)=>s+Number(b.platform_commission||0),0);
    const payouts    = completed.reduce((s,b)=>s+Number(b.cleaner_payment||0),0);

    const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0);
    const lastMonth = new Date(thisMonth); lastMonth.setMonth(lastMonth.getMonth()-1);

    const cm = completed.filter(b=>new Date(b.created_at)>=thisMonth);
    const lm = completed.filter(b=>{const d=new Date(b.created_at); return d>=lastMonth && d<thisMonth;});

    const cmRev = cm.reduce((s,b)=>s+Number(b.platform_commission||0),0);
    const lmRev = lm.reduce((s,b)=>s+Number(b.platform_commission||0),0);
    const growth = lmRev>0 ? ((cmRev-lmRev)/lmRev)*100 : (cmRev>0?100:0);

    // Client behaviour
    const byClient: Record<string,any[]> = {};
    bookings.forEach(b=>{ (byClient[b.client_id] ||= []).push(b); });
    const clientIds   = Object.keys(byClient);
    const repeatIds   = clientIds.filter(id=>byClient[id].filter(b=>b.status==='completed').length>=2);
    const repeatRate  = clientIds.length ? (repeatIds.length/clientIds.length)*100 : 0;
    const avgOrders   = clientIds.length ? bookings.length/clientIds.length : 0;

    const avgRating = reviews.length
      ? reviews.reduce((s,r)=>s+Number(r.rating||0),0)/reviews.length : 0;

    return {
      total: bookings.length, completed: completed.length, cancelled: cancelled.length,
      disputed: disputed.length, active: active.length,
      gmv, commission, payouts,
      completionRate: bookings.length ? (completed.length/bookings.length)*100 : 0,
      cancelRate:     bookings.length ? (cancelled.length/bookings.length)*100 : 0,
      cmCount: cm.length, lmCount: lm.length, cmRev, lmRev, growth,
      clientCount: clientIds.length, repeatCount: repeatIds.length, repeatRate, avgOrders,
      avgTicket: completed.length ? gmv/completed.length : 0,
      avgRating, reviewCount: reviews.length,
    };
  },[bookings, reviews]);

  // ── Clients with aggregates ──
  const clients = useMemo(()=>{
    return profiles.filter(p=>p.role==='client').map(p=>{
      const mine = bookings.filter(b=>b.client_id===p.id);
      const done = mine.filter(b=>b.status==='completed');
      const spent = done.reduce((s,b)=>s+Number(b.total_price||0),0);
      const dates = mine.map(b=>b.created_at).sort();
      return {
        ...p,
        orders: mine.length, completed: done.length, spent,
        first: dates[0], last: dates[dates.length-1],
        inactive: daysAgo(dates[dates.length-1]) > 30 && mine.length>0,
        isRepeat: done.length>=2,
      };
    }).sort((a,b)=>b.spent-a.spent);
  },[profiles, bookings]);

  // ── Cleaners with aggregates ──
  const cleaners = useMemo(()=>{
    return profiles.filter(p=>p.role==='cleaner').map(p=>{
      const app  = apps.find(a=>a.id===p.id);
      const mine = bookings.filter(b=>b.cleaner_id===p.id);
      const done = mine.filter(b=>b.status==='completed');
      const rej  = mine.filter(b=>b.status==='cancelled');
      const earned = done.reduce((s,b)=>s+Number(b.cleaner_payment||0),0);
      const myRevs = reviews.filter(r=>r.cleaner_id===p.id);
      const rating = myRevs.length ? myRevs.reduce((s,r)=>s+Number(r.rating||0),0)/myRevs.length : 0;
      return {
        ...p, app,
        jobs: mine.length, completed: done.length, cancelled: rej.length,
        earned, rating, reviewCount: myRevs.length,
        acceptRate: mine.length ? (done.length/mine.length)*100 : 0,
        status: app?.verification_status || 'none',
        categories: app?.categories || [],
        acceptsUrgent: !!app?.accepts_urgent,
      };
    }).sort((a,b)=>b.earned-a.earned);
  },[profiles, bookings, apps, reviews]);

  const nameOf = (id:string) => profiles.find(p=>p.id===id)?.full_name || id?.slice(0,8) || '—';

  // ── Actions ──
  const approve = async (id:string) => {
    setBusy(id);
    const { data:{ user } } = await supabase.auth.getUser();
    await supabase.from('cleaner_profiles').update({
      verification_status:'approved', reviewed_at:new Date().toISOString(),
      reviewed_by:user?.id, rejection_reason:null,
    }).eq('id', id);
    notify(id, 'application_approved', {});
    await load(); setBusy(null);
  };

  const reject = async (id:string) => {
    if (!rejectText.trim()) return;
    setBusy(id);
    const { data:{ user } } = await supabase.auth.getUser();
    await supabase.from('cleaner_profiles').update({
      verification_status:'rejected', rejection_reason:rejectText.trim(),
      reviewed_at:new Date().toISOString(), reviewed_by:user?.id,
    }).eq('id', id);
    notify(id, 'application_rejected', { reason: rejectText.trim() });
    setRejectFor(null); setRejectTxt(''); await load(); setBusy(null);
  };

  const revoke = async (id:string) => {
    setBusy(id);
    await supabase.from('cleaner_profiles')
      .update({ verification_status:'submitted', reviewed_at:null }).eq('id', id);
    await load(); setBusy(null);
  };

  const [confirmDelete, setConfirmDelete] = useState<string|null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const deleteBooking = async (id:string) => {
    setBusy(id);
    await supabase.from('booking_checklist').delete().eq('booking_id', id);
    await supabase.from('booking_extras').delete().eq('booking_id', id);
    await supabase.from('reviews').delete().eq('booking_id', id);
    await supabase.from('notifications').delete().eq('booking_id', id);
    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if (error) console.log('deleteBooking:', error.message);
    setConfirmDelete(null);
    await load();
    setBusy(null);
  };

  const clearFinished = async () => {
    const ids = bookings
      .filter(b => ['completed','cancelled'].includes(b.status))
      .map(b => b.id);
    if (!ids.length) return;
    setBulkBusy(true);
    await supabase.from('booking_checklist').delete().in('booking_id', ids);
    await supabase.from('booking_extras').delete().in('booking_id', ids);
    await supabase.from('reviews').delete().in('booking_id', ids);
    await supabase.from('notifications').delete().in('booking_id', ids);
    const { error } = await supabase.from('bookings').delete().in('id', ids);
    if (error) console.log('clearFinished:', error.message);
    setBulkBusy(false);
    await load();
  };

  const priorCount = (userId:string) =>
    violations.filter(v => v.user_id === userId).length;

  const raisePenalty = async (userId:string, bookingId:string|null, evidence:string) => {
    setBusy(userId);
    const { data:{ user } } = await supabase.auth.getUser();
    const prior = priorCount(userId);
    const pen   = nextPenalty(prior);

    await supabase.from('violations').insert({
      user_id: userId,
      booking_id: bookingId,
      kind: 'off_platform',
      severity: pen.severity,
      fine_amount: pen.fine,
      note: penaltyNote || pen.label,
      evidence,
      raised_by: user?.id,
      suspended_until: pen.severity === 'suspension'
        ? new Date(Date.now() + 30*864e5).toISOString().slice(0,10) : null,
    });

    // reflect it on the account
    const patch: any = { violation_count: prior + 1 };
    if (pen.fine > 0) {
      const { data: prof } = await supabase.from('profiles')
        .select('outstanding_fines').eq('id', userId).maybeSingle();
      patch.outstanding_fines = Number(prof?.outstanding_fines || 0) + pen.fine;
    }
    if (pen.severity === 'suspension')
      patch.suspended_until = new Date(Date.now() + 30*864e5).toISOString().slice(0,10);

    await supabase.from('profiles').update(patch).eq('id', userId);

    if (pen.severity === 'suspension' || pen.severity === 'ban') {
      await supabase.from('cleaner_profiles')
        .update({ available: false,
                  verification_status: pen.severity === 'ban' ? 'rejected' : 'approved',
                  suspended_until: patch.suspended_until || null })
        .eq('id', userId);
    }

    setPenalty(null); setPNote('');
    await load();
    setBusy(null);
  };

  const dismissFlag = async (msgId:string) => {
    setBusy(msgId);
    await supabase.from('messages').update({ flagged:false }).eq('id', msgId);
    await load();
    setBusy(null);
  };

  const resolveDispute = async (id:string, outcome:'completed'|'cancelled') => {
    setBusy(id);
    await supabase.from('bookings').update({ status: outcome }).eq('id', id);
    await load(); setBusy(null);
  };

  const viewDoc = async (path:string) => {
    if (!path) return;
    const { data, error } = await supabase.storage.from('verification-docs').createSignedUrl(path, 300);
    if (error || !data) { alert('Could not open document'); return; }
    if (Platform.OS==='web') window.open(data.signedUrl,'_blank'); else Linking.openURL(data.signedUrl);
  };

  const signOut = async () => {
    try { await supabase.auth.signOut({scope:'local'}); } catch(e) {}
    router.replace('/auth');
  };

  if (notAdmin) return (
    <View style={st.centerWrap}>
      <Text style={st.bigIcon}>🔒</Text>
      <Text style={st.centerTitle}>Admin access only</Text>
      <TouchableOpacity style={st.primaryBtn} onPress={signOut}>
        <Text style={st.primaryTxt}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) return (
    <View style={st.centerWrap}><ActivityIndicator color={C.primary} size="large" /></View>
  );

  const pendingApps = apps.filter(a=>['submitted','under_review'].includes(a.verification_status));
  const disputes    = bookings.filter(b=>b.status==='disputed');
  const q = search.toLowerCase();

  return (
    <ScrollView style={st.wrap} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary}/>}>

      <View style={st.hdr}>
        <View style={{flex:1}}>
          <Text style={st.heading}>Admin Panel</Text>
          <Text style={st.sub}>Poji Malta</Text>
        </View>
        <TouchableOpacity style={st.signOutBtn} onPress={signOut}>
          <Text style={st.signOutTxt}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.tabScroll}
        contentContainerStyle={st.tabRow}>
        {TABS.map((t,i)=>{
          const badge = i===1 ? pendingApps.length : i===5 ? disputes.length : 0;
          return (
            <TouchableOpacity key={t} style={[st.tab, tab===i&&st.tabOn]} onPress={()=>{setTab(i);setSearch('');}}>
              <Text style={[st.tabTxt, tab===i&&st.tabTxtOn]}>{t}</Text>
              {badge>0 && <View style={st.badge}><Text style={st.badgeTxt}>{badge}</Text></View>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ════════ OVERVIEW ════════ */}
      {tab===0 && (
        <View style={{gap:16}}>
          <View style={st.kpiGrid}>
            <Kpi label="Platform revenue" value={money(stats.commission)} sub="All time" color={C.green} wide />
            <Kpi label="GMV (ex-VAT)"     value={money(stats.gmv)}        sub="All time" color={C.primary} wide />
          </View>

          <View style={st.kpiGrid}>
            <Kpi label="This month"  value={money(stats.cmRev)}
                 sub={`${stats.cmCount} jobs`} color={C.primary} />
            <Kpi label="Last month"  value={money(stats.lmRev)}
                 sub={`${stats.lmCount} jobs`} color={C.muted} />
            <Kpi label="Growth"      value={`${stats.growth>=0?'+':''}${stats.growth.toFixed(0)}%`}
                 sub="MoM revenue" color={stats.growth>=0?C.green:C.red} />
          </View>

          <SectionCard title="Bookings">
            <Row k="Total"           v={String(stats.total)} />
            <Row k="Completed"       v={`${stats.completed}  ·  ${stats.completionRate.toFixed(0)}%`} good />
            <Row k="Active now"      v={String(stats.active)} />
            <Row k="Cancelled"       v={`${stats.cancelled}  ·  ${stats.cancelRate.toFixed(0)}%`} bad={stats.cancelRate>20} />
            <Row k="Disputed"        v={String(stats.disputed)} bad={stats.disputed>0} />
            <Row k="Avg ticket"      v={money(stats.avgTicket)} />
          </SectionCard>

          <SectionCard title="Clients">
            <Row k="Total clients"   v={String(stats.clientCount)} />
            <Row k="Repeat clients"  v={String(stats.repeatCount)} good />
            <Row k="Repeat rate"     v={`${stats.repeatRate.toFixed(0)}%`}
                 good={stats.repeatRate>=30} bad={stats.repeatRate<15 && stats.clientCount>3} />
            <Row k="Avg orders/client" v={stats.avgOrders.toFixed(1)} />
            <Row k="Inactive 30d+"   v={String(clients.filter(c=>c.inactive).length)}
                 bad={clients.filter(c=>c.inactive).length>0} />
          </SectionCard>

          <SectionCard title="Cleaners">
            <Row k="Total cleaners"   v={String(cleaners.length)} />
            <Row k="Approved"         v={String(cleaners.filter(c=>c.status==='approved').length)} good />
            <Row k="Pending review"   v={String(pendingApps.length)} bad={pendingApps.length>0} />
            <Row k="Total paid out"   v={money(stats.payouts)} />
            <Row k="Avg rating"       v={stats.avgRating ? `${stats.avgRating.toFixed(1)} ⭐  (${stats.reviewCount})` : '—'} />
          </SectionCard>
        </View>
      )}

      {/* ════════ APPLICATIONS ════════ */}
      {tab===1 && (
        apps.length===0 ? <Empty text="No applications yet" /> :
        apps.map(a=>{
          const meta = APP_STATUS[a.verification_status] || APP_STATUS.draft;
          const open = expanded===a.id;
          const isBusy = busy===a.id;
          return (
            <View key={a.id} style={st.card}>
              <TouchableOpacity style={st.rowBetween} onPress={()=>setExpanded(open?null:a.id)}>
                <View style={{flex:1}}>
                  <Text style={st.cardTitle}>{a.first_name} {a.last_name}</Text>
                  <Text style={st.cardSub}>{a.nationality||'—'} · {a.team_type} · €{a.hourly_rate}/hr</Text>
                </View>
                <View style={[st.pill,{backgroundColor:meta.bg}]}>
                  <Text style={[st.pillTxt,{color:meta.color}]}>{meta.label}</Text>
                </View>
                <Text style={st.chevron}>{open?'▲':'▼'}</Text>
              </TouchableOpacity>

              {open && (
                <View style={st.details}>
                  <Detail title="Identity" rows={[
                    ['Full name',`${a.first_name||''} ${a.last_name||''}`],
                    ['Born',a.date_of_birth], ['Nationality',a.nationality],
                    ['Phone',a.phone], ['Email',a.email],
                    ['Address',`${a.address||''} ${a.locality||''}`],
                    ['Emergency',a.emergency_name?`${a.emergency_name} · ${a.emergency_phone||''}`:'—'],
                  ]}/>
                  <Detail title="Documents" rows={[
                    ['Type',(a.id_type||'').replace(/_/g,' ')], ['Number',a.id_number],
                  ]}/>
                  <View style={st.docRow}>
                    {[['ID front',a.id_front_url],['ID back',a.id_back_url],
                      ['Selfie',a.selfie_url],['Profile photo',a.profile_photo_url],
                      ['Work permit',a.work_permit_url],['Insurance',a.insurance_doc_url]]
                      .filter(([_,u])=>!!u).map(([l,u])=>(
                      <TouchableOpacity key={l} style={st.docBtn} onPress={()=>viewDoc(u)}>
                        <Text style={st.docTxt}>📄  {l}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Detail title="Work" rows={[
                    ['Right to work',(a.work_authorization||'').replace(/_/g,' ')],
                    ['Permit expiry',a.work_permit_expiry],
                    ['Team',a.team_type], ['Team size',String(a.team_size||1)],
                    ['Company',a.company_name], ['VAT',a.vat_number],
                  ]}/>
                  <Detail title="Insurance" rows={[
                    ['Has cover', a.has_insurance ? 'Yes' : 'No'],
                    ['Insurer',   a.insurance_provider],
                    ['Policy',    a.insurance_policy_no],
                    ['Expires',   a.insurance_expiry],
                  ]}/>

                  <Detail title="Service" rows={[
                    ['Trades', (a.categories||[]).map((id:string)=>
                      findTrade(id)?.name || id).join(', ') || '—'],
                    ['Emergency callouts', a.accepts_urgent ? 'Yes' : 'No'],
                    ['Travel radius', a.service_radius_km ? `${a.service_radius_km} km` : '—'],
                    ['Rate',`€${a.hourly_rate}`], ['Min hours',`${a.min_hours}h`],
                    ['Supplies',a.brings_own_supplies?'Brings own':'Client provides'],
                    ['Areas',(a.service_areas||[]).join(', ')], ['Bio',a.bio],
                  ]}/>
                  <Detail title="Payment" rows={[
                    ['Holder',a.account_holder], ['IBAN',a.iban], ['Bank',a.bank_name],
                  ]}/>

                  {a.rejection_reason ? (
                    <View style={st.noteRed}><Text style={st.noteRedTxt}>Rejected: {a.rejection_reason}</Text></View>
                  ) : null}

                  {['submitted','under_review'].includes(a.verification_status) && (
                    rejectFor===a.id ? (
                      <View style={{gap:8}}>
                        <Text style={st.label}>Reason for rejection</Text>
                        <TextInput style={st.textArea} value={rejectText} onChangeText={setRejectTxt}
                          placeholder="e.g. ID photo is blurry — please upload again"
                          placeholderTextColor={C.muted} multiline textAlignVertical="top" />
                        <View style={st.actionRow}>
                          <TouchableOpacity style={st.ghostBtn} onPress={()=>{setRejectFor(null);setRejectTxt('');}}>
                            <Text style={st.ghostTxt}>Back</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[st.dangerBtn,isBusy&&st.dis]} disabled={isBusy}
                            onPress={()=>reject(a.id)}>
                            <Text style={st.whiteTxt}>{isBusy?'…':'Send rejection'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <View style={st.actionRow}>
                        <TouchableOpacity style={[st.rejectBtn,isBusy&&st.dis]} disabled={isBusy}
                          onPress={()=>setRejectFor(a.id)}>
                          <Text style={st.rejectTxt}>✕  Reject</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[st.approveBtn,isBusy&&st.dis]} disabled={isBusy}
                          onPress={()=>approve(a.id)}>
                          <Text style={st.whiteTxt}>{isBusy?'…':'✓  Approve'}</Text>
                        </TouchableOpacity>
                      </View>
                    )
                  )}
                  {a.verification_status==='approved' && (
                    <TouchableOpacity style={[st.revokeBtn,isBusy&&st.dis]} disabled={isBusy}
                      onPress={()=>revoke(a.id)}>
                      <Text style={st.revokeTxt}>{isBusy?'…':'Revoke approval'}</Text>
                    </TouchableOpacity>
                  )}
                  {a.verification_status==='rejected' && (
                    <TouchableOpacity style={[st.approveBtn,isBusy&&st.dis]} disabled={isBusy}
                      onPress={()=>approve(a.id)}>
                      <Text style={st.whiteTxt}>{isBusy?'…':'✓  Approve anyway'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}

      {/* ════════ CLIENTS ════════ */}
      {tab===2 && (
        <>
          <SearchBar value={search} onChange={setSearch} placeholder="Search clients…" />
          <View style={st.miniRow}>
            <Mini label="Total"    value={String(clients.length)} />
            <Mini label="Repeat"   value={String(clients.filter(c=>c.isRepeat).length)} color={C.green} />
            <Mini label="Inactive" value={String(clients.filter(c=>c.inactive).length)} color={C.amber} />
          </View>
          {clients.filter(c=>!q || (c.full_name||'').toLowerCase().includes(q)).map(c=>(
            <View key={c.id} style={st.card}>
              <View style={st.rowBetween}>
                <View style={{flex:1}}>
                  <View style={st.tagRow}>
                    <Text style={st.cardTitle}>{c.full_name||'Client'}</Text>
                    {c.isRepeat  && <Tag text="Repeat"   color={C.green} bg={C.greenLt} />}
                    {c.inactive  && <Tag text="Inactive" color={C.amber} bg={C.amberLt} />}
                  </View>
                  <Text style={st.cardSub}>
                    First {dayjs(c.first)} · Last {dayjs(c.last)}
                  </Text>
                </View>
                <View style={{alignItems:'flex-end'}}>
                  <Text style={st.amount}>{money(c.spent)}</Text>
                  <Text style={st.cardSub}>{c.completed}/{c.orders} jobs</Text>
                </View>
              </View>
            </View>
          ))}
        </>
      )}

      {/* ════════ CLEANERS ════════ */}
      {tab===3 && (
        <>
          <SearchBar value={search} onChange={setSearch} placeholder="Search providers…" />

          {(() => {
            const used = TRADES.filter(t =>
              cleaners.some((c:any) => (c.categories||[]).includes(t.id)));
            if (used.length < 2) return null;
            return (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{maxHeight:44,marginBottom:12}} contentContainerStyle={st.tStrip}>
                <TouchableOpacity style={[st.tChip, !tradeFilter&&st.tChipOn]}
                  onPress={()=>setTradeF(null)}>
                  <Text style={[st.tChipTxt, !tradeFilter&&st.tChipTxtOn]}>All</Text>
                </TouchableOpacity>
                {used.map(t=>(
                  <TouchableOpacity key={t.id} style={[st.tChip, tradeFilter===t.id&&st.tChipOn]}
                    onPress={()=>setTradeF(t.id)}>
                    <Text style={[st.tChipTxt, tradeFilter===t.id&&st.tChipTxtOn]}>
                      {t.icon} {t.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            );
          })()}

          <View style={st.miniRow}>
            <Mini label="Total"    value={String(cleaners.length)} />
            <Mini label="Approved" value={String(cleaners.filter(c=>c.status==='approved').length)} color={C.green} />
            <Mini label="Pending"  value={String(pendingApps.length)} color={C.amber} />
          </View>
          {cleaners
            .filter(c=>!q || (c.full_name||'').toLowerCase().includes(q))
            .filter((c:any)=>!tradeFilter || (c.categories||[]).includes(tradeFilter))
            .map(c=>{
            const meta = APP_STATUS[c.status] || {label:'No application',color:C.muted,bg:C.bgAlt};
            return (
              <View key={c.id} style={st.card}>
                <View style={st.rowBetween}>
                  <View style={{flex:1}}>
                    <Text style={st.cardTitle}>{c.full_name||'Cleaner'}</Text>
                    <Text style={st.cardSub}>
                      {c.app ? `${c.app.team_type} · €${c.app.hourly_rate}/hr` : 'No application'}
                    </Text>
                  </View>
                  <View style={[st.pill,{backgroundColor:meta.bg}]}>
                    <Text style={[st.pillTxt,{color:meta.color}]}>{meta.label}</Text>
                  </View>
                </View>
                {((c as any).categories || []).length > 0 && (
                  <View style={st.badgeWrap}>
                    {((c as any).categories || []).slice(0,6).map((id:string)=>{
                      const t = findTrade(id);
                      return (
                        <View key={id} style={st.tradeBadge}>
                          <Text style={st.tradeBadgeTxt}>{t?.icon || '•'} {t?.name || id}</Text>
                        </View>
                      );
                    })}
                    {((c as any).categories || []).length > 6 && (
                      <View style={st.tradeBadge}>
                        <Text style={st.tradeBadgeTxt}>
                          +{((c as any).categories || []).length - 6}
                        </Text>
                      </View>
                    )}
                    {(c as any).acceptsUrgent && (
                      <View style={[st.tradeBadge,{backgroundColor:C.amberLt,borderColor:'#FDE68A'}]}>
                        <Text style={[st.tradeBadgeTxt,{color:C.amber}]}>⚡ Emergency</Text>
                      </View>
                    )}
                  </View>
                )}

                <View style={st.metricRow}>
                  <Metric label="Jobs"     value={`${c.completed}/${c.jobs}`} />
                  <Metric label="Earned"   value={money(c.earned)} color={C.green} />
                  <Metric label="Rating"   value={c.rating?`${c.rating.toFixed(1)} ⭐`:'—'} />
                  <Metric label="Complete" value={c.jobs?`${c.acceptRate.toFixed(0)}%`:'—'} />
                </View>
              </View>
            );
          })}
        </>
      )}

      {/* ════════ BOOKINGS ════════ */}
      {tab===4 && (
        <>
          <SearchBar value={search} onChange={setSearch} placeholder="Search by address…" />

          {(() => {
            const finished = bookings.filter(b => ['completed','cancelled'].includes(b.status));
            if (!finished.length) return null;
            return (
              <View style={st.bulkBar}>
                <Text style={st.bulkTxt}>
                  {finished.length} finished booking{finished.length>1?'s':''} in the list
                </Text>
                <TouchableOpacity style={[st.bulkBtn, bulkBusy&&st.dis]} disabled={bulkBusy}
                  onPress={clearFinished}>
                  <Text style={st.bulkBtnTxt}>{bulkBusy ? 'Clearing…' : 'Clear all finished'}</Text>
                </TouchableOpacity>
              </View>
            );
          })()}

          {bookings.filter(b=>!q || (b.address||'').toLowerCase().includes(q)).slice(0,100).map(b=>{
            const meta = BK_STATUS[b.status] || BK_STATUS.pending;
            const finished = ['completed','cancelled'].includes(b.status);
            const isBusy = busy === b.id;
            return (
              <View key={b.id} style={st.card}>
                <View style={st.rowBetween}>
                  <View style={{flex:1}}>
                    <Text style={st.cardTitle}>{b.address}</Text>
                    <Text style={st.cardSub}>
                      {prettyDate(b.date)} · {b.start_time} · {b.hours}h × {b.num_cleaners}
                    </Text>
                  </View>
                  <View style={[st.pill,{backgroundColor:meta.bg}]}>
                    <Text style={[st.pillTxt,{color:meta.color}]}>{meta.label}</Text>
                  </View>
                </View>
                <View style={st.rowBetween}>
                  <Text style={st.cardSub}>
                    {nameOf(b.client_id)} → {nameOf(b.cleaner_id)}
                  </Text>
                  <View style={{alignItems:'flex-end'}}>
                    <Text style={st.amount}>{money(b.total_price)}</Text>
                    <Text style={st.commission}>Platform {money(b.platform_commission)}</Text>
                  </View>
                </View>

                {finished && (
                  confirmDelete === b.id ? (
                    <View style={st.confirmRow}>
                      <Text style={st.confirmTxt}>Delete this booking for good?</Text>
                      <View style={st.confirmBtns}>
                        <TouchableOpacity style={st.ghostSm} onPress={()=>setConfirmDelete(null)}>
                          <Text style={st.ghostSmTxt}>Keep</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[st.dangerSm, isBusy&&st.dis]} disabled={isBusy}
                          onPress={()=>deleteBooking(b.id)}>
                          <Text style={st.dangerSmTxt}>{isBusy?'…':'Delete'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity style={st.deleteLink} onPress={()=>setConfirmDelete(b.id)}>
                      <Text style={st.deleteLinkTxt}>🗑  Delete booking</Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            );
          })}
        </>
      )}

      {/* ════════ FLAGGED ════════ */}
      {tab===6 && (
        <>
          <View style={st.miniRow}>
            <Mini label="Flagged"    value={String(flagged.length)} color={C.red} />
            <Mini label="Penalties"  value={String(violations.length)} color={C.amber} />
            <Mini label="Suspended"  value={String(violations.filter(v=>v.severity==='suspension').length)} />
          </View>

          {flagged.length === 0 && violations.length === 0 ? (
            <View style={st.empty}>
              <Text style={st.emptyIcon}>✅</Text>
              <Text style={st.emptyTxt}>Nothing flagged</Text>
              <Text style={st.emptySub}>Messages that look like off-platform deals land here.</Text>
            </View>
          ) : null}

          {flagged.map(m=>{
            const sender = profiles.find((p:any)=>p.id===m.sender_id);
            const bk     = bookings.find((b:any)=>b.id===m.booking_id);
            const prior  = priorCount(m.sender_id);
            const pen    = nextPenalty(prior);
            const isBusy = busy===m.sender_id || busy===m.id;
            return (
              <View key={m.id} style={[st.card,{borderColor:'#FECACA',borderWidth:1.5}]}>
                <View style={st.rowBetween}>
                  <View style={{flex:1}}>
                    <Text style={st.cardTitle}>
                      {sender?.full_name || 'Unknown'}
                      <Text style={st.cardSub}>  ·  {m.sender_role}</Text>
                    </Text>
                    <Text style={st.cardSub}>
                      {new Date(m.created_at).toLocaleString('en-GB')}
                      {bk ? `  ·  ${bk.address}` : ''}
                    </Text>
                  </View>
                  {prior > 0 && (
                    <View style={[st.pill,{backgroundColor:C.redLt}]}>
                      <Text style={[st.pillTxt,{color:C.red}]}>{prior} prior</Text>
                    </View>
                  )}
                </View>

                <View style={st.quoteBox}>
                  <Text style={st.quoteTxt}>"{m.body}"</Text>
                </View>

                {(m.flag_reasons || []).length > 0 && (
                  <View style={st.reasonWrap}>
                    {(m.flag_reasons || []).map((r:string)=>(
                      <View key={r} style={st.reasonTag}>
                        <Text style={st.reasonTxt}>{r}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {penaltyFor === m.id ? (
                  <View style={{gap:8}}>
                    <View style={st.penBox}>
                      <Text style={st.penTitle}>Next step: {pen.label}</Text>
                      <Text style={st.penTxt}>{pen.detail}</Text>
                    </View>
                    <TextInput style={st.textArea} value={penaltyNote} onChangeText={setPNote}
                      placeholder="Note for the record (optional)"
                      placeholderTextColor={C.muted} multiline textAlignVertical="top" />
                    <View style={st.actionRow}>
                      <TouchableOpacity style={st.ghostBtn}
                        onPress={()=>{setPenalty(null);setPNote('');}}>
                        <Text style={st.ghostTxt}>Back</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[st.dangerBtn,isBusy&&st.dis]} disabled={isBusy}
                        onPress={()=>raisePenalty(m.sender_id, m.booking_id, m.body)}>
                        <Text style={st.whiteTxt}>{isBusy?'…':`Apply ${pen.label}`}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={st.actionRow}>
                    <TouchableOpacity style={[st.ghostBtn,isBusy&&st.dis]} disabled={isBusy}
                      onPress={()=>dismissFlag(m.id)}>
                      <Text style={st.ghostTxt}>False alarm</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[st.rejectBtn,isBusy&&st.dis]} disabled={isBusy}
                      onPress={()=>setPenalty(m.id)}>
                      <Text style={st.rejectTxt}>Act on this</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          {violations.length > 0 && (
            <>
              <Text style={st.sectionLbl}>Penalties on record</Text>
              {violations.map(v=>{
                const who = profiles.find((p:any)=>p.id===v.user_id);
                return (
                  <View key={v.id} style={st.card}>
                    <View style={st.rowBetween}>
                      <View style={{flex:1}}>
                        <Text style={st.cardTitle}>{who?.full_name || 'Unknown'}</Text>
                        <Text style={st.cardSub}>
                          {new Date(v.created_at).toLocaleDateString('en-GB')}
                          {v.note ? `  ·  ${v.note}` : ''}
                        </Text>
                      </View>
                      <View style={[st.pill,{backgroundColor:
                        v.severity==='ban' ? C.redLt :
                        v.severity==='suspension' ? C.amberLt : C.bgAlt}]}>
                        <Text style={[st.pillTxt,{color:
                          v.severity==='ban' ? C.red :
                          v.severity==='suspension' ? C.amber : C.muted}]}>
                          {v.severity}{v.fine_amount>0 ? ` · ${money(v.fine_amount)}` : ''}
                        </Text>
                      </View>
                    </View>
                    {!!v.evidence && (
                      <Text style={st.evidence} numberOfLines={2}>"{v.evidence}"</Text>
                    )}
                  </View>
                );
              })}
            </>
          )}
        </>
      )}

      {/* ════════ DISPUTES ════════ */}
      {tab===5 && (
        disputes.length===0 ? <Empty text="No open disputes 🎉" /> :
        disputes.map(b=>{
          const isBusy = busy===b.id;
          return (
            <View key={b.id} style={[st.card,{borderColor:'#FECACA',borderWidth:1.5}]}>
              <View style={st.rowBetween}>
                <View style={{flex:1}}>
                  <Text style={st.cardTitle}>{b.address}</Text>
                  <Text style={st.cardSub}>{prettyDate(b.date)} · {b.hours}h · {money(b.total_price)}</Text>
                </View>
                <View style={[st.pill,{backgroundColor:C.redLt}]}>
                  <Text style={[st.pillTxt,{color:C.red}]}>Disputed</Text>
                </View>
              </View>

              <View style={st.noteRed}>
                <Text style={st.noteRedTxt}>Client says: {b.dispute_reason||'—'}</Text>
              </View>

              <Detail title="Timeline" rows={[
                ['Client',   nameOf(b.client_id)],
                ['Cleaner',  nameOf(b.cleaner_id)],
                ['Started',  b.started_at  ? new Date(b.started_at).toLocaleString('en-GB')  : '—'],
                ['Finished', b.finished_at ? new Date(b.finished_at).toLocaleString('en-GB') : '—'],
                ['PIN used', b.started_at ? 'Yes — cleaner was on site' : 'No'],
              ]}/>

              <View style={st.actionRow}>
                <TouchableOpacity style={[st.rejectBtn,isBusy&&st.dis]} disabled={isBusy}
                  onPress={()=>resolveDispute(b.id,'cancelled')}>
                  <Text style={st.rejectTxt}>Refund client</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.approveBtn,isBusy&&st.dis]} disabled={isBusy}
                  onPress={()=>resolveDispute(b.id,'completed')}>
                  <Text style={st.whiteTxt}>Pay cleaner</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      <View style={{height:40}} />
    </ScrollView>
  );
}

// ── Small components ──
function Kpi({label,value,sub,color,wide}:any){
  return (
    <View style={[st.kpiCard, wide&&{flexBasis:'47%'}]}>
      <Text style={st.kpiLabel}>{label}</Text>
      <Text style={[st.kpiValue,{color}]}>{value}</Text>
      {sub ? <Text style={st.kpiSub}>{sub}</Text> : null}
    </View>
  );
}
function SectionCard({title,children}:any){
  return (
    <View style={st.sectionCard}>
      <Text style={st.sectionCardTitle}>{title}</Text>
      {children}
    </View>
  );
}
function Row({k,v,good,bad}:any){
  return (
    <View style={st.statRow}>
      <Text style={st.statKey}>{k}</Text>
      <Text style={[st.statVal, good&&{color:C.green}, bad&&{color:C.red}]}>{v}</Text>
    </View>
  );
}
function Detail({title,rows}:any){
  return (
    <View style={{gap:2}}>
      <Text style={st.detailTitle}>{title}</Text>
      {rows.map(([k,v]:any)=>(
        <View key={k} style={st.detailRow}>
          <Text style={st.detailKey}>{k}</Text>
          <Text style={st.detailVal}>{v||'—'}</Text>
        </View>
      ))}
    </View>
  );
}
function Metric({label,value,color}:any){
  return (
    <View style={st.metric}>
      <Text style={[st.metricVal,color&&{color}]}>{value}</Text>
      <Text style={st.metricLbl}>{label}</Text>
    </View>
  );
}
function Mini({label,value,color}:any){
  return (
    <View style={st.miniCard}>
      <Text style={[st.miniVal,color&&{color}]}>{value}</Text>
      <Text style={st.miniLbl}>{label}</Text>
    </View>
  );
}
function Tag({text,color,bg}:any){
  return <View style={[st.tag,{backgroundColor:bg}]}><Text style={[st.tagTxt,{color}]}>{text}</Text></View>;
}
function SearchBar({value,onChange,placeholder}:any){
  return (
    <View style={st.searchBox}>
      <Text>🔍  </Text>
      <TextInput style={st.searchInput} value={value} onChangeText={onChange}
        placeholder={placeholder} placeholderTextColor={C.muted} />
    </View>
  );
}
function Empty({text}:any){
  return (
    <View style={st.empty}>
      <Text style={st.emptyIcon}>📭</Text>
      <Text style={st.emptyTxt}>{text}</Text>
      <Text style={st.emptySub}>Pull down to refresh</Text>
    </View>
  );
}

const st = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  hdr:{flexDirection:'row',alignItems:'center',paddingHorizontal:20,paddingTop:60,paddingBottom:16,gap:12},
  heading:{fontSize:22,fontWeight:'800',color:C.dark},
  sub:{fontSize:13,color:C.muted,marginTop:2},
  signOutBtn:{backgroundColor:C.redLt,paddingHorizontal:14,paddingVertical:8,borderRadius:20,borderWidth:1,borderColor:'#FECACA'},
  signOutTxt:{fontSize:13,fontWeight:'700',color:C.red},
  tabScroll:{marginBottom:16,maxHeight:52},
  tabRow:{paddingHorizontal:20,gap:8},
  tab:{paddingHorizontal:16,paddingVertical:10,borderRadius:20,backgroundColor:C.white,borderWidth:1.5,borderColor:C.border,flexDirection:'row',alignItems:'center',gap:6},
  tabOn:{backgroundColor:C.primary,borderColor:C.primary},
  tabTxt:{fontSize:13,fontWeight:'600',color:C.muted},
  tabTxtOn:{color:C.white,fontWeight:'700'},
  badge:{backgroundColor:C.red,borderRadius:10,minWidth:18,height:18,alignItems:'center',justifyContent:'center',paddingHorizontal:5},
  badgeTxt:{color:C.white,fontSize:10,fontWeight:'800'},
  kpiGrid:{flexDirection:'row',flexWrap:'wrap',gap:10,paddingHorizontal:20},
  kpiCard:{flex:1,minWidth:100,backgroundColor:C.white,borderRadius:16,padding:14,borderWidth:1,borderColor:C.border,...S.sm,gap:3},
  kpiLabel:{fontSize:11,color:C.muted,fontWeight:'600'},
  kpiValue:{fontSize:20,fontWeight:'800'},
  kpiSub:{fontSize:10,color:C.muted},
  sectionCard:{marginHorizontal:20,backgroundColor:C.white,borderRadius:16,padding:16,borderWidth:1,borderColor:C.border,...S.sm},
  sectionCardTitle:{fontSize:11,fontWeight:'800',color:C.muted,textTransform:'uppercase',letterSpacing:0.6,marginBottom:8},
  statRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:7,borderBottomWidth:1,borderBottomColor:C.bg},
  statKey:{fontSize:13,color:C.text},
  statVal:{fontSize:13,fontWeight:'700',color:C.dark},
  card:{marginHorizontal:20,marginBottom:12,backgroundColor:C.white,borderRadius:16,padding:14,...S.sm,borderWidth:1,borderColor:C.border,gap:8},
  rowBetween:{flexDirection:'row',alignItems:'center',gap:10},
  cardTitle:{fontSize:15,fontWeight:'700',color:C.dark},
  cardSub:{fontSize:12,color:C.muted,marginTop:3},
  amount:{fontSize:16,fontWeight:'800',color:C.primary},
  commission:{fontSize:11,color:C.green,fontWeight:'700',marginTop:2},
  pill:{paddingHorizontal:10,paddingVertical:4,borderRadius:20},
  pillTxt:{fontSize:11,fontWeight:'700',textTransform:'capitalize'},
  chevron:{fontSize:11,color:C.muted},
  details:{gap:12,marginTop:6,paddingTop:12,borderTopWidth:1,borderTopColor:C.bg},
  detailTitle:{fontSize:11,fontWeight:'800',color:C.muted,textTransform:'uppercase',letterSpacing:0.6,marginBottom:4},
  detailRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:5,gap:12},
  detailKey:{fontSize:12,color:C.muted,fontWeight:'600'},
  detailVal:{fontSize:12,color:C.text,fontWeight:'600',flex:1,textAlign:'right'},
  docRow:{flexDirection:'row',flexWrap:'wrap',gap:8},
  docBtn:{backgroundColor:C.primaryLt,paddingHorizontal:12,paddingVertical:9,borderRadius:10,borderWidth:1,borderColor:C.border},
  docTxt:{fontSize:12,color:C.primary,fontWeight:'700'},
  tStrip:{gap:8,paddingRight:20},
  tChip:{paddingHorizontal:12,paddingVertical:8,borderRadius:18,backgroundColor:C.white,borderWidth:1.5,borderColor:C.border},
  tChipOn:{backgroundColor:C.primary,borderColor:C.primary},
  tChipTxt:{fontSize:11,fontWeight:'700',color:C.muted},
  tChipTxtOn:{color:C.white},
  badgeWrap:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8},
  tradeBadge:{backgroundColor:C.primaryLt,paddingHorizontal:9,paddingVertical:4,borderRadius:10,borderWidth:1,borderColor:C.border},
  tradeBadgeTxt:{fontSize:10,fontWeight:'700',color:C.primary},
  metricRow:{flexDirection:'row',gap:8,marginTop:4},
  metric:{flex:1,backgroundColor:C.bg,borderRadius:10,paddingVertical:8,alignItems:'center'},
  metricVal:{fontSize:14,fontWeight:'800',color:C.dark},
  metricLbl:{fontSize:10,color:C.muted,marginTop:2},
  miniRow:{flexDirection:'row',paddingHorizontal:20,gap:10,marginBottom:12},
  miniCard:{flex:1,backgroundColor:C.white,borderRadius:12,paddingVertical:10,alignItems:'center',borderWidth:1,borderColor:C.border},
  miniVal:{fontSize:17,fontWeight:'800',color:C.dark},
  miniLbl:{fontSize:10,color:C.muted,marginTop:2},
  tagRow:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'},
  tag:{paddingHorizontal:8,paddingVertical:3,borderRadius:12},
  tagTxt:{fontSize:10,fontWeight:'700'},
  searchBox:{flexDirection:'row',alignItems:'center',marginHorizontal:20,backgroundColor:C.white,borderRadius:14,paddingHorizontal:14,borderWidth:1,borderColor:C.border,marginBottom:12},
  searchInput:{flex:1,paddingVertical:12,fontSize:14,color:C.text},
  actionRow:{flexDirection:'row',gap:10,marginTop:6},
  approveBtn:{flex:1,backgroundColor:C.green,borderRadius:12,paddingVertical:13,alignItems:'center'},
  rejectBtn:{flex:1,borderWidth:1.5,borderColor:C.red,borderRadius:12,paddingVertical:13,alignItems:'center'},
  rejectTxt:{color:C.red,fontWeight:'700',fontSize:14},
  whiteTxt:{color:C.white,fontWeight:'700',fontSize:14},
  dangerBtn:{flex:1,backgroundColor:C.red,borderRadius:12,paddingVertical:13,alignItems:'center'},
  ghostBtn:{flex:1,borderWidth:1.5,borderColor:C.border,borderRadius:12,paddingVertical:13,alignItems:'center'},
  ghostTxt:{color:C.muted,fontWeight:'600',fontSize:14},
  revokeBtn:{borderWidth:1.5,borderColor:C.amber,borderRadius:12,paddingVertical:12,alignItems:'center',marginTop:6},
  revokeTxt:{color:C.amber,fontWeight:'700',fontSize:13},
  label:{fontSize:12,fontWeight:'700',color:C.text},
  textArea:{backgroundColor:C.bg,borderRadius:10,padding:12,fontSize:13,color:C.text,borderWidth:1,borderColor:C.border,minHeight:70},
  noteRed:{backgroundColor:C.redLt,borderRadius:10,padding:10,borderWidth:1,borderColor:'#FECACA'},
  noteRedTxt:{fontSize:12,color:C.red,fontWeight:'600'},
  dis:{opacity:0.5},
  quoteBox:{backgroundColor:C.bgAlt,borderRadius:10,padding:12,borderLeftWidth:3,
    borderLeftColor:C.red},
  quoteTxt:{fontSize:13,color:C.text,lineHeight:19,fontStyle:'italic'},
  reasonWrap:{flexDirection:'row',flexWrap:'wrap',gap:6},
  reasonTag:{backgroundColor:C.redLt,paddingHorizontal:9,paddingVertical:4,borderRadius:10,
    borderWidth:1,borderColor:'#FECACA'},
  reasonTxt:{fontSize:10,fontWeight:'700',color:C.red},
  penBox:{backgroundColor:C.amberLt,borderRadius:10,padding:12,gap:4,
    borderWidth:1,borderColor:'#FDE68A'},
  penTitle:{fontSize:13,fontWeight:'800',color:C.amber},
  penTxt:{fontSize:12,color:C.text,lineHeight:17},
  evidence:{fontSize:12,color:C.muted,fontStyle:'italic',marginTop:6},
  sectionLbl:{fontSize:12,fontWeight:'800',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.6,paddingHorizontal:20,marginTop:20,marginBottom:10},
  bulkBar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginHorizontal:20,marginBottom:12,backgroundColor:C.amberLt,borderRadius:12,paddingHorizontal:14,paddingVertical:10,borderWidth:1,borderColor:'#FDE68A',gap:10},
  bulkTxt:{fontSize:12,color:C.amber,fontWeight:'700',flex:1},
  bulkBtn:{backgroundColor:C.red,borderRadius:10,paddingHorizontal:14,paddingVertical:8},
  bulkBtnTxt:{color:C.white,fontSize:12,fontWeight:'700'},
  deleteLink:{alignSelf:'flex-start',paddingVertical:6},
  deleteLinkTxt:{fontSize:12,color:C.red,fontWeight:'700'},
  confirmRow:{backgroundColor:C.redLt,borderRadius:10,padding:12,gap:10,borderWidth:1,borderColor:'#FECACA'},
  confirmTxt:{fontSize:12,color:C.red,fontWeight:'700'},
  confirmBtns:{flexDirection:'row',gap:8},
  ghostSm:{flex:1,borderWidth:1.5,borderColor:C.border,borderRadius:10,paddingVertical:9,alignItems:'center',backgroundColor:C.white},
  ghostSmTxt:{fontSize:12,color:C.muted,fontWeight:'700'},
  dangerSm:{flex:1,backgroundColor:C.red,borderRadius:10,paddingVertical:9,alignItems:'center'},
  dangerSmTxt:{fontSize:12,color:C.white,fontWeight:'700'},
  empty:{alignItems:'center',paddingTop:60,gap:6},
  emptyIcon:{fontSize:44},
  emptyTxt:{fontSize:16,fontWeight:'700',color:C.dark},
  emptySub:{fontSize:13,color:C.muted},
  centerWrap:{flex:1,backgroundColor:C.bg,alignItems:'center',justifyContent:'center',padding:32,gap:14},
  bigIcon:{fontSize:60},
  centerTitle:{fontSize:22,fontWeight:'800',color:C.dark,textAlign:'center'},
  primaryBtn:{backgroundColor:C.primary,borderRadius:16,paddingVertical:15,paddingHorizontal:34,marginTop:10},
  primaryTxt:{color:C.white,fontSize:15,fontWeight:'700'},
});
