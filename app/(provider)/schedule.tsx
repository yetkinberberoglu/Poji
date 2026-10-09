import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Linking
} from 'react-native';
import { router } from 'expo-router';
import { useState, useMemo } from 'react';
import { C, S } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { fmtDuration } from '../../lib/services';

const UPCOMING = ['accepted','en_route','arrived','in_progress','quoted','reschedule_proposed'];

const dayLabel = (d: string) => {
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((dt.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7 && diff > 0) return dt.toLocaleDateString('en-GB', { weekday:'long' });
  return dt.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
};

const isPast = (d: string, t: string) => {
  const dt = new Date(`${d}T${t || '00:00'}:00`);
  return !isNaN(dt.getTime()) && dt < new Date();
};

export default function Schedule() {
  const { bookings, loadBookings } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => { setRefreshing(true); await loadBookings(); setRefreshing(false); };

  const byDay = useMemo(() => {
    const jobs = bookings
      .filter(b => UPCOMING.includes(b.status))
      .sort((a,b) => (a.date + a.time).localeCompare(b.date + b.time));

    const map: Record<string, any[]> = {};
    jobs.forEach(b => { (map[b.date] ||= []).push(b); });
    return Object.entries(map);
  }, [bookings]);

  const total = byDay.reduce((n,[,list]) => n + list.length, 0);

  const todayKey = new Date().toISOString().slice(0,10);
  const todayJobs = bookings.filter(b => b.date === todayKey && UPCOMING.includes(b.status));

  return (
    <ScrollView style={s.wrap} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary}/>}>

      <Text style={s.heading}>Your schedule</Text>
      <Text style={s.sub}>
        {total === 0 ? 'Nothing booked in'
          : `${total} job${total===1?'':'s'} coming up`}
        {todayJobs.length > 0 ? ` · ${todayJobs.length} today` : ''}
      </Text>

      {byDay.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyIcon}>🗓</Text>
          <Text style={s.emptyTitle}>Nothing booked yet</Text>
          <Text style={s.emptyTxt}>
            Accepted jobs show up here, in order, so you can see your week at a glance.
          </Text>
          <TouchableOpacity style={s.emptyBtn} onPress={()=>router.push('/(provider)/jobs')}>
            <Text style={s.emptyBtnTxt}>See open jobs</Text>
          </TouchableOpacity>
        </View>
      ) : byDay.map(([date, list])=>(
        <View key={date} style={s.dayBlock}>
          <View style={s.dayHead}>
            <Text style={s.dayName}>{dayLabel(date)}</Text>
            <Text style={s.dayCount}>{list.length} job{list.length===1?'':'s'}</Text>
          </View>

          {list.map((b:any)=>{
            const late = isPast(b.date, b.time) && ['accepted'].includes(b.status);
            return (
              <TouchableOpacity key={b.id} style={[s.job, late&&s.jobLate]}
                onPress={()=>router.push('/(provider)/jobs')}>
                <View style={s.timeCol}>
                  <Text style={s.time}>{b.time}</Text>
                  <Text style={s.dur}>
                    {b.actualMinutes ? fmtDuration(b.actualMinutes)
                      : b.hours ? `${b.hours}h` : '—'}
                  </Text>
                </View>

                <View style={s.line} />

                <View style={{flex:1}}>
                  <Text style={s.addr} numberOfLines={1}>{b.address}</Text>
                  <Text style={s.meta}>
                    {b.status === 'quoted' ? 'Quote sent — waiting'
                      : b.status === 'reschedule_proposed' ? 'New time offered'
                      : b.status === 'in_progress' ? 'In progress'
                      : b.status === 'arrived' ? 'On site'
                      : b.status === 'en_route' ? 'On the way'
                      : 'Accepted'}
                    {b.numWorkers > 1 ? ` · ${b.numWorkers} people` : ''}
                  </Text>
                  {late && <Text style={s.lateTxt}>This started already</Text>}
                </View>

                <TouchableOpacity style={s.navBtn}
                  onPress={()=>Linking.openURL(
                    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(b.address)}&travelmode=driving`)}>
                  <Text style={s.navTxt}>🚗</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      <View style={{height:32}}/>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  heading:{fontSize:28,fontWeight:'800',color:C.dark,paddingHorizontal:20,paddingTop:60},
  sub:{fontSize:13,color:C.muted,paddingHorizontal:20,marginTop:4,marginBottom:20},

  dayBlock:{marginBottom:22},
  dayHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
    paddingHorizontal:20,marginBottom:10},
  dayName:{fontSize:15,fontWeight:'800',color:C.dark},
  dayCount:{fontSize:12,color:C.muted},

  job:{flexDirection:'row',alignItems:'center',gap:12,marginHorizontal:20,marginBottom:8,
    backgroundColor:C.white,borderRadius:14,padding:13,borderWidth:1,borderColor:C.border,...S.sm},
  jobLate:{borderColor:C.amber,borderWidth:1.5},
  timeCol:{width:50,alignItems:'center'},
  time:{fontSize:15,fontWeight:'800',color:C.dark},
  dur:{fontSize:10,color:C.muted,marginTop:2},
  line:{width:3,alignSelf:'stretch',borderRadius:2,backgroundColor:C.primaryLt},
  addr:{fontSize:14,fontWeight:'700',color:C.dark},
  meta:{fontSize:12,color:C.muted,marginTop:3},
  lateTxt:{fontSize:11,color:C.amber,fontWeight:'700',marginTop:3},
  navBtn:{padding:8},
  navTxt:{fontSize:20},

  emptyBox:{marginHorizontal:20,backgroundColor:C.white,borderRadius:18,padding:30,
    alignItems:'center',gap:8,borderWidth:1,borderColor:C.border},
  emptyIcon:{fontSize:44},
  emptyTitle:{fontSize:17,fontWeight:'800',color:C.dark},
  emptyTxt:{fontSize:13,color:C.muted,textAlign:'center',lineHeight:19},
  emptyBtn:{backgroundColor:C.primary,borderRadius:12,paddingVertical:12,
    paddingHorizontal:24,marginTop:4},
  emptyBtnTxt:{color:C.white,fontSize:14,fontWeight:'700'},
});
