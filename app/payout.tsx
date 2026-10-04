import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator
} from 'react-native';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { validateIban, formatIban } from '../constants/malta';
import Picker from '../components/Picker';

const BANKS = ['BOV','HSBC Malta','APS Bank','Lombard Bank','BNF Bank','Revolut','Wise','Other'];

/**
 * Asked only once a provider has money waiting.
 * Nobody hands over bank details before they've earned anything.
 */
export default function Payout() {
  const [f, setF] = useState({ account_holder:'', iban:'', bank_name:'', other_bank:'' });
  const [name, setName]   = useState('');
  const [owed, setOwed]   = useState(0);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const [done, setDone]   = useState(false);
  const [load, setLoad]   = useState(true);

  const set = (k:string, v:string) => { setF(p=>({...p,[k]:v})); setError(''); };

  useEffect(() => {
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/auth'); return; }

      const { data: prof } = await supabase.from('cleaner_profiles')
        .select('account_holder, iban, bank_name, first_name, last_name')
        .eq('id', user.id).maybeSingle();

      if (prof) {
        setName(`${prof.first_name || ''} ${prof.last_name || ''}`.trim());
        setF({
          account_holder: prof.account_holder || `${prof.first_name || ''} ${prof.last_name || ''}`.trim(),
          iban: prof.iban || '',
          bank_name: prof.bank_name || '',
          other_bank: BANKS.includes(prof.bank_name || '') ? '' : (prof.bank_name || ''),
        });
      }

      // what's waiting for them
      const { data: jobs } = await supabase.from('bookings')
        .select('final_cleaner_payment, cleaner_payment, total_price, status')
        .eq('cleaner_id', user.id)
        .in('status', ['completed','awaiting_confirmation']);

      const total = (jobs || []).reduce((sum:number, b:any) =>
        sum + Number(b.final_cleaner_payment ?? b.cleaner_payment ?? 0), 0);
      setOwed(total);

      setLoad(false);
    })();
  }, []);

  const bankLabel = f.bank_name === 'Other' || (!BANKS.includes(f.bank_name) && f.bank_name)
    ? 'Other' : f.bank_name;

  const save = async () => {
    const ib = validateIban(f.iban);
    if (!f.account_holder.trim()) { setError('Enter the account holder name'); return; }
    if (!ib.ok) { setError('IBAN — ' + ib.reason); return; }
    const bank = bankLabel === 'Other' ? f.other_bank.trim() : f.bank_name;
    if (!bank) { setError('Which bank?'); return; }

    setBusy(true);
    const { data:{ user } } = await supabase.auth.getUser();
    const { error: e } = await supabase.from('cleaner_profiles').update({
      account_holder: f.account_holder.trim(),
      iban: f.iban.replace(/\s+/g,'').toUpperCase(),
      bank_name: bank,
      signup_stage: 'paid',
      updated_at: new Date().toISOString(),
    }).eq('id', user!.id);

    setBusy(false);
    if (e) { setError(e.message); return; }
    setDone(true);
  };

  if (load) {
    return <View style={s.center}><ActivityIndicator color={C.primary} size="large" /></View>;
  }

  if (done) {
    return (
      <View style={s.center}>
        <Text style={s.doneIcon}>🏦</Text>
        <Text style={s.doneTitle}>Bank details saved</Text>
        <Text style={s.doneTxt}>
          {owed > 0
            ? `€${owed.toFixed(2)} will land in your account within three working days of each job being approved.`
            : 'You will be paid within three working days of each job being approved.'}
        </Text>
        <TouchableOpacity style={s.doneBtn} onPress={()=>router.replace('/(provider)/earnings')}>
          <Text style={s.doneBtnTxt}>Back to earnings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const ibanCheck = f.iban.length > 4 ? validateIban(f.iban) : null;
  const nameMismatch = f.account_holder && name &&
    !f.account_holder.toLowerCase().includes(name.split(' ').pop()?.toLowerCase() || '');

  return (
    <View style={s.wrap}>
      <View style={s.hdr}>
        <TouchableOpacity onPress={()=>router.back()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Getting paid</Text>
        <View style={{width:54}}/>
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
        {owed > 0 && (
          <View style={s.owedCard}>
            <Text style={s.owedLbl}>Waiting for you</Text>
            <Text style={s.owedVal}>€{owed.toFixed(2)}</Text>
            <Text style={s.owedTxt}>
              We can't send this until we know where to put it.
            </Text>
          </View>
        )}

        <Text style={s.intro}>
          {owed > 0 ? 'Where should we send it?' : 'Where should we pay you?'}
        </Text>
        <Text style={s.hint}>
          The name has to match your ID or the bank will bounce the transfer.
        </Text>

        <Text style={s.lbl}>Account holder</Text>
        <TextInput style={s.input} value={f.account_holder}
          onChangeText={(t)=>set('account_holder',t)}
          placeholder="Exactly as your bank has it" placeholderTextColor={C.muted} />
        {nameMismatch ? (
          <Text style={[s.note,{color:C.amber}]}>
            This doesn't look like "{name}" — double-check it.
          </Text>
        ) : null}

        <Text style={s.lbl}>IBAN</Text>
        <TextInput style={s.input} value={f.iban}
          onChangeText={(t)=>set('iban', t.toUpperCase())}
          onBlur={()=>set('iban', formatIban(f.iban))}
          placeholder="MT84 MALT 0110 0001 2345 MTLC AST0 01S"
          placeholderTextColor={C.muted} autoCapitalize="characters" />
        {ibanCheck && (
          <Text style={[s.note,{color: ibanCheck.ok ? C.green : C.red}]}>
            {ibanCheck.ok ? '✓ That IBAN checks out' : ibanCheck.reason}
          </Text>
        )}

        <Text style={s.lbl}>Bank</Text>
        <Picker
          value={bankLabel}
          options={BANKS}
          onChange={(v)=>set('bank_name', v)}
          placeholder="Choose your bank"
          title="Your bank"
          searchable={false}
        />
        {bankLabel === 'Other' && (
          <TextInput style={[s.input,{marginTop:10}]} value={f.other_bank}
            onChangeText={(t)=>set('other_bank',t)}
            placeholder="Bank name" placeholderTextColor={C.muted} />
        )}

        <View style={s.infoBox}>
          <Text style={s.infoTitle}>How payouts work</Text>
          {[
            ['Client approves the job', 'Or it approves itself after six hours'],
            ['Poji takes 20%',          'From the job value, before VAT'],
            ['You get the rest',        'Within three working days'],
            ['We invoice the VAT',      'On your behalf, so you do not have to'],
          ].map(([a,b])=>(
            <View key={a} style={s.infoRow}>
              <Text style={s.infoDot}>•</Text>
              <View style={{flex:1}}>
                <Text style={s.infoA}>{a}</Text>
                <Text style={s.infoB}>{b}</Text>
              </View>
            </View>
          ))}
        </View>

        {error ? <View style={s.errBox}><Text style={s.errTxt}>⚠️  {error}</Text></View> : null}

        <View style={{height:24}}/>
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={[s.btn, busy&&s.btnDis]} disabled={busy} onPress={save}>
          {busy ? <ActivityIndicator color={C.white}/>
            : <Text style={s.btnTxt}>Save bank details</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  center:{flex:1,backgroundColor:C.bg,alignItems:'center',justifyContent:'center',padding:32,gap:12},
  hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
    paddingHorizontal:20,paddingTop:60,paddingBottom:14},
  back:{fontSize:16,color:C.primary,fontWeight:'600',width:54},
  title:{fontSize:17,fontWeight:'700',color:C.dark},
  body:{flex:1,paddingHorizontal:20},

  owedCard:{backgroundColor:C.dark,borderRadius:18,padding:20,gap:4,marginTop:6,...S.md},
  owedLbl:{fontSize:13,color:'#C7D2FE',fontWeight:'600'},
  owedVal:{fontSize:36,fontWeight:'800',color:C.white},
  owedTxt:{fontSize:12,color:'#A5B4FC',lineHeight:17},

  intro:{fontSize:22,fontWeight:'800',color:C.dark,marginTop:22},
  hint:{fontSize:13,color:C.muted,lineHeight:19,marginTop:6},
  lbl:{fontSize:12,fontWeight:'700',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.5,marginTop:22,marginBottom:8},
  note:{fontSize:12,fontWeight:'700',marginTop:6},
  input:{backgroundColor:C.white,borderRadius:14,paddingHorizontal:16,paddingVertical:14,
    fontSize:15,color:C.text,borderWidth:1.5,borderColor:C.border},

  infoBox:{backgroundColor:C.white,borderRadius:16,padding:16,gap:10,marginTop:26,
    borderWidth:1,borderColor:C.border,...S.sm},
  infoTitle:{fontSize:15,fontWeight:'800',color:C.dark},
  infoRow:{flexDirection:'row',gap:10},
  infoDot:{fontSize:14,color:C.primary,fontWeight:'800'},
  infoA:{fontSize:13,fontWeight:'700',color:C.text},
  infoB:{fontSize:12,color:C.muted,marginTop:2,lineHeight:16},

  errBox:{backgroundColor:C.redLt,borderRadius:12,padding:14,marginTop:16,
    borderWidth:1,borderColor:'#FECACA'},
  errTxt:{fontSize:13,color:C.red,fontWeight:'600'},

  footer:{paddingHorizontal:20,paddingVertical:16,backgroundColor:C.white,
    borderTopWidth:1,borderTopColor:C.border},
  btn:{backgroundColor:C.primary,borderRadius:16,paddingVertical:17,alignItems:'center',...S.md},
  btnDis:{opacity:0.6},
  btnTxt:{color:C.white,fontSize:16,fontWeight:'700'},

  doneIcon:{fontSize:60},
  doneTitle:{fontSize:24,fontWeight:'800',color:C.dark,textAlign:'center'},
  doneTxt:{fontSize:14,color:C.muted,textAlign:'center',lineHeight:21},
  doneBtn:{backgroundColor:C.primary,borderRadius:16,paddingVertical:15,paddingHorizontal:32,marginTop:10},
  doneBtnTxt:{color:C.white,fontSize:15,fontWeight:'700'},
});
