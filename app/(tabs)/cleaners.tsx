import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { C, S } from '../../constants/theme';
import { useApp } from '../../context/AppContext';

export default function CleanersScreen() {
  const { cleaners } = useApp();
  const [q, setQ] = useState('');
  const [onlyAvail, setOnlyAvail] = useState(false);
  const [needTeam, setNeedTeam]   = useState(1);
  const list = cleaners.filter(c =>
    (c.name.toLowerCase().includes(q.toLowerCase()) || c.areas.some(a=>a.toLowerCase().includes(q.toLowerCase()))) &&
    (!onlyAvail || c.available) &&
    (((c as any).teamSize ?? 1) >= needTeam)
  );
  return (
    <ScrollView style={s.wrap} showsVerticalScrollIndicator={false}>
      <Text style={s.heading}>Find a Cleaner</Text>
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Text>🔍  </Text>
          <TextInput style={s.searchInput} placeholder="Name or area..." placeholderTextColor={C.muted} value={q} onChangeText={setQ} />
        </View>
        <TouchableOpacity style={[s.filterBtn, onlyAvail&&s.filterBtnOn]} onPress={()=>setOnlyAvail(!onlyAvail)}>
          <Text style={[s.filterTxt, onlyAvail&&s.filterTxtOn]}>Available</Text>
        </TouchableOpacity>
      </View>
      <View style={s.teamRow}>
        <Text style={s.teamLbl}>Team size</Text>
        <View style={s.teamChips}>
          {[1,2,3].map(n=>(
            <TouchableOpacity key={n} style={[s.teamChip, needTeam===n&&s.teamChipOn]}
              onPress={()=>setNeedTeam(n)}>
              <Text style={[s.teamChipTxt, needTeam===n&&s.teamChipTxtOn]}>
                {n===1?'Any':`${n}+`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={s.count}>{list.length} cleaners found</Text>
      {list.map(c=>(
        <TouchableOpacity key={c.id} style={s.card} onPress={()=>router.push(`/cleaner/${c.id}`)}>
          <View style={s.cardTop}>
            <View style={[s.avatar, {backgroundColor:c.color+'22'}]}>
              <Text style={[s.initials, {color:c.color}]}>{c.initials}</Text>
            </View>
            <View style={{flex:1}}>
              <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                <Text style={s.name}>{c.name}</Text>
                {c.verified && <View style={s.ver}><Text style={s.verTxt}>✓ Verified</Text></View>}
              </View>
              <View style={{flexDirection:'row',gap:8,alignItems:'center',marginTop:4}}>
                <Text style={s.rating}>⭐ {c.rating}</Text>
                <Text style={s.reviews}>({c.reviews})</Text>
              </View>
              <Text style={s.areas}>{c.areas.join(' · ')}</Text>
              {((c as any).teamSize ?? 1) > 1 && (
                <Text style={s.teamNote}>👥 Can send up to {(c as any).teamSize} cleaners</Text>
              )}
            </View>
            <View style={s.rateBox}>
              <Text style={s.rate}>€{c.rate}</Text>
              <Text style={s.rateUnit}>/hr</Text>
            </View>
          </View>
          <View style={s.tags}>
            {c.specialties.map(sp=><View key={sp} style={s.tag}><Text style={s.tagTxt}>{sp}</Text></View>)}
            <View style={[s.tag, c.available?s.tagAvail:s.tagBusy]}>
              <Text style={[s.tagTxt, {color:c.available?C.green:C.muted}]}>{c.available?'● Available':'○ Busy'}</Text>
            </View>
          </View>
          <View style={s.cardFooter}>
            <TouchableOpacity style={s.viewBtn} onPress={()=>router.push(`/cleaner/${c.id}`)}>
              <Text style={s.viewBtnTxt}>View Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.bookBtn, !c.available&&s.bookBtnDis]}
              onPress={()=>c.available&&router.push(`/booking?cleanerId=${c.id}&cleanerName=${encodeURIComponent(c.name)}`)}>
              <Text style={s.bookBtnTxt}>{c.available?'Book →':'Unavailable'}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      ))}
      <View style={{height:32}} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  heading:{fontSize:28,fontWeight:'800',color:C.dark,paddingHorizontal:20,paddingTop:60,paddingBottom:16},
  searchRow:{flexDirection:'row',paddingHorizontal:20,gap:10,marginBottom:12},
  searchBox:{flex:1,flexDirection:'row',alignItems:'center',backgroundColor:C.white,borderRadius:14,paddingHorizontal:14,borderWidth:1,borderColor:C.border,...S.sm},
  searchInput:{flex:1,paddingVertical:13,fontSize:14,color:C.text},
  filterBtn:{paddingHorizontal:14,justifyContent:'center',borderRadius:14,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white},
  filterBtnOn:{backgroundColor:C.primaryLt,borderColor:C.primary},
  filterTxt:{fontSize:13,color:C.muted,fontWeight:'600'},
  filterTxtOn:{color:C.primary},
  teamRow:{flexDirection:'row',alignItems:'center',paddingHorizontal:20,gap:12,marginBottom:12},
  teamLbl:{fontSize:12,fontWeight:'700',color:C.muted,textTransform:'uppercase',letterSpacing:0.5},
  teamChips:{flexDirection:'row',gap:6},
  teamChip:{paddingHorizontal:14,paddingVertical:7,borderRadius:20,backgroundColor:C.white,borderWidth:1.5,borderColor:C.border},
  teamChipOn:{backgroundColor:C.primary,borderColor:C.primary},
  teamChipTxt:{fontSize:12,fontWeight:'700',color:C.muted},
  teamChipTxtOn:{color:C.white},
  teamNote:{fontSize:11,color:C.accent,fontWeight:'700',marginTop:3},
  count:{fontSize:13,color:C.muted,paddingHorizontal:20,marginBottom:12},
  card:{marginHorizontal:20,marginBottom:14,backgroundColor:C.white,borderRadius:20,padding:16,...S.sm,borderWidth:1,borderColor:C.border},
  cardTop:{flexDirection:'row',gap:12,marginBottom:12},
  avatar:{width:58,height:58,borderRadius:29,alignItems:'center',justifyContent:'center'},
  initials:{fontSize:20,fontWeight:'800'},
  name:{fontSize:16,fontWeight:'700',color:C.dark},
  ver:{backgroundColor:C.greenLt,paddingHorizontal:8,paddingVertical:3,borderRadius:8},
  verTxt:{fontSize:11,color:C.green,fontWeight:'700'},
  rating:{fontSize:13,fontWeight:'600'},
  reviews:{fontSize:12,color:C.muted},
  areas:{fontSize:12,color:C.muted,marginTop:4},
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
});
