import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { routeHome } from '../lib/route-home';
import { CATEGORIES, useTrades } from '../constants/trades';
import Logo from '../components/Logo';

/**
 * The front door.
 *
 * It used to be the login form, which asks someone to commit before it has
 * told them anything. The two routes in are genuinely different products —
 * one person wants a job done, the other wants work — so they get their own
 * card rather than a single button and a role picker further down.
 */
export default function Welcome() {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const { categories } = useTrades();
  const [checked, setChecked] = useState(false);

  /* Somebody already signed in has no use for a pitch. */
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) { routeHome(); return; }
      setChecked(true);
    })();
  }, []);

  const go = (role: 'client' | 'cleaner') =>
    router.push(`/auth?mode=register&role=${role}`);

  const cats = (categories?.length ? categories : CATEGORIES).slice(0, 6);

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.body}
      showsVerticalScrollIndicator={false}>

      <View style={s.hero}>
        <Logo size={64} />
        <Text style={s.brand}>Poji</Text>
        <Text style={s.tag}>Trades and services across Malta and Gozo</Text>
        <Text style={s.lede}>
          One agreed price, nothing added at the end, and nobody is paid until
          the work is done.
        </Text>
      </View>

      <View style={[s.doors, wide && s.doorsWide]}>
        <TouchableOpacity style={[s.door, s.doorClient]} onPress={()=>go('client')}>
          <Text style={s.doorIcon}>🏠</Text>
          <Text style={s.doorTitle}>I need something done</Text>
          <Text style={s.doorTxt}>
            Compare what each provider would charge for your actual job, not an
            hourly rate you have to work out. A four-digit code from you starts
            the work, and you release the payment when it's finished.
          </Text>
          <View style={s.doorBtn}>
            <Text style={s.doorBtnTxt}>Find a provider  →</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={[s.door, s.doorPro]} onPress={()=>go('cleaner')}>
          <Text style={s.doorIcon}>🛠️</Text>
          <Text style={s.doorTitle}>I do the work</Text>
          <Text style={s.doorTxt}>
            You set your own prices, service by service — an hour cooking is not
            an hour cleaning. Poji's commission comes out of your side, so the
            price you name is the price the client sees. Joining is free.
          </Text>
          <View style={[s.doorBtn, s.doorBtnPro]}>
            <Text style={s.doorBtnTxt}>Get listed  →</Text>
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={s.loginRow} onPress={()=>router.push('/auth?mode=login')}>
        <Text style={s.loginTxt}>
          Already have an account?  <Text style={s.loginLink}>Log in</Text>
        </Text>
      </TouchableOpacity>

      <View style={s.sect}>
        <Text style={s.sectTitle}>How it works</Text>
        <View style={s.steps}>
          {[
            ['Say what you need', 'A few questions that actually change the price — how many square metres, which floor, how many guests.'],
            ['See real totals', 'Every provider sets their own prices. You compare the figure for your job, side by side.'],
            ['A PIN starts the job', 'The work cannot begin until you read out the code in your app.'],
            ['You approve, they get paid', 'Or it releases on its own six hours after the job is marked done.'],
          ].map(([t, d], i)=>(
            <View key={t} style={s.step}>
              <Text style={s.stepNo}>{i+1}</Text>
              <View style={{flex:1}}>
                <Text style={s.stepTitle}>{t}</Text>
                <Text style={s.stepTxt}>{d}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={s.sect}>
        <Text style={s.sectTitle}>What Poji covers</Text>
        <View style={s.cats}>
          {cats.map(c=>(
            <View key={c.id} style={s.cat}>
              <Text style={s.catIcon}>{c.icon}</Text>
              <View style={{flex:1}}>
                <Text style={s.catName}>{c.name}</Text>
                <Text style={s.catDesc}>{c.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={s.sect}>
        <Text style={s.sectTitle}>The money, plainly</Text>
        <View style={s.money}>
          {[
            ['Nothing is added for VAT at the end',
             "A provider's price already contains whatever VAT they owe, and they account for it themselves."],
            ['The commission comes off the provider, not you',
             'Which is why the figure you compare is the figure you are charged.'],
            ['Hourly work is billed on time actually worked',
             'Rounded up to the next quarter hour, never the next hour.'],
            ['Card only, nothing before the work',
             'So there is a record of every job on both sides.'],
          ].map(([t,d])=>(
            <View key={t} style={s.moneyRow}>
              <Text style={s.moneyTitle}>{t}</Text>
              <Text style={s.moneyTxt}>{d}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.newBox}>
        <Text style={s.newTitle}>Poji is new in Malta</Text>
        <Text style={s.newTxt}>
          We're opening with a small number of providers rather than claiming a
          directory we don't have. Everyone listed has been checked by a person,
          and each trade is approved on its own.
        </Text>
      </View>

      <View style={s.foot}>
        <TouchableOpacity onPress={()=>router.push('/legal?doc=terms')}>
          <Text style={s.footLink}>Terms of Service</Text>
        </TouchableOpacity>
        <Text style={s.footDot}>·</Text>
        <TouchableOpacity onPress={()=>router.push('/legal?doc=privacy')}>
          <Text style={s.footLink}>Privacy Notice</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.footNote}>Poji · Malta and Gozo</Text>

      <View style={{height:30}}/>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  body:{paddingHorizontal:20,paddingTop:56,paddingBottom:20,gap:22,
    maxWidth:760,width:'100%',alignSelf:'center'},

  hero:{alignItems:'center',gap:9},
  brand:{fontSize:34,fontWeight:'800',color:C.dark,marginTop:10},
  tag:{fontSize:14,color:C.muted,fontWeight:'600'},
  lede:{fontSize:16,color:C.text,textAlign:'center',lineHeight:24,marginTop:6,
    maxWidth:420},

  doors:{gap:14},
  doorsWide:{flexDirection:'row'},
  door:{flex:1,backgroundColor:C.white,borderRadius:20,padding:20,gap:9,
    borderWidth:2,...S.sm},
  doorClient:{borderColor:C.primary},
  doorPro:{borderColor:C.green},
  doorIcon:{fontSize:30},
  doorTitle:{fontSize:19,fontWeight:'800',color:C.dark},
  doorTxt:{fontSize:14,color:C.muted,lineHeight:21},
  doorBtn:{backgroundColor:C.primary,borderRadius:14,paddingVertical:14,
    alignItems:'center',marginTop:6},
  doorBtnPro:{backgroundColor:C.green},
  doorBtnTxt:{color:C.white,fontSize:15,fontWeight:'700'},

  loginRow:{alignItems:'center',paddingVertical:2},
  loginTxt:{fontSize:14,color:C.muted},
  loginLink:{color:C.primary,fontWeight:'800'},

  sect:{gap:12},
  sectTitle:{fontSize:12,fontWeight:'800',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.7},

  steps:{gap:2},
  step:{flexDirection:'row',gap:14,paddingVertical:12,borderBottomWidth:1,
    borderBottomColor:C.border},
  stepNo:{fontSize:13,fontWeight:'800',color:C.primary,width:16,paddingTop:2},
  stepTitle:{fontSize:15,fontWeight:'700',color:C.dark},
  stepTxt:{fontSize:13,color:C.muted,lineHeight:19,marginTop:3},

  cats:{gap:8},
  cat:{flexDirection:'row',gap:12,alignItems:'center',backgroundColor:C.white,
    borderRadius:14,padding:13,borderWidth:1,borderColor:C.border},
  catIcon:{fontSize:20},
  catName:{fontSize:14,fontWeight:'700',color:C.dark},
  catDesc:{fontSize:12,color:C.muted,marginTop:2,lineHeight:17},

  money:{gap:14},
  moneyRow:{gap:3},
  moneyTitle:{fontSize:14,fontWeight:'700',color:C.text},
  moneyTxt:{fontSize:13,color:C.muted,lineHeight:19},

  newBox:{backgroundColor:C.primaryLt,borderRadius:16,padding:16,gap:6,
    borderWidth:1,borderColor:C.border},
  newTitle:{fontSize:15,fontWeight:'800',color:C.primary},
  newTxt:{fontSize:13,color:C.text,lineHeight:19},

  foot:{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:10,
    marginTop:4},
  footLink:{fontSize:13,color:C.primary,fontWeight:'600'},
  footDot:{color:C.muted},
  footNote:{fontSize:12,color:C.muted,textAlign:'center'},
});
