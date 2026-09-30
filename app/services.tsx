import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { C, S } from '../constants/theme';
import { tradesIn, findCategory, type Trade } from '../constants/trades';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';

export default function Services() {
  const { category } = useLocalSearchParams<{category?: string}>();
  const { providers } = useApp();
  const cat = findCategory(category);
  const trades = tradesIn(category || '');
  const [interested, setInterested] = useState<string[]>([]);

  const countFor = (tradeId: string) =>
    providers.filter(p => (p.categories || []).includes(tradeId)).length;

  const registerInterest = async (t: Trade) => {
    if (interested.includes(t.id)) return;
    setInterested(prev => [...prev, t.id]);
    try {
      const { data:{ user } } = await supabase.auth.getUser();
      await supabase.from('service_interest').insert({
        user_id: user?.id ?? null, category_id: t.id, category_name: t.name,
      });
    } catch {}
  };

  const open = (t: Trade) => {
    if (!t.live) { registerInterest(t); return; }
    if (t.roadside) { router.push('/roadside'); return; }
    router.push(`/providers?trade=${t.id}`);
  };

  if (!cat) {
    return (
      <View style={s.wrap}>
        <View style={s.hdr}>
          <TouchableOpacity onPress={()=>router.back()}><Text style={s.back}>← Back</Text></TouchableOpacity>
          <Text style={s.title}>Services</Text>
          <View style={{width:54}}/>
        </View>
        <Text style={s.emptyTxt}>Category not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.wrap} showsVerticalScrollIndicator={false}>
      <View style={s.hdr}>
        <TouchableOpacity onPress={()=>router.back()}><Text style={s.back}>← Back</Text></TouchableOpacity>
        <Text style={s.title}>{cat.name}</Text>
        <View style={{width:54}}/>
      </View>

      <View style={s.heroRow}>
        <View style={[s.heroIcon,{backgroundColor:cat.colour+'18'}]}>
          <Text style={{fontSize:30}}>{cat.icon}</Text>
        </View>
        <View style={{flex:1}}>
          <Text style={s.heroTitle}>{cat.name}</Text>
          <Text style={s.heroDesc}>{cat.desc}</Text>
        </View>
      </View>

      {cat.urgent && (
        <View style={s.urgentBanner}>
          <Text style={s.urgentBannerTxt}>
            ⚡  These are callout jobs. Fixed price, and we send your GPS so they drive
            straight to you.
          </Text>
        </View>
      )}

      {trades.map(t=>{
        const n = countFor(t.id);
        const wanted = interested.includes(t.id);
        return (
          <TouchableOpacity key={t.id}
            style={[s.card, !t.live && s.cardOff, wanted && s.cardWanted]}
            onPress={()=>open(t)}>
            <Text style={[s.cardIcon, !t.live && !wanted && s.dim]}>{t.icon}</Text>
            <View style={{flex:1}}>
              <Text style={[s.cardName, !t.live && !wanted && s.dim]}>{t.name}</Text>
              <Text style={[s.cardDesc, !t.live && !wanted && s.dim]}>{t.desc}</Text>
              {t.live ? (
                <Text style={[s.cardMeta,{color:cat.colour}]}>
                  {n > 0
                    ? `${n} provider${n>1?'s':''} available`
                    : 'No one signed up yet'}
                  {t.pricing === 'fixed' ? ' · fixed price' : ' · hourly'}
                </Text>
              ) : (
                <Text style={s.cardMetaSoon}>
                  {wanted ? 'We\'ll message you when it goes live' : 'Tap to register interest'}
                </Text>
              )}
            </View>
            {t.live
              ? <Text style={s.cardGo}>›</Text>
              : <View style={[s.tag, wanted&&s.tagOn]}>
                  <Text style={[s.tagTxt, wanted&&s.tagTxtOn]}>{wanted ? '✓' : 'Soon'}</Text>
                </View>}
          </TouchableOpacity>
        );
      })}

      {interested.length > 0 && (
        <View style={s.thanksBox}>
          <Text style={s.thanksTitle}>Thanks — noted 👂</Text>
          <Text style={s.thanksTxt}>
            We bring new trades on in the order people ask for them.
          </Text>
        </View>
      )}

      <View style={{height:32}}/>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:60,paddingBottom:12},
  back:{fontSize:16,color:C.primary,fontWeight:'600',width:54},
  title:{fontSize:17,fontWeight:'700',color:C.dark},

  heroRow:{flexDirection:'row',alignItems:'center',gap:14,paddingHorizontal:20,marginBottom:18},
  heroIcon:{width:60,height:60,borderRadius:18,alignItems:'center',justifyContent:'center'},
  heroTitle:{fontSize:20,fontWeight:'800',color:C.dark},
  heroDesc:{fontSize:13,color:C.muted,marginTop:3,lineHeight:18},

  urgentBanner:{marginHorizontal:20,marginBottom:16,backgroundColor:C.amberLt,borderRadius:14,padding:14,borderWidth:1,borderColor:'#FDE68A'},
  urgentBannerTxt:{fontSize:12,color:C.amber,fontWeight:'700',lineHeight:18},

  card:{flexDirection:'row',alignItems:'center',gap:14,marginHorizontal:20,marginBottom:10,backgroundColor:C.white,borderRadius:16,padding:15,borderWidth:1.5,borderColor:C.border,...S.sm},
  cardOff:{backgroundColor:C.bgAlt,borderStyle:'dashed'},
  cardWanted:{backgroundColor:C.greenLt,borderColor:'#A7F3D0',borderStyle:'solid'},
  cardIcon:{fontSize:26},
  cardName:{fontSize:15,fontWeight:'700',color:C.dark},
  cardDesc:{fontSize:12,color:C.muted,marginTop:2,lineHeight:17},
  cardMeta:{fontSize:11,fontWeight:'700',marginTop:5},
  cardMetaSoon:{fontSize:11,color:C.muted,marginTop:5},
  cardGo:{fontSize:24,color:C.border},
  dim:{opacity:0.45},
  tag:{backgroundColor:C.amberLt,paddingHorizontal:9,paddingVertical:4,borderRadius:10},
  tagOn:{backgroundColor:C.green},
  tagTxt:{fontSize:10,fontWeight:'800',color:C.amber},
  tagTxtOn:{color:C.white},

  thanksBox:{marginHorizontal:20,marginTop:10,backgroundColor:C.greenLt,borderRadius:14,padding:14,gap:5,borderWidth:1,borderColor:'#A7F3D0'},
  thanksTitle:{fontSize:14,fontWeight:'800',color:C.green},
  thanksTxt:{fontSize:12,color:C.text,lineHeight:18},
  emptyTxt:{fontSize:14,color:C.muted,textAlign:'center',marginTop:40},
});
