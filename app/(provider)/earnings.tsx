import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useState, useMemo, useEffect } from 'react';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { C, S } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { fmtDuration } from '../../lib/services';
import PlatformFeedback from '../../components/PlatformFeedback';

const money = (n:number) => '€' + (Number(n)||0).toFixed(2);

const prettyDate = (d?: string) => {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
};

const PERIODS = [
  { k:'week',  label:'This week' },
  { k:'month', label:'This month' },
  { k:'all',   label:'All time' },
];

export default function Earnings() {
  const { bookings, loadBookings } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState('month');
  const [hasBank, setHasBank] = useState(true);

  useEffect(() => {
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('cleaner_profiles')
        .select('iban').eq('id', user.id).maybeSingle();
      setHasBank(!!(data?.iban && data.iban.length > 10));
    })();
  }, []);

  const onRefresh = async () => { setRefreshing(true); await loadBookings(); setRefreshing(false); };

  const since = useMemo(() => {
    const d = new Date();
    if (period === 'week')  { const day = (d.getDay()+6)%7; d.setDate(d.getDate()-day); }
    if (period === 'month') { d.setDate(1); }
    if (period === 'all')   { return new Date(0); }
    d.setHours(0,0,0,0);
    return d;
  }, [period]);

  const stats = useMemo(() => {
    const paid = bookings.filter(b =>
      b.status === 'completed' && new Date(b.createdAt) >= since);

    const pending = bookings.filter(b => b.status === 'awaiting_confirmation');

    const earned = paid.reduce((s,b) =>
      s + Number(b.finalCleanerPayment ?? (b.total/1.029/1.18*0.80)), 0);

    const waiting = pending.reduce((s,b) =>
      s + Number(b.finalCleanerPayment ?? (b.total/1.029/1.18*0.80)), 0);

    const minutes = paid.reduce((s,b) => s + Number(b.actualMinutes ?? (b.hours*60)), 0);
    const hourly  = minutes > 0 ? earned / (minutes/60) : 0;

    return {
      jobs: paid.length, earned, waiting, pendingCount: pending.length,
      minutes, hourly,
      avg: paid.length ? earned / paid.length : 0,
    };
  }, [bookings, since]);

  const history = bookings
    .filter(b => ['completed','awaiting_confirmation'].includes(b.status))
    .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 40);

  return (
    <ScrollView style={s.wrap} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary}/>}>

      <Text style={s.heading}>Earnings</Text>

      <View style={s.periodRow}>
        {PERIODS.map(p=>(
          <TouchableOpacity key={p.k} style={[s.pChip, period===p.k&&s.pChipOn]}
            onPress={()=>setPeriod(p.k)}>
            <Text style={[s.pChipTxt, period===p.k&&s.pChipTxtOn]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.heroCard}>
        <Text style={s.heroLbl}>Paid out</Text>
        <Text style={s.heroVal}>{money(stats.earned)}</Text>
        <Text style={s.heroSub}>
          {stats.jobs} job{stats.jobs===1?'':'s'} · {fmtDuration(stats.minutes)} worked
        </Text>
      </View>

      {!hasBank && (stats.earned > 0 || stats.waiting > 0) && (
        <TouchableOpacity style={s.bankCard} onPress={()=>router.push('/payout')}>
          <Text style={s.bankIcon}>🏦</Text>
          <View style={{flex:1}}>
            <Text style={s.bankTitle}>Add your bank details</Text>
            <Text style={s.bankTxt}>
              You've earned money but we have nowhere to send it. Takes a minute.
            </Text>
          </View>
          <Text style={s.bankGo}>›</Text>
        </TouchableOpacity>
      )}

      {stats.pendingCount > 0 && (
        <View style={s.waitCard}>
          <Text style={s.waitIcon}>⏳</Text>
          <View style={{flex:1}}>
            <Text style={s.waitTitle}>{money(stats.waiting)} waiting</Text>
            <Text style={s.waitTxt}>
              {stats.pendingCount} job{stats.pendingCount===1?'':'s'} awaiting client
              confirmation. Released automatically after 6 hours.
            </Text>
          </View>
        </View>
      )}

      <View style={s.statGrid}>
        <View style={s.statCard}>
          <Text style={s.statVal}>{money(stats.avg)}</Text>
          <Text style={s.statLbl}>Average job</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statVal}>{money(stats.hourly)}</Text>
          <Text style={s.statLbl}>Per hour worked</Text>
        </View>
      </View>

      <View style={s.infoBox}>
        <Text style={s.infoTitle}>How payouts work</Text>
        <Text style={s.infoTxt}>
          You keep 80% of each job before VAT. Poji issues the VAT invoice on your
          behalf and pays you after the client approves the work.
        </Text>
      </View>

      <PlatformFeedback role="cleaner" jobsDone={stats.jobs} />

      <Text style={s.sectionTitle}>
        {history.length > 0 ? 'Recent jobs' : 'Nothing yet'}
      </Text>

      {history.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyIcon}>💶</Text>
          <Text style={s.emptyTxt}>No completed jobs yet</Text>
          <Text style={s.emptySub}>
            Your earnings will appear here once you finish your first job.
          </Text>
        </View>
      ) : history.map(b=>{
        const pay = Number(b.finalCleanerPayment ?? (b.total/1.029/1.18*0.80));
        const waiting = b.status === 'awaiting_confirmation';
        return (
          <View key={b.id} style={s.row}>
            <View style={{flex:1}}>
              <Text style={s.rowAddr} numberOfLines={1}>{b.address}</Text>
              <Text style={s.rowMeta}>
                {prettyDate(b.date)} · {b.actualMinutes ? fmtDuration(b.actualMinutes) : `${b.hours}h`}
              </Text>
            </View>
            <View style={{alignItems:'flex-end'}}>
              <Text style={[s.rowPay, waiting && {color:C.amber}]}>{money(pay)}</Text>
              <Text style={s.rowState}>{waiting ? 'pending' : 'paid'}</Text>
            </View>
          </View>
        );
      })}

      <View style={{height:32}}/>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  heading:{fontSize:28,fontWeight:'800',color:C.dark,paddingHorizontal:20,paddingTop:60,paddingBottom:16},
  periodRow:{flexDirection:'row',gap:8,paddingHorizontal:20,marginBottom:16},
  pChip:{paddingHorizontal:14,paddingVertical:9,borderRadius:20,backgroundColor:C.white,borderWidth:1.5,borderColor:C.border},
  pChipOn:{backgroundColor:C.primary,borderColor:C.primary},
  pChipTxt:{fontSize:12,fontWeight:'700',color:C.muted},
  pChipTxtOn:{color:C.white},
  heroCard:{marginHorizontal:20,backgroundColor:C.dark,borderRadius:20,padding:22,gap:4,...S.md},
  heroLbl:{fontSize:13,color:'#C7D2FE',fontWeight:'600'},
  heroVal:{fontSize:40,fontWeight:'800',color:C.white},
  heroSub:{fontSize:12,color:'#A5B4FC'},
  bankCard:{flexDirection:'row',alignItems:'center',gap:12,marginHorizontal:20,marginTop:12,
    backgroundColor:C.primaryLt,borderRadius:16,padding:14,borderWidth:1.5,borderColor:C.primary},
  bankIcon:{fontSize:22},
  bankTitle:{fontSize:15,fontWeight:'800',color:C.primary},
  bankTxt:{fontSize:12,color:C.text,marginTop:3,lineHeight:17},
  bankGo:{fontSize:22,color:C.primary},
  waitCard:{flexDirection:'row',gap:12,marginHorizontal:20,marginTop:12,backgroundColor:C.amberLt,borderRadius:16,padding:14,borderWidth:1,borderColor:'#FDE68A'},
  waitIcon:{fontSize:22},
  waitTitle:{fontSize:15,fontWeight:'800',color:C.amber},
  waitTxt:{fontSize:12,color:C.text,marginTop:3,lineHeight:17},
  statGrid:{flexDirection:'row',gap:12,paddingHorizontal:20,marginTop:12},
  statCard:{flex:1,backgroundColor:C.white,borderRadius:16,padding:16,alignItems:'center',borderWidth:1,borderColor:C.border,...S.sm},
  statVal:{fontSize:20,fontWeight:'800',color:C.primary},
  statLbl:{fontSize:11,color:C.muted,marginTop:4,textAlign:'center'},
  infoBox:{marginHorizontal:20,marginTop:16,backgroundColor:C.primaryLt,borderRadius:14,padding:14,borderWidth:1,borderColor:C.border},
  infoTitle:{fontSize:13,fontWeight:'800',color:C.primary,marginBottom:4},
  infoTxt:{fontSize:12,color:C.text,lineHeight:18},
  sectionTitle:{fontSize:17,fontWeight:'700',color:C.dark,paddingHorizontal:20,marginTop:24,marginBottom:12},
  row:{flexDirection:'row',alignItems:'center',gap:12,marginHorizontal:20,marginBottom:8,backgroundColor:C.white,borderRadius:14,padding:14,borderWidth:1,borderColor:C.border},
  rowAddr:{fontSize:14,fontWeight:'700',color:C.dark},
  rowMeta:{fontSize:12,color:C.muted,marginTop:3},
  rowPay:{fontSize:16,fontWeight:'800',color:C.green},
  rowState:{fontSize:10,color:C.muted,marginTop:2},
  emptyBox:{marginHorizontal:20,backgroundColor:C.white,borderRadius:18,padding:30,alignItems:'center',gap:8,borderWidth:1,borderColor:C.border},
  emptyIcon:{fontSize:42},
  emptyTxt:{fontSize:16,fontWeight:'700',color:C.dark},
  emptySub:{fontSize:13,color:C.muted,textAlign:'center',lineHeight:19},
});
