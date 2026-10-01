import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { C, S } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { findTrade } from '../../constants/trades';
import Avatar from '../../components/Avatar';

const REVIEWS = [
  {author:'Sarah K.',rating:5,text:'Absolutely brilliant — punctual, thorough, left everything spotless!',date:'2 days ago'},
  {author:'Tom R.',  rating:5,text:'Second booking, just as good. Very professional.',                  date:'1 week ago'},
  {author:'Lisa M.', rating:4,text:'Great job overall. Communicated well when running slightly late.',   date:'2 weeks ago'},
];

export default function CleanerProfile() {
  const { id, trade } = useLocalSearchParams<{id:string; trade?:string}>();
  const { cleaners } = useApp();
  const c = cleaners.find(x=>x.id===id) || cleaners[0];
  if (!c) return null;

  return (
    <ScrollView style={s.wrap} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={s.back} onPress={()=>router.back()}>
        <Text style={s.backTxt}>← Back</Text>
      </TouchableOpacity>
      <View style={s.hero}>
        <View style={s.avatarShadow}>
          <Avatar photoUrl={(c as any).photoUrl} initials={c.initials} color={c.color} size={104} />
        </View>
        <Text style={s.name}>{c.name}</Text>
        <View style={s.ratingRow}>
          <Text style={s.rating}>⭐ {c.rating}</Text>
          <Text style={s.reviews}>({c.reviews} reviews)</Text>
          <Text style={s.dot}>·</Text>
          <Text style={s.completion}>{c.completionRate}% completion</Text>
        </View>
        <View style={s.badgeRow}>
          {c.verified && <View style={s.verBadge}><Text style={s.verTxt}>✓ ID verified</Text></View>}
          {(c as any).insured && <View style={s.insBadge}><Text style={s.insTxt}>🛡 Insured</Text></View>}
        </View>
        <View style={s.availRow}>
          <View style={[s.availDot,{backgroundColor:c.available?C.green:C.amber}]}/>
          <Text style={[s.availTxt,{color:c.available?C.green:C.amber}]}>
            {c.available?'Available for booking':'Currently busy'}
          </Text>
        </View>
      </View>
      <View style={s.body}>
        <View style={s.rateCard}>
          <Text style={s.rateLbl}>Hourly Rate</Text>
          <Text style={s.rateVal}>€{c.rate}/hour</Text>
          <Text style={s.rateNote}>VAT agency model — zero platform VAT on commission</Text>
        </View>
        <View style={s.badges}>
          {c.badges.map(b=><View key={b} style={s.badge}><Text style={s.badgeTxt}>{b}</Text></View>)}
        </View>
        <Text style={s.sectionTitle}>About</Text>
        <Text style={s.bio}>{c.bio}</Text>
        {((c as any).categories || []).length > 0 && (
          <>
            <Text style={s.sectionTitle}>Trades</Text>
            <View style={s.tradeWrap}>
              {((c as any).categories || []).map((id:string)=>{
                const t = findTrade(id);
                return (
                  <View key={id} style={s.tradePill}>
                    <Text style={s.tradePillTxt}>{t?.icon || '•'}  {t?.name || id}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <Text style={s.sectionTitle}>Specialties</Text>
        <View style={s.specialties}>
          {c.specialties.map(x=><View key={x} style={s.specialty}><Text style={s.specialtyTxt}>✓ {x}</Text></View>)}
        </View>
        <Text style={s.sectionTitle}>Team</Text>
        <View style={s.teamCard}>
          <Text style={s.teamIcon}>{((c as any).teamSize ?? 1) > 1 ? '👥' : '👤'}</Text>
          <View style={{flex:1}}>
            <Text style={s.teamTitle}>
              {(c as any).teamType === 'company' ? 'Cleaning company'
                : (c as any).teamType === 'duo' ? 'Works as a pair'
                : 'Solo cleaner'}
            </Text>
            <Text style={s.teamSub}>
              Can send up to {(c as any).teamSize ?? 1} cleaner{((c as any).teamSize ?? 1) > 1 ? 's' : ''} per job
              {(c as any).minHours ? ` · ${(c as any).minHours}h minimum` : ''}
            </Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Service Areas</Text>
        <Text style={s.areas}>{c.areas.join(' · ')}</Text>
        <Text style={s.sectionTitle}>Recent Reviews</Text>
        {REVIEWS.map(r=>(
          <View key={r.author} style={s.reviewCard}>
            <View style={s.reviewHdr}>
              <Text style={s.reviewAuthor}>{r.author}</Text>
              <Text style={{fontSize:12}}>{'⭐'.repeat(r.rating)}</Text>
              <Text style={s.reviewDate}>{r.date}</Text>
            </View>
            <Text style={s.reviewTxt}>{r.text}</Text>
          </View>
        ))}
      </View>
      <View style={s.footer}>
        <View>
          <Text style={s.footerLbl}>Starting from</Text>
          <Text style={s.footerRate}>€{c.rate}/hr</Text>
        </View>
        <TouchableOpacity
          style={[s.bookBtn, !c.available&&s.bookBtnDis]}
          onPress={()=>c.available&&router.push(`/booking?cleanerId=${c.id}&cleanerName=${encodeURIComponent(c.name)}${trade?`&trade=${trade}`:''}`)}
        >
          <Text style={s.bookBtnTxt}>
            {c.available?`Book ${c.name.split(' ')[0]}  →`:'Currently Unavailable'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  back:{paddingHorizontal:20,paddingTop:60,paddingBottom:8},
  backTxt:{fontSize:16,color:C.primary,fontWeight:'600'},
  hero:{alignItems:'center',paddingVertical:24,backgroundColor:C.white,borderBottomWidth:1,borderBottomColor:C.border},
  avatar:{width:100,height:100,borderRadius:50,alignItems:'center',justifyContent:'center',marginBottom:14,...S.sm},
  initials:{fontSize:34,fontWeight:'800'},
  name:{fontSize:26,fontWeight:'800',color:C.dark,marginBottom:8},
  ratingRow:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:12},
  rating:{fontSize:15,fontWeight:'700'},
  reviews:{fontSize:13,color:C.muted},
  dot:{color:C.muted},
  completion:{fontSize:13,color:C.green,fontWeight:'600'},
  avatarShadow:{marginBottom:14,borderRadius:52,...S.sm},
  badgeRow:{flexDirection:'row',gap:8,marginBottom:10,flexWrap:'wrap',justifyContent:'center'},
  insBadge:{backgroundColor:C.primaryLt,paddingHorizontal:12,paddingVertical:6,borderRadius:20},
  insTxt:{fontSize:12,color:C.primary,fontWeight:'700'},
  verBadge:{backgroundColor:C.greenLt,paddingHorizontal:14,paddingVertical:6,borderRadius:20,marginBottom:10},
  verTxt:{fontSize:13,color:C.green,fontWeight:'700'},
  availRow:{flexDirection:'row',alignItems:'center',gap:8},
  availDot:{width:8,height:8,borderRadius:4},
  availTxt:{fontSize:13,fontWeight:'600'},
  body:{padding:20},
  rateCard:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',backgroundColor:C.primaryLt,borderRadius:16,padding:16,marginBottom:16,borderWidth:1,borderColor:C.border,gap:10},
  rateLbl:{fontSize:13,color:C.muted,fontWeight:'600'},
  rateVal:{fontSize:24,fontWeight:'800',color:C.primary,flex:1},
  rateNote:{fontSize:11,color:C.muted,width:'100%'},
  badges:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:20},
  badge:{backgroundColor:C.dark,paddingHorizontal:12,paddingVertical:6,borderRadius:20},
  badgeTxt:{fontSize:12,color:C.white,fontWeight:'600'},
  sectionTitle:{fontSize:16,fontWeight:'700',color:C.dark,marginBottom:10,marginTop:6},
  bio:{fontSize:14,color:C.text,lineHeight:23,marginBottom:16},
  tradeWrap:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:16},
  tradePill:{backgroundColor:C.primaryLt,paddingHorizontal:12,paddingVertical:7,borderRadius:20,borderWidth:1,borderColor:C.border},
  tradePillTxt:{fontSize:12,color:C.primary,fontWeight:'700'},
  specialties:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:16},
  specialty:{backgroundColor:C.greenLt,paddingHorizontal:12,paddingVertical:6,borderRadius:20},
  specialtyTxt:{fontSize:12,color:C.green,fontWeight:'600'},
  teamCard:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:C.bgAlt,borderRadius:14,padding:14,marginBottom:16,borderWidth:1,borderColor:C.border},
  teamIcon:{fontSize:26},
  teamTitle:{fontSize:14,fontWeight:'700',color:C.dark},
  teamSub:{fontSize:12,color:C.muted,marginTop:3,lineHeight:17},
  areas:{fontSize:14,color:C.text,marginBottom:16,lineHeight:22},
  reviewCard:{backgroundColor:C.white,borderRadius:14,padding:14,marginBottom:10,...S.sm,borderWidth:1,borderColor:C.border},
  reviewHdr:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8},
  reviewAuthor:{fontSize:13,fontWeight:'700',color:C.dark,flex:1},
  reviewDate:{fontSize:11,color:C.muted},
  reviewTxt:{fontSize:13,color:C.text,lineHeight:21},
  footer:{flexDirection:'row',alignItems:'center',padding:20,backgroundColor:C.white,borderTopWidth:1,borderTopColor:C.border,gap:16},
  footerLbl:{fontSize:11,color:C.muted},
  footerRate:{fontSize:20,fontWeight:'800',color:C.dark},
  bookBtn:{flex:1,backgroundColor:C.primary,borderRadius:14,paddingVertical:16,alignItems:'center',...S.md},
  bookBtnDis:{backgroundColor:C.muted},
  bookBtnTxt:{color:C.white,fontSize:16,fontWeight:'700'},
});
