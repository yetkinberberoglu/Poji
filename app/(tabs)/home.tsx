import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { C, S } from '../../constants/theme';
import { CATEGORIES, tradesIn } from '../../constants/trades';
import { useApp } from '../../context/AppContext';

export default function Home() {
  const { userName, bookings, availableTrades, providersFor } = useApp();

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

      {(() => {
        const served = CATEGORIES.filter(cat =>
          tradesIn(cat.id).some(t => availableTrades.includes(t.id)));

        if (served.length === 0) {
          return (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>🚧</Text>
              <Text style={s.emptyTitle}>We're just getting started</Text>
              <Text style={s.emptyTxt}>
                Poji is signing up its first providers in Malta right now.
                Tell us what you need and we'll message you the moment someone covers it.
              </Text>
              <TouchableOpacity style={s.emptyBtn} onPress={()=>router.push('/request')}>
                <Text style={s.emptyBtnTxt}>Tell us what you need</Text>
              </TouchableOpacity>
            </View>
          );
        }

        return served.map(cat=>{
        const liveTrades = tradesIn(cat.id).filter(t => availableTrades.includes(t.id));
        const people = new Set(
          liveTrades.flatMap(t => providersFor(t.id).map(p => p.id))
        ).size;
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
              <Text style={s.catDesc}>
                {liveTrades.map(t=>t.name).slice(0,3).join(' · ')}
                {liveTrades.length > 3 ? ` +${liveTrades.length - 3}` : ''}
              </Text>
              <Text style={[s.catCount,{color:cat.colour}]}>
                {people} {people===1?'provider':'providers'} available
              </Text>
            </View>
            <Text style={s.catGo}>›</Text>
          </TouchableOpacity>
        );
        });
      })()}

      <TouchableOpacity style={s.requestRow} onPress={()=>router.push('/request')}>
        <Text style={s.requestIcon}>💬</Text>
        <View style={{flex:1}}>
          <Text style={s.requestTitle}>Need something else?</Text>
          <Text style={s.requestTxt}>
            Tell us the trade and we'll find someone for you
          </Text>
        </View>
        <Text style={s.catGo}>›</Text>
      </TouchableOpacity>

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

  emptyState:{marginHorizontal:20,backgroundColor:C.white,borderRadius:20,padding:28,alignItems:'center',gap:10,borderWidth:1,borderColor:C.border,...S.sm},
  emptyIcon:{fontSize:44},
  emptyTitle:{fontSize:18,fontWeight:'800',color:C.dark,textAlign:'center'},
  emptyTxt:{fontSize:13,color:C.muted,textAlign:'center',lineHeight:19},
  emptyBtn:{backgroundColor:C.primary,borderRadius:14,paddingVertical:14,paddingHorizontal:26,marginTop:6},
  emptyBtnTxt:{color:C.white,fontSize:14,fontWeight:'700'},
  requestRow:{flexDirection:'row',alignItems:'center',gap:14,marginHorizontal:20,marginBottom:12,backgroundColor:C.bgAlt,borderRadius:18,padding:16,borderWidth:1.5,borderStyle:'dashed',borderColor:C.border},
  requestIcon:{fontSize:24},
  requestTitle:{fontSize:15,fontWeight:'800',color:C.dark},
  requestTxt:{fontSize:12,color:C.muted,marginTop:3,lineHeight:17},
  stepsCard:{marginHorizontal:20,backgroundColor:C.white,borderRadius:18,padding:18,marginTop:16,borderWidth:1,borderColor:C.border,gap:14,...S.sm},
  stepsTitle:{fontSize:16,fontWeight:'800',color:C.dark,marginBottom:2},
  stepRow:{flexDirection:'row',gap:12,alignItems:'flex-start'},
  stepNum:{width:26,height:26,borderRadius:13,backgroundColor:C.primaryLt,alignItems:'center',justifyContent:'center'},
  stepNumTxt:{fontSize:12,fontWeight:'800',color:C.primary},
  stepTitle:{fontSize:14,fontWeight:'700',color:C.text},
  stepDesc:{fontSize:12,color:C.muted,marginTop:2,lineHeight:17},
});
