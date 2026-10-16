import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { C, S } from '../../constants/theme';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import PushSettings from '../../components/PushSettings';
import { useState, useEffect } from 'react';

export default function Profile() {
  const { bookings, userName, userRole } = useApp();
  const [addr, setAddr]         = useState('');
  const [locality, setLocality] = useState('');
  const [phone, setPhone]       = useState('');
  const [editAddr, setEdit]     = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  /* Whether there is a client record to edit at all. A provider who has
     booked something has one, and until now the address block was
     hidden from them because it keyed off the account's role — so their
     saved address existed and they could neither see nor change it. */
  const [hasClientRow, setHasRow] = useState(false);
  /* Which account this is. Neither profile screen said which email
     somebody signed up with. */
  const [authEmail, setAuthEmail] = useState('');

  useEffect(() => {
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) return;
      setAuthEmail(user.email || '');
      const { data } = await supabase.from('client_profiles')
        .select('default_address, default_locality, phone').eq('id', user.id).maybeSingle();
      if (data) {
        setHasRow(true);
        setAddr(data.default_address || '');
        setLocality(data.default_locality || '');
        setPhone(data.phone || '');
      }
    })();
  }, []);

  const saveAddress = async () => {
    setSaving(true);
    const { data:{ user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('client_profiles')
        .update({ default_address: addr, default_locality: locality, phone })
        .eq('id', user.id);
    }
    setSaving(false); setEdit(false); setSaved(true);
    setTimeout(()=>setSaved(false), 2500);
  };
  /* Only the bookings this person is the client of.
   *
   * A provider is allowed to book services too, and their own jobs were
   * being counted here: the figure under "Spent" was the money other
   * people had paid THEM, labelled as money they had spent. Which side
   * of a booking somebody is on belongs to the booking, not the
   * account, and every screen now reads it off the row. */
  const mine      = bookings.filter(b => b.side !== 'provider');
  const completed = mine.filter(b=>b.status==='completed').length;
  const totalSpent= mine.filter(b=>b.status==='completed').reduce((s,b)=>s+b.total,0);

  const handleSignOut = async () => {
    try { await supabase.auth.signOut({ scope: 'local' }); } catch(e) {}
    router.replace('/auth');
  };

  return (
    <ScrollView style={s.wrap} showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <View style={s.avatarCircle}><Text style={{fontSize:44}}>👤</Text></View>
        <Text style={s.name}>{userName || 'My Account'}</Text>
        <View style={[s.roleBadge, userRole==='cleaner'&&s.roleBadgeCleaner]}>
          <Text style={[s.roleTxt, userRole==='cleaner'&&s.roleTxtCleaner]}>
            {userRole==='cleaner'?'🛠️ Provider':'🏠 Client'}
          </Text>
        </View>
        <View style={s.statsRow}>
          {[[String(mine.length),'Bookings'],[String(completed),'Completed'],[`€${totalSpent.toFixed(0)}`,'Spent']].map(([v,l])=>(
            <View key={l} style={s.stat}>
              <Text style={s.statVal}>{v}</Text>
              <Text style={s.statLbl}>{l}</Text>
            </View>
          ))}
        </View>
      </View>

      {(userRole === 'client' || hasClientRow) && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>My default address</Text>
          {editAddr ? (
            <View style={s.editBox}>
              <Text style={s.editLbl}>Address</Text>
              <TextInput style={s.editInput} value={addr} onChangeText={setAddr}
                placeholder="Flat 4, 12 Tower Road" placeholderTextColor={C.muted} />
              <Text style={s.editLbl}>Locality</Text>
              <TextInput style={s.editInput} value={locality} onChangeText={setLocality}
                placeholder="Sliema" placeholderTextColor={C.muted} />
              <Text style={s.editLbl}>Phone</Text>
              <TextInput style={s.editInput} value={phone} onChangeText={setPhone}
                placeholder="+356 7900 0000" placeholderTextColor={C.muted} keyboardType="phone-pad" />
              <View style={s.editRow}>
                <TouchableOpacity style={s.editCancel} onPress={()=>setEdit(false)}>
                  <Text style={s.editCancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.editSave, saving&&{opacity:0.6}]} disabled={saving}
                  onPress={saveAddress}>
                  {saving ? <ActivityIndicator color={C.white} size="small" />
                    : <Text style={s.editSaveTxt}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={s.addrView} onPress={()=>setEdit(true)}>
              <Text style={s.addrIcon}>🏠</Text>
              <View style={{flex:1}}>
                <Text style={s.addrLine}>{addr || 'No address saved yet'}</Text>
                {!!locality && <Text style={s.addrLocality}>{locality}</Text>}
                {!!phone && <Text style={s.addrPhone}>{phone}</Text>}
              </View>
              <Text style={s.editLink}>{saved ? '✓ Saved' : 'Edit'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Imported since the screen was written and never drawn, so a
          client had no way to change what Poji sends them - while the
          menu below claimed "Notifications: all enabled", which was a
          hardcoded label doing nothing and possibly saying something
          untrue. The label is gone; this is the real thing. */}
      <PushSettings role="client" />

      {[
        {title:'Account', items:[
          {icon:'📧',label:'Signed in as',sub: authEmail || '—'},
          /* A password cannot be shown anywhere: what is stored is a
             hash of it, not the password. Changing it is the offer. */
          {icon:'🔑',label:'Change password',sub:'You will be asked for your current one',
           go:'/set-password'},
          {icon:'💳',label:'Payment Methods',sub:'Cards & billing'},

          {icon:'🛡',label:'Privacy Notice',sub:'What we collect and why', go:'/legal?doc=privacy'},
          {icon:'📄',label:'Terms of Service',sub:'How Poji works',         go:'/legal?doc=terms'},
        ]},
        {title:'Support', items:[
          {icon:'💬',label:'Help & FAQ',sub:'Common questions'},
          {icon:'📧',label:'Contact Us',sub:'supportpoji@gmail.com'},
          {icon:'⭐',label:'Rate the App',sub:'Love Poji?'},
        ]},
      ].map(section=>(
        <View key={section.title} style={s.section}>
          <Text style={s.sectionTitle}>{section.title}</Text>
          {section.items.map((item,i)=>(
            <TouchableOpacity key={item.label} style={[s.menuItem, i>0&&s.menuBorder]}
              onPress={()=> (item as any).go ? router.push((item as any).go) : undefined}>
              <Text style={s.menuIcon}>{item.icon}</Text>
              <View style={{flex:1}}>
                <Text style={s.menuLabel}>{item.label}</Text>
                <Text style={s.menuSub}>{item.sub}</Text>
              </View>
              <Text style={s.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}

      {/* This box was wrong on every line. It said 18% VAT was collected
          and remitted, when nothing in the system adds VAT at all; it
          said the commission was 20%, which it no longer is; and it
          asserted a VAT liability of zero, which is not something an
          app screen should be claiming. It also contradicted the
          landing page, which says providers account for their own VAT.
          What it says now is what the code actually does. */}
      <View style={s.vatBox}>
        <Text style={s.vatTitle}>💡 How the money works</Text>
        <Text style={s.vatTxt}>
          Nothing is added for VAT at the end. A provider's price already contains
          whatever VAT they owe, and they account for it themselves.{'\n\n'}
          Poji takes 15% of the labour and 5% of materials from the provider, and
          charges you a 5% service fee. That fee and the card processing cost are
          already inside the price you are shown, so the figure you compare is the
          figure you are charged.
        </Text>
      </View>

      {userRole==='cleaner' && (
        <TouchableOpacity style={s.providerBtn} onPress={()=>router.replace('/provider')}>
          <Text style={s.providerTxt}>🛠️  Go to Provider Dashboard</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={s.signOut} onPress={handleSignOut}>
        <Text style={s.signOutTxt}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={s.version}>Poji v1.0.0 · Malta, EU</Text>
      <View style={{height:40}} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  header:{alignItems:'center',paddingTop:60,paddingBottom:24,backgroundColor:C.white,borderBottomWidth:1,borderBottomColor:C.border},
  avatarCircle:{width:86,height:86,borderRadius:43,backgroundColor:C.primaryLt,alignItems:'center',justifyContent:'center',marginBottom:12,...S.sm},
  name:{fontSize:22,fontWeight:'800',color:C.dark},
  roleBadge:{backgroundColor:C.bgAlt,paddingHorizontal:14,paddingVertical:5,borderRadius:20,marginTop:6,marginBottom:16,borderWidth:1,borderColor:C.border},
  roleBadgeCleaner:{backgroundColor:C.greenLt,borderColor:'#A7F3D0'},
  roleTxt:{fontSize:13,fontWeight:'700',color:C.muted},
  roleTxtCleaner:{color:C.green},
  statsRow:{flexDirection:'row',gap:36},
  stat:{alignItems:'center'},
  statVal:{fontSize:22,fontWeight:'800',color:C.primary},
  statLbl:{fontSize:11,color:C.muted,marginTop:3},
  section:{margin:20,marginBottom:0,backgroundColor:C.white,borderRadius:18,overflow:'hidden',...S.sm,borderWidth:1,borderColor:C.border},
  sectionTitle:{fontSize:11,fontWeight:'700',color:C.muted,paddingHorizontal:16,paddingTop:14,paddingBottom:4,textTransform:'uppercase',letterSpacing:0.8},
  menuItem:{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:14,gap:14},
  menuBorder:{borderTopWidth:1,borderTopColor:C.bg},
  menuIcon:{fontSize:20},
  menuLabel:{fontSize:15,fontWeight:'600',color:C.text},
  menuSub:{fontSize:12,color:C.muted,marginTop:2},
  chevron:{fontSize:22,color:C.border},
  editBox:{padding:16,gap:6},
  editLbl:{fontSize:11,fontWeight:'700',color:C.muted,textTransform:'uppercase',letterSpacing:0.5,marginTop:6},
  editInput:{backgroundColor:C.bg,borderRadius:12,paddingHorizontal:14,paddingVertical:12,fontSize:14,color:C.text,borderWidth:1.5,borderColor:C.border},
  editRow:{flexDirection:'row',gap:10,marginTop:12},
  editCancel:{flex:1,borderWidth:1.5,borderColor:C.border,borderRadius:12,paddingVertical:12,alignItems:'center'},
  editCancelTxt:{color:C.muted,fontWeight:'600',fontSize:14},
  editSave:{flex:1,backgroundColor:C.primary,borderRadius:12,paddingVertical:12,alignItems:'center'},
  editSaveTxt:{color:C.white,fontWeight:'700',fontSize:14},
  addrView:{flexDirection:'row',alignItems:'flex-start',gap:12,paddingHorizontal:16,paddingVertical:14,borderTopWidth:1,borderTopColor:C.bg},
  addrIcon:{fontSize:20},
  addrLine:{fontSize:14,fontWeight:'600',color:C.text},
  addrLocality:{fontSize:12,color:C.muted,marginTop:2},
  addrPhone:{fontSize:12,color:C.muted,marginTop:2},
  editLink:{fontSize:13,color:C.primary,fontWeight:'700'},
  vatBox:{margin:20,backgroundColor:C.primaryLt,borderRadius:16,padding:16,borderWidth:1,borderColor:C.border},
  vatTitle:{fontSize:13,fontWeight:'700',color:C.primary,marginBottom:8},
  vatTxt:{fontSize:12,color:C.text,lineHeight:19},
  providerBtn:{marginHorizontal:20,backgroundColor:C.primary,borderRadius:14,paddingVertical:16,alignItems:'center',marginTop:16},
  providerTxt:{color:C.white,fontWeight:'700',fontSize:15},
  signOut:{marginHorizontal:20,borderWidth:1.5,borderColor:C.red,borderRadius:14,paddingVertical:14,alignItems:'center',marginTop:12},
  signOutTxt:{color:C.red,fontWeight:'600',fontSize:15},
  version:{textAlign:'center',fontSize:12,color:C.muted,marginTop:12},
});

