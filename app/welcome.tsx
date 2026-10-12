import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions,
  Platform, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { routeHome } from '../lib/route-home';
import { CATEGORIES, TRADES, useTrades } from '../constants/trades';
import Logo from '../components/Logo';

/** What a share link points at, wherever the page happens to be running. */
const SITE = 'https://po-ji.com';

/**
 * The front door.
 *
 * It used to be the login form, which asks someone to commit before it has
 * told them anything. The two routes in are genuinely different products —
 * one person wants a job done, the other wants work — so they get their own
 * card rather than a single button and a role picker further down.
 *
 * The illustration on the right is the app itself rather than a stock
 * photograph of somebody smiling at a mop. Showing the real booking screen
 * explains the product and can't be accused of being somebody else's
 * kitchen.
 */
export default function Welcome() {
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const mid  = width >= 700;
  const { categories, trades } = useTrades();
  const [copied, setCopied] = useState(false);
  const [openCat, setOpenCat] = useState<string|null>(null);

  /* Somebody already signed in has no use for a pitch. */
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) routeHome();
    })();
  }, []);

  const go = (role: 'client' | 'cleaner') =>
    router.push(`/auth?mode=register&role=${role}`);

  const cats    = (categories?.length ? categories : CATEGORIES);
  const allT    = (trades?.length ? trades : TRADES);
  const liveNow = allT.filter((t:any) => t.live).length;

  const shareText =
    `Poji — trades and services across Malta and Gozo. One agreed price, `
    + `nothing added at the end. ${SITE}`;

  const shareWhatsApp = () =>
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(shareText)}`)
      .catch(()=>{});

  const copyLink = async () => {
    try {
      if (Platform.OS === 'web' && (navigator as any)?.clipboard) {
        await (navigator as any).clipboard.writeText(SITE);
        setCopied(true);
        setTimeout(()=>setCopied(false), 2500);
        return;
      }
    } catch (e) { /* the address is on screen either way */ }
    setCopied(true);
    setTimeout(()=>setCopied(false), 2500);
  };

  /* ── the two routes in ── */
  const Doors = (
    <View style={[s.doors, mid && s.doorsRow]}>
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
  );

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.scroll}
      showsVerticalScrollIndicator={false}>

      <View style={[s.top, wide && s.topWide]}>

        {/* ── left: the pitch ── */}
        <View style={[s.left, wide && {flex:1.15}]}>
          <View style={[s.hero, wide && s.heroLeft]}>
            <Logo size={58} />
            <Text style={s.brand}>Poji</Text>
            <Text style={s.tag}>Trades and services across Malta and Gozo</Text>
            <Text style={[s.lede, wide && {textAlign:'left'}]}>
              One agreed price, nothing added at the end, and nobody is paid
              until the work is done.
            </Text>

            <View style={[s.figures, wide && {justifyContent:'flex-start'}]}>
              <View style={s.figure}>
                <Text style={s.figureNo}>{allT.length}</Text>
                <Text style={s.figureLbl}>trades</Text>
              </View>
              <View style={s.figureLine}/>
              <View style={s.figure}>
                <Text style={s.figureNo}>{liveNow}</Text>
                <Text style={s.figureLbl}>bookable today</Text>
              </View>
              <View style={s.figureLine}/>
              <View style={s.figure}>
                <Text style={s.figureNo}>0%</Text>
                <Text style={s.figureLbl}>added to the price</Text>
              </View>
            </View>
          </View>

          {Doors}

          <TouchableOpacity style={s.loginRow}
            onPress={()=>router.push('/auth?mode=login')}>
            <Text style={s.loginTxt}>
              Already have an account?  <Text style={s.loginLink}>Log in</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── right: the app itself ── */}
        {wide && (
          <View style={s.right}>
            <Phone />
            <Receipt />
          </View>
        )}
      </View>

      {/* on narrow screens the illustration comes after the choice */}
      {!wide && (
        <View style={s.midShow}>
          <Phone />
          <Receipt />
        </View>
      )}

      <View style={s.sect}>
        <Text style={s.sectTitle}>How it works</Text>
        <View style={[s.steps, mid && s.stepsGrid]}>
          {[
            ['Say what you need', 'A few questions that actually change the price — how many square metres, which floor, how many guests.'],
            ['See real totals', 'Every provider sets their own prices. You compare the figure for your job, side by side.'],
            ['A PIN starts the job', 'The work cannot begin until you read out the code in your app.'],
            ['You approve, they get paid', 'Or it releases on its own six hours after the job is marked done.'],
          ].map(([t, d], i)=>(
            <View key={t} style={[s.step, mid && s.stepCard]}>
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
        <Text style={s.sectHint}>Tap a category to see what's under it.</Text>
        <View style={s.tiles}>
          {cats.map((c:any)=>{
            const mine = allT.filter((t:any)=>t.category === c.id);
            const open = openCat === c.id;
            const tone = c.colour || C.primary;
            return (
              <TouchableOpacity
                key={c.id}
                activeOpacity={0.85}
                onPress={()=>setOpenCat(open ? null : c.id)}
                style={[s.tile, {borderColor: open ? tone : C.border},
                        open && s.tileOpen]}>
                <Text style={s.tileIcon}>{c.icon}</Text>
                <Text style={s.tileName}>{c.name}</Text>
                <Text style={s.tileDesc}>{c.desc}</Text>

                {mine.length > 0 && (
                  <View style={s.tileFoot}>
                    <Text style={[s.tileCount,{color:tone}]}>
                      {mine.length} trade{mine.length===1?'':'s'}
                    </Text>
                    <Text style={[s.tileChev,{color:tone}]}>{open ? '▲' : '▼'}</Text>
                  </View>
                )}

                {open && (
                  <View style={s.chips}>
                    {mine.map((t:any)=>(
                      <View key={t.id}
                        style={[s.chip, t.live && {borderColor:tone,
                                                   backgroundColor:C.white}]}>
                        <Text style={s.chipTxt}>{t.icon}  {t.name}</Text>
                        {t.live && <View style={[s.chipDot,{backgroundColor:tone}]}/>}
                      </View>
                    ))}
                    <Text style={s.chipNote}>
                      A dot means you can book it today. The rest are listed and
                      waiting on a provider in your area.
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={s.sect}>
        <Text style={s.sectTitle}>The money, plainly</Text>
        <View style={[s.money, mid && s.moneyGrid]}>
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
            <View key={t} style={[s.moneyRow, mid && s.moneyCard]}>
              <Text style={s.moneyTitle}>{t}</Text>
              <Text style={s.moneyTxt}>{d}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── pass it on ── */}
      <View style={s.share}>
        <Text style={s.shareIcon}>📣</Text>
        <Text style={s.shareTitle}>Know somebody who should be on here?</Text>
        <Text style={s.shareTxt}>
          A plumber who answers the phone, a cleaner who turns up — Poji is only
          as good as the people on it. Send them the link.
        </Text>
        <View style={s.shareBtns}>
          <TouchableOpacity style={s.waBtn} onPress={shareWhatsApp}>
            <Text style={s.waBtnTxt}>Send on WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.copyBtn} onPress={copyLink}>
            <Text style={s.copyBtnTxt}>{copied ? '✓  Copied' : 'Copy link'}</Text>
          </TouchableOpacity>
        </View>
        <Text selectable style={s.shareUrl}>po-ji.com</Text>
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

      <View style={{height:34}}/>
    </ScrollView>
  );
}

/* ──────────────────────────────────────────────────────────────────
   The booking screen, drawn small. Same numbers the app would show:
   a provider's own rate, and a total that belongs to them rather than
   to the platform.
   ────────────────────────────────────────────────────────────────── */
function Phone() {
  return (
    <View style={s.phone}>
      <View style={s.notch}/>
      <View style={s.screen}>
        <View style={s.pHead}>
          <Text style={s.pBack}>←</Text>
          <Text style={s.pTitle}>Book a service</Text>
          <Text style={s.pStep}>2/5</Text>
        </View>

        <View style={s.pDots}>
          {['Service','Provider','Details','When','Confirm'].map((d,i)=>(
            <View key={d} style={s.pDotWrap}>
              <View style={[s.pDot, i<=1 && s.pDotOn]}>
                <Text style={[s.pDotTxt, i<=1 && s.pDotTxtOn]}>
                  {i===0 ? '✓' : i+1}
                </Text>
              </View>
              <Text style={[s.pDotLbl, i===1 && s.pDotLblOn]}>{d}</Text>
            </View>
          ))}
        </View>

        <Text style={s.pLbl}>CHOOSE YOUR PROVIDER</Text>
        <Text style={s.pHint}>Each provider sets their own price.</Text>

        {[
          { n:'Marija', r:'€22/hr', t:'€69', h:'3h', on:true },
          { n:'Carmelo', r:'€25/hr', t:'€77', h:'3h', on:false },
        ].map(p=>(
          <View key={p.n} style={[s.pCard, p.on && s.pCardOn]}>
            <View style={[s.pAvatar, p.on && {backgroundColor:C.primary}]}>
              <Text style={s.pAvatarTxt}>{p.n[0]}</Text>
            </View>
            <View style={{flex:1}}>
              <Text style={s.pName}>{p.n}</Text>
              <Text style={s.pMeta}>⭐ 5.0 · {p.r}</Text>
            </View>
            <View style={{alignItems:'flex-end'}}>
              <Text style={[s.pTotal, p.on && {color:C.primary}]}>{p.t}</Text>
              <Text style={s.pHours}>{p.h}</Text>
            </View>
          </View>
        ))}

        <View style={s.pFoot}>
          <View>
            <Text style={s.pFootLbl}>From</Text>
            <Text style={s.pFootVal}>€69.00</Text>
          </View>
          <View style={s.pFootBtn}>
            <Text style={s.pFootBtnTxt}>Continue →</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/* The whole bill, including the part most platforms keep quiet about. */
function Receipt() {
  return (
    <View style={s.receipt}>
      <Text style={s.rTitle}>Three hours of cleaning</Text>
      {[
        ['Cleaning, 3 hours at €23.00', '€69.00'],
        ['VAT added by Poji', '€0.00'],
        ['Card fee', '€2.30'],
      ].map(([l,v])=>(
        <View key={l} style={s.rRow}>
          <Text style={s.rLbl}>{l}</Text>
          <Text style={s.rVal}>{v}</Text>
        </View>
      ))}
      <View style={s.rTot}>
        <Text style={s.rTotLbl}>You pay</Text>
        <Text style={s.rTotVal}>€71.30</Text>
      </View>
      <View style={s.rSplit}>
        <Text style={s.rSplitCap}>OF WHICH</Text>
        <View style={s.rRow}>
          <Text style={s.rLbl}>Goes to your cleaner</Text>
          <Text style={[s.rVal,{color:C.green,fontWeight:'800'}]}>€55.20</Text>
        </View>
        <View style={s.rRow}>
          <Text style={s.rLbl}>Poji's commission</Text>
          <Text style={s.rVal}>€13.80</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  scroll:{paddingHorizontal:20,paddingTop:48,paddingBottom:20,gap:26,
    maxWidth:1080,width:'100%',alignSelf:'center'},

  top:{gap:22},
  topWide:{flexDirection:'row',gap:40,alignItems:'flex-start'},
  left:{gap:20},
  right:{flex:0.85,gap:16,alignItems:'center'},
  midShow:{gap:16,alignItems:'center'},

  hero:{alignItems:'center',gap:8},
  heroLeft:{alignItems:'flex-start'},
  brand:{fontSize:34,fontWeight:'800',color:C.dark,marginTop:8},
  tag:{fontSize:14,color:C.muted,fontWeight:'600'},
  lede:{fontSize:16,color:C.text,textAlign:'center',lineHeight:24,marginTop:4,
    maxWidth:430},

  figures:{flexDirection:'row',alignItems:'center',gap:16,marginTop:14,
    justifyContent:'center',flexWrap:'wrap'},
  figure:{alignItems:'center'},
  figureNo:{fontSize:22,fontWeight:'800',color:C.primary},
  figureLbl:{fontSize:11,color:C.muted,marginTop:1},
  figureLine:{width:1,height:26,backgroundColor:C.border},

  doors:{gap:14},
  doorsRow:{flexDirection:'row'},
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

  /* phone */
  phone:{width:286,backgroundColor:C.dark,borderRadius:34,padding:9,
    paddingTop:14,...S.md},
  notch:{width:84,height:5,borderRadius:3,backgroundColor:'#3B3870',
    alignSelf:'center',marginBottom:9},
  screen:{backgroundColor:C.bg,borderRadius:26,padding:12,gap:9},
  pHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  pBack:{fontSize:13,color:C.primary,fontWeight:'700'},
  pTitle:{fontSize:13,fontWeight:'800',color:C.dark},
  pStep:{fontSize:11,color:C.muted},
  pDots:{flexDirection:'row',justifyContent:'space-between'},
  pDotWrap:{alignItems:'center',gap:3,flex:1},
  pDot:{width:19,height:19,borderRadius:10,backgroundColor:C.bgAlt,
    alignItems:'center',justifyContent:'center'},
  pDotOn:{backgroundColor:C.primary},
  pDotTxt:{fontSize:9,fontWeight:'800',color:C.muted},
  pDotTxtOn:{color:C.white},
  pDotLbl:{fontSize:7,color:C.muted},
  pDotLblOn:{color:C.primary,fontWeight:'700'},
  pLbl:{fontSize:9,fontWeight:'800',color:C.muted,letterSpacing:0.6,marginTop:3},
  pHint:{fontSize:10,color:C.muted,marginTop:-4,lineHeight:14},
  pCard:{flexDirection:'row',alignItems:'center',gap:9,backgroundColor:C.white,
    borderRadius:12,padding:9,borderWidth:1.5,borderColor:C.border},
  pCardOn:{borderColor:C.primary},
  pAvatar:{width:28,height:28,borderRadius:14,backgroundColor:C.muted,
    alignItems:'center',justifyContent:'center'},
  pAvatarTxt:{color:C.white,fontSize:12,fontWeight:'800'},
  pName:{fontSize:12,fontWeight:'700',color:C.dark},
  pMeta:{fontSize:9,color:C.muted,marginTop:1},
  pTotal:{fontSize:14,fontWeight:'800',color:C.dark},
  pHours:{fontSize:9,color:C.muted},
  pFoot:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
    backgroundColor:C.white,borderRadius:12,padding:10,marginTop:3,
    borderWidth:1,borderColor:C.border},
  pFootLbl:{fontSize:9,color:C.muted},
  pFootVal:{fontSize:15,fontWeight:'800',color:C.dark},
  pFootBtn:{backgroundColor:C.primary,borderRadius:10,paddingHorizontal:13,
    paddingVertical:8},
  pFootBtnTxt:{color:C.white,fontSize:11,fontWeight:'700'},

  /* receipt */
  receipt:{width:286,backgroundColor:C.white,borderRadius:16,padding:15,gap:5,
    borderWidth:1,borderColor:C.border,...S.sm},
  rTitle:{fontSize:12,fontWeight:'800',color:C.dark,marginBottom:4},
  rRow:{flexDirection:'row',justifyContent:'space-between',gap:10},
  rLbl:{fontSize:11,color:C.muted,flex:1},
  rVal:{fontSize:11,color:C.text,fontWeight:'600'},
  rTot:{flexDirection:'row',justifyContent:'space-between',borderTopWidth:1,
    borderTopColor:C.border,marginTop:6,paddingTop:7},
  rTotLbl:{fontSize:13,fontWeight:'800',color:C.dark},
  rTotVal:{fontSize:15,fontWeight:'800',color:C.dark},
  rSplit:{borderTopWidth:1,borderTopColor:C.border,borderStyle:'dashed',
    marginTop:7,paddingTop:8,gap:4},
  rSplitCap:{fontSize:8,fontWeight:'800',color:C.muted,letterSpacing:0.8},

  sect:{gap:12},
  sectTitle:{fontSize:12,fontWeight:'800',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.7},
  sectHint:{fontSize:13,color:C.muted,marginTop:-6},

  steps:{gap:2},
  stepsGrid:{flexDirection:'row',flexWrap:'wrap',gap:12},
  step:{flexDirection:'row',gap:14,paddingVertical:12,borderBottomWidth:1,
    borderBottomColor:C.border},
  stepCard:{flexBasis:'47%',flexGrow:1,backgroundColor:C.white,borderRadius:14,
    padding:14,borderBottomWidth:0,borderWidth:1,borderColor:C.border},
  stepNo:{fontSize:13,fontWeight:'800',color:C.primary,width:16,paddingTop:2},
  stepTitle:{fontSize:15,fontWeight:'700',color:C.dark},
  stepTxt:{fontSize:13,color:C.muted,lineHeight:19,marginTop:3},

  /* flex-start, or an open tile would stretch its neighbours to match */
  tiles:{flexDirection:'row',flexWrap:'wrap',gap:12,alignItems:'flex-start'},
  tile:{flexBasis:'47%',flexGrow:1,minWidth:150,backgroundColor:C.white,
    borderRadius:16,padding:15,gap:4,borderWidth:1.5,...S.sm},
  tileOpen:{flexBasis:'100%'},
  tileIcon:{fontSize:26},
  tileName:{fontSize:14,fontWeight:'800',color:C.dark,marginTop:2},
  tileDesc:{fontSize:12,color:C.muted,lineHeight:17},
  tileFoot:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
    marginTop:3},
  tileCount:{fontSize:11,fontWeight:'800'},
  tileChev:{fontSize:9,fontWeight:'800'},

  chips:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:10,
    borderTopWidth:1,borderTopColor:C.border,paddingTop:12},
  chip:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:C.bg,
    borderRadius:20,paddingHorizontal:11,paddingVertical:7,borderWidth:1.5,
    borderColor:C.border},
  chipTxt:{fontSize:12,fontWeight:'600',color:C.text},
  chipDot:{width:6,height:6,borderRadius:3},
  chipNote:{flexBasis:'100%',fontSize:11,color:C.muted,lineHeight:16,marginTop:4},

  money:{gap:14},
  moneyGrid:{flexDirection:'row',flexWrap:'wrap',gap:12},
  moneyRow:{gap:3},
  moneyCard:{flexBasis:'47%',flexGrow:1,backgroundColor:C.white,borderRadius:14,
    padding:14,borderWidth:1,borderColor:C.border},
  moneyTitle:{fontSize:14,fontWeight:'700',color:C.text},
  moneyTxt:{fontSize:13,color:C.muted,lineHeight:19},

  share:{backgroundColor:C.dark,borderRadius:20,padding:22,gap:9,
    alignItems:'center'},
  shareIcon:{fontSize:30},
  shareTitle:{fontSize:18,fontWeight:'800',color:C.white,textAlign:'center'},
  shareTxt:{fontSize:14,color:'#C7D2FE',textAlign:'center',lineHeight:21,
    maxWidth:440},
  shareBtns:{flexDirection:'row',gap:10,marginTop:6,flexWrap:'wrap',
    justifyContent:'center'},
  waBtn:{backgroundColor:C.green,borderRadius:13,paddingVertical:13,
    paddingHorizontal:20},
  waBtnTxt:{color:C.white,fontSize:14,fontWeight:'700'},
  copyBtn:{borderWidth:1.5,borderColor:'#4F46E5',borderRadius:13,
    paddingVertical:13,paddingHorizontal:20,backgroundColor:'#1E1B4B'},
  copyBtnTxt:{color:'#C7D2FE',fontSize:14,fontWeight:'700'},
  shareUrl:{fontSize:13,color:'#A5B4FC',marginTop:4,fontWeight:'600'},

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
