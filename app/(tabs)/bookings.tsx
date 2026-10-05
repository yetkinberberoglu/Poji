import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, TextInput } from 'react-native';
import { router } from 'expo-router';
import { C, S } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { fmtDuration } from '../../lib/services';
import PartsPanel from '../../components/PartsPanel';
import Chat from '../../components/Chat';
import QuotePanel from '../../components/QuotePanel';

const STATUS: Record<string,{label:string;color:string;bg:string;icon:string}> = {
  pending:               {label:'Waiting for provider',color:C.amber, bg:C.amberLt,   icon:'⏳'},
  pending_pool:          {label:'Finding a provider',color:C.accent, bg:'#F3E8FF',   icon:'🌐'},
  reschedule_proposed:   {label:'New time offered', color:C.teal,   bg:C.tealLt,    icon:'📅'},
  quoted:                {label:'Quote received',   color:C.teal,   bg:C.tealLt,    icon:'💬'},
  accepted:              {label:'Accepted',          color:C.green,  bg:C.greenLt,   icon:'✅'},
  en_route:              {label:'On the way',        color:C.teal,   bg:C.tealLt,    icon:'🚗'},
  arrived:               {label:'Provider arrived',   color:C.amber,  bg:C.amberLt,   icon:'🔐'},
  in_progress:           {label:'In Progress',       color:C.primary,bg:C.primaryLt, icon:'🧹'},
  awaiting_confirmation: {label:'Confirm the work',  color:C.teal,   bg:C.tealLt,    icon:'👀'},
  completed:             {label:'Completed',         color:C.green,  bg:C.greenLt,   icon:'✓'},
  disputed:              {label:'Disputed',          color:C.red,    bg:C.redLt,     icon:'⚠️'},
  cancelled:             {label:'Cancelled',         color:C.red,    bg:C.redLt,     icon:'✕'},
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

const DISPUTE_REASONS = [
  'Nobody showed up',
  'Work was incomplete',
  'Quality was poor',
  'Left earlier than booked',
  'Something was damaged',
];

export default function Bookings() {
  const { bookings, cleaners, userId, updateStatus, clientConfirm, clientDispute, releaseToPool, reassignCleaner, respondToProposal, respondToQuote, loadBookings } = useApp();
  const [refreshing, setRefreshing]   = useState(false);
  const [busy, setBusy]               = useState<string|null>(null);
  const [disputeFor, setDisputeFor]   = useState<string|null>(null);
  const [disputeText, setDisputeText] = useState('');
  const [pickFor, setPickFor]         = useState<string|null>(null);
  const [now, setNow]                 = useState(Date.now());
  const [checklist, setChecklist]     = useState<Record<string, any[]>>({});
  const [openList, setOpenList]       = useState<string|null>(null);
  const [actionError, setActionError] = useState('');

  const loadChecklist = async (bookingId: string) => {
    const { data } = await supabase.from('booking_checklist')
      .select('*').eq('booking_id', bookingId).order('area');
    setChecklist(prev => ({ ...prev, [bookingId]: data || [] }));
  };

  useEffect(() => {
    bookings
      .filter(b => ['awaiting_confirmation','completed','disputed'].includes(b.status))
      .forEach(b => { if (!checklist[b.id]) loadChecklist(b.id); });
  }, [bookings]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const onRefresh = async () => { setRefreshing(true); await loadBookings(); setRefreshing(false); };
  const confirmWork = async (id: string) => {
    setBusy(id); setActionError('');
    try {
      await clientConfirm(id);
    } catch (e: any) {
      setActionError(e?.message || 'Could not approve that');
    }
    setBusy(null);
  };
  const doRelease = async (id: string) => { setBusy(id); await releaseToPool(id); setBusy(null); };

  const doQuoteReply = async (id: string, accept: boolean) => {
    setBusy(id); await respondToQuote(id, accept); setBusy(null);
  };

  const doProposal = async (id: string, accept: boolean) => {
    setBusy(id); await respondToProposal(id, accept); setBusy(null);
  };
  const doReassign = async (id: string, cleanerId: string) => {
    setBusy(id); await reassignCleaner(id, cleanerId); setBusy(null); setPickFor(null);
  };

  const submitDispute = async (id: string) => {
    if (!disputeText.trim()) return;
    setBusy(id);
    await clientDispute(id, disputeText.trim());
    setBusy(null); setDisputeFor(null); setDisputeText('');
  };

  const elapsed = (startedAt?: string|null) => {
    if (!startedAt) return 0;
    return Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 60000));
  };

  const fmtCountdown = (until: string) => {
    const ms = new Date(until).getTime() - now;
    if (ms <= 0) return null;
    const m = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${m}:${String(sec).padStart(2,'0')}`;
  };

  return (
    <ScrollView style={st.wrap} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary}/>}>
      <Text style={st.heading}>My Bookings</Text>

      {actionError ? (
        <View style={st.errBanner}>
          <Text style={st.errBannerTxt}>⚠️  {actionError}</Text>
          <TouchableOpacity onPress={()=>setActionError('')}>
            <Text style={st.errBannerX}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <Text style={st.sub}>Pull down to refresh</Text>

      {bookings.length===0 && (
        <View style={st.empty}>
          <Text style={st.emptyIcon}>📋</Text>
          <Text style={st.emptyTxt}>No bookings yet</Text>
          <Text style={st.emptySub}>Your bookings will appear here</Text>
        </View>
      )}

      {bookings.map(b=>{
        const s = STATUS[b.status]||STATUS.pending;
        const cleaner = cleaners.find(c=>c.id===b.cleanerId);
        const isBusy = busy===b.id;

        return (
          <View key={b.id} style={st.card}>
            <View style={[st.banner,{backgroundColor:s.bg}]}>
              <Text style={[st.bannerTxt,{color:s.color}]}>{s.icon}  {s.label}</Text>
              <Text style={st.bookingId}>{b.id.length>10?b.id.slice(0,8)+'…':b.id}</Text>
            </View>

            <View style={st.body}>
              <View style={st.cleanerRow}>
                <View style={[st.avatar,{backgroundColor:(cleaner?.color||C.primary)+'22'}]}>
                  <Text style={[st.initials,{color:cleaner?.color||C.primary}]}>{cleaner?.initials||'?'}</Text>
                </View>
                <View style={{flex:1}}>
                  <Text style={st.cleanerName}>{cleaner?.name||'Cleaner'}</Text>
                  <Text style={st.cleanerSub}>{b.numCleaners} cleaner · {b.hours}h · {prettyDate(b.date)} at {b.time}</Text>
                </View>
                <View style={{alignItems:'flex-end'}}>
                  <Text style={st.price}>€{Number(b.finalTotal ?? b.total).toFixed(2)}</Text>
                  {b.status==='completed' && b.actualMinutes != null && (
                    <Text style={st.priceSub}>{fmtDuration(b.actualMinutes)} worked</Text>
                  )}
                </View>
              </View>

              <View style={st.addrRow}>
                <Text>📍  </Text><Text style={st.addrTxt}>{b.address}</Text>
              </View>

              {b.status==='pending' && (() => {
                const left = b.preferredUntil ? fmtCountdown(b.preferredUntil) : null;
                if (left) {
                  return (
                    <View style={st.waitBox}>
                      <Text style={st.waitTitle}>⏳  Waiting for {cleaner?.name||'your provider'}</Text>
                      <Text style={st.waitTxt}>We've notified them. They have priority on this job for the next few minutes.</Text>
                      <Text style={st.countdown}>{left} left</Text>
                    </View>
                  );
                }
                // Who else could actually take this? Only people in the same
                // trade, free to work, and not the one who went quiet.
                const alternatives = cleaners.filter(c =>
                  c.id !== b.cleanerId &&
                  c.available &&
                  (!b.tradeId || ((c as any).categories || []).includes(b.tradeId))
                );
                const alone = alternatives.length === 0;

                return (
                  <View style={st.chooseBox}>
                    <Text style={st.chooseTitle}>
                      😕  {cleaner?.name||'Your provider'} hasn't responded
                    </Text>
                    <Text style={st.chooseTxt}>
                      {alone
                        ? "They're the only provider covering this in your area right now, so there's nobody else to ask. Give them a little longer, send them a message, or cancel — nothing has been charged."
                        : `They may be busy or haven't seen it yet. ${alternatives.length} other ${alternatives.length===1?'provider':'providers'} could take this.`}
                    </Text>
                    {pickFor===b.id ? (
                      <View style={st.pickList}>
                        <Text style={st.pickLabel}>Choose someone else</Text>
                        {alternatives.slice(0,5).map(c=>(
                          <TouchableOpacity key={c.id} style={st.pickRow} disabled={isBusy}
                            onPress={()=>doReassign(b.id, c.id)}>
                            <View style={[st.pickAvatar,{backgroundColor:c.color+'22'}]}>
                              <Text style={[st.pickInitials,{color:c.color}]}>{c.initials}</Text>
                            </View>
                            <View style={{flex:1}}>
                              <Text style={st.pickName}>{c.name}</Text>
                              <Text style={st.pickMeta}>⭐ {c.rating} · {c.areas[0]}</Text>
                            </View>
                            <Text style={st.pickGo}>›</Text>
                          </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={st.cancelBtn} onPress={()=>setPickFor(null)}>
                          <Text style={st.cancelTxt}>Back</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      alone ? (
                        <View style={st.chooseActions}>
                          <TouchableOpacity style={[st.poolBtn,isBusy&&st.dis]} disabled={isBusy}
                            onPress={()=>doRelease(b.id)}>
                            <Text style={st.whiteTxt}>
                              {isBusy?'…':'⏳  Keep waiting'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={st.pickBtn}
                            onPress={()=>updateStatus(b.id,'cancelled')}>
                            <Text style={st.pickBtnTxt}>Cancel this request</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={st.chooseActions}>
                          <TouchableOpacity style={[st.poolBtn,isBusy&&st.dis]} disabled={isBusy}
                            onPress={()=>doRelease(b.id)}>
                            <Text style={st.whiteTxt}>
                              {isBusy?'…'
                                : alternatives.length === 1
                                ? `🔔  Ask ${alternatives[0].name.split(' ')[0]} instead`
                                : '🌐  Ask the others too'}
                            </Text>
                          </TouchableOpacity>
                          {alternatives.length > 1 && (
                            <TouchableOpacity style={st.pickBtn} onPress={()=>setPickFor(b.id)}>
                              <Text style={st.pickBtnTxt}>Pick someone myself</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )
                    )}
                  </View>
                );
              })()}

              {(b.status==='quoted' ||
                (b.pricingModel === 'quote' && ['pending','pending_pool','accepted'].includes(b.status))) && (
                <QuotePanel
                  booking={b}
                  role="client"
                  busy={isBusy}
                  onRespond={(ok)=>doQuoteReply(b.id, ok)}
                />
              )}

              {b.status==='reschedule_proposed' && (
                <View style={st.proposalBox}>
                  <Text style={st.proposalTitle}>
                    📅  {cleaner?.name?.split(' ')[0] || 'Your provider'} offers a different time
                  </Text>

                  <View style={st.compareRow}>
                    <View style={st.compareCol}>
                      <Text style={st.compareLbl}>You asked for</Text>
                      <Text style={st.compareOld}>{prettyDate(b.date)}</Text>
                      <Text style={st.compareOldTime}>{b.time}</Text>
                    </View>
                    <Text style={st.compareArrow}>→</Text>
                    <View style={st.compareCol}>
                      <Text style={st.compareLbl}>They can come</Text>
                      <Text style={st.compareNew}>{prettyDate(b.proposedDate || '')}</Text>
                      <Text style={st.compareNewTime}>{b.proposedTime}</Text>
                    </View>
                  </View>

                  {!!b.proposedNote && (
                    <View style={st.proposalNote}>
                      <Text style={st.proposalNoteTxt}>"{b.proposedNote}"</Text>
                    </View>
                  )}

                  <View style={st.row}>
                    <TouchableOpacity style={[st.declineBtn,isBusy&&st.dis]} disabled={isBusy}
                      onPress={()=>doProposal(b.id, false)}>
                      <Text style={st.declineTxt}>Find someone else</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[st.acceptBtn,isBusy&&st.dis]} disabled={isBusy}
                      onPress={()=>doProposal(b.id, true)}>
                      <Text style={st.whiteTxt}>{isBusy?'…':'✓  That works'}</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={st.proposalHint}>
                    Declining puts your job back out to every available provider —
                    at your original time.
                  </Text>
                </View>
              )}

              {b.status==='pending_pool' && (
                <View style={st.poolBox}>
                  {(() => {
                    const pool = cleaners.filter(c =>
                      c.available &&
                      (!b.tradeId || ((c as any).categories || []).includes(b.tradeId)));
                    return (
                      <>
                        <Text style={st.poolTitle}>🌐  Finding you a provider</Text>
                        <Text style={st.poolTxt}>
                          {pool.length === 0
                            ? "Nobody covering this is free at the moment. We'll keep looking and message you the moment someone can take it."
                            : pool.length === 1
                            ? `${pool[0].name.split(' ')[0]} is the one provider covering this in your area. They've been notified.`
                            : `All ${pool.length} providers covering this have been notified. The first to accept takes the job.`}
                        </Text>
                      </>
                    );
                  })()}
                </View>
              )}

              {b.status==='en_route' && (
                <View style={st.trackBox}>
                  <Text style={st.trackTxt}>🚗  Your provider is on the way</Text>
                </View>
              )}

              {b.status==='arrived' && b.pinCode && (
                <View style={st.pinBox}>
                  <Text style={st.pinTitle}>🔐  Give this PIN to your provider</Text>
                  <Text style={st.pinCode}>{b.pinCode}</Text>
                  <Text style={st.pinHint}>The job only starts once your provider enters this code. Never share it before they arrive.</Text>
                </View>
              )}

              {b.status==='in_progress' && (() => {
                const mins = elapsed(b.startedAt);
                const rate = (Number(b.hourlyRate)||15) * (Number(b.serviceMultiplier)||1)
                           + (b.suppliesBy === 'cleaner' ? 2 : 0);
                const billed  = Math.ceil(mins/15)*15;
                const running = (billed/60) * rate * (b.numCleaners||1) * 1.18 * 1.029 + 0.30;
                return (
                  <View style={st.runBox}>
                    <Text style={st.runTitle}>🧹  Cleaning in progress</Text>
                    <View style={st.runRow}>
                      <Text style={st.runBig}>{fmtDuration(mins)}</Text>
                      <Text style={st.runCost}>≈ €{running.toFixed(2)}</Text>
                    </View>
                    <Text style={st.runSub}>
                      Started {b.startedAt ? new Date(b.startedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'}
                      {'  ·  '}You pay for the time actually worked
                    </Text>
                  </View>
                );
              })()}

              {(['accepted','en_route','arrived','in_progress','awaiting_confirmation','quoted']
                .includes(b.status)
                || (b.pricingModel === 'quote' && b.status === 'pending')) && cleaner && (
                <Chat
                  booking={b}
                  role="client"
                  myId={userId}
                  otherName={cleaner.name}
                />
              )}

              {['arrived','in_progress','awaiting_confirmation','completed'].includes(b.status) && (
                <PartsPanel
                  bookingId={b.id}
                  role="client"
                  locked={b.status === 'completed'}
                  onChange={loadBookings}
                />
              )}

              {b.status==='awaiting_confirmation' && (
                <View style={st.confirmBox}>
                  <Text style={st.confirmTitle}>👀  Your provider marked this job as finished</Text>
                  <Text style={st.confirmTxt}>Please check the work and confirm. If you don't respond within 6 hours, it is approved automatically.</Text>
                  {b.actualMinutes != null && (
                    <View style={st.billBox}>
                      <Text style={st.billTitle}>Final bill</Text>
                      <View style={st.billRow}>
                        <Text style={st.billLbl}>Time worked</Text>
                        <Text style={st.billVal}>{fmtDuration(b.actualMinutes)}</Text>
                      </View>
                      {Number(b.partsTotal) > 0 && (
                        <>
                          <View style={st.billRow}>
                            <Text style={st.billLbl}>Labour</Text>
                            <Text style={st.billVal}>
                              €{(Number(b.finalTotal ?? b.total) - Number(b.partsTotal)).toFixed(2)}
                            </Text>
                          </View>
                          <View style={st.billRow}>
                            <Text style={st.billLbl}>Parts you approved</Text>
                            <Text style={st.billVal}>€{Number(b.partsTotal).toFixed(2)}</Text>
                          </View>
                        </>
                      )}
                      <View style={st.billRow}>
                        <Text style={st.billLbl}>Estimated was</Text>
                        <Text style={st.billMuted}>€{Number(b.estimatedTotal ?? b.total).toFixed(2)}</Text>
                      </View>
                      <View style={st.billTotalRow}>
                        <Text style={st.billTotalLbl}>You pay</Text>
                        <Text style={st.billTotalVal}>€{Number(b.finalTotal ?? b.total).toFixed(2)}</Text>
                      </View>
                      {b.finalTotal != null && b.estimatedTotal != null && (
                        <Text style={st.billNote}>
                          {(() => {
                            const labour = Number(b.finalTotal) - Number(b.partsTotal || 0);
                            const est    = Number(b.estimatedTotal);
                            const diff   = +(labour - est).toFixed(2);
                            if (diff < 0) return `The job finished early — €${Math.abs(diff).toFixed(2)} less than estimated.`;
                            if (diff > 0) return `The job ran longer than estimated — €${diff.toFixed(2)} more.`;
                            return 'Labour exactly as estimated.';
                          })()}
                        </Text>
                      )}
                    </View>
                  )}

                  {b.autoConfirmAt && (
                    <Text style={st.deadline}>Auto-approves at {new Date(b.autoConfirmAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</Text>
                  )}

                  {(() => {
                    const items = checklist[b.id] || [];
                    if (!items.length) return null;
                    const done = items.filter(t=>t.done).length;
                    const grouped: Record<string, any[]> = {};
                    items.forEach(t => { (grouped[t.area] ||= []).push(t); });
                    const areas = Object.entries(grouped);
                    const allDone = done === items.length;
                    return (
                      <View style={st.workCard}>
                        <Text style={st.workTitle}>
                          {allDone ? '✓  Everything on the list was done'
                            : `${done} of ${items.length} tasks done`}
                        </Text>

                        <View style={st.areaWrap}>
                          {areas.map(([area, tasks])=>{
                            const areaDone = tasks.every((t:any)=>t.done);
                            const n = tasks.filter((t:any)=>t.done).length;
                            return (
                              <View key={area} style={[st.areaChip, !areaDone&&st.areaChipPart]}>
                                <Text style={[st.areaChipTxt, !areaDone&&{color:C.amber}]}>
                                  {areaDone ? '✓' : `${n}/${tasks.length}`}  {area}
                                </Text>
                              </View>
                            );
                          })}
                        </View>

                        <TouchableOpacity onPress={()=>setOpenList(openList===b.id?null:b.id)}>
                          <Text style={st.workMore}>
                            {openList===b.id ? 'Hide the detail ▲' : 'See every task ▼'}
                          </Text>
                        </TouchableOpacity>

                        {openList===b.id && (
                          <View style={st.listBox}>
                            {areas.map(([area, tasks])=>(
                              <View key={area} style={st.listGroup}>
                                <Text style={st.listArea}>{area}</Text>
                                {tasks.map((t:any)=>(
                                  <View key={t.id} style={st.listRow}>
                                    <Text style={[st.listMark,{color: t.done?C.green:C.red}]}>
                                      {t.done?'✓':'✕'}
                                    </Text>
                                    <Text style={[st.listTask, !t.done&&st.listTaskMissed]}>{t.task}</Text>
                                  </View>
                                ))}
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })()}
                  {disputeFor===b.id ? (
                    <View style={st.disputeForm}>
                      <Text style={st.disputeLabel}>What went wrong?</Text>
                      <View style={st.reasonRow}>
                        {DISPUTE_REASONS.map(r=>(
                          <TouchableOpacity key={r} style={[st.reasonChip, disputeText===r&&st.reasonChipOn]}
                            onPress={()=>setDisputeText(r)}>
                            <Text style={[st.reasonTxt, disputeText===r&&st.reasonTxtOn]}>{r}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TextInput style={st.disputeInput} placeholder="Add details…" placeholderTextColor={C.muted}
                        value={disputeText} onChangeText={setDisputeText} multiline />
                      <View style={st.row}>
                        <TouchableOpacity style={st.cancelBtn} onPress={()=>{setDisputeFor(null);setDisputeText('');}}>
                          <Text style={st.cancelTxt}>Back</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[st.dangerBtn,isBusy&&st.dis]} disabled={isBusy}
                          onPress={()=>submitDispute(b.id)}>
                          <Text style={st.whiteTxt}>{isBusy?'…':'Submit Report'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={st.row}>
                      <TouchableOpacity style={st.reportBtn} onPress={()=>setDisputeFor(b.id)}>
                        <Text style={st.reportTxt}>⚠️  Report issue</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[st.approveBtn,isBusy&&st.dis]} disabled={isBusy}
                        onPress={()=>confirmWork(b.id)}>
                        <Text style={st.whiteTxt}>{isBusy?'…':'✓  Confirm work'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {b.status==='disputed' && (
                <View style={st.disputedBox}>
                  <Text style={st.disputedTitle}>⚠️  Reported — under review</Text>
                  {b.disputeReason && <Text style={st.disputedTxt}>{b.disputeReason}</Text>}
                  <Text style={st.disputedHint}>Our team will contact you within 24 hours.</Text>
                </View>
              )}

              {['pending','pending_pool','reschedule_proposed','accepted'].includes(b.status) && (
                <TouchableOpacity style={st.cancelBooking} onPress={()=>updateStatus(b.id,'cancelled')}>
                  <Text style={st.cancelBookingTxt}>Cancel Booking</Text>
                </TouchableOpacity>
              )}

              {b.status==='completed' && (
                <TouchableOpacity style={st.reviewBtn}
                  onPress={()=>router.push(`/review?bookingId=${b.id}&cleanerId=${b.cleanerId}&cleanerName=${encodeURIComponent(cleaner?.name||'your cleaner')}`)}>
                  <Text style={st.reviewTxt}>⭐  Leave a Review</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
      <View style={{height:32}} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  heading:{fontSize:28,fontWeight:'800',color:C.dark,paddingHorizontal:20,paddingTop:60,paddingBottom:4},
  sub:{fontSize:12,color:C.muted,paddingHorizontal:20,marginBottom:16},
  empty:{alignItems:'center',paddingTop:80},
  emptyIcon:{fontSize:48,marginBottom:12},
  emptyTxt:{fontSize:16,fontWeight:'700',color:C.dark},
  emptySub:{fontSize:13,color:C.muted,marginTop:6},
  card:{marginHorizontal:20,marginBottom:16,backgroundColor:C.white,borderRadius:20,overflow:'hidden',...S.md,borderWidth:1,borderColor:C.border},
  banner:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:16,paddingVertical:11},
  bannerTxt:{fontSize:13,fontWeight:'700'},
  bookingId:{fontSize:11,color:C.muted},
  body:{padding:16,gap:12},
  cleanerRow:{flexDirection:'row',alignItems:'center',gap:12},
  avatar:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center'},
  initials:{fontSize:16,fontWeight:'800'},
  cleanerName:{fontSize:15,fontWeight:'700',color:C.dark},
  cleanerSub:{fontSize:12,color:C.muted,marginTop:2},
  price:{marginLeft:'auto',fontSize:18,fontWeight:'800',color:C.primary},
  addrRow:{flexDirection:'row',backgroundColor:C.bg,padding:10,borderRadius:10},
  addrTxt:{fontSize:13,color:C.text,flex:1},
  waitBox:{backgroundColor:C.amberLt,borderRadius:14,padding:14,gap:6,borderWidth:1,borderColor:'#FDE68A'},
  waitTitle:{fontSize:14,fontWeight:'800',color:C.amber},
  waitTxt:{fontSize:12,color:C.text,lineHeight:18},
  countdown:{fontSize:20,fontWeight:'800',color:C.amber,marginTop:2},
  chooseBox:{backgroundColor:C.bgAlt,borderRadius:14,padding:14,gap:8,borderWidth:1,borderColor:C.border},
  chooseTitle:{fontSize:14,fontWeight:'800',color:C.dark},
  chooseTxt:{fontSize:12,color:C.text,lineHeight:18},
  chooseActions:{gap:8,marginTop:4},
  poolBtn:{backgroundColor:C.accent,borderRadius:12,paddingVertical:13,alignItems:'center'},
  pickBtn:{borderWidth:1.5,borderColor:C.border,borderRadius:12,paddingVertical:12,alignItems:'center',backgroundColor:C.white},
  pickBtnTxt:{color:C.text,fontWeight:'600',fontSize:13},
  pickList:{gap:8,marginTop:4},
  pickLabel:{fontSize:12,fontWeight:'700',color:C.muted,textTransform:'uppercase',letterSpacing:0.5},
  pickRow:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:C.white,borderRadius:12,padding:10,borderWidth:1,borderColor:C.border},
  pickAvatar:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center'},
  pickInitials:{fontSize:14,fontWeight:'800'},
  pickName:{fontSize:14,fontWeight:'700',color:C.dark},
  pickMeta:{fontSize:11,color:C.muted,marginTop:1},
  pickGo:{fontSize:20,color:C.border},
  poolBox:{backgroundColor:'#F3E8FF',borderRadius:14,padding:14,gap:6,borderWidth:1,borderColor:'#E9D5FF'},
  poolTitle:{fontSize:14,fontWeight:'800',color:C.accent},
  poolTxt:{fontSize:12,color:C.text,lineHeight:18},
  priceSub:{fontSize:10,color:C.muted,marginTop:2},
  runBox:{backgroundColor:C.primaryLt,borderRadius:14,padding:14,gap:8,borderWidth:1,borderColor:C.border},
  runTitle:{fontSize:13,fontWeight:'800',color:C.primary},
  runRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  runBig:{fontSize:24,fontWeight:'800',color:C.primary},
  runCost:{fontSize:17,fontWeight:'800',color:C.dark},
  runSub:{fontSize:11,color:C.muted,lineHeight:16},
  billBox:{backgroundColor:C.white,borderRadius:12,padding:14,gap:7,marginTop:8,borderWidth:1,borderColor:C.border},
  billTitle:{fontSize:12,fontWeight:'800',color:C.muted,textTransform:'uppercase',letterSpacing:0.5,marginBottom:2},
  billRow:{flexDirection:'row',justifyContent:'space-between'},
  billLbl:{fontSize:12,color:C.muted},
  billVal:{fontSize:12,color:C.text,fontWeight:'700'},
  billMuted:{fontSize:12,color:C.muted,textDecorationLine:'line-through'},
  billTotalRow:{flexDirection:'row',justifyContent:'space-between',paddingTop:8,marginTop:2,borderTopWidth:1,borderTopColor:C.bg},
  billTotalLbl:{fontSize:14,fontWeight:'800',color:C.dark},
  billTotalVal:{fontSize:18,fontWeight:'800',color:C.primary},
  billNote:{fontSize:11,color:C.green,fontWeight:'700',marginTop:2},
  trackBox:{backgroundColor:C.tealLt,borderRadius:10,padding:12,borderWidth:1,borderColor:'#BAE6FD',gap:4},
  trackTxt:{fontSize:13,color:C.teal,fontWeight:'700'},
  startedTxt:{fontSize:12,color:C.muted},
  pinBox:{backgroundColor:C.amberLt,borderRadius:14,padding:16,alignItems:'center',gap:8,borderWidth:1,borderColor:'#FDE68A'},
  pinTitle:{fontSize:14,fontWeight:'800',color:C.amber},
  pinCode:{fontSize:44,fontWeight:'800',color:C.dark,letterSpacing:12},
  pinHint:{fontSize:12,color:C.text,textAlign:'center',lineHeight:18},
  confirmBox:{backgroundColor:C.tealLt,borderRadius:14,padding:16,gap:8,borderWidth:1,borderColor:'#BAE6FD'},
  confirmTitle:{fontSize:14,fontWeight:'800',color:C.teal},
  confirmTxt:{fontSize:12,color:C.text,lineHeight:18},
  deadline:{fontSize:12,color:C.teal,fontWeight:'700'},
  workCard:{backgroundColor:C.white,borderRadius:12,padding:13,gap:9,marginTop:8,
    borderWidth:1,borderColor:C.border},
  workTitle:{fontSize:13,fontWeight:'800',color:C.dark},
  areaWrap:{flexDirection:'row',flexWrap:'wrap',gap:6},
  areaChip:{backgroundColor:C.greenLt,paddingHorizontal:10,paddingVertical:5,borderRadius:14,
    borderWidth:1,borderColor:'#A7F3D0'},
  areaChipPart:{backgroundColor:C.amberLt,borderColor:'#FDE68A'},
  areaChipTxt:{fontSize:11,fontWeight:'700',color:C.green},
  workMore:{fontSize:12,color:C.primary,fontWeight:'700'},
  listToggle:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:C.white,borderRadius:10,padding:12,marginTop:8,borderWidth:1,borderColor:C.border},
  listToggleTxt:{fontSize:13,fontWeight:'700',color:C.teal},
  listChevron:{fontSize:12,color:C.muted},
  listBox:{backgroundColor:C.white,borderRadius:10,padding:14,marginTop:8,borderWidth:1,borderColor:C.border,gap:12},
  listGroup:{gap:3},
  listArea:{fontSize:11,fontWeight:'800',color:C.muted,textTransform:'uppercase',letterSpacing:0.6,marginBottom:3},
  listRow:{flexDirection:'row',gap:9,paddingVertical:4,alignItems:'flex-start'},
  listMark:{fontSize:12,fontWeight:'800',marginTop:1},
  listTask:{fontSize:12,color:C.text,flex:1,lineHeight:18},
  listTaskMissed:{color:C.red,fontWeight:'600'},
  row:{flexDirection:'row',gap:10,marginTop:8},
  proposalBox:{backgroundColor:C.tealLt,borderRadius:14,padding:14,gap:10,
    borderWidth:1,borderColor:'#BAE6FD'},
  proposalTitle:{fontSize:14,fontWeight:'800',color:C.teal},
  compareRow:{flexDirection:'row',alignItems:'center',gap:10},
  compareCol:{flex:1,backgroundColor:C.white,borderRadius:11,padding:11,
    borderWidth:1,borderColor:C.border},
  compareLbl:{fontSize:10,color:C.muted,fontWeight:'700',textTransform:'uppercase',
    letterSpacing:0.4},
  compareOld:{fontSize:13,fontWeight:'700',color:C.muted,marginTop:4,
    textDecorationLine:'line-through'},
  compareOldTime:{fontSize:12,color:C.muted,textDecorationLine:'line-through'},
  compareNew:{fontSize:13,fontWeight:'800',color:C.dark,marginTop:4},
  compareNewTime:{fontSize:12,color:C.teal,fontWeight:'700'},
  compareArrow:{fontSize:18,color:C.teal,fontWeight:'800'},
  proposalNote:{backgroundColor:C.white,borderRadius:10,padding:11,
    borderWidth:1,borderColor:C.border},
  proposalNoteTxt:{fontSize:12,color:C.text,lineHeight:18,fontStyle:'italic'},
  declineBtn:{flex:1,borderWidth:1.5,borderColor:C.border,borderRadius:12,
    paddingVertical:12,alignItems:'center',backgroundColor:C.white},
  declineTxt:{fontSize:13,fontWeight:'700',color:C.muted},
  acceptBtn:{flex:1.3,backgroundColor:C.teal,borderRadius:12,paddingVertical:12,
    alignItems:'center'},
  proposalHint:{fontSize:11,color:C.text,lineHeight:16},
  reportBtn:{flex:1,borderWidth:1.5,borderColor:C.red,borderRadius:12,paddingVertical:12,alignItems:'center'},
  reportTxt:{color:C.red,fontWeight:'700',fontSize:13},
  approveBtn:{flex:1,backgroundColor:C.green,borderRadius:12,paddingVertical:12,alignItems:'center'},
  whiteTxt:{color:C.white,fontWeight:'700',fontSize:13},
  dis:{opacity:0.5},
  errBanner:{flexDirection:'row',alignItems:'center',gap:10,marginHorizontal:20,
    marginBottom:14,backgroundColor:C.redLt,borderRadius:12,padding:13,
    borderWidth:1,borderColor:'#FECACA'},
  errBannerTxt:{flex:1,fontSize:13,color:C.red,fontWeight:'600',lineHeight:18},
  errBannerX:{fontSize:15,color:C.red,fontWeight:'800'},
  disputeForm:{gap:10,marginTop:8},
  disputeLabel:{fontSize:12,fontWeight:'700',color:C.text},
  reasonRow:{flexDirection:'row',flexWrap:'wrap',gap:6},
  reasonChip:{backgroundColor:C.white,paddingHorizontal:10,paddingVertical:6,borderRadius:16,borderWidth:1,borderColor:C.border},
  reasonChipOn:{backgroundColor:C.redLt,borderColor:C.red},
  reasonTxt:{fontSize:11,color:C.muted,fontWeight:'600'},
  reasonTxtOn:{color:C.red},
  disputeInput:{backgroundColor:C.white,borderRadius:10,padding:12,fontSize:13,color:C.text,borderWidth:1,borderColor:C.border,minHeight:60},
  cancelBtn:{flex:1,borderWidth:1.5,borderColor:C.border,borderRadius:12,paddingVertical:12,alignItems:'center'},
  cancelTxt:{color:C.muted,fontWeight:'600',fontSize:13},
  dangerBtn:{flex:1,backgroundColor:C.red,borderRadius:12,paddingVertical:12,alignItems:'center'},
  disputedBox:{backgroundColor:C.redLt,borderRadius:14,padding:14,gap:6,borderWidth:1,borderColor:'#FECACA'},
  disputedTitle:{fontSize:14,fontWeight:'800',color:C.red},
  disputedTxt:{fontSize:13,color:C.text},
  disputedHint:{fontSize:12,color:C.muted},
  cancelBooking:{borderWidth:1.5,borderColor:C.red,borderRadius:12,paddingVertical:12,alignItems:'center'},
  cancelBookingTxt:{color:C.red,fontWeight:'600',fontSize:14},
  reviewBtn:{backgroundColor:C.amberLt,borderRadius:12,paddingVertical:12,alignItems:'center',borderWidth:1,borderColor:'#FDE68A'},
  reviewTxt:{color:C.amber,fontWeight:'700',fontSize:14},
});
