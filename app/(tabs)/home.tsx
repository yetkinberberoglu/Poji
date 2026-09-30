import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { C, S } from '../../constants/theme';
import { CATEGORIES, tradesIn, liveCount } from '../../constants/trades';
import { useApp } from '../../context/AppContext';

export default function Home() {
  const { userName, bookings } = useApp();

  const active = bookings.filter(b =>
    ['pending','pending_pool','accepted','en_route','arrived','in_progress','awaiting_confirmation']
      .includes(b.status));

  return (
    <ScrollView style={s.wrap} showsVerticalScrollIndicator={false}>

      <View style={s.header}>
        <View>
          <Text style={s.greeting}>Good day{userName ? `, ${userName.split(' ')[0]}` : ''} 👋</Text>
          <Text style={s.heading}>What do you need?</Text>
        </View>
        <TouchableOpacity style={s.avatar} onPress={() => router.push('/(tabs)/profile')}>
          <Text style={{ fontSize:22 }}>👤</Text>
        </TouchableOpacity>
      </View>

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

      {CATEGORIES.map(cat=>{
        const total = tradesIn(cat.id).length;
        const live  = liveCount(cat.id);
        return (
          <TouchableOpacity key={cat.id} style={s.catCard}
            onPress={()=>router.push(`/services?category=${cat.id}`)}>
            <View style={[s.catIconBox,{backgroundColor:cat.colour+'18'}]}>
              <Text style={s.catIcon}>{cat.icon}</Text>
            </View>
            <View style={{flex:1}}>
              <View style={s.catTitleRow}>
                <Text style={s.catName}>{cat.name}</Text>
                {cat.urgent && (
                  <View style={s.urgentTag}><Text style={s.urgentTxt}>⚡ Same-day</Text></View>
                )}
              </View>
              <Text style={s.catDesc}>{cat.desc}</Text>
              <Text style={[s.catCount,{color:cat.colour}]}>
                {live > 0 ? `${live} of ${total} available now` : `${total} services · coming soon`}
              </Text>
            </View>
            <Text style={s.catGo}>›</Text>
          </TouchableOpacity>
        );
      })}

      <View style={s.stepsCard}>
        <Text style={s.stepsTitle}>How Poji works</Text>
        {[
          ['1','Pick what you need','Choose a service and tell us the details'],
          ['2','Compare providers','Real people, real rates, all verified'],
          ['3','They arrive and work','Job starts with your PIN'],
          ['4','You approve, then pay','Only for the work actually done'],
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

  catCard:{flexDirection:'row',alignItems:'center',gap:14,marginHorizontal:20,marginBottom:12,backgroundColor:C.white,borderRadius:18,padding:16,borderWidth:1,borderColor:C.border,...S.sm},
  catIconBox:{width:54,height:54,borderRadius:16,alignItems:'center',justifyContent:'center'},
  catIcon:{fontSize:26},
  catTitleRow:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},
  catName:{fontSize:16,fontWeight:'800',color:C.dark},
  catDesc:{fontSize:12,color:C.muted,marginTop:3,lineHeight:17},
  catCount:{fontSize:11,fontWeight:'700',marginTop:5},
  catGo:{fontSize:24,color:C.border},
  urgentTag:{backgroundColor:C.amberLt,paddingHorizontal:8,paddingVertical:3,borderRadius:10,borderWidth:1,borderColor:'#FDE68A'},
  urgentTxt:{fontSize:10,fontWeight:'800',color:C.amber},

  stepsCard:{marginHorizontal:20,backgroundColor:C.white,borderRadius:18,padding:18,marginTop:16,borderWidth:1,borderColor:C.border,gap:14,...S.sm},
  stepsTitle:{fontSize:16,fontWeight:'800',color:C.dark,marginBottom:2},
  stepRow:{flexDirection:'row',gap:12,alignItems:'flex-start'},
  stepNum:{width:26,height:26,borderRadius:13,backgroundColor:C.primaryLt,alignItems:'center',justifyContent:'center'},
  stepNumTxt:{fontSize:12,fontWeight:'800',color:C.primary},
  stepTitle:{fontSize:14,fontWeight:'700',color:C.text},
  stepDesc:{fontSize:12,color:C.muted,marginTop:2,lineHeight:17},
});
