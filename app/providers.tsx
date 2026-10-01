import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { C, S } from '../constants/theme';
import { findTrade } from '../constants/trades';
import { useApp } from '../context/AppContext';

/** "Electrician" → "Electricians near you" */
const plural = (name: string) => {
  if (/s$/i.test(name)) return name;
  if (/(ch|sh|x|z)$/i.test(name)) return name + 'es';
  if (/[^aeiou]y$/i.test(name)) return name.slice(0,-1) + 'ies';
  return name + 's';
};

export default function Providers() {
  const { trade } = useLocalSearchParams<{trade?: string}>();
  const { providers } = useApp();
  const [q, setQ] = useState('');
  const [onlyAvail, setOnly] = useState(false);

  const t = findTrade(trade);
  const forTrade = providers.filter(p => (p.categories || []).includes(trade || ''));

  const list = forTrade.filter(p =>
    (!q || p.name.toLowerCase().includes(q.toLowerCase())
        || p.areas.some(a => a.toLowerCase().includes(q.toLowerCase())))
    && (!onlyAvail || p.available)
  );

  const heading = t ? `${plural(t.name)} near you` : 'Providers near you';

  return (
    <ScrollView style={s.wrap} showsVerticalScrollIndicator={false}>
      <View style={s.hdr}>
        <TouchableOpacity onPress={()=>router.back()}><Text style={s.back}>← Back</Text></TouchableOpacity>
        <Text style={s.title}>{t?.name || 'Providers'}</Text>
        <View style={{width:54}}/>
      </View>

      <Text style={s.heading}>{heading}</Text>
      <Text style={s.sub}>
        {forTrade.length > 0
          ? `${forTrade.length} verified ${forTrade.length===1?'provider':'providers'} · all ID-checked by Poji`
          : 'No one has signed up for this trade yet.'}
      </Text>

      {forTrade.length > 0 && (
        <View style={s.searchRow}>
          <View style={s.searchBox}>
            <Text>🔍  </Text>
            <TextInput style={s.searchInput} placeholder="Name or area…"
              placeholderTextColor={C.muted} value={q} onChangeText={setQ} />
          </View>
          <TouchableOpacity style={[s.filterBtn, onlyAvail&&s.filterBtnOn]}
            onPress={()=>setOnly(!onlyAvail)}>
            <Text style={[s.filterTxt, onlyAvail&&s.filterTxtOn]}>Available</Text>
          </TouchableOpacity>
        </View>
      )}

      {forTrade.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyIcon}>{t?.icon || '🔎'}</Text>
          <Text style={s.emptyTxt}>No {t ? plural(t.name).toLowerCase() : 'providers'} yet</Text>
          <Text style={s.emptySub}>
            We're onboarding people in your area. Try another service, or check back soon.
          </Text>
          <TouchableOpacity style={s.emptyBtn} onPress={()=>router.back()}>
            <Text style={s.emptyBtnTxt}>Back to services</Text>
          </TouchableOpacity>
        </View>
      ) : list.map(p=>(
        <TouchableOpacity key={p.id} style={s.card} onPress={()=>router.push(`/cleaner/${p.id}?trade=${trade}`)}>
          <View style={s.cardTop}>
            <View style={[s.avatar,{backgroundColor:p.color+'22'}]}>
              <Text style={[s.initials,{color:p.color}]}>{p.initials}</Text>
            </View>
            <View style={{flex:1}}>
              <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                <Text style={s.name}>{p.name}</Text>
                {p.verified && <View style={s.ver}><Text style={s.verTxt}>✓ Verified</Text></View>}
              </View>
              <View style={{flexDirection:'row',gap:8,alignItems:'center',marginTop:4}}>
                <Text style={s.rating}>⭐ {p.rating}</Text>
                <Text style={s.reviews}>({p.reviews})</Text>
              </View>
              <Text style={s.areas}>{p.areas.join(' · ')}</Text>
              {((p as any).teamSize ?? 1) > 1 && (
                <Text style={s.teamNote}>👥 Can send up to {(p as any).teamSize} people</Text>
              )}
            </View>
            <View style={s.rateBox}>
              <Text style={s.rate}>€{p.rate}</Text>
              <Text style={s.rateUnit}>/hr</Text>
            </View>
          </View>

          <View style={s.tags}>
            {(p.specialties||[]).slice(0,3).map(sp=>(
              <View key={sp} style={s.tag}><Text style={s.tagTxt}>{sp}</Text></View>
            ))}
            <View style={[s.tag, p.available?s.tagAvail:s.tagBusy]}>
              <Text style={[s.tagTxt,{color:p.available?C.green:C.muted}]}>
                {p.available?'● Available':'○ Busy'}
              </Text>
            </View>
          </View>

          <View style={s.cardFooter}>
            <TouchableOpacity style={s.viewBtn} onPress={()=>router.push(`/cleaner/${p.id}?trade=${trade}`)}>
              <Text style={s.viewBtnTxt}>View profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.bookBtn, !p.available&&s.bookBtnDis]}
              disabled={!p.available}
              onPress={()=>router.push(`/booking?cleanerId=${p.id}&cleanerName=${encodeURIComponent(p.name)}&trade=${trade}`)}>
              <Text style={s.bookBtnTxt}>{p.available?'Book →':'Unavailable'}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      ))}

      <View style={{height:32}}/>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:60,paddingBottom:8},
  back:{fontSize:16,color:C.primary,fontWeight:'600',width:54},
  title:{fontSize:17,fontWeight:'700',color:C.dark},
  heading:{fontSize:26,fontWeight:'800',color:C.dark,paddingHorizontal:20,marginTop:8},
  sub:{fontSize:13,color:C.muted,paddingHorizontal:20,marginTop:4,marginBottom:16,lineHeight:18},

  searchRow:{flexDirection:'row',paddingHorizontal:20,gap:10,marginBottom:16},
  searchBox:{flex:1,flexDirection:'row',alignItems:'center',backgroundColor:C.white,borderRadius:14,paddingHorizontal:14,borderWidth:1,borderColor:C.border,...S.sm},
  searchInput:{flex:1,paddingVertical:13,fontSize:14,color:C.text},
  filterBtn:{paddingHorizontal:14,justifyContent:'center',borderRadius:14,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white},
  filterBtnOn:{backgroundColor:C.primaryLt,borderColor:C.primary},
  filterTxt:{fontSize:13,color:C.muted,fontWeight:'600'},
  filterTxtOn:{color:C.primary},

  card:{marginHorizontal:20,marginBottom:14,backgroundColor:C.white,borderRadius:20,padding:16,...S.sm,borderWidth:1,borderColor:C.border},
  cardTop:{flexDirection:'row',gap:12,marginBottom:12},
  avatar:{width:56,height:56,borderRadius:28,alignItems:'center',justifyContent:'center'},
  initials:{fontSize:19,fontWeight:'800'},
  name:{fontSize:16,fontWeight:'700',color:C.dark},
  ver:{backgroundColor:C.greenLt,paddingHorizontal:8,paddingVertical:3,borderRadius:8},
  verTxt:{fontSize:11,color:C.green,fontWeight:'700'},
  rating:{fontSize:13,fontWeight:'600'},
  reviews:{fontSize:12,color:C.muted},
  areas:{fontSize:12,color:C.muted,marginTop:4},
  teamNote:{fontSize:11,color:C.accent,fontWeight:'700',marginTop:3},
  rateBox:{alignItems:'flex-end'},
  rate:{fontSize:22,fontWeight:'800',color:C.primary},
  rateUnit:{fontSize:12,color:C.muted},
  tags:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:14},
  tag:{backgroundColor:C.bgAlt,paddingHorizontal:10,paddingVertical:4,borderRadius:20,borderWidth:1,borderColor:C.border},
  tagAvail:{backgroundColor:C.greenLt,borderColor:C.greenLt},
  tagBusy:{backgroundColor:C.bgAlt},
  tagTxt:{fontSize:11,color:C.muted,fontWeight:'600'},
  cardFooter:{flexDirection:'row',gap:10},
  viewBtn:{flex:1,borderWidth:1.5,borderColor:C.border,borderRadius:12,paddingVertical:11,alignItems:'center'},
  viewBtnTxt:{fontSize:14,fontWeight:'600',color:C.muted},
  bookBtn:{flex:1,backgroundColor:C.primary,borderRadius:12,paddingVertical:11,alignItems:'center'},
  bookBtnDis:{backgroundColor:C.bgAlt},
  bookBtnTxt:{fontSize:14,fontWeight:'700',color:C.white},

  emptyBox:{marginHorizontal:20,backgroundColor:C.white,borderRadius:18,padding:30,alignItems:'center',borderWidth:1,borderColor:C.border,gap:8},
  emptyIcon:{fontSize:42},
  emptyTxt:{fontSize:16,fontWeight:'700',color:C.dark},
  emptySub:{fontSize:13,color:C.muted,textAlign:'center',lineHeight:19},
  emptyBtn:{marginTop:8,backgroundColor:C.primary,borderRadius:12,paddingVertical:12,paddingHorizontal:24},
  emptyBtnTxt:{color:C.white,fontSize:14,fontWeight:'700'},
});
