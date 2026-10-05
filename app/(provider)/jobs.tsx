import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, RefreshControl, TextInput } from 'react-native';
import { C, S } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { findTrade } from '../../constants/trades';
import { bandLabel, vehicleLabel } from '../../lib/transport';
import PartsPanel from '../../components/PartsPanel';
import ProposeTime from '../../components/ProposeTime';
import Chat from '../../components/Chat';
import QuotePanel from '../../components/QuotePanel';
import { useState, useEffect } from 'react';
import { fmtDuration } from '../../lib/services';
import { directionsLink, mapsLink } from '../../lib/location';


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

const STATUS: Record<string,{label:string;color:string;bg:string;icon:string}> = {
  pending:               {label:'Offered to You',  color:C.amber,  bg:C.amberLt,   icon:'🔔'},
  reschedule_proposed:   {label:'Time suggested',   color:C.teal,   bg:C.tealLt,    icon:'📅'},
  quoted:                {label:'Quote sent',       color:C.teal,   bg:C.tealLt,    icon:'💬'},
  pending_pool:          {label:'Open to All',     color:C.accent, bg:'#F3E8FF',   icon:'🌐'},
  accepted:              {label:'Accepted',        color:C.green,  bg:C.greenLt,   icon:'✅'},
  en_route:              {label:'En Route',        color:C.teal,   bg:C.tealLt,    icon:'🚗'},
  arrived:               {label:'Arrived — PIN',   color:C.amber,  bg:C.amberLt,   icon:'🔐'},
  in_progress:           {label:'In Progress',     color:C.primary,bg:C.primaryLt, icon:'🧹'},
  awaiting_confirmation: {label:'Awaiting Client', color:C.teal,   bg:C.tealLt,    icon:'⏳'},
  completed:             {label:'Completed',       color:C.green,  bg:C.greenLt,   icon:'✓'},
  disputed:              {label:'Disputed',        color:C.red,    bg:C.redLt,     icon:'⚠️'},
  cancelled:             {label:'Cancelled',       color:C.red,    bg:C.redLt,     icon:'✕'},
};

export default function ProviderScreen() {
  const { bookings, updateStatus, markArrived, verifyPin, finishJob, acceptJob, proposeTime, loadBookings, userName, userId, myCategories, sendQuote } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy]             = useState<string|null>(null);
  const [pinInput, setPinInput]     = useState<Record<string,string>>({});
  const [pinError, setPinError]     = useState<Record<string,string>>({});
  const [proposingFor, setProposing]= useState<string|null>(null);
  const [actionError, setActionError]= useState('');
  const doQuote = async (id:string, labour:number, parts:number, note:string) => {
    setBusy(id);
    try {
      await sendQuote(id, labour, parts, note, userId);
    } catch (e: any) {
      setActionError(e?.message || 'Could not send that quote');
    }
    setBusy(null);
  };

  const [clientNames, setClientNames]   = useState<Record<string,string>>({});
  const [clientPhones, setClientPhones] = useState<Record<string,string>>({});

  useEffect(() => {
    const ids = Array.from(new Set(
      bookings.map(b => b.clientId).filter(Boolean)
    )) as string[];
    if (!ids.length) return;
    (async () => {
      const { data } = await supabase.from('client_profiles')
        .select('id, first_name, last_name, phone').in('id', ids);
      const names: Record<string,string> = {};
      const phones: Record<string,string> = {};
      (data || []).forEach((c:any) => {
        names[c.id]  = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Client';
        phones[c.id] = c.phone || '';
      });
      setClientNames(names);
      setClientPhones(phones);
    })();
  }, [bookings.length]);

  const doPropose = async (id: string, date: string, time: string, note: string) => {
    setBusy(id);
    await proposeTime(id, date, time, note, userId);
    setBusy(null);
    setProposing(null);
  };
  const [checklist, setChecklist]   = useState<Record<string, any[]>>({});
  const [openList, setOpenList]     = useState<string|null>(null);
  const [tick, setTick]             = useState(Date.now());
  const [myStatus, setMyStatus]     = useState<string|null>(null);
  const [myApp, setMyApp]           = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('cleaner_profiles')
        .select('verification_status, signup_stage, submitted_at, rejection_reason, first_name, categories')
        .eq('id', user.id).maybeSingle();
      if (data) { setMyStatus(data.verification_status); setMyApp(data); }
    })();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const elapsed = (startedAt?: string|null) => {
    if (!startedAt) return 0;
    return Math.max(0, Math.round((tick - new Date(startedAt).getTime()) / 60000));
  };

  const loadChecklist = async (bookingId: string) => {
    const { data } = await supabase.from('booking_checklist')
      .select('*').eq('booking_id', bookingId).order('area');
    setChecklist(prev => ({ ...prev, [bookingId]: data || [] }));
  };

  const toggleTask = async (bookingId: string, taskId: string, done: boolean) => {
    setChecklist(prev => ({
      ...prev,
      [bookingId]: (prev[bookingId]||[]).map(t =>
        t.id === taskId ? { ...t, done } : t),
    }));
    await supabase.from('booking_checklist')
      .update({ done, checked_at: done ? new Date().toISOString() : null })
      .eq('id', taskId);
  };

  const toggleArea = async (bookingId: string, area: string, done: boolean) => {
    const items = (checklist[bookingId] || []).filter(t => t.area === area);
    if (!items.length) return;

    // optimistic — ticking five areas shouldn't feel like five round trips
    setChecklist(prev => ({
      ...prev,
      [bookingId]: (prev[bookingId] || []).map(t =>
        t.area === area ? { ...t, done } : t),
    }));

    const { error } = await supabase.from('booking_checklist')
      .update({ done, done_at: done ? new Date().toISOString() : null })
      .in('id', items.map(t => t.id));

    if (error) { console.log('toggleArea:', error.message); loadChecklist(bookingId); }
  };

  const markEverything = async (bookingId: string) => {
    const items = checklist[bookingId] || [];
    if (!items.length) return;
    setChecklist(prev => ({
      ...prev,
      [bookingId]: (prev[bookingId] || []).map(t => ({ ...t, done: true })),
    }));
    const { error } = await supabase.from('booking_checklist')
      .update({ done: true, done_at: new Date().toISOString() })
      .eq('booking_id', bookingId);
    if (error) { console.log('markEverything:', error.message); loadChecklist(bookingId); }
  };

  const listProgress = (bookingId: string) => {
    const items = checklist[bookingId] || [];
    const done  = items.filter(t=>t.done).length;
    return { done, total: items.length };
  };

  const onRefresh = async () => { setRefreshing(true); await loadBookings(); setRefreshing(false); };

  useEffect(() => {
    bookings
      .filter(b => ['in_progress','awaiting_confirmation'].includes(b.status))
      .forEach(b => { if (!checklist[b.id]) loadChecklist(b.id); });
  }, [bookings]);

  const openDirections = (a: string) =>
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a+', Malta')}&travelmode=driving`);
  const openMap = (a: string) =>
    Linking.openURL(`https://maps.google.com/maps?q=${encodeURIComponent(a+', Malta')}`);

  const handleSignOut = async () => {
    try { await supabase.auth.signOut({ scope:'local' }); } catch(e) {}
    router.replace('/auth');
  };

  const doAccept = async (id: string) => {
    setBusy(id);
    const ok = await acceptJob(id, userId);
    setBusy(null);
    if (!ok) await loadBookings();
  };

  const doStatus = async (id: string, status: string, address?: string) => {
    setBusy(id); await updateStatus(id, status);
    if (status === 'en_route' && address) openDirections(address);
    setBusy(null);
  };

  const doArrive = async (id: string) => { setBusy(id); await markArrived(id); setBusy(null); };

  const doVerifyPin = async (id: string) => {
    const pin = pinInput[id] || '';
    if (pin.length !== 4) { setPinError(p => ({...p,[id]:'Enter the 4-digit PIN'})); return; }
    setBusy(id);
    const ok = await verifyPin(id, pin);
    setBusy(null);
    if (!ok) setPinError(p => ({...p,[id]:'Wrong PIN — ask the client again'}));
    else { setPinError(p => ({...p,[id]:''})); setPinInput(p => ({...p,[id]:''})); }
  };

  const doFinish = async (id: string) => {
    setBusy(id);
    try {
      await finishJob(id);
    } catch (e: any) {
      setActionError(e?.message || 'Could not finish that job');
    }
    setBusy(null);
  };

  /** A job out on the road — the client is standing next to the car, not a door */
  const isRoadside = (b: any) => b.lat != null && b.lng != null;

  /** Some fixed-price work has no task list to tick */
  const hasChecklist = (b: any) => (checklist[b.id] || []).length > 0;

  /** Jobs in the trades this provider actually signed up for */
  const inMyTrade = (b: any) => {
    // anything already assigned to me always shows
    if (b.cleanerId === userId) return true;
    // every booking records which trade it belongs to
    if (b.tradeId) return myCategories.includes(b.tradeId);
    // older bookings with no trade recorded — fall back to cleaning
    return myCategories.includes('cleaning');
  };

  const active = bookings
    .filter(b => !['cancelled','completed','disputed'].includes(b.status))
    .filter(inMyTrade)
    .sort((a,b) => (b.isUrgent ? 1 : 0) - (a.isUrgent ? 1 : 0));
  const done   = bookings.filter(b => ['cancelled','completed','disputed'].includes(b.status));
  const earned = done.filter(b => b.status==='completed')
    .reduce((s,b) => s + Number(b.finalCleanerPayment ?? (b.total/1.029/1.18*0.80)), 0);

  return (
    <ScrollView style={s0.wrap} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary}/>}>

      <View style={s0.header}>
        <View style={{flex:1}}>
          <Text style={s0.heading}>Your jobs</Text>
          <Text style={s0.sub}>{userName||'Provider'}</Text>
          {myCategories.length > 0 && (
            <View style={s0.myTrades}>
              {myCategories.slice(0,4).map(id=>{
                const t = findTrade(id);
                return (
                  <View key={id} style={s0.myTradeChip}>
                    <Text style={s0.myTradeTxt}>{t?.icon || '•'} {t?.name || id}</Text>
                  </View>
                );
              })}
              {myCategories.length > 4 && (
                <View style={s0.myTradeChip}>
                  <Text style={s0.myTradeTxt}>+{myCategories.length - 4}</Text>
                </View>
              )}
            </View>
          )}
        </View>

      </View>

      {myStatus === 'approved' && <View style={s0.statsRow}>
        {[
          {val:String(active.length), lbl:'Active Jobs', col:C.primary},
          {val:String(done.filter(b=>b.status==='completed').length), lbl:'Completed', col:C.green},
          {val:`€${earned.toFixed(0)}`, lbl:'Total Earned', col:C.amber},
        ].map(x=>(
          <View key={x.lbl} style={s0.statCard}>
            <Text style={[s0.statVal,{color:x.col}]}>{x.val}</Text>
            <Text style={s0.statLbl}>{x.lbl}</Text>
          </View>
        ))}
      </View>}

      {actionError ? (
        <View style={s0.errBanner}>
          <Text style={s0.errBannerTxt}>⚠️  {actionError}</Text>
          <TouchableOpacity onPress={()=>setActionError('')}>
            <Text style={s0.errBannerX}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {myStatus !== 'approved' && (() => {
        const stage = myApp?.signup_stage || 'basic';
        const open  = active.length;

        // Not verified yet — show them the work, then the next step
        if (myStatus === 'basic' || stage === 'basic') {
          return (
            <View style={s0.gateCard}>
              <Text style={s0.gateIcon}>👀</Text>
              <Text style={s0.gateTitle}>
                {open > 0
                  ? `${open} job${open===1?'':'s'} open in your areas`
                  : 'No open jobs right now'}
              </Text>
              <Text style={s0.gateTxt}>
                {open > 0
                  ? "Have a look below. To accept one, we need to verify who you are — it takes about three minutes."
                  : "Nothing waiting at this moment. Verify your account now and you'll be ready the second something comes in."}
              </Text>

              <View style={s0.gateSteps}>
                {[
                  ['✓','Trades and areas set','Done', true],
                  ['2','Verify your identity','ID photo, a selfie and a profile picture', false],
                  ['3','Add your bank details','Only when you are owed money', false],
                ].map(([n,t,d,done]:any)=>(
                  <View key={t} style={s0.gStepRow}>
                    <View style={[s0.gStepDot, done&&s0.gStepDotOn]}>
                      <Text style={[s0.gStepNum, done&&s0.gStepNumOn]}>{n}</Text>
                    </View>
                    <View style={{flex:1}}>
                      <Text style={[s0.gStepTitle, done&&{color:C.green}]}>{t}</Text>
                      <Text style={s0.gStepDesc}>{d}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={s0.gateBtn} onPress={()=>router.push('/onboarding')}>
                <Text style={s0.gateBtnTxt}>Verify my account  →</Text>
              </TouchableOpacity>
            </View>
          );
        }

        // Documents in, waiting on us
        return (
          <View style={s0.pendingCard}>
            <Text style={s0.pendingIcon}>⏳</Text>
            <Text style={s0.pendingTitle}>We're checking your documents</Text>
            <Text style={s0.pendingTxt}>
              Usually done within a working day. You can browse jobs meanwhile —
              you'll be able to accept them the moment you're approved.
            </Text>

            <View style={s0.pendingSteps}>
              {[
                ['✓', 'Application submitted',
                 myApp?.submitted_at
                   ? new Date(myApp.submitted_at).toLocaleDateString('en-GB',
                       {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})
                   : 'Done', true],
                ['2', 'We check your ID and documents', 'In progress', false],
                ['3', 'Your profile goes live', 'Clients can book you', false],
              ].map(([n,t,d,done]:any)=>(
                <View key={t} style={s0.pStepRow}>
                  <View style={[s0.pStepDot, done&&s0.pStepDotOn]}>
                    <Text style={[s0.pStepNum, done&&s0.pStepNumOn]}>{n}</Text>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={[s0.pStepTitle, done&&{color:C.green}]}>{t}</Text>
                    <Text style={s0.pStepDesc}>{d}</Text>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity style={s0.pendingBtn} onPress={()=>router.push('/onboarding')}>
              <Text style={s0.pendingBtnTxt}>Review my application</Text>
            </TouchableOpacity>
          </View>
        );
      })()}

      {active.length > 0 && (
        <Text style={s0.sectionTitle}>
          {myStatus === 'approved'
            ? `Active Jobs (${active.length})`
            : `Open near you (${active.length})`}
        </Text>
      )}

      {active.map(b => {
        const st  = STATUS[b.status] || STATUS.pending;
        const pay = (b.total/1.029/1.18*0.80).toFixed(2);
        const isBusy = busy === b.id;

        return (
          <View key={b.id} style={s0.card}>
            <View style={[s0.statusBar,{backgroundColor:st.bg}]}>
              <Text style={[s0.statusTxt,{color:st.color}]}>{st.icon}  {st.label}</Text>
              <Text style={s0.bookingId}>{b.id.slice(0,8)}…</Text>
            </View>

            <View style={s0.cardBody}>
              <View style={s0.infoGrid}>
                {[['📅',prettyDate(b.date)],['🕐',b.time],['⏱',`${b.hours}h`],
                  ['🧹',(b.serviceType||'standard').replace('_',' ')]].map(([i,v])=>(
                  <View key={String(v)} style={s0.infoItem}>
                    <Text style={s0.infoIcon}>{i}</Text><Text style={s0.infoTxt}>{v}</Text>
                  </View>
                ))}
              </View>

              {b.pricingModel === 'fixed' && (
                <View style={s0.roadBox}>
                  <View style={s0.roadHead}>
                    <Text style={s0.roadTitle}>
                      {b.isUrgent ? '🚨  Emergency callout' : '🛞  Roadside job'}
                    </Text>
                    <View style={s0.fixedTag}>
                      <Text style={s0.fixedTagTxt}>Fixed price</Text>
                    </View>
                  </View>

                  {!!b.vehicleInfo && (
                    <View style={s0.roadRow}>
                      <Text style={s0.roadKey}>Vehicle</Text>
                      <Text style={s0.roadVal}>{b.vehicleInfo}</Text>
                    </View>
                  )}
                  {!!b.locationNote && (
                    <View style={s0.roadRow}>
                      <Text style={s0.roadKey}>Finding them</Text>
                      <Text style={s0.roadVal}>{b.locationNote}</Text>
                    </View>
                  )}

                  {b.lat != null && b.lng != null && (
                    <View style={s0.gpsBox}>
                      <Text style={s0.gpsTxt}>
                        📍  GPS shared — {Number(b.lat).toFixed(5)}, {Number(b.lng).toFixed(5)}
                      </Text>
                      <View style={s0.mapButtons}>
                        <TouchableOpacity style={s0.mapBtn}
                          onPress={()=>Linking.openURL(mapsLink({lat:Number(b.lat), lng:Number(b.lng)}))}>
                          <Text style={s0.mapBtnTxt}>🗺  View pin</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s0.mapBtn,s0.mapBtnPrimary]}
                          onPress={()=>Linking.openURL(directionsLink({lat:Number(b.lat), lng:Number(b.lng)}))}>
                          <Text style={[s0.mapBtnTxt,{color:C.white}]}>🚗  Navigate</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {b.routeBand && (
                <View style={s0.runBox}>
                  <Text style={s0.runTitle}>🚚  The run</Text>
                  <View style={s0.runRow}>
                    <Text style={s0.runKey}>From</Text>
                    <Text style={s0.runVal}>{b.fromLocality}</Text>
                  </View>
                  <View style={s0.runRow}>
                    <Text style={s0.runKey}>To</Text>
                    <Text style={s0.runVal}>{b.toLocality}</Text>
                  </View>
                  <View style={s0.runRow}>
                    <Text style={s0.runKey}>Vehicle</Text>
                    <Text style={s0.runVal}>
                      {vehicleLabel(b.vehicleType)} · {bandLabel(b.routeBand)}
                    </Text>
                  </View>
                  {!!b.loadNote && (
                    <View style={s0.loadBox}>
                      <Text style={s0.loadTxt}>{b.loadNote}</Text>
                    </View>
                  )}
                  <Text style={s0.runNote}>
                    Driving only. Anything else, agree it in the chat and add it as a
                    line — you keep 95% of those.
                  </Text>
                </View>
              )}

              {b.answers && Object.keys(b.answers).length > 0 && (
                <View style={s0.answerBox}>
                  <Text style={s0.answerTitle}>📝  What they told us</Text>
                  {Object.entries(b.answers as Record<string,string>).map(([k,v])=>(
                    <View key={k} style={s0.answerRow}>
                      <Text style={s0.answerVal}>{v}</Text>
                    </View>
                  ))}
                </View>
              )}

              {b.numCleaners > 1 && (
                <View style={s0.teamBanner}>
                  <Text style={s0.teamBannerTxt}>
                    👥  Bring {b.numCleaners} cleaners — the client booked a team
                  </Text>
                </View>
              )}

              <View style={s0.addressCard}>
                <View style={s0.addressRow}>
                  <Text style={s0.addressIcon}>📍</Text>
                  <Text style={s0.addressTxt}>{b.address}</Text>
                </View>
                {b.pricingModel !== 'fixed' && (
                  <View style={s0.mapButtons}>
                    <TouchableOpacity style={s0.mapBtn} onPress={()=>openMap(b.address)}>
                      <Text style={s0.mapBtnTxt}>🗺  View Map</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s0.mapBtn,s0.mapBtnPrimary]} onPress={()=>openDirections(b.address)}>
                      <Text style={[s0.mapBtnTxt,{color:C.white}]}>🚗  Directions</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={s0.earningsRow}>
                <Text style={s0.earningsKey}>
                  {b.pricingModel === 'fixed' ? 'You get (fixed)' : 'Your earnings'}
                </Text>
                <Text style={s0.earningsAmt}>€{pay}</Text>
              </View>

              {(b.status==='pending' || b.status==='pending_pool') && (
                <>
                  {b.status==='pending' && b.preferredUntil && (
                    <View style={s0.priorityBox}>
                      <Text style={s0.priorityTxt}>
                        ⭐  The client chose you — you have priority until{' '}
                        {new Date(b.preferredUntil).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
                      </Text>
                    </View>
                  )}
                  {b.status==='pending_pool' && (
                    <View style={s0.poolBox}>
                      <Text style={s0.poolTxt}>🌐  Open to every available provider — first to accept gets it</Text>
                    </View>
                  )}
                  {b.pricingModel === 'quote' ? (
                    myStatus !== 'approved' ? (
                      <TouchableOpacity style={s0.lockedBtn}
                        onPress={()=>router.push('/onboarding')}>
                        <Text style={s0.lockedTxt}>🔒  Verify your account to quote</Text>
                      </TouchableOpacity>
                    ) : (
                      <QuotePanel
                        booking={b}
                        role="provider"
                        busy={isBusy}
                        onSend={(l,pt,n)=>doQuote(b.id, l, pt, n)}
                      />
                    )
                  ) : myStatus !== 'approved' ? (
                    <TouchableOpacity style={s0.lockedBtn}
                      onPress={()=>router.push('/onboarding')}>
                      <Text style={s0.lockedTxt}>🔒  Verify your account to take this job</Text>
                    </TouchableOpacity>
                  ) : proposingFor === b.id ? (
                    <ProposeTime
                      currentDate={b.date}
                      currentTime={b.time}
                      busy={isBusy}
                      onCancel={()=>setProposing(null)}
                      onSubmit={(d,t,n)=>doPropose(b.id,d,t,n)}
                    />
                  ) : (
                    <>
                      <View style={s0.actions}>
                        <TouchableOpacity style={[s0.rejectBtn,isBusy&&s0.dis]} disabled={isBusy}
                          onPress={()=>doStatus(b.id,'pending_pool')}>
                          <Text style={s0.rejectTxt}>✕  Pass</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s0.acceptBtn,isBusy&&s0.dis]} disabled={isBusy}
                          onPress={()=>doAccept(b.id)}>
                          <Text style={s0.acceptTxt}>{isBusy?'…':'✓  Accept Job'}</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity style={s0.proposeBtn} onPress={()=>setProposing(b.id)}>
                        <Text style={s0.proposeTxt}>📅  Can't make it — suggest another time</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}

              {b.status==='quoted' && (
                <QuotePanel booking={b} role="provider" busy={isBusy} />
              )}

              {b.status==='reschedule_proposed' && (
                <View style={s0.waitProposal}>
                  <Text style={s0.waitProposalTitle}>⏳  Waiting on the client</Text>
                  <Text style={s0.waitProposalTxt}>
                    You offered {prettyDate(b.proposedDate || '')} at {b.proposedTime}.
                    They can take it or put the job back out to others.
                  </Text>
                </View>
              )}

              {b.status==='accepted' && (
                proposingFor === b.id ? (
                  <ProposeTime
                    currentDate={b.date}
                    currentTime={b.time}
                    busy={isBusy}
                    onCancel={()=>setProposing(null)}
                    onSubmit={(d,t,n)=>doPropose(b.id,d,t,n)}
                  />
                ) : (
                  <>
                    <TouchableOpacity style={[s0.tealBtn,isBusy&&s0.dis]} disabled={isBusy}
                      onPress={()=>doStatus(b.id,'en_route',b.address)}>
                      <Text style={s0.whiteBtnTxt}>{isBusy?'…':"🚗  I'm On My Way"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s0.proposeBtn} onPress={()=>setProposing(b.id)}>
                      <Text style={s0.proposeTxt}>📅  Need to move this job</Text>
                    </TouchableOpacity>
                  </>
                )
              )}

              {b.status==='en_route' && (
                isRoadside(b) ? (
                  <TouchableOpacity style={[s0.primaryBtn,isBusy&&s0.dis]} disabled={isBusy}
                    onPress={()=>doStatus(b.id,'in_progress')}>
                    <Text style={s0.whiteBtnTxt}>{isBusy?'…':'📍  Arrived — start work'}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[s0.amberBtn,isBusy&&s0.dis]} disabled={isBusy}
                    onPress={()=>doArrive(b.id)}>
                    <Text style={s0.whiteBtnTxt}>{isBusy?'…':'📍  I Have Arrived'}</Text>
                  </TouchableOpacity>
                )
              )}

              {b.status==='arrived' && (
                <View style={s0.pinBox}>
                  <Text style={s0.pinTitle}>🔐  Ask the client for their 4-digit PIN</Text>
                  <Text style={s0.pinHint}>The client sees the PIN in their app. The job can only start once it is entered correctly.</Text>
                  <TextInput
                    style={s0.pinInput}
                    placeholder="• • • •"
                    placeholderTextColor={C.muted}
                    keyboardType="number-pad"
                    maxLength={4}
                    value={pinInput[b.id]||''}
                    onChangeText={t=>{ setPinInput(p=>({...p,[b.id]:t.replace(/[^0-9]/g,'')})); setPinError(p=>({...p,[b.id]:''})); }}
                  />
                  {pinError[b.id] ? <Text style={s0.pinErr}>⚠️  {pinError[b.id]}</Text> : null}
                  <TouchableOpacity style={[s0.primaryBtn,isBusy&&s0.dis]} disabled={isBusy}
                    onPress={()=>doVerifyPin(b.id)}>
                    <Text style={s0.whiteBtnTxt}>{isBusy?'…':'Start Job'}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {['accepted','en_route','arrived','in_progress','awaiting_confirmation']
                .includes(b.status) && (
                <Chat
                  booking={b}
                  role="cleaner"
                  myId={userId}
                  otherName={clientNames[b.clientId || ''] || 'the client'}
                />
              )}

              {['arrived','in_progress','awaiting_confirmation'].includes(b.status) && (
                <PartsPanel
                  bookingId={b.id}
                  role="provider"
                  locked={b.status === 'awaiting_confirmation'}
                  onChange={loadBookings}
                />
              )}

              {b.status==='in_progress' && (isRoadside(b) || !hasChecklist(b)) && (
                <>
                  <View style={s0.fixedWorking}>
                    <Text style={s0.fixedWorkingTxt}>
                      🔧  {b.pricingModel === 'hourly'
                        ? 'No task list on this one — finish the work and mark it done.'
                        : 'Fixed price — no timer running. Finish the work and mark it done.'}
                    </Text>
                    <Text style={s0.fixedWorkingSub}>
                      If it needs parts beyond the standard fix, agree that with the client
                      separately before carrying on.
                    </Text>
                  </View>
                  <TouchableOpacity style={[s0.primaryBtn,isBusy&&s0.dis]} disabled={isBusy}
                    onPress={()=>doFinish(b.id)}>
                    <Text style={s0.whiteBtnTxt}>{isBusy?'…':'✅  Work complete'}</Text>
                  </TouchableOpacity>
                </>
              )}

              {b.status==='in_progress' && !isRoadside(b) && hasChecklist(b) && (() => {
                const prog = listProgress(b.id);
                const allDone = prog.total > 0 && prog.done === prog.total;
                const items = checklist[b.id] || [];
                const grouped: Record<string, any[]> = {};
                items.forEach(t => { (grouped[t.area] ||= []).push(t); });

                return (
                  <>
                    {b.startedAt && (() => {
                      const mins = elapsed(b.startedAt);
                      const rate = (Number(b.hourlyRate)||15) * (Number(b.serviceMultiplier)||1)
                                 + (b.suppliesBy === 'cleaner' ? 2 : 0);
                      const billed = Math.ceil(mins/15)*15;
                      const earning = (billed/60) * rate * (b.numCleaners||1) * 0.80;
                      return (
                        <View style={s0.timerBox}>
                          <View style={s0.timerRow}>
                            <Text style={s0.timerBig}>⏱  {fmtDuration(mins)}</Text>
                            <Text style={s0.timerEarn}>≈ €{earning.toFixed(2)}</Text>
                          </View>
                          <Text style={s0.timerSub}>
                            Started {new Date(b.startedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
                            {'  ·  '}You're paid for the time actually worked
                          </Text>
                        </View>
                      );
                    })()}

                    <View style={s0.checkCard}>
                      <View style={s0.checkHead}>
                        <Text style={s0.checkTitle}>
                          📋  What you're doing
                        </Text>
                        {!allDone && prog.total > 0 && (
                          <TouchableOpacity onPress={()=>markEverything(b.id)}>
                            <Text style={s0.markAll}>Mark all done</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={s0.barTrack}>
                        <View style={[s0.barFill,
                          {width: prog.total ? `${(prog.done/prog.total)*100}%` : '0%'}]} />
                      </View>

                      {Object.entries(grouped).map(([area, tasks])=>{
                        const areaDone  = tasks.every((t:any)=>t.done);
                        const someDone  = tasks.some((t:any)=>t.done);
                        const expanded  = openList === `${b.id}:${area}`;
                        return (
                          <View key={area} style={[s0.areaBlock, areaDone&&s0.areaBlockOn]}>
                            <View style={s0.areaRow}>
                              <TouchableOpacity
                                style={s0.areaTapZone}
                                onPress={()=>toggleArea(b.id, area, !areaDone)}>
                                <View style={[s0.areaCheck, areaDone&&s0.areaCheckOn,
                                  !areaDone&&someDone&&s0.areaCheckPart]}>
                                  {areaDone
                                    ? <Text style={s0.areaCheckTxt}>✓</Text>
                                    : someDone ? <View style={s0.partDot}/> : null}
                                </View>
                                <View style={{flex:1}}>
                                  <Text style={[s0.areaName, areaDone&&s0.areaNameOn]}>{area}</Text>
                                  <Text style={s0.areaCount}>
                                    {tasks.filter((t:any)=>t.done).length}/{tasks.length} tasks
                                  </Text>
                                </View>
                              </TouchableOpacity>

                              <TouchableOpacity style={s0.areaExpand}
                                onPress={()=>setOpenList(expanded ? null : `${b.id}:${area}`)}>
                                <Text style={s0.areaChevron}>{expanded ? '▲' : '▼'}</Text>
                              </TouchableOpacity>
                            </View>

                            {expanded && (
                              <View style={s0.taskList}>
                                {tasks.map((t:any)=>(
                                  <TouchableOpacity key={t.id} style={s0.listRow}
                                    onPress={()=>toggleTask(b.id, t.id, !t.done)}>
                                    <View style={[s0.listCheck, t.done&&s0.listCheckOn]}>
                                      {t.done && <Text style={s0.listCheckTxt}>✓</Text>}
                                    </View>
                                    <Text style={[s0.listTask, t.done&&s0.listTaskDone]}>{t.task}</Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            )}
                          </View>
                        );
                      })}

                      {!allDone && prog.total > 0 && (
                        <Text style={s0.checkHint}>
                          Tap an area once when you've finished it. Open it if you want
                          to tick tasks one by one.
                        </Text>
                      )}
                    </View>

                    <TouchableOpacity
                      style={[s0.primaryBtn,(isBusy||!allDone)&&s0.dis]}
                      disabled={isBusy||!allDone}
                      onPress={()=>doFinish(b.id)}>
                      <Text style={s0.whiteBtnTxt}>
                        {isBusy ? '…' : allDone ? '✅  Finish Job' : `${prog.done}/${prog.total} tasks done`}
                      </Text>
                    </TouchableOpacity>
                  </>
                );
              })()}

              {b.status==='awaiting_confirmation' && (
                <View style={s0.waitBox}>
                  {b.pricingModel === 'fixed' && (
                    <View style={s0.settleBox}>
                      <View style={s0.settleRow}>
                        <Text style={s0.settleLbl}>Agreed price</Text>
                        <Text style={s0.settleBig}>
                          €{(Number(b.total)/1.029/1.18*0.80).toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  )}
                  {b.pricingModel !== 'fixed' && b.actualMinutes != null && (
                    <View style={s0.settleBox}>
                      <View style={s0.settleRow}>
                        <Text style={s0.settleLbl}>Time worked</Text>
                        <Text style={s0.settleVal}>{fmtDuration(b.actualMinutes)}</Text>
                      </View>
                      {Number(b.partsTotal) > 0 && (
                        <View style={s0.settleRow}>
                          <Text style={s0.settleLbl}>Parts</Text>
                          <Text style={s0.settleVal}>€{Number(b.partsTotal).toFixed(2)}</Text>
                        </View>
                      )}
                      <View style={s0.settleRow}>
                        <Text style={s0.settleLbl}>Your payment</Text>
                        <Text style={s0.settleBig}>€{Number(b.finalCleanerPayment||0).toFixed(2)}</Text>
                      </View>
                    </View>
                  )}
                  <Text style={s0.waitTitle}>⏳  Waiting for client confirmation</Text>
                  <Text style={s0.waitTxt}>
                    The client has 6 hours to confirm. If they don't respond, the job is auto-approved and payment is released.
                  </Text>
                  {b.autoConfirmAt && (
                    <Text style={s0.waitDeadline}>
                      Auto-approves at {new Date(b.autoConfirmAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>
        );
      })}

      {done.length>0 && (
        <>
          <Text style={s0.sectionTitle}>History ({done.length})</Text>
          {done.map(b=>{
            const st = STATUS[b.status]||STATUS.completed;
            return (
              <View key={b.id} style={[s0.card,{opacity:0.75}]}>
                <View style={[s0.statusBar,{backgroundColor:st.bg}]}>
                  <Text style={[s0.statusTxt,{color:st.color}]}>{st.icon}  {st.label}</Text>
                </View>
                <View style={s0.cardBody}>
                  <View style={s0.addressRow}>
                    <Text style={s0.addressIcon}>📍</Text>
                    <Text style={s0.addressTxt}>{b.address}</Text>
                  </View>
                  {b.status==='disputed' && b.disputeReason && (
                    <View style={s0.disputeBox}>
                      <Text style={s0.disputeTxt}>Client reported: {b.disputeReason}</Text>
                    </View>
                  )}
                  <View style={s0.earningsRow}>
                    <Text style={s0.earningsKey}>{prettyDate(b.date)} · {b.hours}h</Text>
                    <Text style={s0.earningsAmt}>
                      {b.status==='completed'
                        ? `€${Number(b.finalCleanerPayment ?? (b.total/1.029/1.18*0.80)).toFixed(2)}`
                        : st.label}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </>
      )}

      {myStatus === 'approved' && bookings.length===0 && (
        <View style={s0.empty}>
          <Text style={s0.emptyIcon}>📋</Text>
          <Text style={s0.emptyTxt}>No jobs yet</Text>
          <Text style={s0.emptySub}>Pull down to refresh</Text>
        </View>
      )}
      <View style={{height:40}}/>
    </ScrollView>
  );
}

const s0 = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  header:{flexDirection:'row',alignItems:'flex-start',paddingHorizontal:20,paddingTop:60,paddingBottom:20,gap:12},
  heading:{fontSize:22,fontWeight:'800',color:C.dark},
  sub:{fontSize:13,color:C.muted,marginTop:2},
  editLink:{fontSize:12,color:C.primary,fontWeight:'700'},
  pendingCard:{marginHorizontal:20,marginBottom:20,backgroundColor:C.white,borderRadius:20,padding:20,gap:10,borderWidth:1,borderColor:C.border,...S.sm},
  pendingIcon:{fontSize:40,textAlign:'center'},
  pendingTitle:{fontSize:18,fontWeight:'800',color:C.dark,textAlign:'center'},
  pendingTxt:{fontSize:13,color:C.muted,textAlign:'center',lineHeight:19},
  pendingSteps:{gap:12,marginTop:10,marginBottom:4},
  pStepRow:{flexDirection:'row',gap:12,alignItems:'flex-start'},
  pStepDot:{width:26,height:26,borderRadius:13,backgroundColor:C.bgAlt,borderWidth:2,borderColor:C.border,alignItems:'center',justifyContent:'center'},
  pStepDotOn:{backgroundColor:C.green,borderColor:C.green},
  pStepNum:{fontSize:11,fontWeight:'800',color:C.muted},
  pStepNumOn:{color:C.white},
  pStepTitle:{fontSize:13,fontWeight:'700',color:C.text},
  pStepDesc:{fontSize:11,color:C.muted,marginTop:2},
  pendingBtn:{borderWidth:1.5,borderColor:C.border,borderRadius:14,paddingVertical:13,alignItems:'center',backgroundColor:C.white,marginTop:4},
  pendingBtnTxt:{fontSize:14,fontWeight:'700',color:C.primary},
  myTrades:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:8},
  myTradeChip:{backgroundColor:C.primaryLt,paddingHorizontal:8,paddingVertical:3,borderRadius:9,borderWidth:1,borderColor:C.border},
  myTradeTxt:{fontSize:10,fontWeight:'700',color:C.primary},
  signOutBtn:{backgroundColor:C.redLt,paddingHorizontal:14,paddingVertical:8,borderRadius:20,borderWidth:1,borderColor:'#FECACA'},
  signOutTxt:{fontSize:13,fontWeight:'700',color:C.red},
  statsRow:{flexDirection:'row',paddingHorizontal:20,gap:12,marginBottom:24},
  statCard:{flex:1,backgroundColor:C.white,borderRadius:16,padding:14,alignItems:'center',...S.sm,borderWidth:1,borderColor:C.border},
  statVal:{fontSize:20,fontWeight:'800',marginBottom:4},
  statLbl:{fontSize:11,color:C.muted,textAlign:'center'},
  sectionTitle:{fontSize:17,fontWeight:'700',color:C.dark,paddingHorizontal:20,marginBottom:12},
  card:{marginHorizontal:20,marginBottom:16,backgroundColor:C.white,borderRadius:20,overflow:'hidden',...S.md,borderWidth:1,borderColor:C.border},
  statusBar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:16,paddingVertical:11},
  statusTxt:{fontSize:13,fontWeight:'700'},
  bookingId:{fontSize:11,color:C.muted},
  cardBody:{padding:16,gap:14},
  infoGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},
  infoItem:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:C.bg,paddingHorizontal:10,paddingVertical:6,borderRadius:10},
  infoIcon:{fontSize:14},
  infoTxt:{fontSize:13,color:C.text,fontWeight:'600'},
  runBox:{backgroundColor:C.primaryLt,borderRadius:14,padding:14,gap:7,
    borderWidth:1,borderColor:C.border},
  runTitle:{fontSize:14,fontWeight:'800',color:C.primary},
  runRow:{flexDirection:'row',gap:10},
  runKey:{fontSize:12,color:C.muted,fontWeight:'700',width:64},
  runVal:{fontSize:13,color:C.text,flex:1,fontWeight:'600'},
  loadBox:{backgroundColor:C.white,borderRadius:10,padding:11,marginTop:3,
    borderWidth:1,borderColor:C.border},
  loadTxt:{fontSize:12,color:C.text,lineHeight:18},
  runNote:{fontSize:11,color:C.text,lineHeight:16,marginTop:2},
  answerBox:{backgroundColor:C.primaryLt,borderRadius:12,padding:13,gap:5,
    borderWidth:1,borderColor:C.border},
  answerTitle:{fontSize:13,fontWeight:'800',color:C.primary},
  answerRow:{flexDirection:'row'},
  answerVal:{fontSize:13,color:C.text,lineHeight:19},
  roadBox:{backgroundColor:C.amberLt,borderRadius:14,padding:14,gap:10,borderWidth:1,borderColor:'#FDE68A'},
  roadHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  roadTitle:{fontSize:14,fontWeight:'800',color:C.amber},
  fixedTag:{backgroundColor:C.white,paddingHorizontal:9,paddingVertical:3,borderRadius:10,borderWidth:1,borderColor:'#FDE68A'},
  fixedTagTxt:{fontSize:10,fontWeight:'800',color:C.amber},
  roadRow:{flexDirection:'row',gap:10},
  roadKey:{fontSize:12,color:C.muted,fontWeight:'700',width:90},
  roadVal:{fontSize:12,color:C.text,flex:1,lineHeight:17},
  gpsBox:{backgroundColor:C.white,borderRadius:12,padding:12,gap:10,borderWidth:1,borderColor:C.border},
  gpsTxt:{fontSize:12,color:C.text,fontWeight:'600'},
  fixedWorking:{backgroundColor:C.amberLt,borderRadius:12,padding:14,gap:6,borderWidth:1,borderColor:'#FDE68A'},
  fixedWorkingTxt:{fontSize:13,color:C.amber,fontWeight:'700',lineHeight:18},
  fixedWorkingSub:{fontSize:11,color:C.text,lineHeight:16},
  teamBanner:{backgroundColor:'#F3E8FF',borderRadius:12,padding:12,borderWidth:1,borderColor:'#E9D5FF'},
  teamBannerTxt:{fontSize:13,color:C.accent,fontWeight:'700'},
  addressCard:{backgroundColor:C.bg,borderRadius:14,padding:12,gap:10},
  addressRow:{flexDirection:'row',gap:8,alignItems:'flex-start'},
  addressIcon:{fontSize:16},
  addressTxt:{fontSize:13,color:C.text,flex:1,lineHeight:20},
  mapButtons:{flexDirection:'row',gap:8},
  mapBtn:{flex:1,paddingVertical:10,borderRadius:10,borderWidth:1.5,borderColor:C.border,alignItems:'center',backgroundColor:C.white},
  mapBtnPrimary:{backgroundColor:C.primary,borderColor:C.primary},
  mapBtnTxt:{fontSize:13,fontWeight:'600',color:C.text},
  earningsRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',backgroundColor:C.greenLt,borderRadius:12,paddingHorizontal:14,paddingVertical:10},
  earningsKey:{fontSize:13,color:C.green,fontWeight:'600'},
  earningsAmt:{fontSize:18,fontWeight:'800',color:C.green},
  actions:{flexDirection:'row',gap:10},
  rejectBtn:{flex:1,borderWidth:1.5,borderColor:C.red,borderRadius:12,paddingVertical:13,alignItems:'center'},
  rejectTxt:{color:C.red,fontWeight:'700',fontSize:14},
  acceptBtn:{flex:1,backgroundColor:C.green,borderRadius:12,paddingVertical:13,alignItems:'center'},
  acceptTxt:{color:C.white,fontWeight:'700',fontSize:14},
  tealBtn:{backgroundColor:C.teal,borderRadius:12,paddingVertical:14,alignItems:'center'},
  amberBtn:{backgroundColor:C.amber,borderRadius:12,paddingVertical:14,alignItems:'center'},
  primaryBtn:{backgroundColor:C.primary,borderRadius:12,paddingVertical:14,alignItems:'center'},
  whiteBtnTxt:{color:C.white,fontWeight:'700',fontSize:15},
  dis:{opacity:0.5},
  errBanner:{flexDirection:'row',alignItems:'center',gap:10,marginHorizontal:20,
    marginBottom:14,backgroundColor:C.redLt,borderRadius:12,padding:13,
    borderWidth:1,borderColor:'#FECACA'},
  errBannerTxt:{flex:1,fontSize:13,color:C.red,fontWeight:'600',lineHeight:18},
  errBannerX:{fontSize:15,color:C.red,fontWeight:'800'},
  lockedBtn:{backgroundColor:C.bgAlt,borderRadius:12,paddingVertical:14,alignItems:'center',
    borderWidth:1.5,borderStyle:'dashed',borderColor:C.border},
  lockedTxt:{fontSize:13,fontWeight:'700',color:C.primary},
  gateCard:{marginHorizontal:20,marginBottom:20,backgroundColor:C.white,borderRadius:20,
    padding:20,gap:10,borderWidth:1,borderColor:C.border,...S.sm},
  gateIcon:{fontSize:40,textAlign:'center'},
  gateTitle:{fontSize:18,fontWeight:'800',color:C.dark,textAlign:'center'},
  gateTxt:{fontSize:13,color:C.muted,textAlign:'center',lineHeight:19},
  gateSteps:{gap:12,marginTop:10,marginBottom:4},
  gStepRow:{flexDirection:'row',gap:12,alignItems:'flex-start'},
  gStepDot:{width:26,height:26,borderRadius:13,backgroundColor:C.bgAlt,borderWidth:2,
    borderColor:C.border,alignItems:'center',justifyContent:'center'},
  gStepDotOn:{backgroundColor:C.green,borderColor:C.green},
  gStepNum:{fontSize:11,fontWeight:'800',color:C.muted},
  gStepNumOn:{color:C.white},
  gStepTitle:{fontSize:13,fontWeight:'700',color:C.text},
  gStepDesc:{fontSize:11,color:C.muted,marginTop:2},
  gateBtn:{backgroundColor:C.primary,borderRadius:14,paddingVertical:15,alignItems:'center',marginTop:4},
  gateBtnTxt:{fontSize:15,fontWeight:'700',color:C.white},
  proposeBtn:{borderWidth:1.5,borderColor:C.teal,borderRadius:12,paddingVertical:12,
    alignItems:'center',backgroundColor:C.white},
  proposeTxt:{fontSize:13,fontWeight:'700',color:C.teal},
  waitProposal:{backgroundColor:C.tealLt,borderRadius:12,padding:14,gap:5,
    borderWidth:1,borderColor:'#BAE6FD'},
  waitProposalTitle:{fontSize:14,fontWeight:'800',color:C.teal},
  waitProposalTxt:{fontSize:12,color:C.text,lineHeight:18},
  checkCard:{backgroundColor:C.white,borderRadius:14,padding:14,gap:10,
    borderWidth:1,borderColor:C.border},
  checkHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  checkTitle:{fontSize:14,fontWeight:'800',color:C.dark},
  markAll:{fontSize:12,fontWeight:'700',color:C.primary},
  checkHint:{fontSize:11,color:C.muted,lineHeight:16},
  areaBlock:{borderRadius:12,borderWidth:1.5,borderColor:C.border,backgroundColor:C.bg,
    overflow:'hidden'},
  areaBlockOn:{borderColor:C.green,backgroundColor:C.greenLt},
  areaRow:{flexDirection:'row',alignItems:'center'},
  areaTapZone:{flex:1,flexDirection:'row',alignItems:'center',gap:12,padding:13},
  areaCheck:{width:26,height:26,borderRadius:8,borderWidth:2,borderColor:C.border,
    alignItems:'center',justifyContent:'center',backgroundColor:C.white},
  areaCheckOn:{backgroundColor:C.green,borderColor:C.green},
  areaCheckPart:{borderColor:C.amber},
  areaCheckTxt:{color:C.white,fontSize:15,fontWeight:'800'},
  partDot:{width:10,height:10,borderRadius:5,backgroundColor:C.amber},
  areaName:{fontSize:14,fontWeight:'700',color:C.dark},
  areaNameOn:{color:C.green},
  areaCount:{fontSize:11,color:C.muted,marginTop:2},
  areaExpand:{paddingHorizontal:14,paddingVertical:16},
  areaChevron:{fontSize:11,color:C.muted},
  taskList:{paddingHorizontal:13,paddingBottom:12,gap:2,borderTopWidth:1,
    borderTopColor:C.border,paddingTop:10},
  progressBar:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:C.primaryLt,borderRadius:12,padding:14,borderWidth:1,borderColor:C.border},
  progressTitle:{fontSize:13,fontWeight:'800',color:C.primary,marginBottom:8},
  barTrack:{height:6,backgroundColor:C.white,borderRadius:3,overflow:'hidden'},
  barFill:{height:6,backgroundColor:C.primary,borderRadius:3},
  progressChevron:{fontSize:12,color:C.primary},
  listBox:{backgroundColor:C.white,borderRadius:12,padding:14,borderWidth:1,borderColor:C.border,gap:14},
  listGroup:{gap:4},
  listArea:{fontSize:11,fontWeight:'800',color:C.muted,textTransform:'uppercase',letterSpacing:0.6,marginBottom:4},
  listRow:{flexDirection:'row',alignItems:'flex-start',gap:10,paddingVertical:6},
  listCheck:{width:20,height:20,borderRadius:6,borderWidth:2,borderColor:C.border,alignItems:'center',justifyContent:'center',marginTop:1},
  listCheckOn:{backgroundColor:C.green,borderColor:C.green},
  listCheckTxt:{color:C.white,fontSize:12,fontWeight:'800'},
  listTask:{fontSize:13,color:C.text,flex:1,lineHeight:19},
  listTaskDone:{color:C.muted,textDecorationLine:'line-through'},
  warnBox:{backgroundColor:C.amberLt,borderRadius:10,padding:10,borderWidth:1,borderColor:'#FDE68A'},
  warnTxt:{fontSize:12,color:C.amber,fontWeight:'700'},
  priorityBox:{backgroundColor:C.amberLt,borderRadius:10,padding:10,borderWidth:1,borderColor:'#FDE68A'},
  priorityTxt:{fontSize:12,color:C.amber,fontWeight:'700',lineHeight:17},
  poolBox:{backgroundColor:'#F3E8FF',borderRadius:10,padding:10,borderWidth:1,borderColor:'#E9D5FF'},
  poolTxt:{fontSize:12,color:C.accent,fontWeight:'700'},
  pinBox:{backgroundColor:C.amberLt,borderRadius:14,padding:16,gap:10,borderWidth:1,borderColor:'#FDE68A'},
  pinTitle:{fontSize:14,fontWeight:'800',color:C.amber},
  pinHint:{fontSize:12,color:C.text,lineHeight:18},
  pinInput:{backgroundColor:C.white,borderRadius:12,paddingVertical:14,fontSize:28,fontWeight:'800',color:C.dark,textAlign:'center',letterSpacing:12,borderWidth:2,borderColor:C.amber},
  pinErr:{fontSize:13,color:C.red,fontWeight:'600'},
  timerBox:{backgroundColor:C.primaryLt,borderRadius:14,padding:14,borderWidth:1,borderColor:C.border,gap:6},
  timerRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  timerBig:{fontSize:22,fontWeight:'800',color:C.primary},
  timerEarn:{fontSize:16,fontWeight:'800',color:C.green},
  timerSub:{fontSize:11,color:C.muted,lineHeight:16},
  timerTxt:{fontSize:13,color:C.primary,fontWeight:'700'},
  settleBox:{backgroundColor:C.white,borderRadius:12,padding:12,gap:6,marginBottom:8,borderWidth:1,borderColor:C.border},
  settleRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  settleLbl:{fontSize:12,color:C.muted,fontWeight:'600'},
  settleVal:{fontSize:13,color:C.text,fontWeight:'700'},
  settleBig:{fontSize:18,color:C.green,fontWeight:'800'},
  waitBox:{backgroundColor:C.tealLt,borderRadius:14,padding:16,gap:6,borderWidth:1,borderColor:'#BAE6FD'},
  waitTitle:{fontSize:14,fontWeight:'800',color:C.teal},
  waitTxt:{fontSize:12,color:C.text,lineHeight:18},
  waitDeadline:{fontSize:12,color:C.teal,fontWeight:'700',marginTop:4},
  disputeBox:{backgroundColor:C.redLt,borderRadius:10,padding:10,borderWidth:1,borderColor:'#FECACA'},
  disputeTxt:{fontSize:12,color:C.red,fontWeight:'600'},
  empty:{alignItems:'center',paddingTop:60},
  emptyIcon:{fontSize:52,marginBottom:12},
  emptyTxt:{fontSize:18,fontWeight:'700',color:C.dark},
  emptySub:{fontSize:14,color:C.muted,marginTop:6,textAlign:'center'},
});
