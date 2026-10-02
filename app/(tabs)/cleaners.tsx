import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { C, S } from '../../constants/theme';
import { CATEGORIES, TRADES, tradesIn } from '../../constants/trades';
import { useApp } from '../../context/AppContext';

export default function ServicesTab() {
  const { availableTrades, providersFor } = useApp();
  const [q, setQ] = useState('');

  const live = TRADES.filter(t => availableTrades.includes(t.id));
  const list = live.filter(t =>
    !q || t.name.toLowerCase().includes(q.toLowerCase())
       || t.desc.toLowerCase().includes(q.toLowerCase()));

  const open = (t: any) =>
    t.roadside ? router.push(`/roadside?trade=${t.id}`) : router.push(`/providers?trade=${t.id}`);

  const grouped = CATEGORIES
    .map(cat => ({ cat, items: list.filter(t => t.category === cat.id) }))
    .filter(g => g.items.length > 0);

  return (
    <ScrollView style={s.wrap} showsVerticalScrollIndicator={false}>
      <Text style={s.heading}>All services</Text>
      <Text style={s.sub}>
        {live.length > 0
          ? `${live.length} service${live.length===1?'':'s'} available in Malta right now`
          : 'Nothing available yet — we\'re signing up the first providers'}
      </Text>

      {live.length > 0 && (
        <View style={s.searchBox}>
          <Text>🔍  </Text>
          <TextInput style={s.searchInput} placeholder="Search services…"
            placeholderTextColor={C.muted} value={q} onChangeText={setQ} />
        </View>
      )}

      {live.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyIcon}>🚧</Text>
          <Text style={s.emptyTitle}>We're just getting started</Text>
          <Text style={s.emptyTxt}>
            Tell us what you need and we'll message you when someone covers it.
          </Text>
          <TouchableOpacity style={s.emptyBtn} onPress={()=>router.push('/request')}>
            <Text style={s.emptyBtnTxt}>Tell us what you need</Text>
          </TouchableOpacity>
        </View>
      ) : grouped.map(({cat, items})=>(
        <View key={cat.id}>
          <Text style={s.groupTitle}>{cat.icon}  {cat.name}</Text>
          {items.map(t=>{
            const people = providersFor(t.id);
            const from = people.length ? Math.min(...people.map(p=>p.rate)) : 0;
            return (
              <TouchableOpacity key={t.id} style={s.card} onPress={()=>open(t)}>
                <Text style={s.cardIcon}>{t.icon}</Text>
                <View style={{flex:1}}>
                  <Text style={s.cardName}>{t.name}</Text>
                  <Text style={s.cardDesc}>{t.desc}</Text>
                  <Text style={[s.cardMeta,{color:cat.colour}]}>
                    {people.length} {people.length===1?'provider':'providers'}
                    {t.pricing === 'fixed' ? ' · fixed price' : ` · from €${from}/hr`}
                  </Text>
                </View>
                <Text style={s.cardGo}>›</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {live.length > 0 && (
        <TouchableOpacity style={s.requestRow} onPress={()=>router.push('/request')}>
          <Text style={s.requestIcon}>💬</Text>
          <View style={{flex:1}}>
            <Text style={s.requestTitle}>Can't find what you need?</Text>
            <Text style={s.requestTxt}>Tell us and we'll find someone</Text>
          </View>
          <Text style={s.cardGo}>›</Text>
        </TouchableOpacity>
      )}

      <View style={{height:32}}/>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  heading:{fontSize:28,fontWeight:'800',color:C.dark,paddingHorizontal:20,paddingTop:60},
  sub:{fontSize:13,color:C.muted,paddingHorizontal:20,marginTop:4,marginBottom:16,lineHeight:18},
  searchBox:{flexDirection:'row',alignItems:'center',marginHorizontal:20,backgroundColor:C.white,borderRadius:14,paddingHorizontal:14,borderWidth:1,borderColor:C.border,marginBottom:18,...S.sm},
  searchInput:{flex:1,paddingVertical:13,fontSize:14,color:C.text},
  groupTitle:{fontSize:12,fontWeight:'800',color:C.muted,textTransform:'uppercase',letterSpacing:0.7,paddingHorizontal:20,marginBottom:10,marginTop:8},
  card:{flexDirection:'row',alignItems:'center',gap:14,marginHorizontal:20,marginBottom:10,backgroundColor:C.white,borderRadius:16,padding:15,borderWidth:1,borderColor:C.border,...S.sm},
  cardIcon:{fontSize:26},
  cardName:{fontSize:15,fontWeight:'700',color:C.dark},
  cardDesc:{fontSize:12,color:C.muted,marginTop:2,lineHeight:17},
  cardMeta:{fontSize:11,fontWeight:'700',marginTop:5},
  cardGo:{fontSize:24,color:C.border},
  emptyBox:{marginHorizontal:20,backgroundColor:C.white,borderRadius:20,padding:30,alignItems:'center',gap:10,borderWidth:1,borderColor:C.border},
  emptyIcon:{fontSize:44},
  emptyTitle:{fontSize:18,fontWeight:'800',color:C.dark},
  emptyTxt:{fontSize:13,color:C.muted,textAlign:'center',lineHeight:19},
  emptyBtn:{backgroundColor:C.primary,borderRadius:14,paddingVertical:13,paddingHorizontal:24,marginTop:4},
  emptyBtnTxt:{color:C.white,fontSize:14,fontWeight:'700'},
  requestRow:{flexDirection:'row',alignItems:'center',gap:14,marginHorizontal:20,marginTop:8,backgroundColor:C.bgAlt,borderRadius:16,padding:15,borderWidth:1.5,borderStyle:'dashed',borderColor:C.border},
  requestIcon:{fontSize:22},
  requestTitle:{fontSize:14,fontWeight:'800',color:C.dark},
  requestTxt:{fontSize:12,color:C.muted,marginTop:2},
});
