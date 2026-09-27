import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { C, S } from '../../constants/theme';
import { useApp } from '../../context/AppContext';

const CATEGORIES = [
  { id:'cleaning',  icon:'🧹', name:'Cleaning',   desc:'Homes, offices, Airbnb turnovers', live:true  },
  { id:'handyman',  icon:'🔧', name:'Handyman',   desc:'Small repairs and assembly',       live:false },
  { id:'electric',  icon:'⚡', name:'Electrician', desc:'Wiring, sockets, lighting',        live:false },
  { id:'plumbing',  icon:'🚰', name:'Plumber',    desc:'Leaks, taps, drainage',            live:false },
  { id:'painting',  icon:'🎨', name:'Painter',    desc:'Interior and exterior',            live:false },
  { id:'garden',    icon:'🌿', name:'Gardening',  desc:'Terraces, balconies, plants',      live:false },
];

export default function Home() {
  const { userName, cleaners, bookings } = useApp();

  const active = bookings.filter(b =>
    ['pending','pending_pool','accepted','en_route','arrived','in_progress','awaiting_confirmation']
      .includes(b.status));

  return (
    <ScrollView style={s.wrap} showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>Good day{userName ? `, ${userName.split(' ')[0]}` : ''} 👋</Text>
          <Text style={s.heading}>What do you need?</Text>
        </View>
        <TouchableOpacity style={s.avatar} onPress={() => router.push('/(tabs)/profile')}>
          <Text style={{ fontSize:22 }}>👤</Text>
        </TouchableOpacity>
      </View>

      {/* Active job reminder */}
      {active.length > 0 && (
        <TouchableOpacity style={s.activeCard} onPress={()=>router.push('/(tabs)/bookings')}>
          <Text style={s.activeIcon}>📋</Text>
          <View style={{flex:1}}>
            <Text style={s.activeTitle}>
              You have {active.length} job{active.length>1?'s':''} in progress
            </Text>
            <Text style={s.activeSub}>Tap to see the latest update</Text>
          </View>
          <Text style={s.activeGo}>›</Text>
        </TouchableOpacity>
      )}

      {/* Categories */}
      <View style={s.grid}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[s.catCard, !cat.live && s.catCardOff]}
            disabled={!cat.live}
            onPress={()=>router.push('/booking')}
          >
            <Text style={[s.catIcon, !cat.live && s.dim]}>{cat.icon}</Text>
            <Text style={[s.catName, !cat.live && s.dim]}>{cat.name}</Text>
            <Text style={[s.catDesc, !cat.live && s.dim]}>{cat.desc}</Text>
            {!cat.live && (
              <View style={s.soonTag}><Text style={s.soonTxt}>Soon</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* How it works */}
      <View style={s.stepsCard}>
        <Text style={s.stepsTitle}>How Poji works</Text>
        {[
          ['1','Tell us what you need','Service, size of the place, any extras'],
          ['2','We work out the time','You see the estimate before you book'],
          ['3','A verified pro accepts','They arrive and start with your PIN'],
          ['4','You approve the work','Pay only for the hours actually worked'],
        ].map(([n,t,d])=>(
          <View key={n} style={s.stepRow}>
            <View style={s.stepNum}><Text style={s.stepNumTxt}>{n}</Text></View>
            <View style={{flex:1}}>
              <Text style={s.stepTitle}>{t}</Text>
              <Text style={s.stepDesc}>{d}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Cleaners preview */}
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>Cleaners near you</Text>
        <TouchableOpacity onPress={()=>router.push('/(tabs)/cleaners')}>
          <Text style={s.seeAll}>See all ›</Text>
        </TouchableOpacity>
      </View>

      {cleaners.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyIcon}>🧹</Text>
          <Text style={s.emptyTxt}>No cleaners available yet</Text>
          <Text style={s.emptySub}>We're onboarding cleaners in your area right now.</Text>
        </View>
      ) : cleaners.slice(0,3).map(c=>(
        <TouchableOpacity key={c.id} style={s.cleanerCard} onPress={()=>router.push(`/cleaner/${c.id}`)}>
          <View style={[s.cleanerAv, { backgroundColor: c.color+'22' }]}>
            <Text style={[s.initials, { color: c.color }]}>{c.initials}</Text>
          </View>
          <View style={{ flex:1 }}>
            <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:3 }}>
              <Text style={s.cleanerName}>{c.name}</Text>
              {c.verified && <View style={s.verBadge}><Text style={s.verTxt}>✓</Text></View>}
            </View>
            <View style={{ flexDirection:'row', gap:8, alignItems:'center' }}>
              <Text style={s.rating}>⭐ {c.rating}</Text>
              <View style={[s.availBadge, !c.available&&s.busyBadge]}>
                <Text style={[s.availTxt, !c.available&&s.busyTxt]}>
                  {c.available?'● Available':'○ Busy'}
                </Text>
              </View>
            </View>
            <Text style={s.areas}>
              {((c as any).teamSize ?? 1) > 1 ? `👥 up to ${(c as any).teamSize} · ` : ''}
              {c.areas.slice(0,2).join(' · ')}
            </Text>
          </View>
          <View style={{alignItems:'flex-end'}}>
            <Text style={s.rate}>€{c.rate}</Text>
            <Text style={s.rateUnit}>/hr from</Text>
          </View>
        </TouchableOpacity>
      ))}

      {/* CTA */}
      <TouchableOpacity style={s.cta} onPress={()=>router.push('/booking')}>
        <Text style={s.ctaTxt}>Book a cleaner  →</Text>
      </TouchableOpacity>

      <View style={{ height:32 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,paddingTop:60,paddingBottom:20},
  greeting:{fontSize:13,color:C.muted},
  heading:{fontSize:28,fontWeight:'800',color:C.dark},
  avatar:{width:46,height:46,borderRadius:23,backgroundColor:C.primaryLt,alignItems:'center',justifyContent:'center'},

  activeCard:{flexDirection:'row',alignItems:'center',gap:12,marginHorizontal:20,marginBottom:20,backgroundColor:C.primaryLt,borderRadius:16,padding:14,borderWidth:1,borderColor:C.border},
  activeIcon:{fontSize:22},
  activeTitle:{fontSize:14,fontWeight:'700',color:C.primary},
  activeSub:{fontSize:12,color:C.muted,marginTop:2},
  activeGo:{fontSize:22,color:C.primary},

  grid:{flexDirection:'row',flexWrap:'wrap',gap:12,paddingHorizontal:20,marginBottom:28},
  catCard:{flexBasis:'47%',flexGrow:1,backgroundColor:C.white,borderRadius:18,padding:16,gap:4,borderWidth:1.5,borderColor:C.border,...S.sm},
  catCardOff:{backgroundColor:C.bgAlt,borderStyle:'dashed'},
  catIcon:{fontSize:28,marginBottom:4},
  catName:{fontSize:15,fontWeight:'800',color:C.dark},
  catDesc:{fontSize:11,color:C.muted,lineHeight:16},
  dim:{opacity:0.45},
  soonTag:{position:'absolute',top:12,right:12,backgroundColor:C.amberLt,paddingHorizontal:8,paddingVertical:3,borderRadius:10},
  soonTxt:{fontSize:10,fontWeight:'800',color:C.amber},

  stepsCard:{marginHorizontal:20,backgroundColor:C.white,borderRadius:18,padding:18,marginBottom:28,borderWidth:1,borderColor:C.border,gap:14,...S.sm},
  stepsTitle:{fontSize:16,fontWeight:'800',color:C.dark,marginBottom:2},
  stepRow:{flexDirection:'row',gap:12,alignItems:'flex-start'},
  stepNum:{width:26,height:26,borderRadius:13,backgroundColor:C.primaryLt,alignItems:'center',justifyContent:'center'},
  stepNumTxt:{fontSize:12,fontWeight:'800',color:C.primary},
  stepTitle:{fontSize:14,fontWeight:'700',color:C.text},
  stepDesc:{fontSize:12,color:C.muted,marginTop:2,lineHeight:17},

  sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,marginBottom:12},
  sectionTitle:{fontSize:19,fontWeight:'800',color:C.dark},
  seeAll:{fontSize:13,color:C.primary,fontWeight:'700'},

  emptyBox:{marginHorizontal:20,backgroundColor:C.white,borderRadius:18,padding:28,alignItems:'center',borderWidth:1,borderColor:C.border,gap:6},
  emptyIcon:{fontSize:40},
  emptyTxt:{fontSize:16,fontWeight:'700',color:C.dark},
  emptySub:{fontSize:13,color:C.muted,textAlign:'center'},

  cleanerCard:{flexDirection:'row',alignItems:'center',marginHorizontal:20,marginBottom:12,backgroundColor:C.white,borderRadius:18,padding:14,...S.sm,borderWidth:1,borderColor:C.border,gap:14},
  cleanerAv:{width:52,height:52,borderRadius:26,alignItems:'center',justifyContent:'center'},
  initials:{fontSize:17,fontWeight:'800'},
  cleanerName:{fontSize:15,fontWeight:'700',color:C.dark},
  verBadge:{backgroundColor:C.greenLt,width:20,height:20,borderRadius:10,alignItems:'center',justifyContent:'center'},
  verTxt:{fontSize:11,color:C.green,fontWeight:'700'},
  rating:{fontSize:13,fontWeight:'600'},
  availBadge:{backgroundColor:C.greenLt,paddingHorizontal:8,paddingVertical:2,borderRadius:8},
  busyBadge:{backgroundColor:C.bgAlt},
  availTxt:{fontSize:11,color:C.green,fontWeight:'600'},
  busyTxt:{color:C.muted},
  areas:{fontSize:12,color:C.muted,marginTop:3},
  rate:{fontSize:17,fontWeight:'800',color:C.primary},
  rateUnit:{fontSize:10,color:C.muted},

  cta:{marginHorizontal:20,marginTop:8,backgroundColor:C.primary,borderRadius:16,paddingVertical:17,alignItems:'center',...S.md},
  ctaTxt:{color:C.white,fontSize:16,fontWeight:'700'},
});
