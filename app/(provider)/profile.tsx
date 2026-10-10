import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Switch, Platform
} from 'react-native';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { C, S } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { CATEGORIES, tradesIn, findTrade } from '../../constants/trades';
import { MALTA_MAIN, GOZO_LOCALITIES, validateIban, formatIban } from '../../constants/malta';
import { MultiPicker } from '../../components/Picker';
import Avatar from '../../components/Avatar';
import PushSettings from '../../components/PushSettings';
import AvailabilityGrid from '../../components/AvailabilityGrid';
import {
  DEFAULT_AVAILABILITY, describe, countSlots, type Availability,
} from '../../lib/availability';

type Section = 'trades' | 'rates' | 'areas' | 'hours' | 'about' | 'payment' | null;

export default function ProviderProfile() {
  const [open, setOpen]     = useState<Section>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSaved] = useState<string|null>(null);
  const [error, setError]   = useState('');
  const [loading, setLoad]  = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string|null>(null);
  const [standing, setStanding] = useState<any>(null);
  const [founding, setFounding] = useState<any>(null);
  const [noShows, setNoShows]   = useState(0);

  useEffect(() => {
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles')
        .select('suspended_until, outstanding_fines, violation_count')
        .eq('id', user.id).maybeSingle();
      if (data && (data.violation_count || data.outstanding_fines || data.suspended_until))
        setStanding(data);

      const { data: cp } = await supabase.from('cleaner_profiles')
        .select('founding_member, commission_free_until, no_show_count').eq('id', user.id).maybeSingle();
      if (cp?.founding_member || cp?.commission_free_until) setFounding(cp);
      if (cp?.no_show_count) setNoShows(cp.no_show_count);
    })();
  }, []);

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
    availability: DEFAULT_AVAILABILITY as Availability,
    notice_hours:'12',
    max_jobs_per_day:'3',
  });

  const [timeOff, setTimeOff] = useState<any[]>([]);
  const [addingOff, setAddOff] = useState(false);
  const [offFrom, setOffFrom] = useState('');
  const [offTo, setOffTo]     = useState('');
  const [offWhy, setOffWhy]   = useState('');

  const set = (k:string, v:any) => { setF((p:any)=>({...p,[k]:v})); setError(''); };

  /* Trades are granted, not chosen. my_trades() returns every live trade
     with this provider's standing against it, so the panel below asks
     rather than assigns. The database freezes cleaner_profiles.categories
     against anything but decide_trade(), so a tick box here would have
     looked saved and changed nothing. */
  const [tradeRows, setTradeRows]   = useState<any[]>([]);
  const [tradeBusy, setTradeBusy]   = useState<string|null>(null);
  const [confirmDrop, setConfirmDrop] = useState<string|null>(null);

  /* Asking for a trade means writing something. A tap was as thin as the
     tick box it replaced, and left the admin nothing to decide from. */
  const [askFor, setAskFor]     = useState<any>(null);
  const [askYears, setAskYears] = useState('');
  const [askLetter, setLetter]  = useState('');

  const YEARS = ['Under a year', '1–3 years', '3–10 years', 'Over 10 years'];

  const loadMyTrades = async () => {
    const { data, error: e } = await supabase.rpc('my_trades');
    if (e) { console.log('my_trades:', e.message); return; }
    setTradeRows(data || []);
  };

  useEffect(() => { loadMyTrades(); }, []);

  const standingOf = (id: string) =>
    tradeRows.find(r => r.trade_id === id)?.status || 'none';

  /* While my_trades is still in flight, fall back to the column so the
     Rates and radius sections do not flicker out of existence. */
  const approvedIds: string[] = tradeRows.length
    ? tradeRows.filter(r => r.status === 'approved').map(r => r.trade_id)
    : (f.categories as string[]);

  const pendingCount = tradeRows.filter(r => r.status === 'pending').length;

  const myTrades  = approvedIds.map((id:string)=>findTrade(id)).filter(Boolean);
  const hasHourly = myTrades.some((t:any)=>t.pricing === 'hourly');
  const hasRoad   = myTrades.some((t:any)=>t.roadside);

  const callRpc = async (fn: string, args: any) => {
    const { data, error: e } = await supabase.rpc(fn, args);
    if (e) {
      /* also to the console, so a message that scrolls past is still
         findable when something goes wrong on someone else's phone */
      console.log(`${fn} failed:`, e.message, args);
      throw new Error(e.message);
    }
    return data;
  };

  const tapTrade = async (row: any) => {
    if (row.status === 'suspended') {
      setError('That trade is suspended on your account. Email support and we will look at it.');
      return;
    }
    if (row.status === 'approved') { setConfirmDrop(row.trade_id); return; }

    /* Pending is a request you can take back - one tap, nothing to write */
    if (row.status === 'pending') {
      setTradeBusy(row.trade_id); setError('');
      try {
        await callRpc('withdraw_trade', { p_trade: row.trade_id });
        await loadMyTrades();
      } catch (e:any) {
        setError(e?.message || 'That did not go through');
      }
      setTradeBusy(null);
      return;
    }

    /* Anything else opens the letter, with whatever they wrote last time
       still in the box so a rejection is not back to a blank page */
    setError('');
    setAskFor(row);
    setAskYears(row.reason?.years  || '');
    setLetter(row.reason?.letter || '');
  };

  const submitRequest = async () => {
    if (!askFor) return;
    if (!askYears) { setError('Pick how long you have done this work'); return; }
    if (askLetter.trim().length < 100) {
      setError('A few more sentences — what you have done in this trade and who for');
      return;
    }

    setTradeBusy(askFor.trade_id); setError('');
    try {
      await callRpc('request_trade', {
        p_trade:  askFor.trade_id,
        p_reason: { years: askYears, letter: askLetter.trim() },
      });
      await loadMyTrades();
      setAskFor(null); setAskYears(''); setLetter('');
    } catch (e:any) {
      setError(e?.message || 'That did not go through');
    }
    setTradeBusy(null);
  };

  const dropTrade = async (id: string) => {
    setTradeBusy(id); setError('');
    try {
      await callRpc('withdraw_trade', { p_trade: id });
      await loadMyTrades();
    } catch (e:any) {
      setError(e?.message || 'That did not go through');
    }
    setTradeBusy(null); setConfirmDrop(null);
  };

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
          availability: data.availability || DEFAULT_AVAILABILITY,
          notice_hours: String(data.notice_hours ?? 12),
          max_jobs_per_day: String(data.max_jobs_per_day ?? 3),
        }));
        if (data.profile_photo_url) {
          const { data: signed } = await supabase.storage
            .from('verification-docs')
            .createSignedUrl(data.profile_photo_url, 3600);
          if (signed?.signedUrl) setPhotoUrl(signed.signedUrl);
        }
      }
      const { data: off } = await supabase.from('time_off')
        .select('*').eq('provider_id', user.id)
        .gte('ends_on', new Date().toISOString().slice(0,10))
        .order('starts_on');
      setTimeOff(off || []);

      setLoad(false);
    })();
  }, []);

  const addTimeOff = async () => {
    if (!offFrom || !offTo) { setError('Pick both dates'); return; }
    if (offTo < offFrom)    { setError('The end date is before the start'); return; }
    setSaving(true);
    const { data:{ user } } = await supabase.auth.getUser();
    const { data, error: e } = await supabase.from('time_off').insert({
      provider_id: user!.id, starts_on: offFrom, ends_on: offTo,
      reason: offWhy.trim() || null,
    }).select().single();
    setSaving(false);
    if (e) { setError(e.message); return; }
    setTimeOff(prev => [...prev, data].sort((a,b)=>a.starts_on.localeCompare(b.starts_on)));
    setAddOff(false); setOffFrom(''); setOffTo(''); setOffWhy('');
  };

  const removeTimeOff = async (id: string) => {
    setSaving(true);
    await supabase.from('time_off').delete().eq('id', id);
    setTimeOff(prev => prev.filter(t => t.id !== id));
    setSaving(false);
  };

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
              : f.status==='basic'    ? '○ Not verified yet'
              : '⏳ Under review'}
          </Text>
        </View>
      </View>

      {savedAt && <Text style={s.savedNote}>Saved at {savedAt}</Text>}
      {error ? <View style={s.errBox}><Text style={s.errTxt}>⚠️  {error}</Text></View> : null}

      {standing && (
        <View style={s.standingCard}>
          <Text style={s.standingTitle}>
            {standing.suspended_until && new Date(standing.suspended_until) >= new Date()
              ? '⛔  Account suspended'
              : '⚠️  Note on your account'}
          </Text>
          {standing.suspended_until && new Date(standing.suspended_until) >= new Date() && (
            <Text style={s.standingTxt}>
              You can't take jobs until{' '}
              {new Date(standing.suspended_until).toLocaleDateString('en-GB',
                {day:'numeric', month:'long'})}.
            </Text>
          )}
          {Number(standing.outstanding_fines) > 0 && (
            <Text style={s.standingTxt}>
              €{Number(standing.outstanding_fines).toFixed(2)} outstanding, taken from
              your next payout.
            </Text>
          )}
          <Text style={s.standingTxt}>
            {standing.violation_count} breach{standing.violation_count===1?'':'es'} on
            record. If you think this is wrong, email support.
          </Text>
        </View>
      )}

      {(f.status === 'basic' || !f.status) && (
        <TouchableOpacity style={s.verifyCard} onPress={()=>router.push('/onboarding')}>
          <Text style={s.verifyIcon}>🪪</Text>
          <View style={{flex:1}}>
            <Text style={s.verifyTitle}>Verify your account</Text>
            <Text style={s.verifyTxt}>
              Three minutes. Until then you can see jobs but not take them.
            </Text>
          </View>
          <Text style={s.verifyGo}>›</Text>
        </TouchableOpacity>
      )}

      {founding && (() => {
        const until = founding.commission_free_until
          ? new Date(founding.commission_free_until) : null;
        const live = until && until >= new Date();
        return (
          <View style={s.foundCard}>
            <Text style={s.foundBadge}>⭐  Founding provider</Text>
            <Text style={s.foundTitle}>
              {live ? 'No commission until '
                + until!.toLocaleDateString('en-GB', {day:'numeric', month:'long'})
                : 'Thanks for being here early'}
            </Text>
            <Text style={s.foundTxt}>
              {live
                ? 'You keep everything you earn until then. After that the usual 20% applies, and you keep the badge.'
                : 'Your founding badge stays on your profile. Clients see you were one of the first.'}
            </Text>
          </View>
        );
      })()}

      {noShows > 0 && (
        <View style={s.noShowCard}>
          <Text style={s.noShowTitle}>
            {noShows === 1 ? '⚠️  One client said you didn\u2019t arrive'
              : `⚠️  ${noShows} clients said you didn\u2019t arrive`}
          </Text>
          <Text style={s.noShowTxt}>
            {noShows === 1
              ? "It happens — a van breaks down, a job overruns. Message the client when it does and most will wait. Two more and your account is suspended."
              : noShows === 2
              ? "This is the second time. One more and your account is suspended for thirty days. If something is going wrong, tell us before it does."
              : "Your account is at risk. Anyone who can't make a job needs to say so in the app before the time passes."}
          </Text>
          <Text style={s.noShowHint}>
            Can't make one? Open the job and offer another time — clients almost
            always take it.
          </Text>
        </View>
      )}

      {/* ── availability ── */}
      {f.status === 'approved' && <View style={s.availCard}>
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
      </View>}

      {/* ══ TRADES ══ */}
      <Row
        icon="🛠️" title="What you do"
        value={
          approvedIds.length
            ? `${approvedIds.length} trade${approvedIds.length>1?'s':''}`
              + (pendingCount ? ` · ${pendingCount} waiting` : '')
            : pendingCount ? `${pendingCount} waiting on approval` : 'None yet'
        }
        open={open==='trades'} onPress={()=>setOpen(open==='trades'?null:'trades')}
      />
      {open==='trades' && (
        <View style={s.panel}>
          <Text style={s.panelHint}>
            Ask for the trades you're qualified for and we'll check them. Some need a
            licence or certificate before we can grant them. A trade you already hold
            can be dropped whenever you like.
          </Text>

          {error && !askFor ? (
            <View style={s.askErr}>
              <Text style={s.askErrTxt}>⚠️  {error}</Text>
            </View>
          ) : null}

          {CATEGORIES.map(cat=>{
            const items = tradeRows.length
              ? tradeRows.filter(r => r.category_id === cat.id)
              : tradesIn(cat.id).map(t => ({
                  trade_id: t.id, name: t.name, icon: t.icon,
                  category_id: t.category, status: standingOf(t.id),
                  requires_proof: false, proof_label: null, note: null,
                }));
            if (!items.length) return null;

            const mine = items.filter((r:any)=>r.status === 'approved').length;
            return (
              <View key={cat.id} style={s.tradeGroup}>
                <View style={s.tradeHead}>
                  <Text style={s.tradeHeadTxt}>{cat.icon}  {cat.name}</Text>
                  {mine>0 && (
                    <View style={s.countPill}><Text style={s.countTxt}>{mine}</Text></View>
                  )}
                </View>
                <View style={s.pillWrap}>
                  {items.map((r:any)=>{
                    const busy = tradeBusy === r.trade_id;
                    const st   = r.status;
                    return (
                      <TouchableOpacity
                        key={r.trade_id}
                        disabled={busy}
                        style={[s.pill,
                          st==='approved'  && s.pillOn,
                          st==='pending'   && s.pillWait,
                          st==='rejected'  && s.pillBad,
                          st==='suspended' && s.pillStop,
                          busy && s.saveDis]}
                        onPress={()=>tapTrade(r)}>
                        <Text style={[s.pillTxt,
                          st==='approved'  && s.pillTxtOn,
                          st==='pending'   && {color:C.amber},
                          st==='rejected'  && {color:C.red},
                          st==='suspended' && {color:C.red}]}>
                          {st==='approved'  ? '✓ ' :
                           st==='pending'   ? '⏳ ' :
                           st==='rejected'  ? '✕ ' :
                           st==='suspended' ? '⛔ ' : ''}
                          {r.icon}  {r.name}
                          {r.requires_proof && st!=='approved' ? '  📄' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {items.filter((r:any)=>r.status==='rejected' && r.note).map((r:any)=>(
                  <View key={`n-${r.trade_id}`} style={s.rejNote}>
                    <Text style={s.rejNoteTxt}>
                      {r.icon}  {r.name} — {r.note}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })}

          {askFor && (
            <View style={s.askBox}>
              <Text style={s.askTitle}>
                {askFor.icon}  {askFor.name}
              </Text>
              <Text style={s.askHint}>
                {askFor.status === 'rejected'
                  ? 'You can ask again. Say what has changed since last time.'
                  : 'Tell us about your experience in this trade. A person reads this, not a machine.'}
              </Text>

              <Text style={s.lbl}>How long have you done this work?</Text>
              <View style={s.pillWrap}>
                {YEARS.map(y=>(
                  <TouchableOpacity key={y} style={[s.pill, askYears===y&&s.pillOn]}
                    onPress={()=>{setAskYears(y); setError('');}}>
                    <Text style={[s.pillTxt, askYears===y&&s.pillTxtOn]}>{y}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.lbl}>Your letter</Text>
              <TextInput
                style={[s.input,{minHeight:140}]}
                value={askLetter}
                onChangeText={(t:string)=>{setLetter(t); setError('');}}
                multiline textAlignVertical="top"
                placeholder={
                  'Six years doing weddings and private parties, mostly in St Julian’s '
                  + 'and Sliema. I own my own rig — two tops, two subs, lights. I read a '
                  + 'room rather than play a fixed set. Happy to give you two venues to ring.'
                }
                placeholderTextColor={C.muted} />
              <Text style={[s.hintSmall,
                askLetter.trim().length < 100 && {color:C.amber,fontWeight:'700'}]}>
                {askLetter.trim().length < 100
                  ? `${100 - askLetter.trim().length} more characters`
                  : `${askLetter.trim().length} characters`}
              </Text>

              {askFor.requires_proof && (
                <View style={s.proofNote}>
                  <Text style={s.proofNoteTxt}>
                    📄  This one also needs {askFor.proof_label || 'proof of qualification'}.
                    Upload it under Documents and identity before you send this.
                  </Text>
                </View>
              )}

              {/* Next to the button that caused it. The page-level banner is
                  at the top of a long scroll, where nobody standing on this
                  form will ever see it. */}
              {error ? (
                <View style={s.askErr}>
                  <Text style={s.askErrTxt}>⚠️  {error}</Text>
                </View>
              ) : null}

              <View style={s.row2}>
                <TouchableOpacity style={s.offCancel}
                  onPress={()=>{setAskFor(null);setError('');}}>
                  <Text style={s.offCancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.offSave, tradeBusy===askFor.trade_id&&s.saveDis]}
                  disabled={tradeBusy===askFor.trade_id}
                  onPress={submitRequest}>
                  {tradeBusy===askFor.trade_id
                    ? <ActivityIndicator color={C.white} size="small"/>
                    : <Text style={s.offSaveTxt}>Send for approval</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {confirmDrop && (() => {
            const row = tradeRows.find(r=>r.trade_id===confirmDrop);
            return (
              <View style={s.dropBox}>
                <Text style={s.dropTitle}>
                  Stop offering {row?.name || 'this trade'}?
                </Text>
                <Text style={s.dropTxt}>
                  You'll stop getting jobs in it and drop off the client list for it.
                  Asking for it again later means another check.
                </Text>
                <View style={s.row2}>
                  <TouchableOpacity style={s.offCancel} onPress={()=>setConfirmDrop(null)}>
                    <Text style={s.offCancelTxt}>Keep it</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.dropBtn, tradeBusy===confirmDrop&&s.saveDis]}
                    disabled={tradeBusy===confirmDrop}
                    onPress={()=>dropTrade(confirmDrop)}>
                    <Text style={s.dropBtnTxt}>Drop it</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}

          {pendingCount > 0 && (
            <View style={s.waitNote}>
              <Text style={s.waitNoteTxt}>
                ⏳  {pendingCount === 1 ? 'One trade is' : `${pendingCount} trades are`}
                {' '}waiting on us. Usually within a working day. Tap one again to take
                the request back.
              </Text>
            </View>
          )}

          {tradeRows.some(r=>r.requires_proof && r.status!=='approved') && (
            <View style={s.proofNote}>
              <Text style={s.proofNoteTxt}>
                📄  A trade marked with a document needs proof of qualification. Upload
                it under Documents and identity, then ask for the trade.
              </Text>
            </View>
          )}

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

          {/* Trades save themselves the moment you ask for one, so the only
              thing left to save here is the roadside pair. Without them the
              button would promise something it no longer does. */}
          {hasRoad && (
            <SaveBtn busy={saving} onPress={()=>save({
              accepts_urgent: !!f.accepts_urgent,
              service_radius_km: Number(f.service_radius_km) || 15,
            })} />
          )}
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

              {/* Nothing is added on top of the rate any more. The client pays
                  the rate plus the card fee; the commission comes off the
                  provider's side. */}
              <View style={s.calcBox}>
                <View style={s.calcRow}>
                  <Text style={s.calcLbl}>Client pays per hour</Text>
                  <Text style={s.calcVal}>€{(Number(f.hourly_rate||0)*1.029).toFixed(2)}</Text>
                </View>
                <View style={s.calcRow}>
                  <Text style={s.calcLbl}>You keep (after 20% commission)</Text>
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

      {/* ══ HOURS ══ */}
      <Row
        icon="🗓" title="When you work"
        value={describe(f.availability)}
        open={open==='hours'} onPress={()=>setOpen(open==='hours'?null:'hours')}
      />
      {open==='hours' && (
        <View style={s.panel}>
          <Text style={s.panelHint}>
            You only hear about jobs in the slots you tick. Tap a day name or a
            time label to toggle the whole row.
          </Text>

          <AvailabilityGrid
            value={f.availability}
            onChange={(v)=>set('availability', v)}
          />

          <Text style={s.lbl}>How much notice do you need?</Text>
          <View style={s.pillWrap}>
            {[2,6,12,24,48].map(h=>(
              <TouchableOpacity key={h} style={[s.pill, Number(f.notice_hours)===h&&s.pillOn]}
                onPress={()=>set('notice_hours', String(h))}>
                <Text style={[s.pillTxt, Number(f.notice_hours)===h&&s.pillTxtOn]}>
                  {h < 24 ? `${h}h` : `${h/24} day${h>24?'s':''}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.hintSmall}>
            Jobs starting sooner than this won't be offered to you.
          </Text>

          <Text style={s.lbl}>Most jobs in one day</Text>
          <View style={s.pillWrap}>
            {[1,2,3,4,5,8].map(n=>(
              <TouchableOpacity key={n} style={[s.pill, Number(f.max_jobs_per_day)===n&&s.pillOn]}
                onPress={()=>set('max_jobs_per_day', String(n))}>
                <Text style={[s.pillTxt, Number(f.max_jobs_per_day)===n&&s.pillTxtOn]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <SaveBtn busy={saving} disabled={countSlots(f.availability)===0}
            onPress={()=>save({
              availability: f.availability,
              notice_hours: Number(f.notice_hours) || 12,
              max_jobs_per_day: Number(f.max_jobs_per_day) || 3,
            })} />

          {/* ── time off ── */}
          <Text style={s.lbl}>Time off</Text>
          {timeOff.length === 0 && !addingOff && (
            <Text style={s.hintSmall}>
              Going away? Block the dates and nothing will reach you.
            </Text>
          )}

          {timeOff.map(t=>(
            <View key={t.id} style={s.offRow}>
              <Text style={s.offIcon}>🌴</Text>
              <View style={{flex:1}}>
                <Text style={s.offDates}>
                  {new Date(t.starts_on+'T00:00:00').toLocaleDateString('en-GB',
                    {day:'numeric',month:'short'})}
                  {' – '}
                  {new Date(t.ends_on+'T00:00:00').toLocaleDateString('en-GB',
                    {day:'numeric',month:'short'})}
                </Text>
                {!!t.reason && <Text style={s.offWhy}>{t.reason}</Text>}
              </View>
              <TouchableOpacity onPress={()=>removeTimeOff(t.id)} disabled={saving}>
                <Text style={s.offRemove}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}

          {addingOff ? (
            <View style={s.offForm}>
              <View style={s.row2}>
                <View style={{flex:1}}>
                  <Text style={s.lblSmall}>From</Text>
                  {Platform.OS === 'web' ? (
                    // @ts-ignore
                    <input type="date" value={offFrom}
                      min={new Date().toISOString().slice(0,10)}
                      onChange={(e:any)=>setOffFrom(e.target.value)}
                      style={{backgroundColor:'#fff',borderRadius:10,padding:11,fontSize:14,
                        color:'#374151',border:`1.5px solid ${C.border}`,width:'100%',
                        fontFamily:'inherit',boxSizing:'border-box'}} />
                  ) : (
                    <TextInput style={s.input} value={offFrom} onChangeText={setOffFrom}
                      placeholder="YYYY-MM-DD" placeholderTextColor={C.muted} />
                  )}
                </View>
                <View style={{flex:1}}>
                  <Text style={s.lblSmall}>To</Text>
                  {Platform.OS === 'web' ? (
                    // @ts-ignore
                    <input type="date" value={offTo}
                      min={offFrom || new Date().toISOString().slice(0,10)}
                      onChange={(e:any)=>setOffTo(e.target.value)}
                      style={{backgroundColor:'#fff',borderRadius:10,padding:11,fontSize:14,
                        color:'#374151',border:`1.5px solid ${C.border}`,width:'100%',
                        fontFamily:'inherit',boxSizing:'border-box'}} />
                  ) : (
                    <TextInput style={s.input} value={offTo} onChangeText={setOffTo}
                      placeholder="YYYY-MM-DD" placeholderTextColor={C.muted} />
                  )}
                </View>
              </View>
              <TextInput style={[s.input,{marginTop:10}]} value={offWhy}
                onChangeText={setOffWhy}
                placeholder="Holiday, family, whatever" placeholderTextColor={C.muted} />
              <View style={s.row2}>
                <TouchableOpacity style={s.offCancel}
                  onPress={()=>{setAddOff(false);setError('');}}>
                  <Text style={s.offCancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.offSave, saving&&s.saveDis]}
                  disabled={saving} onPress={addTimeOff}>
                  <Text style={s.offSaveTxt}>Block these dates</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={s.offAdd} onPress={()=>setAddOff(true)}>
              <Text style={s.offAddTxt}>＋  Add time off</Text>
            </TouchableOpacity>
          )}
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

      <Row
        icon="🏦" title="Getting paid"
        value={f.iban ? formatIban(f.iban).slice(0,13) + '…' : 'Not set yet'}
        open={false} onPress={()=>router.push('/payout')}
      />

      {/* ══ static links ══ */}
      <PushSettings role="cleaner" />

      <Text style={s.sectionTitle}>Account</Text>

      <TouchableOpacity style={s.linkRow} onPress={()=>router.push('/my-services')}>
        <Text style={s.linkIcon}>🧰</Text>
        <View style={{flex:1}}>
          <Text style={s.linkTitle}>My services and prices</Text>
          <Text style={s.linkSub}>What you offer and what you charge for each</Text>
        </View>
        <Text style={s.chev}>›</Text>
      </TouchableOpacity>

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

  noShowCard:{marginHorizontal:20,marginTop:18,backgroundColor:C.redLt,borderRadius:16,
    padding:16,gap:7,borderWidth:1.5,borderColor:'#FECACA'},
  noShowTitle:{fontSize:15,fontWeight:'800',color:C.red,lineHeight:20},
  noShowTxt:{fontSize:12,color:C.text,lineHeight:18},
  noShowHint:{fontSize:11,color:C.muted,lineHeight:16},
  foundCard:{marginHorizontal:20,marginTop:18,backgroundColor:C.amberLt,borderRadius:16,
    padding:16,gap:6,borderWidth:1.5,borderColor:'#FDE68A'},
  foundBadge:{fontSize:12,fontWeight:'800',color:C.amber,letterSpacing:0.4},
  foundTitle:{fontSize:16,fontWeight:'800',color:C.dark},
  foundTxt:{fontSize:12,color:C.text,lineHeight:18},
  verifyCard:{flexDirection:'row',alignItems:'center',gap:12,marginHorizontal:20,marginTop:18,
    backgroundColor:C.primaryLt,borderRadius:16,padding:16,borderWidth:1.5,borderColor:C.primary},
  verifyIcon:{fontSize:24},
  verifyTitle:{fontSize:15,fontWeight:'800',color:C.primary},
  verifyTxt:{fontSize:12,color:C.text,marginTop:3,lineHeight:17},
  verifyGo:{fontSize:22,color:C.primary},
  standingCard:{marginHorizontal:20,marginTop:18,backgroundColor:C.redLt,borderRadius:16,
    padding:16,gap:6,borderWidth:1,borderColor:'#FECACA'},
  standingTitle:{fontSize:15,fontWeight:'800',color:C.red},
  standingTxt:{fontSize:12,color:C.text,lineHeight:18},
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
  pillWait:{backgroundColor:C.amberLt,borderColor:'#FDE68A'},
  pillBad:{backgroundColor:C.redLt,borderColor:'#FECACA'},
  pillStop:{backgroundColor:C.redLt,borderColor:C.red,borderStyle:'dashed'},

  rejNote:{backgroundColor:C.redLt,borderRadius:10,padding:10,marginTop:8,
    borderWidth:1,borderColor:'#FECACA'},
  rejNoteTxt:{fontSize:11,color:C.red,lineHeight:16,fontWeight:'600'},
  waitNote:{backgroundColor:C.amberLt,borderRadius:12,padding:12,marginTop:10,
    borderWidth:1,borderColor:'#FDE68A'},
  waitNoteTxt:{fontSize:12,color:C.text,lineHeight:17},
  proofNote:{backgroundColor:C.primaryLt,borderRadius:12,padding:12,marginTop:10,
    borderWidth:1,borderColor:C.border},
  proofNoteTxt:{fontSize:12,color:C.text,lineHeight:17},
  askBox:{backgroundColor:C.bgAlt,borderRadius:14,padding:14,marginTop:10,
    borderWidth:1.5,borderColor:C.primary},
  askTitle:{fontSize:15,fontWeight:'800',color:C.dark},
  askErr:{backgroundColor:C.redLt,borderRadius:10,padding:11,marginTop:12,
    borderWidth:1.5,borderColor:'#FECACA'},
  askErrTxt:{fontSize:12,color:C.red,fontWeight:'700',lineHeight:17},
  askHint:{fontSize:12,color:C.muted,lineHeight:17,marginTop:4},
  dropBox:{backgroundColor:C.redLt,borderRadius:14,padding:14,marginTop:10,gap:6,
    borderWidth:1.5,borderColor:'#FECACA'},
  dropTitle:{fontSize:14,fontWeight:'800',color:C.red},
  dropTxt:{fontSize:12,color:C.text,lineHeight:17},
  dropBtn:{flex:1.4,backgroundColor:C.red,borderRadius:11,paddingVertical:11,
    alignItems:'center'},
  dropBtnTxt:{fontSize:13,fontWeight:'700',color:C.white},

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

  hintSmall:{fontSize:11,color:C.muted,lineHeight:16,marginTop:6},
  lblSmall:{fontSize:10,fontWeight:'700',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.4,marginBottom:6},
  row2:{flexDirection:'row',gap:10,marginTop:10},
  offRow:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:C.bg,
    borderRadius:11,padding:11,marginTop:8,borderWidth:1,borderColor:C.border},
  offIcon:{fontSize:18},
  offDates:{fontSize:13,fontWeight:'700',color:C.dark},
  offWhy:{fontSize:11,color:C.muted,marginTop:2},
  offRemove:{fontSize:11,color:C.red,fontWeight:'700'},
  offForm:{backgroundColor:C.bg,borderRadius:12,padding:12,marginTop:10,
    borderWidth:1,borderColor:C.border},
  offCancel:{flex:1,borderWidth:1.5,borderColor:C.border,borderRadius:11,
    paddingVertical:11,alignItems:'center',backgroundColor:C.white},
  offCancelTxt:{fontSize:13,fontWeight:'600',color:C.muted},
  offSave:{flex:1.4,backgroundColor:C.primary,borderRadius:11,paddingVertical:11,
    alignItems:'center'},
  offSaveTxt:{fontSize:13,fontWeight:'700',color:C.white},
  offAdd:{borderRadius:11,paddingVertical:12,alignItems:'center',marginTop:10,
    borderWidth:1.5,borderStyle:'dashed',borderColor:C.border,backgroundColor:C.bg},
  offAddTxt:{fontSize:13,fontWeight:'700',color:C.primary},
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
