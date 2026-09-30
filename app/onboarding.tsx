import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform
} from 'react-native';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { CATEGORIES, tradesIn } from '../constants/trades';

const STEPS = ['Identity', 'Documents', 'Work', 'Service', 'Payment'];

const NATIONALITIES = ['Malta','Italy','Turkey','Philippines','Serbia','Ukraine','India','Nepal','Bulgaria','Romania','Other'];
const ID_TYPES = [
  { k:'malta_id',         label:'Malta ID' },
  { k:'passport',         label:'Passport' },
  { k:'residence_permit', label:'Residence Permit' },
];
const WORK_AUTH = [
  { k:'eu_citizen',     label:'EU Citizen',      desc:'No permit needed' },
  { k:'malta_resident', label:'Malta Resident',  desc:'Residence card holder' },
  { k:'work_permit',    label:'Work Permit',     desc:'Single permit / employment licence' },
  { k:'none',           label:'None yet',        desc:'Applied or in process' },
];
const TEAM_TYPES = [
  { k:'solo',    label:'Solo',       desc:'I work alone' },
  { k:'duo',     label:'Two people', desc:'We always work as a pair' },
  { k:'company', label:'Company',    desc:'Registered cleaning business' },
];
const AREAS = ['Sliema',"St. Julian's",'Valletta','Gzira','Msida','Birkirkara','Attard','Mosta','Naxxar','Qormi','Paola','Marsaskala','Mellieha','Gozo'];

export default function Onboarding() {
  const [step, setStep]           = useState(0);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [missing, setMissing]     = useState<string[]>([]);
  const [status, setStatus]       = useState<string|null>(null);
  const [uploading, setUploading] = useState<string|null>(null);

  const [f, setF] = useState<any>({
    first_name:'', last_name:'', date_of_birth:'', nationality:'',
    id_type:'malta_id', id_number:'',
    id_front_url:'', id_back_url:'', selfie_url:'',
    phone:'', email:'', address:'', locality:'',
    emergency_name:'', emergency_phone:'',
    work_authorization:'eu_citizen', work_permit_url:'', work_permit_expiry:'',
    team_type:'solo', team_size:1, company_name:'', vat_number:'', company_reg_number:'',
    categories:['cleaning'] as string[],
    accepts_urgent:false, service_radius_km:'15',
    hourly_rate:'15', min_hours:'3', service_areas:[] as string[],
    brings_own_supplies:false, bio:'',
    iban:'', bank_name:'', account_holder:'',
    rejection_reason:'',
  });

  const set = (k:string, v:any) => { setF((p:any)=>({...p,[k]:v})); setError(''); setMissing([]); };

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
        if (prof?.full_name) {
          const parts = prof.full_name.split(' ');
          setF((p:any)=>({ ...p, first_name: parts[0]||'', last_name: parts.slice(1).join(' ')||'', email: user.email||'' }));
        }
      }
    })();
  }, []);

  const pickFile = (field:string) => {
    if (Platform.OS !== 'web') { setError('File upload is available on web for now.'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e:any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5*1024*1024) { setError('File must be under 5 MB.'); return; }
      setUploading(field); setError('');
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { setUploading(null); return; }
      const ext  = file.name.split('.').pop();
      const path = user.id + '/' + field + '_' + Date.now() + '.' + ext;
      const { error: upErr } = await supabase.storage.from('verification-docs').upload(path, file, { upsert:true });
      setUploading(null);
      if (upErr) { setError('Upload failed: ' + upErr.message); return; }
      set(field, path);
    };
    input.click();
  };

  const validate = (s:number): string[] => {
    const miss: string[] = [];
    if (s===0) {
      if (!f.first_name)    miss.push('First name');
      if (!f.last_name)     miss.push('Last name');
      if (!f.date_of_birth) miss.push('Date of birth');
      if (!f.nationality)   miss.push('Nationality');
      if (!f.phone)         miss.push('Phone');
      if (!f.email)         miss.push('Email');
      if (!f.address)       miss.push('Address in Malta');
    }
    if (s===1) {
      if (!f.id_number)     miss.push('Document number');
      if (!f.id_front_url)  miss.push('Front of document');
      if (!f.selfie_url)    miss.push('Selfie holding your document');
    }
    if (s===2) {
      if (f.work_authorization==='work_permit' && !f.work_permit_url) miss.push('Work permit document');
      if (f.team_type==='company' && !f.company_name)                 miss.push('Company name');
    }
    if (s===3) {
      if (!f.categories || f.categories.length === 0) miss.push('At least one trade');
      if (!f.hourly_rate || Number(f.hourly_rate) <= 0) miss.push('Hourly rate');
      if (!f.min_hours   || Number(f.min_hours)   <= 0) miss.push('Minimum hours');
      if (f.service_areas.length===0)                   miss.push('At least one service area');
    }
    if (s===4) {
      if (!f.account_holder) miss.push('Account holder name');
      if (!f.iban)           miss.push('IBAN');
    }
    return miss;
  };

  const saveDraft = async () => {
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload:any = {
      id: user.id,
      first_name:f.first_name, last_name:f.last_name,
      date_of_birth:f.date_of_birth || null, nationality:f.nationality,
      id_type:f.id_type, id_number:f.id_number,
      id_front_url:f.id_front_url, id_back_url:f.id_back_url, selfie_url:f.selfie_url,
      phone:f.phone, email:f.email, address:f.address, locality:f.locality,
      emergency_name:f.emergency_name, emergency_phone:f.emergency_phone,
      work_authorization:f.work_authorization,
      work_permit_url:f.work_permit_url,
      work_permit_expiry:f.work_permit_expiry || null,
      team_type:f.team_type,
      team_size:f.team_type==='solo'?1:(f.team_type==='duo'?2:Number(f.team_size)||1),
      company_name:f.company_name, vat_number:f.vat_number, company_reg_number:f.company_reg_number,
      categories: f.categories && f.categories.length ? f.categories : ['cleaning'],
      accepts_urgent: !!f.accepts_urgent,
      service_radius_km: Number(f.service_radius_km) || 15,
      hourly_rate:Number(f.hourly_rate)||15, min_hours:Number(f.min_hours)||3,
      service_areas:f.service_areas, brings_own_supplies:f.brings_own_supplies, bio:f.bio,
      iban:f.iban, bank_name:f.bank_name, account_holder:f.account_holder,
      verification_status:'draft',
      updated_at:new Date().toISOString(),
    };
    const { error: e } = await supabase.from('cleaner_profiles').upsert(payload);
    if (e) console.log('saveDraft error:', e.message);
  };

  const next = async () => {
    const miss = validate(step);
    if (miss.length) { setMissing(miss); setError(''); return; }
    setMissing([]); setError('');
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

    const payload = {
      id: user.id,
      first_name:f.first_name, last_name:f.last_name,
      date_of_birth:f.date_of_birth || null, nationality:f.nationality,
      id_type:f.id_type, id_number:f.id_number,
      id_front_url:f.id_front_url, id_back_url:f.id_back_url, selfie_url:f.selfie_url,
      phone:f.phone, email:f.email, address:f.address, locality:f.locality,
      emergency_name:f.emergency_name, emergency_phone:f.emergency_phone,
      work_authorization:f.work_authorization,
      work_permit_url:f.work_permit_url,
      work_permit_expiry:f.work_permit_expiry || null,
      team_type:f.team_type,
      team_size:f.team_type==='solo'?1:(f.team_type==='duo'?2:Number(f.team_size)||1),
      company_name:f.company_name, vat_number:f.vat_number, company_reg_number:f.company_reg_number,
      categories: f.categories && f.categories.length ? f.categories : ['cleaning'],
      accepts_urgent: !!f.accepts_urgent,
      service_radius_km: Number(f.service_radius_km) || 15,
      hourly_rate:Number(f.hourly_rate), min_hours:Number(f.min_hours),
      service_areas:f.service_areas, brings_own_supplies:f.brings_own_supplies, bio:f.bio,
      iban:f.iban, bank_name:f.bank_name, account_holder:f.account_holder,
      verification_status:'submitted',
      submitted_at:new Date().toISOString(),
      updated_at:new Date().toISOString(),
    };

    const { error: err } = await supabase.from('cleaner_profiles').upsert(payload);
    setLoading(false);
    if (err) { setError(err.message); return; }
    setStatus('submitted');
  };

  if (status==='submitted' || status==='under_review') {
    return (
      <View style={st.centerWrap}>
        <Text style={st.bigIcon}>⏳</Text>
        <Text style={st.centerTitle}>Application under review</Text>
        <Text style={st.centerTxt}>
          Thanks! Our team is checking your documents. This usually takes 1–2 working days.
          You will be able to accept jobs as soon as you are approved.
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
        <Text style={st.centerTitle}>You are verified!</Text>
        <Text style={st.centerTxt}>Your profile is live. Clients can now book you.</Text>
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
        <Text style={st.centerTitle}>Application needs changes</Text>
        <Text style={st.centerTxt}>{f.rejection_reason || 'Please review your details and resubmit.'}</Text>
        <TouchableOpacity style={st.primaryBtn} onPress={()=>{setStatus('draft');setStep(0);}}>
          <Text style={st.primaryTxt}>Update application</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
          // A step is reachable if every step before it passes validation
          let reachable = true;
          for (let j=0; j<i; j++) { if (validate(j).length) { reachable = false; break; } }
          const done = i < step && validate(i).length === 0;
          return (
            <TouchableOpacity key={s} style={st.pItem} disabled={!reachable}
              onPress={()=>{ if (reachable) { setError(''); setMissing([]); setStep(i); } }}>
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
            <Text style={st.errTitle}>Please complete these fields:</Text>
            {missing.map(m => (
              <Text key={m} style={st.errItem}>•  {m}</Text>
            ))}
          </View>
        )}
        {error ? <View style={st.errBox}><Text style={st.errTxt}>⚠️  {error}</Text></View> : null}

        {step===0 && (
          <View style={st.step}>
            <Text style={st.sectionHint}>We need this to verify who you are and to pay you correctly.</Text>
            <View style={st.row2}>
              <View style={{flex:1}}>
                <Text style={st.lbl}>First name</Text>
                <TextInput style={st.input} value={f.first_name} onChangeText={(t:string)=>set('first_name',t)}
                  placeholder="Maria" placeholderTextColor={C.muted} />
              </View>
              <View style={{flex:1}}>
                <Text style={st.lbl}>Last name</Text>
                <TextInput style={st.input} value={f.last_name} onChangeText={(t:string)=>set('last_name',t)}
                  placeholder="Sciberras" placeholderTextColor={C.muted} />
              </View>
            </View>

            <Text style={st.lbl}>Date of birth</Text>
            <TextInput style={st.input} value={f.date_of_birth} onChangeText={(t:string)=>set('date_of_birth',t)}
              placeholder="YYYY-MM-DD" placeholderTextColor={C.muted} />

            <Text style={st.lbl}>Nationality</Text>
            <View style={st.chips}>
              {NATIONALITIES.map(n=>(
                <TouchableOpacity key={n} style={[st.chip, f.nationality===n&&st.chipOn]} onPress={()=>set('nationality',n)}>
                  <Text style={[st.chipTxt, f.nationality===n&&st.chipTxtOn]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={st.lbl}>Phone</Text>
            <TextInput style={st.input} value={f.phone} onChangeText={(t:string)=>set('phone',t)}
              placeholder="+356 ..." placeholderTextColor={C.muted} keyboardType="phone-pad" />

            <Text style={st.lbl}>Email</Text>
            <TextInput style={st.input} value={f.email} onChangeText={(t:string)=>set('email',t)}
              placeholder="you@example.com" placeholderTextColor={C.muted} autoCapitalize="none" keyboardType="email-address" />

            <Text style={st.lbl}>Address in Malta</Text>
            <TextInput style={st.input} value={f.address} onChangeText={(t:string)=>set('address',t)}
              placeholder="Flat 3, 12 Tower Road" placeholderTextColor={C.muted} />

            <Text style={st.lbl}>Locality</Text>
            <TextInput style={st.input} value={f.locality} onChangeText={(t:string)=>set('locality',t)}
              placeholder="Sliema" placeholderTextColor={C.muted} />

            <Text style={st.divider}>Emergency contact (optional)</Text>
            <View style={st.row2}>
              <View style={{flex:1}}>
                <Text style={st.lbl}>Name</Text>
                <TextInput style={st.input} value={f.emergency_name} onChangeText={(t:string)=>set('emergency_name',t)}
                  placeholder="Full name" placeholderTextColor={C.muted} />
              </View>
              <View style={{flex:1}}>
                <Text style={st.lbl}>Phone</Text>
                <TextInput style={st.input} value={f.emergency_phone} onChangeText={(t:string)=>set('emergency_phone',t)}
                  placeholder="+356 ..." placeholderTextColor={C.muted} keyboardType="phone-pad" />
              </View>
            </View>
          </View>
        )}

        {step===1 && (
          <View style={st.step}>
            <Text style={st.sectionHint}>
              Your documents are private. Only our verification team can see them, never clients.
            </Text>

            <Text style={st.lbl}>Document type</Text>
            <View style={st.chips}>
              {ID_TYPES.map(t=>(
                <TouchableOpacity key={t.k} style={[st.chip, f.id_type===t.k&&st.chipOn]} onPress={()=>set('id_type',t.k)}>
                  <Text style={[st.chipTxt, f.id_type===t.k&&st.chipTxtOn]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={st.lbl}>Document number</Text>
            <TextInput style={st.input} value={f.id_number} onChangeText={(t:string)=>set('id_number',t)}
              placeholder="0000000M" placeholderTextColor={C.muted} autoCapitalize="characters" />

            <UploadRow label="Front of document" value={f.id_front_url}
              uploading={uploading==='id_front_url'} onPress={()=>pickFile('id_front_url')} required />
            <UploadRow label="Back of document" value={f.id_back_url}
              uploading={uploading==='id_back_url'} onPress={()=>pickFile('id_back_url')} />
            <UploadRow label="Selfie holding your document" value={f.selfie_url}
              uploading={uploading==='selfie_url'} onPress={()=>pickFile('selfie_url')} required
              hint="Hold your ID next to your face. This stops anyone using someone else's account." />
          </View>
        )}

        {step===2 && (
          <View style={st.step}>
            <Text style={st.lbl}>Right to work in Malta</Text>
            {WORK_AUTH.map(w=>(
              <TouchableOpacity key={w.k} style={[st.optCard, f.work_authorization===w.k&&st.optCardOn]}
                onPress={()=>set('work_authorization',w.k)}>
                <Text style={st.optLabel}>{w.label}</Text>
                <Text style={st.optDesc}>{w.desc}</Text>
              </TouchableOpacity>
            ))}

            {f.work_authorization==='work_permit' && (
              <>
                <UploadRow label="Work permit document" value={f.work_permit_url}
                  uploading={uploading==='work_permit_url'} onPress={()=>pickFile('work_permit_url')} required />
                <Text style={st.lbl}>Permit expiry date</Text>
                <TextInput style={st.input} value={f.work_permit_expiry} onChangeText={(t:string)=>set('work_permit_expiry',t)}
                  placeholder="YYYY-MM-DD" placeholderTextColor={C.muted} />
              </>
            )}

            {f.work_authorization==='none' && (
              <View style={st.noteBox}>
                <Text style={st.noteTxt}>
                  You can still apply. Our team will review your case individually and decide.
                </Text>
              </View>
            )}

            <Text style={st.divider}>How do you work?</Text>
            {TEAM_TYPES.map(t=>(
              <TouchableOpacity key={t.k} style={[st.optCard, f.team_type===t.k&&st.optCardOn]}
                onPress={()=>set('team_type',t.k)}>
                <Text style={st.optLabel}>{t.label}</Text>
                <Text style={st.optDesc}>{t.desc}</Text>
              </TouchableOpacity>
            ))}

            {f.team_type==='company' && (
              <>
                <Text style={st.lbl}>Company name</Text>
                <TextInput style={st.input} value={f.company_name} onChangeText={(t:string)=>set('company_name',t)}
                  placeholder="Clean Co Ltd" placeholderTextColor={C.muted} />
                <View style={st.row2}>
                  <View style={{flex:1}}>
                    <Text style={st.lbl}>VAT number</Text>
                    <TextInput style={st.input} value={f.vat_number} onChangeText={(t:string)=>set('vat_number',t)}
                      placeholder="MT..." placeholderTextColor={C.muted} />
                  </View>
                  <View style={{flex:1}}>
                    <Text style={st.lbl}>Reg. number</Text>
                    <TextInput style={st.input} value={f.company_reg_number} onChangeText={(t:string)=>set('company_reg_number',t)}
                      placeholder="C 12345" placeholderTextColor={C.muted} />
                  </View>
                </View>
                <Text style={st.lbl}>How many cleaners can you send?</Text>
                <View style={st.chips}>
                  {[1,2,3,4,5,6].map(n=>(
                    <TouchableOpacity key={n} style={[st.chip, Number(f.team_size)===n&&st.chipOn]} onPress={()=>set('team_size',n)}>
                      <Text style={[st.chipTxt, Number(f.team_size)===n&&st.chipTxtOn]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {step===3 && (
          <View style={st.step}>
            <Text style={st.sectionHint}>
              Tell us what you do and what you charge. Poji keeps a flat 20% commission.
            </Text>

            <Text style={st.lbl}>What work do you take?</Text>
            <Text style={st.uploadHint}>
              Pick everything you're qualified for — a company can cover many trades.
              You can change this later.
            </Text>

            {(f.categories||[]).length > 0 && (
              <View style={st.pickedBar}>
                <Text style={st.pickedTxt}>
                  {(f.categories||[]).length} trade{(f.categories||[]).length>1?'s':''} selected
                </Text>
                <TouchableOpacity onPress={()=>set('categories', [])}>
                  <Text style={st.pickedClear}>Clear all</Text>
                </TouchableOpacity>
              </View>
            )}

            {CATEGORIES.map(cat=>{
              const items = tradesIn(cat.id);
              const chosen = items.filter(t=>(f.categories||[]).includes(t.id)).length;
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
                      const on = (f.categories||[]).includes(t.id);
                      return (
                        <TouchableOpacity key={t.id} style={[st.tradePill, on&&st.tradePillOn]}
                          onPress={()=>set('categories', on
                            ? f.categories.filter((x:string)=>x!==t.id)
                            : [...(f.categories||[]), t.id])}>
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

            {tradesIn('vehicle').some(t=>(f.categories||[]).includes(t.id)) && (
              <View style={st.roadBox}>
                <Text style={st.roadTitle}>🛞  Roadside work</Text>
                <Text style={st.roadTxt}>
                  Callout jobs are paid at a fixed price per job, not by the hour.
                  You see the price before accepting.
                </Text>

                <TouchableOpacity style={[st.urgentRow, f.accepts_urgent&&st.urgentRowOn]}
                  onPress={()=>set('accepts_urgent', !f.accepts_urgent)}>
                  <View style={[st.tradeCheck, f.accepts_urgent&&st.tradeCheckOn]}>
                    {f.accepts_urgent && <Text style={st.tradeCheckTxt}>✓</Text>}
                  </View>
                  <View style={{flex:1}}>
                    <Text style={st.tradeName}>I take emergency callouts</Text>
                    <Text style={st.tradeDesc}>Drop everything and go. These pay 25% more.</Text>
                  </View>
                </TouchableOpacity>

                <Text style={st.lbl}>How far will you travel?</Text>
                <View style={st.chips}>
                  {[5,10,15,25,40].map(km=>(
                    <TouchableOpacity key={km}
                      style={[st.chip, Number(f.service_radius_km)===km&&st.chipOn]}
                      onPress={()=>set('service_radius_km', km)}>
                      <Text style={[st.chipTxt, Number(f.service_radius_km)===km&&st.chipTxtOn]}>
                        {km} km
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <Text style={st.lbl}>Your hourly rate (EUR)</Text>
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
                <Text style={st.calcLbl}>Platform (20%)</Text>
                <Text style={st.calcVal}>€{(Number(f.hourly_rate||0)*0.2).toFixed(2)}</Text>
              </View>
            </View>

            <Text style={st.lbl}>Minimum hours per job</Text>
            <View style={st.chips}>
              {[2,2.5,3,3.5,4].map(h=>(
                <TouchableOpacity key={h} style={[st.chip, Number(f.min_hours)===h&&st.chipOn]} onPress={()=>set('min_hours',h)}>
                  <Text style={[st.chipTxt, Number(f.min_hours)===h&&st.chipTxtOn]}>{h}h</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={st.lbl}>Do you bring your own supplies?</Text>
            <View style={st.chips}>
              {[{k:true,l:'Yes, I bring everything'},{k:false,l:'No, client provides'}].map(o=>(
                <TouchableOpacity key={String(o.k)} style={[st.chip, f.brings_own_supplies===o.k&&st.chipOn]}
                  onPress={()=>set('brings_own_supplies',o.k)}>
                  <Text style={[st.chipTxt, f.brings_own_supplies===o.k&&st.chipTxtOn]}>{o.l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={st.lbl}>Where do you work?</Text>
            <View style={st.chips}>
              {AREAS.map(a=>{
                const on = f.service_areas.includes(a);
                return (
                  <TouchableOpacity key={a} style={[st.chip, on&&st.chipOn]}
                    onPress={()=>set('service_areas', on ? f.service_areas.filter((x:string)=>x!==a) : [...f.service_areas,a])}>
                    <Text style={[st.chipTxt, on&&st.chipTxtOn]}>{a}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={st.lbl}>Short bio (shown to clients)</Text>
            <TextInput style={[st.input,{minHeight:90}]} value={f.bio} onChangeText={(t:string)=>set('bio',t)}
              placeholder="5 years of experience, specialising in deep cleans..."
              placeholderTextColor={C.muted} multiline textAlignVertical="top" />
          </View>
        )}

        {step===4 && (
          <View style={st.step}>
            <Text style={st.sectionHint}>
              We pay out to this account. Make sure the name matches your ID.
            </Text>

            <Text style={st.lbl}>Account holder name</Text>
            <TextInput style={st.input} value={f.account_holder} onChangeText={(t:string)=>set('account_holder',t)}
              placeholder="As shown on your bank account" placeholderTextColor={C.muted} />

            <Text style={st.lbl}>IBAN</Text>
            <TextInput style={st.input} value={f.iban} onChangeText={(t:string)=>set('iban',t.toUpperCase())}
              placeholder="MT84 MALT 0110 0001 2345 ..." placeholderTextColor={C.muted} autoCapitalize="characters" />

            <Text style={st.lbl}>Bank name</Text>
            <TextInput style={st.input} value={f.bank_name} onChangeText={(t:string)=>set('bank_name',t)}
              placeholder="BOV / HSBC / Revolut ..." placeholderTextColor={C.muted} />

            <View style={st.summaryBox}>
              <Text style={st.summaryTitle}>Ready to submit</Text>
              {[
                ['Name',  f.first_name + ' ' + f.last_name],
                ['Type',  TEAM_TYPES.find(t=>t.k===f.team_type)?.label || ''],
                ['Trades', `${(f.categories||[]).length} selected`],
                ['Rate',  '€' + f.hourly_rate + '/hr · min ' + f.min_hours + 'h'],
                ['Areas', f.service_areas.slice(0,3).join(', ') + (f.service_areas.length>3 ? ' +' + (f.service_areas.length-3) : '')],
              ].map(([k,v])=>(
                <View key={k} style={st.summaryRow}>
                  <Text style={st.summaryKey}>{k}</Text>
                  <Text style={st.summaryVal}>{v}</Text>
                </View>
              ))}
            </View>

            <View style={st.noteBox}>
              <Text style={st.noteTxt}>
                By submitting you confirm all information is true. False documents will result in a permanent ban.
              </Text>
            </View>

            <View style={st.gdprBox}>
              <Text style={st.gdprTitle}>🔒  How we handle your documents</Text>
              <Text style={st.gdprTxt}>
                Your ID and selfie are stored encrypted and seen only by our verification
                team — never by clients. We keep them for 5 years after you leave the
                platform, as Maltese law requires.
              </Text>
              <Text style={st.gdprTxt}>
                You can ask for a copy, a correction or deletion at any time.
              </Text>
              <TouchableOpacity onPress={()=>router.push('/legal?doc=privacy')}>
                <Text style={st.gdprLink}>Read the full Privacy Notice ›</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{height:24}} />
      </ScrollView>

      <View style={st.footer}>
        <TouchableOpacity style={[st.nextBtn, loading&&st.dis]} onPress={next} disabled={loading}>
          {loading ? <ActivityIndicator color={C.white} />
            : <Text style={st.nextTxt}>{step<STEPS.length-1 ? 'Continue  →' : '✓  Submit Application'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function UploadRow({label, value, uploading, onPress, required, hint}:any) {
  return (
    <View style={{gap:6, marginTop:16}}>
      <Text style={st.lbl}>{label}{required ? ' *' : ''}</Text>
      {hint ? <Text style={st.uploadHint}>{hint}</Text> : null}
      <TouchableOpacity style={[st.uploadBox, value&&st.uploadBoxOn]} onPress={onPress} disabled={uploading}>
        {uploading ? <ActivityIndicator color={C.primary} />
          : value ? <Text style={st.uploadDone}>✓  Uploaded — tap to replace</Text>
          : <Text style={st.uploadTxt}>Choose file</Text>}
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:60,paddingBottom:12},
  back:{fontSize:16,color:C.primary,fontWeight:'600'},
  title:{fontSize:17,fontWeight:'700',color:C.dark},
  stepNum:{fontSize:13,color:C.muted},
  progress:{flexDirection:'row',paddingHorizontal:16,marginBottom:12},
  pItem:{flex:1,alignItems:'center',gap:5},
  dot:{width:28,height:28,borderRadius:14,backgroundColor:C.bgAlt,borderWidth:2,borderColor:C.border,alignItems:'center',justifyContent:'center'},
  dotOn:{backgroundColor:C.primary,borderColor:C.primary},
  dotTxt:{fontSize:11,fontWeight:'700',color:C.muted},
  dotTxtOn:{color:C.white},
  dotLbl:{fontSize:10,color:C.muted,fontWeight:'600'},
  dotLblOn:{color:C.primary},
  dotLocked:{opacity:0.4},
  dotLblLocked:{opacity:0.4},
  body:{flex:1,paddingHorizontal:20},
  step:{paddingBottom:16},
  sectionHint:{fontSize:13,color:C.muted,lineHeight:19,marginTop:8,marginBottom:4},
  divider:{fontSize:13,fontWeight:'800',color:C.dark,marginTop:24,marginBottom:4},
  lbl:{fontSize:12,fontWeight:'700',color:C.muted,textTransform:'uppercase',letterSpacing:0.5,marginTop:16,marginBottom:8},
  input:{backgroundColor:C.white,borderRadius:14,paddingHorizontal:16,paddingVertical:14,fontSize:15,color:C.text,borderWidth:1.5,borderColor:C.border},
  inputBig:{backgroundColor:C.white,borderRadius:14,paddingHorizontal:16,paddingVertical:18,fontSize:26,fontWeight:'800',color:C.dark,borderWidth:2,borderColor:C.primary,textAlign:'center'},
  row2:{flexDirection:'row',gap:12},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
  tradeRow:{flexDirection:'row',alignItems:'center',gap:12,padding:13,borderRadius:14,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white},
  tradeRowOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  tradeCheck:{width:22,height:22,borderRadius:7,borderWidth:2,borderColor:C.border,alignItems:'center',justifyContent:'center'},
  tradeCheckOn:{backgroundColor:C.primary,borderColor:C.primary},
  tradeCheckTxt:{color:C.white,fontSize:13,fontWeight:'800'},
  tradeIcon:{fontSize:22},
  tradeName:{fontSize:14,fontWeight:'700',color:C.dark},
  tradeDesc:{fontSize:11,color:C.muted,marginTop:2},
  roadBox:{backgroundColor:C.amberLt,borderRadius:16,padding:16,marginTop:16,gap:10,borderWidth:1,borderColor:'#FDE68A'},
  roadTitle:{fontSize:14,fontWeight:'800',color:C.amber},
  roadTxt:{fontSize:12,color:C.text,lineHeight:18},
  urgentRow:{flexDirection:'row',alignItems:'center',gap:12,padding:13,borderRadius:12,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white},
  urgentRowOn:{borderColor:C.amber,backgroundColor:C.white},
  chip:{paddingHorizontal:14,paddingVertical:10,borderRadius:12,backgroundColor:C.white,borderWidth:1.5,borderColor:C.border},
  chipOn:{backgroundColor:C.primary,borderColor:C.primary},
  chipTxt:{fontSize:13,fontWeight:'600',color:C.muted},
  chipTxtOn:{color:C.white},
  optCard:{padding:14,borderRadius:14,borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginBottom:8},
  optCardOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  optLabel:{fontSize:14,fontWeight:'700',color:C.dark},
  optDesc:{fontSize:12,color:C.muted,marginTop:3},
  uploadHint:{fontSize:12,color:C.muted,lineHeight:17},
  uploadBox:{backgroundColor:C.white,borderRadius:14,paddingVertical:20,alignItems:'center',borderWidth:2,borderStyle:'dashed',borderColor:C.border},
  uploadBoxOn:{borderColor:C.green,borderStyle:'solid',backgroundColor:C.greenLt},
  uploadTxt:{fontSize:14,color:C.muted,fontWeight:'600'},
  uploadDone:{fontSize:14,color:C.green,fontWeight:'700'},
  calcBox:{backgroundColor:C.bgAlt,borderRadius:14,padding:14,gap:8,marginTop:12,borderWidth:1,borderColor:C.border},
  calcRow:{flexDirection:'row',justifyContent:'space-between'},
  calcLbl:{fontSize:13,color:C.muted},
  calcVal:{fontSize:14,fontWeight:'700',color:C.dark},
  gdprBox:{backgroundColor:C.primaryLt,borderRadius:14,padding:16,marginTop:14,gap:8,borderWidth:1,borderColor:C.border},
  gdprTitle:{fontSize:14,fontWeight:'800',color:C.primary},
  gdprTxt:{fontSize:12,color:C.text,lineHeight:18},
  gdprLink:{fontSize:12,color:C.primary,fontWeight:'700',marginTop:2},
  noteBox:{backgroundColor:C.amberLt,borderRadius:12,padding:14,marginTop:16,borderWidth:1,borderColor:'#FDE68A'},
  noteTxt:{fontSize:12,color:C.text,lineHeight:18},
  summaryBox:{backgroundColor:C.white,borderRadius:16,padding:16,marginTop:20,borderWidth:1,borderColor:C.border,...S.sm},
  summaryTitle:{fontSize:15,fontWeight:'800',color:C.dark,marginBottom:10},
  summaryRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:7,borderBottomWidth:1,borderBottomColor:C.bg},
  summaryKey:{fontSize:13,color:C.muted,fontWeight:'600'},
  summaryVal:{fontSize:13,color:C.text,fontWeight:'700',flex:1,textAlign:'right'},
  errBox:{backgroundColor:C.redLt,borderRadius:12,padding:14,marginTop:12,borderWidth:1,borderColor:'#FECACA'},
  errTxt:{fontSize:13,color:C.red,fontWeight:'600'},
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
