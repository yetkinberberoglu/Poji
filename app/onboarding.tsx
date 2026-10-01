import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Image
} from 'react-native';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { CATEGORIES, tradesIn, findTrade } from '../constants/trades';
import PhoneVerify from '../components/PhoneVerify';
import Picker, { MultiPicker } from '../components/Picker';
import {
  MALTA_LOCALITIES, MALTA_MAIN, GOZO_LOCALITIES,
  validateIban, formatIban, validatePhone, validateEmail,
  ageFrom, isFutureDate,
} from '../constants/malta';

const STEPS = ['You', 'Documents', 'Right to work', 'Your work', 'Getting paid'];

const ID_TYPES = [
  { k:'malta_id',         label:'Malta ID',          hint:'7 digits plus a letter, e.g. 0123456M' },
  { k:'passport',         label:'Passport',          hint:'As printed on the photo page' },
  { k:'residence_permit', label:'Residence Permit',  hint:'The number on your card' },
];

const WORK_AUTH = [
  { k:'eu_citizen',     label:'EU / EEA citizen',  desc:'No permit needed to work in Malta' },
  { k:'malta_resident', label:'Malta resident',    desc:'You hold a residence card' },
  { k:'work_permit',    label:'Work permit',       desc:'Single permit or employment licence' },
  { k:'none',           label:'Not yet',           desc:'Applied, or still sorting it out' },
];

const BANKS = ['BOV','HSBC Malta','APS Bank','Lombard Bank','BNF Bank','Revolut','Wise','Other'];

const TEAM_TYPES = [
  { k:'solo',    label:'On my own',   desc:'I turn up alone' },
  { k:'duo',     label:'As a pair',   desc:'We always work two together' },
  { k:'company', label:'A business',  desc:'Registered company with staff' },
];

export default function Onboarding() {
  const [step, setStep]           = useState(0);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [missing, setMissing]     = useState<string[]>([]);
  const [status, setStatus]       = useState<string|null>(null);
  const [uploading, setUploading] = useState<string|null>(null);
  const [previews, setPreviews]   = useState<Record<string,string>>({});

  const [f, setF] = useState<any>({
    first_name:'', last_name:'', date_of_birth:'', nationality:'', nationality_other:'',
    id_type:'malta_id', id_number:'',
    id_front_url:'', id_back_url:'', selfie_url:'', profile_photo_url:'',
    phone:'', email:'', address:'', locality:'',
    emergency_name:'', emergency_phone:'',
    work_authorization:'eu_citizen', work_permit_url:'', work_permit_expiry:'',
    team_type:'solo', team_size:1, company_name:'', vat_number:'', company_reg_number:'',
    categories:[] as string[],
    accepts_urgent:false, service_radius_km:'15',
    hourly_rate:'15', min_hours:'3',
    service_areas:[] as string[], covers_all_malta:false, covers_all_gozo:false,
    brings_own_supplies:false, bio:'',
    has_insurance:false, insurance_provider:'', insurance_policy_no:'',
    insurance_expiry:'', insurance_doc_url:'',
    iban:'', bank_name:'', account_holder:'',
    accepted_commission:false,
    phone_verified:false,
    rejection_reason:'',
  });

  const set = (k:string, v:any) => {
    setF((p:any)=>({
      ...p,
      [k]: v,
      // a new number has to be confirmed again
      ...(k === 'phone' ? { phone_verified: false } : {}),
    }));
    setError(''); setMissing([]);
  };

  // Which pricing models do their trades use?
  const myTrades   = f.categories.map((id:string)=>findTrade(id)).filter(Boolean);
  const hasHourly  = myTrades.some((t:any)=>t.pricing === 'hourly');
  const hasFixed   = myTrades.some((t:any)=>t.pricing === 'fixed');
  const hasRoad    = myTrades.some((t:any)=>t.roadside);

  useEffect(() => {
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/auth'); return; }
      const { data } = await supabase.from('cleaner_profiles').select('*').eq('id', user.id).maybeSingle();
      if (data) {
        setStatus(data.verification_status);
        setF((p:any)=>({ ...p, ...Object.fromEntries(Object.entries(data).filter(([_,v])=>v!==null)) }));
      } else {
        const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
        const parts = (prof?.full_name || '').split(' ');
        setF((p:any)=>({
          ...p,
          first_name: parts[0] || '',
          last_name:  parts.slice(1).join(' ') || '',
          email:      user.email || '',
        }));
      }
    })();
  }, []);

  // ── uploads ──
  const pickFile = (field:string) => {
    if (Platform.OS !== 'web') {
      setError('Please finish signing up in a browser — we need to upload photos.');
      return;
    }
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,application/pdf';
    input.onchange = async (e:any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { setError('That file is over 8 MB — try a smaller photo.'); return; }

      setUploading(field); setError('');

      // local preview so they can see what they sent
      if (file.type.startsWith('image/')) {
        setPreviews(p => ({ ...p, [field]: URL.createObjectURL(file) }));
      }

      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { setUploading(null); return; }

      const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${user.id}/${field}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('verification-docs').upload(path, file, { upsert:true });

      setUploading(null);
      if (upErr) { setError('Upload failed: ' + upErr.message); return; }
      set(field, path);
    };
    input.click();
  };

  // ── validation ──
  const validate = (s:number): string[] => {
    const m: string[] = [];

    if (s===0) {
      if (!f.first_name.trim()) m.push('First name');
      if (!f.last_name.trim())  m.push('Last name');

      const age = ageFrom(f.date_of_birth);
      if (age === null)      m.push('Date of birth — use YYYY-MM-DD');
      else if (age < 18)     m.push('You must be 18 or over to work on Poji');
      else if (age > 90)     m.push('Check your date of birth');

      if (!f.nationality) m.push('Nationality');

      const ph = validatePhone(f.phone);
      if (!ph.ok) m.push(ph.reason!);
      else if (!f.phone_verified) m.push('Confirm your mobile number with the code we send');

      if (!validateEmail(f.email)) m.push('A valid email address');
      if (!f.address.trim())  m.push('Your address in Malta');
      if (!f.locality)        m.push('Your locality');

      if (f.emergency_phone) {
        const ep = validatePhone(f.emergency_phone);
        if (!ep.ok) m.push('Emergency contact number — ' + ep.reason);
      }
    }

    if (s===1) {
      if (!f.id_number.trim())  m.push('Document number');
      if (f.id_type === 'malta_id' && !/^[0-9]{6,7}[A-Z]$/i.test(f.id_number.trim()))
        m.push('A Malta ID looks like 0123456M');
      if (!f.id_front_url)      m.push('Photo of the front of your document');
      if (!f.selfie_url)        m.push('Selfie holding your document');
      if (!f.profile_photo_url) m.push('A profile photo clients will see');
    }

    if (s===2) {
      if (f.work_authorization === 'work_permit') {
        if (!f.work_permit_url) m.push('Your work permit document');
        if (!f.work_permit_expiry) m.push('Permit expiry date');
        else if (!isFutureDate(f.work_permit_expiry)) m.push('That permit has already expired');
      }
      if (f.team_type === 'company') {
        if (!f.company_name.trim()) m.push('Company name');
        if (!f.company_reg_number.trim()) m.push('Company registration number');
      }
    }

    if (s===3) {
      if (!f.categories.length) m.push('At least one trade');
      if (hasHourly) {
        if (!f.hourly_rate || Number(f.hourly_rate) <= 0) m.push('Your hourly rate');
        else if (Number(f.hourly_rate) < 8)  m.push('An hourly rate below €8 is below the Malta minimum');
        else if (Number(f.hourly_rate) > 90) m.push('Check your hourly rate — that looks very high');
        if (!f.min_hours || Number(f.min_hours) <= 0) m.push('Minimum hours per job');
      }
      if (!f.covers_all_malta && !f.covers_all_gozo && f.service_areas.length === 0)
        m.push('Where you work — pick areas, or tick a whole island');

      if (f.has_insurance) {
        if (!f.insurance_provider.trim())  m.push('Insurance company name');
        if (!f.insurance_policy_no.trim()) m.push('Policy number');
        if (!f.insurance_expiry)           m.push('Policy expiry date');
        else if (!isFutureDate(f.insurance_expiry)) m.push('That policy has already expired');
      }
    }

    if (s===4) {
      if (!f.account_holder.trim()) m.push('Account holder name');
      const ib = validateIban(f.iban);
      if (!ib.ok) m.push('IBAN — ' + ib.reason);
      if (!f.bank_name.trim()) m.push('Bank name');
      if (!f.accepted_commission) m.push('Accept the 20% commission to continue');
    }

    return m;
  };

  // ── saving ──
  const payload = (final: boolean) => ({
    first_name:f.first_name.trim(), last_name:f.last_name.trim(),
    date_of_birth:f.date_of_birth || null,
    nationality:f.nationality,
    nationality_other:null,
    id_type:f.id_type, id_number:f.id_number.trim().toUpperCase(),
    id_front_url:f.id_front_url, id_back_url:f.id_back_url,
    selfie_url:f.selfie_url, profile_photo_url:f.profile_photo_url,
    phone:validatePhone(f.phone).value || f.phone,
    phone_verified:!!f.phone_verified,
    email:f.email.trim(), address:f.address.trim(), locality:f.locality,
    emergency_name:f.emergency_name.trim(),
    emergency_phone:validatePhone(f.emergency_phone).value || f.emergency_phone,
    work_authorization:f.work_authorization,
    work_permit_url:f.work_permit_url,
    work_permit_expiry:f.work_permit_expiry || null,
    team_type:f.team_type,
    team_size:f.team_type==='solo' ? 1 : (f.team_type==='duo' ? 2 : Number(f.team_size)||1),
    company_name:f.company_name.trim(), vat_number:f.vat_number.trim(),
    company_reg_number:f.company_reg_number.trim(),
    categories:f.categories.length ? f.categories : ['cleaning'],
    accepts_urgent:!!f.accepts_urgent,
    service_radius_km:Number(f.service_radius_km) || 15,
    hourly_rate:Number(f.hourly_rate) || 15,
    min_hours:Number(f.min_hours) || 2,
    covers_all_malta:!!f.covers_all_malta,
    covers_all_gozo:!!f.covers_all_gozo,
    service_areas: (() => {
      const extra = f.service_areas || [];
      if (f.covers_all_malta && f.covers_all_gozo) return ['All Malta','All Gozo'];
      if (f.covers_all_malta) return ['All Malta', ...extra.filter((a:string)=>GOZO_LOCALITIES.includes(a))];
      if (f.covers_all_gozo)  return ['All Gozo',  ...extra.filter((a:string)=>MALTA_MAIN.includes(a))];
      return extra;
    })(),
    brings_own_supplies:!!f.brings_own_supplies,
    bio:f.bio.trim(),
    has_insurance:!!f.has_insurance,
    insurance_provider:f.insurance_provider.trim() || null,
    insurance_policy_no:f.insurance_policy_no.trim() || null,
    insurance_expiry:f.insurance_expiry || null,
    insurance_doc_url:f.insurance_doc_url || null,
    iban:f.iban.replace(/\s+/g,'').toUpperCase(),
    bank_name:f.bank_name.trim(), account_holder:f.account_holder.trim(),
    accepted_commission:!!f.accepted_commission,
    accepted_terms_at: final ? new Date().toISOString() : null,
    verification_status: final ? 'submitted' : 'draft',
    submitted_at: final ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });

  const saveDraft = async () => {
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error: e } = await supabase.from('cleaner_profiles')
      .upsert({ id:user.id, ...payload(false) });
    if (e) console.log('saveDraft:', e.message);
  };

  const next = async () => {
    const m = validate(step);
    if (m.length) { setMissing(m); return; }
    setLoading(true);
    await saveDraft();
    setLoading(false);
    if (step < STEPS.length-1) setStep(step+1);
    else submit();
  };

  const submit = async () => {
    setLoading(true);
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { error: e } = await supabase.from('cleaner_profiles')
      .upsert({ id:user.id, ...payload(true) });
    setLoading(false);
    if (e) { setError(e.message); return; }
    setStatus('submitted');
  };

  // ── status screens ──
  if (status==='submitted' || status==='under_review') {
    return (
      <View style={st.centerWrap}>
        <Text style={st.bigIcon}>⏳</Text>
        <Text style={st.centerTitle}>Application under review</Text>
        <Text style={st.centerTxt}>
          Our team is checking your documents. This usually takes 1–2 working days.
          You'll get a message as soon as you're approved.
        </Text>
        <TouchableOpacity style={st.outlineBtn} onPress={()=>setStatus('draft')}>
          <Text style={st.outlineTxt}>Edit my application</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.ghostBtn} onPress={async()=>{
          try { await supabase.auth.signOut({scope:'local'}); } catch(e) {}
          router.replace('/auth');
        }}>
          <Text style={st.ghostTxt}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status==='approved') {
    return (
      <View style={st.centerWrap}>
        <Text style={st.bigIcon}>🎉</Text>
        <Text style={st.centerTitle}>You're verified</Text>
        <Text style={st.centerTxt}>Your profile is live. Clients can book you now.</Text>
        <TouchableOpacity style={st.primaryBtn} onPress={()=>router.replace('/provider')}>
          <Text style={st.primaryTxt}>Go to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status==='rejected') {
    return (
      <View style={st.centerWrap}>
        <Text style={st.bigIcon}>⚠️</Text>
        <Text style={st.centerTitle}>We need a few changes</Text>
        <Text style={st.centerTxt}>{f.rejection_reason || 'Please review your details and resubmit.'}</Text>
        <TouchableOpacity style={st.primaryBtn} onPress={()=>{setStatus('draft');setStep(0);}}>
          <Text style={st.primaryTxt}>Update application</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const age = ageFrom(f.date_of_birth);

  return (
    <View style={st.wrap}>
      <View style={st.hdr}>
        <TouchableOpacity onPress={()=>step>0?setStep(step-1):router.back()}>
          <Text style={st.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={st.title}>Become a Provider</Text>
        <Text style={st.stepNum}>{step+1}/{STEPS.length}</Text>
      </View>

      <View style={st.progress}>
        {STEPS.map((s,i)=>{
          let reachable = true;
          for (let j=0; j<i; j++) if (validate(j).length) { reachable = false; break; }
          const done = i < step && validate(i).length === 0;
          return (
            <TouchableOpacity key={s} style={st.pItem} disabled={!reachable}
              onPress={()=>{ if (reachable) { setMissing([]); setStep(i); } }}>
              <View style={[st.dot, i<=step&&st.dotOn, !reachable&&st.dotLocked]}>
                <Text style={[st.dotTxt, i<=step&&st.dotTxtOn]}>{done?'✓':i+1}</Text>
              </View>
              <Text style={[st.dotLbl, i===step&&st.dotLblOn, !reachable&&st.dotLblLocked]}>{s}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView style={st.body} showsVerticalScrollIndicator={false}>
        {missing.length > 0 && (
          <View style={st.errBox}>
            <Text style={st.errTitle}>Please sort these out:</Text>
            {missing.map(m => <Text key={m} style={st.errItem}>•  {m}</Text>)}
          </View>
        )}
        {error ? <View style={st.errBox}><Text style={st.errItem}>⚠️  {error}</Text></View> : null}

        {/* ══ 0 · YOU ══ */}
        {step===0 && (
          <View style={st.step}>
            <Text style={st.sectionHint}>
              We verify everyone who works through Poji. Clients are letting you into
              their homes, so this has to be real.
            </Text>

            <View style={st.row2}>
              <View style={{flex:1}}>
                <Text style={st.lbl}>First name</Text>
                <TextInput style={st.input} value={f.first_name}
                  onChangeText={(t:string)=>set('first_name',t)}
                  placeholder="Maria" placeholderTextColor={C.muted} autoCapitalize="words" />
              </View>
              <View style={{flex:1}}>
                <Text style={st.lbl}>Last name</Text>
                <TextInput style={st.input} value={f.last_name}
                  onChangeText={(t:string)=>set('last_name',t)}
                  placeholder="Sciberras" placeholderTextColor={C.muted} autoCapitalize="words" />
              </View>
            </View>

            <Text style={st.lbl}>Date of birth</Text>
            {Platform.OS === 'web' ? (
              // @ts-ignore — a native date input on web beats free text
              <input
                type="date"
                value={f.date_of_birth}
                max={new Date(Date.now() - 18*365.25*864e5).toISOString().slice(0,10)}
                min="1935-01-01"
                onChange={(e:any)=>set('date_of_birth', e.target.value)}
                style={{
                  backgroundColor:'#fff', borderRadius:14, padding:14, fontSize:15,
                  color:'#374151', border:`1.5px solid ${C.border}`, width:'100%',
                  fontFamily:'inherit', boxSizing:'border-box',
                }}
              />
            ) : (
              <TextInput style={st.input} value={f.date_of_birth}
                onChangeText={(t:string)=>set('date_of_birth',t)}
                placeholder="YYYY-MM-DD" placeholderTextColor={C.muted} />
            )}
            {age !== null && (
              <Text style={[st.fieldNote, age < 18 && {color:C.red}]}>
                {age < 18 ? `You're ${age} — Poji is for over-18s only.` : `${age} years old`}
              </Text>
            )}

            <Text style={st.lbl}>Nationality</Text>
            <TextInput style={st.input} value={f.nationality}
              onChangeText={(t:string)=>set('nationality',t)}
              placeholder="e.g. Maltese, Italian, Filipino"
              placeholderTextColor={C.muted} autoCapitalize="words" />


            <Text style={st.lbl}>Mobile number</Text>
            <TextInput style={st.input} value={f.phone}
              onChangeText={(t:string)=>set('phone',t)}
              placeholder="+356 7900 0000" placeholderTextColor={C.muted} keyboardType="phone-pad" />
            <Text style={st.fieldNote}>
              Job alerts come to this number on WhatsApp. Include the country code.
            </Text>

            {validatePhone(f.phone).ok && (
              <PhoneVerify
                phone={validatePhone(f.phone).value || f.phone}
                verified={!!f.phone_verified}
                onVerified={(v)=>{ setF((p:any)=>({...p, phone:v, phone_verified:true})); setMissing([]); }}
              />
            )}

            <Text style={st.lbl}>Email</Text>
            <TextInput style={st.input} value={f.email}
              onChangeText={(t:string)=>set('email',t)}
              placeholder="you@example.com" placeholderTextColor={C.muted}
              autoCapitalize="none" keyboardType="email-address" />

            <Text style={st.lbl}>Address in Malta</Text>
            <TextInput style={st.input} value={f.address}
              onChangeText={(t:string)=>set('address',t)}
              placeholder="Flat 3, 12 Tower Road" placeholderTextColor={C.muted} />

            <Text style={st.lbl}>Locality</Text>
            <Picker
              value={f.locality}
              options={MALTA_LOCALITIES}
              onChange={(v)=>set('locality', v)}
              placeholder="Where do you live?"
              title="Your locality"
            />

            <Text style={st.divider}>Emergency contact</Text>
            <Text style={st.fieldNote}>
              Only used if something happens to you on a job. Optional, but we'd rather have it.
            </Text>
            <View style={st.row2}>
              <View style={{flex:1}}>
                <Text style={st.lbl}>Name</Text>
                <TextInput style={st.input} value={f.emergency_name}
                  onChangeText={(t:string)=>set('emergency_name',t)}
                  placeholder="Full name" placeholderTextColor={C.muted} />
              </View>
              <View style={{flex:1}}>
                <Text style={st.lbl}>Phone</Text>
                <TextInput style={st.input} value={f.emergency_phone}
                  onChangeText={(t:string)=>set('emergency_phone',t)}
                  placeholder="+356 ..." placeholderTextColor={C.muted} keyboardType="phone-pad" />
              </View>
            </View>
          </View>
        )}

        {/* ══ 1 · DOCUMENTS ══ */}
        {step===1 && (
          <View style={st.step}>
            <Text style={st.sectionHint}>
              Your ID and selfie are encrypted and seen only by our verification team —
              never by clients. Your profile photo is the one clients see.
            </Text>

            <Text style={st.lbl}>Document type</Text>
            <View style={st.chips}>
              {ID_TYPES.map(t=>(
                <TouchableOpacity key={t.k} style={[st.chip, f.id_type===t.k&&st.chipOn]}
                  onPress={()=>set('id_type',t.k)}>
                  <Text style={[st.chipTxt, f.id_type===t.k&&st.chipTxtOn]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={st.lbl}>Document number</Text>
            <TextInput style={st.input} value={f.id_number}
              onChangeText={(t:string)=>set('id_number',t)}
              placeholder={f.id_type==='malta_id' ? '0123456M' : 'As printed'}
              placeholderTextColor={C.muted} autoCapitalize="characters" />
            <Text style={st.fieldNote}>{ID_TYPES.find(t=>t.k===f.id_type)?.hint}</Text>

            <Upload label="Front of your document" field="id_front_url" required
              value={f.id_front_url} preview={previews.id_front_url}
              uploading={uploading==='id_front_url'} onPress={()=>pickFile('id_front_url')} />

            <Upload label="Back of your document" field="id_back_url"
              value={f.id_back_url} preview={previews.id_back_url}
              uploading={uploading==='id_back_url'} onPress={()=>pickFile('id_back_url')}
              hint="Skip this one if your passport has everything on the photo page." />

            <Upload label="Selfie holding your document" field="selfie_url" required
              value={f.selfie_url} preview={previews.selfie_url}
              uploading={uploading==='selfie_url'} onPress={()=>pickFile('selfie_url')}
              hint="Hold the ID next to your face so both are readable. This stops anyone using someone else's identity." />

            <Text style={st.divider}>Your profile photo</Text>
            <Text style={st.fieldNote}>
              Clients see this before they book. A clear, friendly face gets far more
              work than a logo or an empty circle.
            </Text>
            <Upload label="Profile photo" field="profile_photo_url" required
              value={f.profile_photo_url} preview={previews.profile_photo_url}
              uploading={uploading==='profile_photo_url'}
              onPress={()=>pickFile('profile_photo_url')} round />
          </View>
        )}

        {/* ══ 2 · RIGHT TO WORK ══ */}
        {step===2 && (
          <View style={st.step}>
            <Text style={st.lbl}>Your right to work in Malta</Text>
            {WORK_AUTH.map(w=>(
              <TouchableOpacity key={w.k} style={[st.optCard, f.work_authorization===w.k&&st.optCardOn]}
                onPress={()=>set('work_authorization',w.k)}>
                <View style={[st.radio, f.work_authorization===w.k&&st.radioOn]}>
                  {f.work_authorization===w.k && <View style={st.radioDot}/>}
                </View>
                <View style={{flex:1}}>
                  <Text style={st.optLabel}>{w.label}</Text>
                  <Text style={st.optDesc}>{w.desc}</Text>
                </View>
              </TouchableOpacity>
            ))}

            {f.work_authorization==='work_permit' && (
              <>
                <Upload label="Work permit document" field="work_permit_url" required
                  value={f.work_permit_url} preview={previews.work_permit_url}
                  uploading={uploading==='work_permit_url'} onPress={()=>pickFile('work_permit_url')} />
                <Text style={st.lbl}>Permit expiry date</Text>
                {Platform.OS === 'web' ? (
                  // @ts-ignore
                  <input type="date" value={f.work_permit_expiry}
                    min={new Date().toISOString().slice(0,10)}
                    onChange={(e:any)=>set('work_permit_expiry', e.target.value)}
                    style={{
                      backgroundColor:'#fff', borderRadius:14, padding:14, fontSize:15,
                      color:'#374151', border:`1.5px solid ${C.border}`, width:'100%',
                      fontFamily:'inherit', boxSizing:'border-box',
                    }} />
                ) : (
                  <TextInput style={st.input} value={f.work_permit_expiry}
                    onChangeText={(t:string)=>set('work_permit_expiry',t)}
                    placeholder="YYYY-MM-DD" placeholderTextColor={C.muted} />
                )}
                {f.work_permit_expiry && !isFutureDate(f.work_permit_expiry) && (
                  <Text style={[st.fieldNote,{color:C.red}]}>This permit has expired.</Text>
                )}
              </>
            )}

            {f.work_authorization==='none' && (
              <View style={st.noteBox}>
                <Text style={st.noteTxt}>
                  You can still apply. We review these case by case — tell us where you
                  are in the process in your bio on the next step.
                </Text>
              </View>
            )}

            <Text style={st.divider}>How do you work?</Text>
            {TEAM_TYPES.map(t=>(
              <TouchableOpacity key={t.k} style={[st.optCard, f.team_type===t.k&&st.optCardOn]}
                onPress={()=>set('team_type',t.k)}>
                <View style={[st.radio, f.team_type===t.k&&st.radioOn]}>
                  {f.team_type===t.k && <View style={st.radioDot}/>}
                </View>
                <View style={{flex:1}}>
                  <Text style={st.optLabel}>{t.label}</Text>
                  <Text style={st.optDesc}>{t.desc}</Text>
                </View>
              </TouchableOpacity>
            ))}

            {f.team_type==='company' && (
              <>
                <Text style={st.lbl}>Company name</Text>
                <TextInput style={st.input} value={f.company_name}
                  onChangeText={(t:string)=>set('company_name',t)}
                  placeholder="Your business name" placeholderTextColor={C.muted} />
                <View style={st.row2}>
                  <View style={{flex:1}}>
                    <Text style={st.lbl}>Registration no.</Text>
                    <TextInput style={st.input} value={f.company_reg_number}
                      onChangeText={(t:string)=>set('company_reg_number',t)}
                      placeholder="C 12345" placeholderTextColor={C.muted} />
                  </View>
                  <View style={{flex:1}}>
                    <Text style={st.lbl}>VAT number</Text>
                    <TextInput style={st.input} value={f.vat_number}
                      onChangeText={(t:string)=>set('vat_number',t)}
                      placeholder="MT12345678" placeholderTextColor={C.muted} />
                  </View>
                </View>
                <Text style={st.lbl}>How many people can you send to one job?</Text>
                <View style={st.chips}>
                  {[1,2,3,4,5,6,8,10].map(n=>(
                    <TouchableOpacity key={n} style={[st.chip, Number(f.team_size)===n&&st.chipOn]}
                      onPress={()=>set('team_size',n)}>
                      <Text style={[st.chipTxt, Number(f.team_size)===n&&st.chipTxtOn]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* ══ 3 · YOUR WORK ══ */}
        {step===3 && (
          <View style={st.step}>
            <Text style={st.sectionHint}>
              Pick everything you're genuinely qualified for. Clients only see the
              trades you choose here.
            </Text>

            {f.categories.length > 0 && (
              <View style={st.pickedBar}>
                <Text style={st.pickedTxt}>
                  {f.categories.length} trade{f.categories.length>1?'s':''} selected
                </Text>
                <TouchableOpacity onPress={()=>set('categories', [])}>
                  <Text style={st.pickedClear}>Clear all</Text>
                </TouchableOpacity>
              </View>
            )}

            {CATEGORIES.map(cat=>{
              const items  = tradesIn(cat.id);
              const chosen = items.filter(t=>f.categories.includes(t.id)).length;
              return (
                <View key={cat.id} style={st.tradeGroup}>
                  <View style={st.tradeGroupHead}>
                    <Text style={st.tradeGroupTitle}>{cat.icon}  {cat.name}</Text>
                    {chosen > 0 && (
                      <View style={st.tradeGroupCount}>
                        <Text style={st.tradeGroupCountTxt}>{chosen}</Text>
                      </View>
                    )}
                  </View>
                  <View style={st.tradeWrap}>
                    {items.map(t=>{
                      const on = f.categories.includes(t.id);
                      return (
                        <TouchableOpacity key={t.id} style={[st.tradePill, on&&st.tradePillOn]}
                          onPress={()=>set('categories', on
                            ? f.categories.filter((x:string)=>x!==t.id)
                            : [...f.categories, t.id])}>
                          <Text style={[st.tradePillTxt, on&&st.tradePillTxtOn]}>
                            {on ? '✓ ' : ''}{t.icon}  {t.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            {hasRoad && (
              <View style={st.roadBox}>
                <Text style={st.roadTitle}>🛞  Roadside work</Text>
                <Text style={st.roadTxt}>
                  Callouts pay a fixed price per job, not by the hour. You see the
                  price and the client's GPS before you accept.
                </Text>
                <TouchableOpacity style={[st.checkRow, f.accepts_urgent&&st.checkRowOn]}
                  onPress={()=>set('accepts_urgent', !f.accepts_urgent)}>
                  <View style={[st.check, f.accepts_urgent&&st.checkOn]}>
                    {f.accepts_urgent && <Text style={st.checkTxt}>✓</Text>}
                  </View>
                  <View style={{flex:1}}>
                    <Text style={st.optLabel}>I take emergency callouts</Text>
                    <Text style={st.optDesc}>Drop everything and go. These pay 25% more.</Text>
                  </View>
                </TouchableOpacity>
                <Text style={st.lbl}>How far will you travel?</Text>
                <View style={st.chips}>
                  {[5,10,15,25,40].map(km=>(
                    <TouchableOpacity key={km} style={[st.chip, Number(f.service_radius_km)===km&&st.chipOn]}
                      onPress={()=>set('service_radius_km', km)}>
                      <Text style={[st.chipTxt, Number(f.service_radius_km)===km&&st.chipTxtOn]}>{km} km</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {hasHourly && (
              <>
                <Text style={st.divider}>Your rate</Text>
                <Text style={st.fieldNote}>
                  {hasFixed
                    ? 'This covers your hourly trades. Fixed-price callouts use the rates set for each job type.'
                    : 'You set this. Poji adds VAT and keeps a 20% commission.'}
                </Text>
                <Text style={st.lbl}>Hourly rate (EUR)</Text>
                <TextInput style={st.inputBig} value={String(f.hourly_rate)}
                  onChangeText={(t:string)=>set('hourly_rate',t.replace(/[^0-9.]/g,''))}
                  placeholder="15" placeholderTextColor={C.muted} keyboardType="decimal-pad" />

                <View style={st.calcBox}>
                  <View style={st.calcRow}>
                    <Text style={st.calcLbl}>Client pays per hour</Text>
                    <Text style={st.calcVal}>€{(Number(f.hourly_rate||0)*1.18).toFixed(2)}</Text>
                  </View>
                  <View style={st.calcRow}>
                    <Text style={st.calcLbl}>You keep (80%)</Text>
                    <Text style={[st.calcVal,{color:C.green}]}>€{(Number(f.hourly_rate||0)*0.8).toFixed(2)}</Text>
                  </View>
                  <View style={st.calcRow}>
                    <Text style={st.calcLbl}>Poji commission (20%)</Text>
                    <Text style={st.calcVal}>€{(Number(f.hourly_rate||0)*0.2).toFixed(2)}</Text>
                  </View>
                </View>

                <Text style={st.lbl}>Minimum hours per job</Text>
                <View style={st.chips}>
                  {[1,1.5,2,2.5,3,4].map(h=>(
                    <TouchableOpacity key={h} style={[st.chip, Number(f.min_hours)===h&&st.chipOn]}
                      onPress={()=>set('min_hours',h)}>
                      <Text style={[st.chipTxt, Number(f.min_hours)===h&&st.chipTxtOn]}>{h}h</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={st.lbl}>Do you bring your own materials?</Text>
                <View style={st.chips}>
                  {[{k:true,l:'Yes, I bring everything'},{k:false,l:'No, client provides'}].map(o=>(
                    <TouchableOpacity key={String(o.k)}
                      style={[st.chip, f.brings_own_supplies===o.k&&st.chipOn]}
                      onPress={()=>set('brings_own_supplies',o.k)}>
                      <Text style={[st.chipTxt, f.brings_own_supplies===o.k&&st.chipTxtOn]}>{o.l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={st.divider}>Where do you work?</Text>
            <TouchableOpacity style={[st.checkRow, f.covers_all_malta&&st.checkRowOn]}
              onPress={()=>set('covers_all_malta', !f.covers_all_malta)}>
              <View style={[st.check, f.covers_all_malta&&st.checkOn]}>
                {f.covers_all_malta && <Text style={st.checkTxt}>✓</Text>}
              </View>
              <View style={{flex:1}}>
                <Text style={st.optLabel}>All of Malta</Text>
                <Text style={st.optDesc}>Every locality on the main island</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[st.checkRow, f.covers_all_gozo&&st.checkRowOn]}
              onPress={()=>set('covers_all_gozo', !f.covers_all_gozo)}>
              <View style={[st.check, f.covers_all_gozo&&st.checkOn]}>
                {f.covers_all_gozo && <Text style={st.checkTxt}>✓</Text>}
              </View>
              <View style={{flex:1}}>
                <Text style={st.optLabel}>All of Gozo and Comino</Text>
                <Text style={st.optDesc}>Including the ferry crossing</Text>
              </View>
            </TouchableOpacity>

            {!(f.covers_all_malta && f.covers_all_gozo) && (
              <>
                <Text style={st.fieldNote}>
                  Pick every area you'd actually drive to.
                </Text>
                <MultiPicker
                  values={f.service_areas}
                  options={
                    f.covers_all_malta ? GOZO_LOCALITIES :
                    f.covers_all_gozo  ? MALTA_MAIN :
                    MALTA_LOCALITIES
                  }
                  onChange={(v)=>set('service_areas', v)}
                  placeholder="Choose your areas"
                  title="Where do you work?"
                />
              </>
            )}

            <Text style={st.divider}>Insurance</Text>
            <Text style={st.fieldNote}>
              Poji does not insure your work. Public liability cover protects you if
              something gets damaged — and clients trust insured providers more.
            </Text>
            <TouchableOpacity style={[st.checkRow, f.has_insurance&&st.checkRowOn]}
              onPress={()=>set('has_insurance', !f.has_insurance)}>
              <View style={[st.check, f.has_insurance&&st.checkOn]}>
                {f.has_insurance && <Text style={st.checkTxt}>✓</Text>}
              </View>
              <View style={{flex:1}}>
                <Text style={st.optLabel}>I hold public liability insurance</Text>
                <Text style={st.optDesc}>We'll show an "Insured" badge on your profile</Text>
              </View>
            </TouchableOpacity>

            {f.has_insurance && (
              <>
                <View style={st.row2}>
                  <View style={{flex:1}}>
                    <Text style={st.lbl}>Insurer</Text>
                    <TextInput style={st.input} value={f.insurance_provider}
                      onChangeText={(t:string)=>set('insurance_provider',t)}
                      placeholder="e.g. Mapfre MSV" placeholderTextColor={C.muted} />
                  </View>
                  <View style={{flex:1}}>
                    <Text style={st.lbl}>Policy number</Text>
                    <TextInput style={st.input} value={f.insurance_policy_no}
                      onChangeText={(t:string)=>set('insurance_policy_no',t)}
                      placeholder="Policy no." placeholderTextColor={C.muted} />
                  </View>
                </View>
                <Text style={st.lbl}>Expires</Text>
                {Platform.OS === 'web' ? (
                  // @ts-ignore
                  <input type="date" value={f.insurance_expiry}
                    min={new Date().toISOString().slice(0,10)}
                    onChange={(e:any)=>set('insurance_expiry', e.target.value)}
                    style={{
                      backgroundColor:'#fff', borderRadius:14, padding:14, fontSize:15,
                      color:'#374151', border:`1.5px solid ${C.border}`, width:'100%',
                      fontFamily:'inherit', boxSizing:'border-box',
                    }} />
                ) : (
                  <TextInput style={st.input} value={f.insurance_expiry}
                    onChangeText={(t:string)=>set('insurance_expiry',t)}
                    placeholder="YYYY-MM-DD" placeholderTextColor={C.muted} />
                )}
                <Upload label="Policy document" field="insurance_doc_url"
                  value={f.insurance_doc_url} preview={previews.insurance_doc_url}
                  uploading={uploading==='insurance_doc_url'}
                  onPress={()=>pickFile('insurance_doc_url')}
                  hint="Optional, but it speeds up your approval." />
              </>
            )}

            <Text style={st.divider}>About you</Text>
            <Text style={st.fieldNote}>
              A few honest lines. What you're good at, how long you've done it,
              anything that makes a client pick you.
            </Text>
            <TextInput style={[st.input,{minHeight:110}]} value={f.bio}
              onChangeText={(t:string)=>set('bio',t)}
              placeholder="Eight years in hotel housekeeping. I'm thorough with kitchens and bathrooms and I always arrive on time."
              placeholderTextColor={C.muted} multiline textAlignVertical="top" />
            <Text style={st.fieldNote}>{f.bio.length} characters</Text>
          </View>
        )}

        {/* ══ 4 · GETTING PAID ══ */}
        {step===4 && (
          <View style={st.step}>
            <Text style={st.sectionHint}>
              We pay out to this account after each job is approved. The name must
              match your ID, or the bank will reject the transfer.
            </Text>

            <Text style={st.lbl}>Account holder name</Text>
            <TextInput style={st.input} value={f.account_holder}
              onChangeText={(t:string)=>set('account_holder',t)}
              placeholder="Exactly as your bank has it" placeholderTextColor={C.muted} />
            {f.account_holder && f.first_name && f.last_name &&
              !f.account_holder.toLowerCase().includes(f.last_name.toLowerCase()) && (
              <Text style={[st.fieldNote,{color:C.amber}]}>
                This doesn't match "{f.first_name} {f.last_name}" — make sure it's right.
              </Text>
            )}

            <Text style={st.lbl}>IBAN</Text>
            <TextInput style={st.input} value={f.iban}
              onChangeText={(t:string)=>set('iban',t.toUpperCase())}
              onBlur={()=>set('iban', formatIban(f.iban))}
              placeholder="MT84 MALT 0110 0001 2345 MTLC AST0 01S"
              placeholderTextColor={C.muted} autoCapitalize="characters" />
            {f.iban.length > 4 && (() => {
              const r = validateIban(f.iban);
              return (
                <Text style={[st.fieldNote, { color: r.ok ? C.green : C.red }]}>
                  {r.ok ? '✓ That IBAN checks out' : r.reason}
                </Text>
              );
            })()}

            <Text style={st.lbl}>Bank</Text>
            <Picker
              value={BANKS.includes(f.bank_name) ? f.bank_name : (f.bank_name ? 'Other' : '')}
              options={BANKS}
              onChange={(v)=>set('bank_name', v === 'Other' ? '' : v)}
              placeholder="Choose your bank"
              title="Your bank"
              searchable={false}
            />
            {(f.bank_name === '' || !BANKS.includes(f.bank_name)) && f.iban && (
              <TextInput style={[st.input,{marginTop:10}]} value={f.bank_name}
                onChangeText={(t:string)=>set('bank_name',t)}
                placeholder="Type your bank name" placeholderTextColor={C.muted} />
            )}

            <View style={st.commissionBox}>
              <Text style={st.commissionTitle}>How you get paid</Text>
              {[
                ['Client approves the work', 'You have the job marked complete and they confirm'],
                ['Poji keeps 20%',           'Taken from the job value before VAT'],
                ['You get 80%',              'Paid to your IBAN'],
                ['VAT is handled',           'Poji issues the VAT invoice on your behalf'],
              ].map(([a,b])=>(
                <View key={a} style={st.commissionRow}>
                  <Text style={st.commissionDot}>•</Text>
                  <View style={{flex:1}}>
                    <Text style={st.commissionA}>{a}</Text>
                    <Text style={st.commissionB}>{b}</Text>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity style={[st.checkRow, f.accepted_commission&&st.checkRowOn]}
              onPress={()=>set('accepted_commission', !f.accepted_commission)}>
              <View style={[st.check, f.accepted_commission&&st.checkOn]}>
                {f.accepted_commission && <Text style={st.checkTxt}>✓</Text>}
              </View>
              <View style={{flex:1}}>
                <Text style={st.optLabel}>I accept the 20% commission</Text>
                <Text style={st.optDesc}>
                  And the{' '}
                  <Text style={st.inlineLink} onPress={()=>router.push('/legal?doc=terms')}>
                    Terms of Service
                  </Text>
                  {' '}and{' '}
                  <Text style={st.inlineLink} onPress={()=>router.push('/legal?doc=privacy')}>
                    Privacy Notice
                  </Text>
                </Text>
              </View>
            </TouchableOpacity>

            <View style={st.summaryBox}>
              <Text style={st.summaryTitle}>Ready to submit</Text>
              {[
                ['Name',    `${f.first_name} ${f.last_name}`],
                ['Trades',  f.categories.map((id:string)=>findTrade(id)?.name).filter(Boolean).join(', ') || '—'],
                ['Works',   f.covers_all_malta && f.covers_all_gozo ? 'All Malta and Gozo'
                            : f.covers_all_malta ? 'All Malta'
                            : f.covers_all_gozo  ? 'All Gozo'
                            : `${f.service_areas.length} areas`],
                ...(hasHourly ? [['Rate', `€${f.hourly_rate}/hr · min ${f.min_hours}h`]] : []),
                ['Insured', f.has_insurance ? `Yes · ${f.insurance_provider}` : 'No'],
                ['Paid to', formatIban(f.iban) || '—'],
              ].map(([k,v])=>(
                <View key={k} style={st.summaryRow}>
                  <Text style={st.summaryKey}>{k}</Text>
                  <Text style={st.summaryVal}>{v}</Text>
                </View>
              ))}
            </View>

            <View style={st.noteBox}>
              <Text style={st.noteTxt}>
                By submitting you confirm everything here is true. False documents mean
                a permanent ban and, where relevant, a report to the police.
              </Text>
            </View>

            <View style={st.gdprBox}>
              <Text style={st.gdprTitle}>🔒  Your documents</Text>
              <Text style={st.gdprTxt}>
                Encrypted, seen only by our verification team, kept for 5 years after
                you leave. Ask for a copy or deletion any time.
              </Text>
              <TouchableOpacity onPress={()=>router.push('/legal?doc=privacy')}>
                <Text style={st.gdprLink}>Read the full Privacy Notice ›</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{height:30}} />
      </ScrollView>

      <View style={st.footer}>
        <TouchableOpacity style={[st.nextBtn, loading&&st.dis]} onPress={next} disabled={loading}>
          {loading ? <ActivityIndicator color={C.white} />
            : <Text style={st.nextTxt}>
                {step<STEPS.length-1 ? 'Continue  →' : '✓  Submit application'}
              </Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Upload({label, value, preview, uploading, onPress, required, hint, round}: any) {
  return (
    <View style={{gap:6, marginTop:18}}>
      <Text style={st.lbl}>{label}{required ? ' *' : ''}</Text>
      {hint ? <Text style={st.fieldNote}>{hint}</Text> : null}

      {value && preview ? (
        <TouchableOpacity style={st.previewBox} onPress={onPress} disabled={uploading}>
          <Image
            source={{ uri: preview }}
            style={round ? st.previewRound : st.previewImg}
            resizeMode="cover"
          />
          <View style={{flex:1}}>
            <Text style={st.previewOk}>✓ Uploaded</Text>
            <Text style={st.previewSwap}>Tap to replace</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[st.uploadBox, value&&st.uploadBoxOn]} onPress={onPress} disabled={uploading}>
          {uploading ? <ActivityIndicator color={C.primary} />
            : value ? <Text style={st.uploadDone}>✓  Uploaded — tap to replace</Text>
            : <Text style={st.uploadTxt}>📎  Choose a photo or PDF</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:60,paddingBottom:12},
  back:{fontSize:16,color:C.primary,fontWeight:'600'},
  title:{fontSize:17,fontWeight:'700',color:C.dark},
  stepNum:{fontSize:13,color:C.muted},
  progress:{flexDirection:'row',paddingHorizontal:12,marginBottom:12},
  pItem:{flex:1,alignItems:'center',gap:5},
  dot:{width:28,height:28,borderRadius:14,backgroundColor:C.bgAlt,borderWidth:2,borderColor:C.border,alignItems:'center',justifyContent:'center'},
  dotOn:{backgroundColor:C.primary,borderColor:C.primary},
  dotLocked:{opacity:0.4},
  dotTxt:{fontSize:11,fontWeight:'700',color:C.muted},
  dotTxtOn:{color:C.white},
  dotLbl:{fontSize:9,color:C.muted,fontWeight:'600',textAlign:'center'},
  dotLblOn:{color:C.primary},
  dotLblLocked:{opacity:0.4},
  body:{flex:1,paddingHorizontal:20},
  step:{paddingBottom:16},
  sectionHint:{fontSize:13,color:C.muted,lineHeight:19,marginTop:8,marginBottom:6},
  divider:{fontSize:14,fontWeight:'800',color:C.dark,marginTop:28,marginBottom:4},
  lbl:{fontSize:12,fontWeight:'700',color:C.muted,textTransform:'uppercase',letterSpacing:0.5,marginTop:16,marginBottom:8},
  fieldNote:{fontSize:12,color:C.muted,lineHeight:17,marginTop:6},
  input:{backgroundColor:C.white,borderRadius:14,paddingHorizontal:16,paddingVertical:14,fontSize:15,color:C.text,borderWidth:1.5,borderColor:C.border},
  inputBig:{backgroundColor:C.white,borderRadius:14,paddingHorizontal:16,paddingVertical:18,fontSize:26,fontWeight:'800',color:C.dark,borderWidth:2,borderColor:C.primary,textAlign:'center'},
  row2:{flexDirection:'row',gap:12},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
  chip:{paddingHorizontal:13,paddingVertical:9,borderRadius:12,backgroundColor:C.white,borderWidth:1.5,borderColor:C.border},
  chipOn:{backgroundColor:C.primary,borderColor:C.primary},
  chipTxt:{fontSize:12,fontWeight:'600',color:C.muted},
  chipTxtOn:{color:C.white},
  optCard:{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:14,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginBottom:8},
  optCardOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  optLabel:{fontSize:14,fontWeight:'700',color:C.dark},
  optDesc:{fontSize:12,color:C.muted,marginTop:3,lineHeight:17},
  radio:{width:22,height:22,borderRadius:11,borderWidth:2,borderColor:C.border,alignItems:'center',justifyContent:'center'},
  radioOn:{borderColor:C.primary},
  radioDot:{width:10,height:10,borderRadius:5,backgroundColor:C.primary},
  checkRow:{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:14,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginTop:8},
  checkRowOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  check:{width:22,height:22,borderRadius:7,borderWidth:2,borderColor:C.border,alignItems:'center',justifyContent:'center'},
  checkOn:{backgroundColor:C.primary,borderColor:C.primary},
  checkTxt:{color:C.white,fontSize:13,fontWeight:'800'},
  inlineLink:{color:C.primary,fontWeight:'700'},
  uploadBox:{backgroundColor:C.white,borderRadius:14,paddingVertical:20,alignItems:'center',borderWidth:2,borderStyle:'dashed',borderColor:C.border},
  uploadBoxOn:{borderColor:C.green,borderStyle:'solid',backgroundColor:C.greenLt},
  uploadTxt:{fontSize:14,color:C.muted,fontWeight:'600'},
  uploadDone:{fontSize:14,color:C.green,fontWeight:'700'},
  previewBox:{flexDirection:'row',alignItems:'center',gap:14,backgroundColor:C.greenLt,borderRadius:14,padding:12,borderWidth:1,borderColor:'#A7F3D0'},
  previewImg:{width:64,height:64,borderRadius:10,backgroundColor:C.bgAlt},
  previewRound:{width:64,height:64,borderRadius:32,backgroundColor:C.bgAlt},
  previewOk:{fontSize:14,fontWeight:'800',color:C.green},
  previewSwap:{fontSize:12,color:C.muted,marginTop:2},
  pickedBar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:C.primaryLt,borderRadius:12,paddingHorizontal:14,paddingVertical:10,marginBottom:14,marginTop:8,borderWidth:1,borderColor:C.border},
  pickedTxt:{fontSize:13,fontWeight:'800',color:C.primary},
  pickedClear:{fontSize:12,color:C.muted,fontWeight:'700'},
  tradeGroup:{marginBottom:18},
  tradeGroupHead:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8},
  tradeGroupTitle:{fontSize:13,fontWeight:'800',color:C.dark},
  tradeGroupCount:{backgroundColor:C.primary,minWidth:20,height:20,borderRadius:10,alignItems:'center',justifyContent:'center',paddingHorizontal:6},
  tradeGroupCountTxt:{fontSize:11,fontWeight:'800',color:C.white},
  tradeWrap:{flexDirection:'row',flexWrap:'wrap',gap:8},
  tradePill:{paddingHorizontal:12,paddingVertical:9,borderRadius:20,backgroundColor:C.white,borderWidth:1.5,borderColor:C.border},
  tradePillOn:{backgroundColor:C.primary,borderColor:C.primary},
  tradePillTxt:{fontSize:12,fontWeight:'600',color:C.muted},
  tradePillTxtOn:{color:C.white},
  roadBox:{backgroundColor:C.amberLt,borderRadius:16,padding:16,marginTop:4,marginBottom:8,gap:10,borderWidth:1,borderColor:'#FDE68A'},
  roadTitle:{fontSize:14,fontWeight:'800',color:C.amber},
  roadTxt:{fontSize:12,color:C.text,lineHeight:18},
  calcBox:{backgroundColor:C.bgAlt,borderRadius:14,padding:14,gap:8,marginTop:12,borderWidth:1,borderColor:C.border},
  calcRow:{flexDirection:'row',justifyContent:'space-between'},
  calcLbl:{fontSize:13,color:C.muted},
  calcVal:{fontSize:14,fontWeight:'700',color:C.dark},
  commissionBox:{backgroundColor:C.white,borderRadius:16,padding:16,marginTop:24,gap:10,borderWidth:1,borderColor:C.border,...S.sm},
  commissionTitle:{fontSize:15,fontWeight:'800',color:C.dark,marginBottom:2},
  commissionRow:{flexDirection:'row',gap:10},
  commissionDot:{fontSize:14,color:C.primary,fontWeight:'800'},
  commissionA:{fontSize:13,fontWeight:'700',color:C.text},
  commissionB:{fontSize:12,color:C.muted,marginTop:2,lineHeight:16},
  noteBox:{backgroundColor:C.amberLt,borderRadius:12,padding:14,marginTop:16,borderWidth:1,borderColor:'#FDE68A'},
  noteTxt:{fontSize:12,color:C.text,lineHeight:18},
  gdprBox:{backgroundColor:C.primaryLt,borderRadius:14,padding:16,marginTop:14,gap:8,borderWidth:1,borderColor:C.border},
  gdprTitle:{fontSize:14,fontWeight:'800',color:C.primary},
  gdprTxt:{fontSize:12,color:C.text,lineHeight:18},
  gdprLink:{fontSize:12,color:C.primary,fontWeight:'700',marginTop:2},
  summaryBox:{backgroundColor:C.white,borderRadius:16,padding:16,marginTop:20,borderWidth:1,borderColor:C.border,...S.sm},
  summaryTitle:{fontSize:15,fontWeight:'800',color:C.dark,marginBottom:10},
  summaryRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:7,borderBottomWidth:1,borderBottomColor:C.bg,gap:12},
  summaryKey:{fontSize:13,color:C.muted,fontWeight:'600'},
  summaryVal:{fontSize:13,color:C.text,fontWeight:'700',flex:1,textAlign:'right'},
  errBox:{backgroundColor:C.redLt,borderRadius:12,padding:14,marginTop:12,borderWidth:1,borderColor:'#FECACA'},
  errTitle:{fontSize:13,color:C.red,fontWeight:'800',marginBottom:6},
  errItem:{fontSize:13,color:C.red,fontWeight:'600',lineHeight:20},
  footer:{paddingHorizontal:20,paddingVertical:16,backgroundColor:C.white,borderTopWidth:1,borderTopColor:C.border},
  nextBtn:{backgroundColor:C.primary,borderRadius:16,paddingVertical:17,alignItems:'center',...S.md},
  nextTxt:{color:C.white,fontSize:16,fontWeight:'700'},
  dis:{opacity:0.6},
  centerWrap:{flex:1,backgroundColor:C.bg,alignItems:'center',justifyContent:'center',padding:32,gap:14},
  bigIcon:{fontSize:64},
  centerTitle:{fontSize:24,fontWeight:'800',color:C.dark,textAlign:'center'},
  centerTxt:{fontSize:14,color:C.muted,textAlign:'center',lineHeight:21},
  primaryBtn:{backgroundColor:C.primary,borderRadius:16,paddingVertical:16,paddingHorizontal:36,marginTop:12,...S.md},
  primaryTxt:{color:C.white,fontSize:16,fontWeight:'700'},
  outlineBtn:{borderWidth:1.5,borderColor:C.border,borderRadius:16,paddingVertical:14,paddingHorizontal:32,marginTop:12,backgroundColor:C.white},
  outlineTxt:{color:C.text,fontSize:15,fontWeight:'600'},
  ghostBtn:{paddingVertical:12},
  ghostTxt:{color:C.muted,fontSize:14,fontWeight:'600'},
});
