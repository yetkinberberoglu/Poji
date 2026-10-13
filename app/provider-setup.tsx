import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Image
} from 'react-native';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { CATEGORIES, tradesIn, findTrade, useTrades } from '../constants/trades';
import PhoneVerify from '../components/PhoneVerify';
import Picker from '../components/Picker';
import AvailabilityGrid from '../components/AvailabilityGrid';
import { DEFAULT_AVAILABILITY, countSlots, type Availability } from '../lib/availability';
import { loadServiceTypes, type ServiceType } from '../lib/services';
import {
  MALTA_LOCALITIES, validatePhone, validateEmail, ageFrom, isFutureDate,
} from '../constants/malta';

/**
 * One wizard for becoming a provider.
 *
 * It replaces join.tsx and onboarding.tsx, which asked for the same
 * things twice - name three times, phone twice, and the phone VERIFIED
 * twice, which meant two SMS and two waits before anyone had seen a
 * single job. Neither screen remembered which step you were on, so
 * coming back meant clicking through everything again, and join.tsx
 * wrote straight to cleaner_profiles.categories, a column a trigger
 * freezes - so picking your trades looked like it saved and did not.
 *
 * Six steps, one progress bar, and it opens on the first one that is
 * not finished yet. Nothing is asked twice.
 */

const STEPS = ['You', 'Your work', 'Your prices', 'Where & when', 'Your ID', 'Last bit'];

const ISLANDS = [
  { k:'malta', label:'Malta',                 desc:'The main island' },
  { k:'both',  label:'Malta and Gozo',        desc:'Both islands - the ferry is in the price' },
  { k:'gozo',  label:'Gozo and Comino only',  desc:'You stay on Gozo' },
];

const ID_TYPES = [
  { k:'malta_id',         label:'Malta ID',         hint:'7 digits plus a letter, e.g. 0123456M' },
  { k:'passport',         label:'Passport',         hint:'As printed on the photo page' },
  { k:'residence_permit', label:'Residence Permit', hint:'The number on your card' },
];

const WORK_AUTH = [
  { k:'eu_citizen',     label:'EU / EEA citizen', desc:'No permit needed to work in Malta' },
  { k:'malta_resident', label:'Malta resident',   desc:'You hold a residence card' },
  { k:'work_permit',    label:'Work permit',      desc:'Single permit or employment licence' },
  { k:'none',           label:'Not yet',          desc:'Applied, or still sorting it out' },
];

const TEAM_TYPES = [
  { k:'solo',    label:'On my own',  desc:'I turn up alone' },
  { k:'duo',     label:'As a pair',  desc:'We always work two together' },
  { k:'company', label:'A business', desc:'Registered company with staff' },
];

/** What each pricing model needs before a service can be offered. */
const PRICE_FIELDS: Record<string, { key: string; label: string; required: boolean }[]> = {
  hourly: [
    { key:'hourly_rate', label:'Per hour',     required:true  },
    { key:'min_hours',   label:'Minimum hours', required:false },
  ],
  fixed: [
    { key:'labour_price', label:'For the job', required:true  },
    { key:'parts_price',  label:'Parts',       required:false },
  ],
  unit: [
    { key:'unit_price', label:'Per unit',       required:true  },
    { key:'min_charge', label:'Minimum charge', required:false },
  ],
  quote: [],
  transport: [],
};

/**
 * Did this file come off a camera?
 *
 * A real photograph carries an EXIF block; a screenshot or a file
 * pulled off the web usually does not. We look for the JPEG APP1
 * marker followed by "Exif" and report what we found. This is a
 * SIGNAL, not proof - someone can photograph a screen - and the review
 * screen says exactly that rather than dressing it up as a check.
 */
async function sniffExif(file: File): Promise<boolean> {
  try {
    const head = new Uint8Array(await file.slice(0, 131072).arrayBuffer());
    for (let i = 0; i < head.length - 10; i++) {
      if (head[i] === 0xFF && head[i+1] === 0xE1) {
        // APP1 segment: 2 bytes marker, 2 bytes length, then "Exif\0\0"
        if (head[i+4] === 0x45 && head[i+5] === 0x78 &&
            head[i+6] === 0x69 && head[i+7] === 0x66) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

type SvcDraft = {
  on: boolean;
  hourly_rate: string; min_hours: string;
  labour_price: string; parts_price: string;
  unit_price: string;  min_charge: string;
  price_min: string;   price_max: string;
};

const blankSvc = (): SvcDraft => ({
  on:false, hourly_rate:'', min_hours:'', labour_price:'', parts_price:'',
  unit_price:'', min_charge:'', price_min:'', price_max:'',
});

export default function ProviderSetup() {
  useTrades();   // redraw once the real trade list lands

  const [step, setStep]       = useState(0);
  const [ready, setReady]     = useState(false);
  const [busy, setBusy]       = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError]     = useState('');
  const [status, setStatus]   = useState<string|null>(null);
  const [uploading, setUp]    = useState<string|null>(null);
  const [previews, setPrev]   = useState<Record<string,string>>({});
  const [email, setEmail]     = useState('');
  /* Trades that need a licence come back from declare_trades as pending;
     this is what the screen tells the provider about them. */
  const [proofNote, setProofNote] = useState<string[]>([]);

  const [types, setTypes]     = useState<ServiceType[]>([]);
  const [svc, setSvc]         = useState<Record<string, SvcDraft>>({});

  const [f, setF] = useState<any>({
    first_name:'', last_name:'', phone:'', phone_verified:false,
    categories:[] as string[],
    island:'malta',
    availability: DEFAULT_AVAILABILITY as Availability,
    notice_hours:'12', accepts_urgent:false, service_radius_km:'15',
    date_of_birth:'', nationality:'', address:'', locality:'',
    emergency_name:'', emergency_phone:'',
    id_type:'malta_id', id_number:'',
    id_front_url:'', id_back_url:'', selfie_url:'', profile_photo_url:'',
    doc_source:{} as Record<string, any>,
    work_authorization:'eu_citizen', work_permit_url:'', work_permit_expiry:'',
    team_type:'solo', team_size:1,
    company_name:'', vat_number:'', company_reg_number:'',
    bio:'', accepted_commission:false, rejection_reason:'',
  });

  const set = (k:string, v:any) => {
    setF((p:any)=>({
      ...p, [k]: v,
      ...(k === 'phone' ? { phone_verified:false } : {}),
    }));
    setMissing([]); setError('');
  };

  const setPrice = (id:string, key:string, v:string) => {
    setSvc(p => ({ ...p, [id]: { ...(p[id] || blankSvc()), [key]: v } }));
    setMissing([]); setError('');
  };

  const toggleSvc = (id:string) => {
    setSvc(p => {
      const cur = p[id] || blankSvc();
      return { ...p, [id]: { ...cur, on: !cur.on } };
    });
    setMissing([]);
  };

  /* ─────────── what model does this service price on ─────────── */
  const modelOf = (t: ServiceType) =>
    (t as any).is_transport ? 'transport' : ((t as any).pricing_model || 'hourly');

  const myTrades = (f.categories as string[]).map(id => findTrade(id)).filter(Boolean) as any[];

  /** Services of the chosen trades, grouped so the screen can show headings. */
  const byTrade = myTrades.map(t => ({
    trade: t,
    services: types.filter(x => (x.trade_id || 'cleaning') === t.id),
  })).filter(g => g.services.length > 0);

  const pickedIds = Object.keys(svc).filter(id => svc[id]?.on);
  const pickedTypes = types.filter(t => pickedIds.includes(t.id));
  const needsPriceLater = pickedTypes.some(t => modelOf(t) === 'transport');

  /* ─────────── load, and pick up where they left off ─────────── */
  useEffect(() => {
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/auth'); return; }
      setEmail(user.email || '');

      const [{ data: prof }, { data: row }, { data: trades }, { data: mine }] =
        await Promise.all([
          supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
          supabase.from('cleaner_profiles').select('*').eq('id', user.id).maybeSingle(),
          supabase.from('provider_trades').select('trade_id, status').eq('provider_id', user.id),
          supabase.from('provider_services').select('*').eq('provider_id', user.id),
        ]);

      const parts = (prof?.full_name || '').split(' ');

      setF((p:any) => {
        const next = {
          ...p,
          first_name: parts[0] || '',
          last_name:  parts.slice(1).join(' ') || '',
          ...(row ? Object.fromEntries(
                Object.entries(row).filter(([_,v]) => v !== null)) : {}),
        };
        /* Three checkboxes became one choice of island. Read whichever
           shape the row is already in so nobody loses their answer. */
        next.island = row?.covers_all_malta && row?.covers_all_gozo ? 'both'
                    : row?.covers_all_gozo ? 'gozo' : 'malta';
        next.notice_hours = String(row?.notice_hours ?? 12);
        next.service_radius_km = String(row?.service_radius_km ?? 15);
        next.availability = row?.availability || DEFAULT_AVAILABILITY;
        next.doc_source = row?.doc_source || {};
        /* provider_trades is the real record; categories is derived from
           it by a trigger, so read the record rather than the shadow. */
        next.categories = (trades || [])
          .filter((t:any) => t.status === 'approved' || t.status === 'pending')
          .map((t:any) => t.trade_id);
        return next;
      });

      if (row?.verification_status) setStatus(row.verification_status);

      if ((mine || []).length) {
        const draft: Record<string, SvcDraft> = {};
        (mine as any[]).forEach(r => {
          draft[r.service_type_id] = {
            on: r.active !== false,
            hourly_rate:  r.hourly_rate  != null ? String(r.hourly_rate)  : '',
            min_hours:    r.min_hours    != null ? String(r.min_hours)    : '',
            labour_price: r.labour_price != null ? String(r.labour_price) : '',
            parts_price:  r.parts_price  != null ? String(r.parts_price)  : '',
            unit_price:   r.unit_price   != null ? String(r.unit_price)   : '',
            min_charge:   r.min_charge   != null ? String(r.min_charge)   : '',
            price_min:    r.price_min    != null ? String(r.price_min)    : '',
            price_max:    r.price_max    != null ? String(r.price_max)    : '',
          };
        });
        setSvc(draft);
      }

      setReady(true);
    })();
  }, []);

  /* The service list follows the trades, and only the trades. */
  useEffect(() => {
    if (!f.categories.length) { setTypes([]); return; }
    loadServiceTypes({ trades: f.categories }).then(setTypes);
  }, [JSON.stringify(f.categories)]);

  /* ─────────── validation, one step at a time ─────────── */
  const validate = (s:number): string[] => {
    const m: string[] = [];

    if (s===0) {
      if (!String(f.first_name).trim()) m.push('Your first name');
      if (!String(f.last_name).trim())  m.push('Your last name');
      const ph = validatePhone(f.phone);
      if (!ph.ok) m.push(ph.reason!);
      /* Asked once, here, and nowhere else in the flow. */
      else if (!f.phone_verified) m.push('Confirm your number with the code we send');
    }

    if (s===1) {
      if (!f.categories.length) m.push('Pick at least one trade');
      else if (types.length && pickedIds.length === 0)
        m.push('Tick the services you actually do');
    }

    if (s===2) {
      pickedTypes.forEach(t => {
        const d = svc[t.id] || blankSvc();
        (PRICE_FIELDS[modelOf(t)] || []).forEach(fd => {
          if (fd.required && !(Number((d as any)[fd.key]) > 0))
            m.push(`${t.name} - ${fd.label.toLowerCase()}`);
        });
      });
    }

    if (s===3) {
      if (countSlots(f.availability) === 0) m.push('Tick at least one time slot');
    }

    if (s===4) {
      const age = ageFrom(f.date_of_birth);
      if (age === null)  m.push('Date of birth');
      else if (age < 18) m.push('You must be 18 or over to work on Poji');
      else if (age > 90) m.push('Check your date of birth');
      if (!String(f.nationality).trim()) m.push('Nationality');
      if (!String(f.address).trim())     m.push('Your address in Malta');
      if (!f.locality)                   m.push('Your locality');
      if (!String(f.id_number).trim())   m.push('Document number');
      if (f.id_type === 'malta_id' && !/^[0-9]{6,7}[A-Z]$/i.test(String(f.id_number).trim()))
        m.push('A Malta ID looks like 0123456M');
      if (!f.id_front_url)      m.push('Photo of the front of your document');
      if (!f.selfie_url)        m.push('Selfie holding your document');
      if (!f.profile_photo_url) m.push('A profile photo clients will see');
      if (f.emergency_phone) {
        const ep = validatePhone(f.emergency_phone);
        if (!ep.ok) m.push('Emergency contact number - ' + ep.reason);
      }
    }

    if (s===5) {
      if (f.work_authorization === 'work_permit') {
        if (!f.work_permit_url)    m.push('Your work permit document');
        if (!f.work_permit_expiry) m.push('Permit expiry date');
        else if (!isFutureDate(f.work_permit_expiry)) m.push('That permit has already expired');
      }
      if (f.team_type === 'company') {
        if (!String(f.company_name).trim())       m.push('Company name');
        if (!String(f.company_reg_number).trim()) m.push('Company registration number');
      }
      if (!f.accepted_commission) m.push('Accept the commission to continue');
    }

    return m;
  };

  /* Open on the first step that is not finished. Nothing is stored for
     this - it is read off the data, so there is no stale step number to
     go wrong. */
  useEffect(() => {
    if (!ready) return;
    for (let i = 0; i < STEPS.length; i++) {
      if (validate(i).length) { setStep(i); return; }
    }
    setStep(STEPS.length - 1);
  }, [ready]);

  /* ─────────── saving ─────────── */

  const islandFields = () => ({
    covers_all_malta: f.island === 'malta' || f.island === 'both',
    covers_all_gozo:  f.island === 'gozo'  || f.island === 'both',
    service_areas:
      f.island === 'both' ? ['All Malta','All Gozo'] :
      f.island === 'gozo' ? ['All Gozo'] : ['All Malta'],
  });

  /** Everything that lives on the profile row. categories is absent on
      purpose: a trigger owns that column, and writing it here was the
      bug that made trade selection look like it saved. */
  const profilePayload = (final: boolean) => ({
    first_name: String(f.first_name).trim(),
    last_name:  String(f.last_name).trim(),
    phone: validatePhone(f.phone).value || f.phone,
    phone_verified: !!f.phone_verified,
    email: email || null,
    ...islandFields(),
    availability: f.availability,
    notice_hours: Number(f.notice_hours) || 12,
    accepts_urgent: !!f.accepts_urgent,
    service_radius_km: Number(f.service_radius_km) || 15,
    date_of_birth: f.date_of_birth || null,
    nationality: String(f.nationality).trim(),
    address: String(f.address).trim(),
    locality: f.locality,
    emergency_name: String(f.emergency_name).trim(),
    emergency_phone: validatePhone(f.emergency_phone).value || f.emergency_phone,
    id_type: f.id_type,
    id_number: String(f.id_number).trim().toUpperCase(),
    id_front_url: f.id_front_url,
    id_back_url: f.id_back_url,
    selfie_url: f.selfie_url,
    profile_photo_url: f.profile_photo_url,
    doc_source: f.doc_source || {},
    work_authorization: f.work_authorization,
    work_permit_url: f.work_permit_url,
    work_permit_expiry: f.work_permit_expiry || null,
    team_type: f.team_type,
    team_size: f.team_type === 'solo' ? 1
             : f.team_type === 'duo'  ? 2
             : Number(f.team_size) || 1,
    company_name: String(f.company_name).trim(),
    vat_number: String(f.vat_number).trim(),
    company_reg_number: String(f.company_reg_number).trim(),
    bio: String(f.bio).trim(),
    accepted_commission: !!f.accepted_commission,
    accepted_terms_at: final ? new Date().toISOString() : null,
    verification_status: final ? 'submitted' : 'draft',
    submitted_at: final ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });

  /**
   * The ticked set, written as rows. Unticked services are deleted
   * rather than left inactive, because a row nobody will ever price is
   * just something to trip over later.
   *
   * No upsert: there is no unique constraint on (provider_id,
   * service_type_id), so this reads what is there and decides.
   */
  const saveServices = async (userId: string) => {
    const { data: existing } = await supabase.from('provider_services')
      .select('id, service_type_id').eq('provider_id', userId);
    const have = new Map((existing || []).map((r:any) => [r.service_type_id, r.id]));

    const num = (v:string) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

    for (const t of types) {
      const d = svc[t.id];
      const id = have.get(t.id);

      if (!d?.on) {
        if (id) await supabase.from('provider_services').delete().eq('id', id);
        continue;
      }

      const body: any = {
        provider_id: userId, service_type_id: t.id, active: true,
        hourly_rate:  num(d.hourly_rate),
        min_hours:    num(d.min_hours),
        labour_price: num(d.labour_price),
        parts_price:  num(d.parts_price),
        unit_price:   num(d.unit_price),
        min_charge:   num(d.min_charge),
        price_min:    num(d.price_min),
        price_max:    num(d.price_max),
        updated_at:   new Date().toISOString(),
      };

      if (id) await supabase.from('provider_services').update(body).eq('id', id);
      else    await supabase.from('provider_services').insert(body);
    }
  };

  const save = async (final: boolean): Promise<boolean> => {
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error: e } = await supabase.from('cleaner_profiles')
      .upsert({ id: user.id, ...profilePayload(final) });
    if (e) { setError(e.message); return false; }

    await supabase.from('profiles')
      .update({ full_name: `${f.first_name} ${f.last_name}`.trim() })
      .eq('id', user.id);

    /* Trades go through the RPC, never straight at the column. On a
       first declaration they land approved; a trade that needs a
       licence lands pending and the RPC says which. */
    if (f.categories.length) {
      const { data, error: tErr } = await supabase.rpc('declare_trades',
        { p_trades: f.categories });
      if (tErr) { setError(tErr.message); return false; }
      const pending = (data as any)?.pending || [];
      if (pending.length) {
        setError('');
        setProofNote(pending.map((id:string) => findTrade(id)?.name || id));
      } else setProofNote([]);
    }

    await saveServices(user.id);
    return true;
  };


  const next = async () => {
    const m = validate(step);
    if (m.length) { setMissing(m); return; }
    setBusy(true);
    const ok = await save(step === STEPS.length - 1);
    setBusy(false);
    if (!ok) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else setStatus('submitted');
  };

  /* ─────────── uploads ─────────── */

  /**
   * capture opens the camera straight away on a phone and is ignored on
   * a desktop, which is the honest shape of this: the camera is the
   * normal path, a file is the exception, and we record which one
   * happened rather than claiming we enforced anything.
   */
  const pickFile = (field: string, facing: 'environment' | 'user') => {
    if (Platform.OS !== 'web') {
      setError('Please finish this in a browser - we need to upload photos.');
      return;
    }
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,application/pdf';
    input.setAttribute('capture', facing);
    input.onchange = async (e:any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        setError('That file is over 8 MB - try a smaller photo.'); return;
      }

      setUp(field); setError('');
      if (file.type.startsWith('image/')) {
        setPrev(p => ({ ...p, [field]: URL.createObjectURL(file) }));
      }

      const exif  = file.type === 'image/jpeg' ? await sniffExif(file) : false;
      const fresh = Date.now() - (file.lastModified || 0) < 5 * 60 * 1000;

      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { setUp(null); return; }

      const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${user.id}/${field}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('verification-docs').upload(path, file, { upsert:true });

      setUp(null);
      if (upErr) { setError('Upload failed: ' + upErr.message); return; }

      setF((p:any) => ({
        ...p,
        [field]: path,
        doc_source: {
          ...(p.doc_source || {}),
          [field]: { src: exif ? 'camera' : 'file', exif, fresh,
                     at: new Date().toISOString() },
        },
      }));
      setMissing([]);
    };
    input.click();
  };

  /* ─────────── where they land ─────────── */

  if (!ready) {
    return <View style={s.center}><ActivityIndicator color={C.primary} size="large" /></View>;
  }

  if (status === 'submitted' || status === 'under_review') {
    return (
      <View style={s.center}>
        <Text style={s.bigIcon}>⏳</Text>
        <Text style={s.centerTitle}>With us for review</Text>
        <Text style={s.centerTxt}>
          We check documents by hand, usually within a working day. You will get
          a message the moment you are approved.
        </Text>
        {needsPriceLater && (
          <Text style={s.centerNote}>
            One thing left for you: your route prices for moving work. Set those
            from My services whenever you like.
          </Text>
        )}
        <TouchableOpacity style={s.outlineBtn} onPress={()=>setStatus('draft')}>
          <Text style={s.outlineTxt}>Change something</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.ghostBtn} onPress={()=>router.replace('/(provider)/jobs')}>
          <Text style={s.ghostTxt}>See the work meanwhile</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === 'needs_info') {
    return (
      <View style={s.center}>
        <Text style={s.bigIcon}>📩</Text>
        <Text style={s.centerTitle}>We need one more thing</Text>
        <Text style={s.centerTxt}>{f.rejection_reason || 'Have another look at your details.'}</Text>
        <TouchableOpacity style={s.primaryBtn} onPress={()=>{ setStatus('draft'); setStep(4); }}>
          <Text style={s.primaryTxt}>Sort it out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === 'approved') {
    return (
      <View style={s.center}>
        <Text style={s.bigIcon}>🎉</Text>
        <Text style={s.centerTitle}>You're in</Text>
        <Text style={s.centerTxt}>Clients can book you now.</Text>
        <TouchableOpacity style={s.primaryBtn} onPress={()=>router.replace('/(provider)/jobs')}>
          <Text style={s.primaryTxt}>Go to my jobs</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === 'rejected') {
    return (
      <View style={s.center}>
        <Text style={s.bigIcon}>⚠️</Text>
        <Text style={s.centerTitle}>We couldn't approve this</Text>
        <Text style={s.centerTxt}>{f.rejection_reason || 'Please review your details.'}</Text>
        <TouchableOpacity style={s.primaryBtn} onPress={()=>{ setStatus('draft'); setStep(0); }}>
          <Text style={s.primaryTxt}>Update my application</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const age = ageFrom(f.date_of_birth);

  return (
    <View style={s.wrap}>
      <View style={s.hdr}>
        <TouchableOpacity onPress={()=>step>0?setStep(step-1):router.back()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Join as a provider</Text>
        <Text style={s.stepNum}>{step+1}/{STEPS.length}</Text>
      </View>

      {/* One bar for the whole thing. A finished step is tappable, so
          going back to change a price is one tap rather than six. */}
      <View style={s.progress}>
        {STEPS.map((x,i)=>{
          const done = i < step && validate(i).length === 0;
          const reachable = i <= step || done;
          return (
            <TouchableOpacity key={x} style={s.pItem} disabled={!reachable}
              onPress={()=>{ if (reachable) { setMissing([]); setStep(i); } }}>
              <View style={[s.bar, i<=step&&s.barOn, done&&s.barDone]} />
              <Text style={[s.pLbl, i===step&&s.pLblOn]} numberOfLines={1}>{x}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
        {missing.length > 0 && (
          <View style={s.errBox}>
            <Text style={s.errTitle}>Still needed:</Text>
            {missing.map(m => <Text key={m} style={s.errItem}>•  {m}</Text>)}
          </View>
        )}
        {error ? <View style={s.errBox}><Text style={s.errItem}>⚠️  {error}</Text></View> : null}
        {proofNote.length > 0 && (
          <View style={s.noteBox}>
            <Text style={s.noteTxt}>
              {proofNote.join(' and ')} {proofNote.length===1?'needs':'need'} a licence or
              certificate before we can switch {proofNote.length===1?'it':'them'} on. We will
              ask you for it — everything else carries on as normal.
            </Text>
          </View>
        )}

        {/* ══ 0 · YOU ══ */}
        {step===0 && (
          <View style={s.step}>
            <Text style={s.intro}>Let's get you listed</Text>
            <Text style={s.hint}>
              Six short steps, and it saves as you go — if you stop halfway you
              come back to exactly where you were.
            </Text>

            <View style={s.row2}>
              <View style={{flex:1}}>
                <Text style={s.lbl}>First name</Text>
                <TextInput style={s.input} value={String(f.first_name)}
                  onChangeText={(t:string)=>set('first_name',t)}
                  placeholder="Maria" placeholderTextColor={C.muted} autoCapitalize="words" />
              </View>
              <View style={{flex:1}}>
                <Text style={s.lbl}>Last name</Text>
                <TextInput style={s.input} value={String(f.last_name)}
                  onChangeText={(t:string)=>set('last_name',t)}
                  placeholder="Sciberras" placeholderTextColor={C.muted} autoCapitalize="words" />
              </View>
            </View>

            {/* Taken from the account rather than asked again. The old
                flow asked for it a second time and people wondered
                whether they were signing up twice. */}
            <Text style={s.lbl}>Email</Text>
            <View style={s.readonly}>
              <Text style={s.readonlyTxt}>{email || '—'}</Text>
              <Text style={s.readonlyTag}>from your account</Text>
            </View>

            <Text style={s.lbl}>Mobile number</Text>
            <TextInput style={s.input} value={String(f.phone)}
              onChangeText={(t:string)=>set('phone',t)}
              placeholder="+356 7900 0000" placeholderTextColor={C.muted}
              keyboardType="phone-pad" />
            <Text style={s.note}>
              Job alerts come here. This is the only time we ask you to confirm it.
            </Text>

            {validatePhone(f.phone).ok && (
              <PhoneVerify
                phone={validatePhone(f.phone).value || f.phone}
                verified={!!f.phone_verified}
                onVerified={(v)=>{ setF((p:any)=>({...p, phone:v, phone_verified:true})); setMissing([]); }}
              />
            )}
          </View>
        )}

        {/* ══ 1 · YOUR WORK ══ */}
        {step===1 && (
          <View style={s.step}>
            <Text style={s.intro}>What do you do?</Text>
            <Text style={s.hint}>
              Pick your trades, then tick the jobs inside them you actually take.
              Leaving one unticked means you simply never get offered it.
            </Text>

            {CATEGORIES.map(cat=>{
              const items = tradesIn(cat.id);
              if (!items.length) return null;
              const chosen = items.filter(t=>f.categories.includes(t.id)).length;
              return (
                <View key={cat.id} style={s.group}>
                  <View style={s.groupHead}>
                    <Text style={s.groupTitle}>{cat.icon}  {cat.name}</Text>
                    {chosen>0 && <View style={s.count}><Text style={s.countTxt}>{chosen}</Text></View>}
                  </View>
                  <View style={s.pillWrap}>
                    {items.map(t=>{
                      const on = f.categories.includes(t.id);
                      return (
                        <TouchableOpacity key={t.id} style={[s.pill, on&&s.pillOn]}
                          onPress={()=>set('categories', on
                            ? f.categories.filter((x:string)=>x!==t.id)
                            : [...f.categories, t.id])}>
                          <Text style={[s.pillTxt, on&&s.pillTxtOn]}>
                            {on?'✓ ':''}{t.icon}  {t.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            {byTrade.length > 0 && (
              <>
                <Text style={s.divider}>Which jobs do you take?</Text>
                {byTrade.map(g=>(
                  <View key={g.trade.id} style={s.svcGroup}>
                    <Text style={s.svcGroupTitle}>{g.trade.icon}  {g.trade.name}</Text>
                    {g.services.map(t=>{
                      const on = !!svc[t.id]?.on;
                      return (
                        <TouchableOpacity key={t.id} style={[s.svcRow, on&&s.svcRowOn]}
                          onPress={()=>toggleSvc(t.id)}>
                          <View style={[s.check, on&&s.checkOn]}>
                            {on && <Text style={s.checkTxt}>✓</Text>}
                          </View>
                          <View style={{flex:1}}>
                            <Text style={s.svcName}>{(t as any).icon} {t.name}</Text>
                            {!!(t as any).description && (
                              <Text style={s.svcDesc}>{(t as any).description}</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {/* ══ 2 · YOUR PRICES ══ */}
        {step===2 && (
          <View style={s.step}>
            <Text style={s.intro}>What do you charge?</Text>
            <Text style={s.hint}>
              Your price, per job you take — there is no platform figure behind
              this and nothing is filled in for you. A client compares these
              side by side, so it is yours to pitch.
            </Text>

            {pickedTypes.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyTxt}>Nothing ticked yet</Text>
                <TouchableOpacity onPress={()=>setStep(1)}>
                  <Text style={s.link}>Go back and pick your jobs ›</Text>
                </TouchableOpacity>
              </View>
            ) : byTrade.map(g=>{
              const mine = g.services.filter(t=>svc[t.id]?.on);
              if (!mine.length) return null;
              return (
                <View key={g.trade.id} style={s.svcGroup}>
                  <Text style={s.svcGroupTitle}>{g.trade.icon}  {g.trade.name}</Text>
                  {mine.map(t=>{
                    const model  = modelOf(t);
                    const fields = PRICE_FIELDS[model] || [];
                    const d = svc[t.id] || blankSvc();
                    const comm = Number((t as any).labour_commission) > 0
                      ? Number((t as any).labour_commission) : 0.20;
                    const main = Number(model==='hourly' ? d.hourly_rate
                                 : model==='fixed' ? d.labour_price
                                 : model==='unit'  ? d.unit_price : 0);
                    return (
                      <View key={t.id} style={s.priceCard}>
                        <Text style={s.priceName}>{t.name}</Text>

                        {model === 'quote' && (
                          <Text style={s.priceNote}>
                            Quoted work — you see the job, then send a figure. Nothing
                            to set here.
                          </Text>
                        )}

                        {model === 'transport' && (
                          <Text style={s.priceNote}>
                            Priced by route and vehicle, so it needs its own table.
                            Set it from My services once you are in — we will remind you.
                          </Text>
                        )}

                        {fields.length > 0 && (
                          <View style={s.priceRow}>
                            {fields.map(fd=>(
                              <View key={fd.key} style={{flex:1}}>
                                <Text style={s.priceLbl}>
                                  {fd.label}{fd.required ? '' : '  (optional)'}
                                </Text>
                                <TextInput
                                  style={[s.priceInput, fd.required && !((d as any)[fd.key]) && s.priceInputWant]}
                                  value={String((d as any)[fd.key] || '')}
                                  onChangeText={(v:string)=>setPrice(t.id, fd.key, v.replace(/[^0-9.]/g,''))}
                                  placeholder={fd.key==='min_hours' ? '2' : '—'}
                                  placeholderTextColor={C.muted}
                                  keyboardType="decimal-pad" />
                              </View>
                            ))}
                          </View>
                        )}

                        {main > 0 && model !== 'quote' && model !== 'transport' && (
                          <Text style={s.priceKeep}>
                            You keep €{(main * (1 - comm)).toFixed(2)}
                            {model==='hourly' ? ' an hour' : model==='unit' ? ' a unit' : ' of it'}
                            {'  ·  '}Poji {Math.round(comm*100)}%
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}

        {/* ══ 3 · WHERE AND WHEN ══ */}
        {step===3 && (
          <View style={s.step}>
            <Text style={s.intro}>Where and when?</Text>

            <Text style={s.lbl}>Which island do you cover?</Text>
            {ISLANDS.map(o=>(
              <TouchableOpacity key={o.k} style={[s.optCard, f.island===o.k&&s.optCardOn]}
                onPress={()=>set('island', o.k)}>
                <View style={[s.radio, f.island===o.k&&s.radioOn]}>
                  {f.island===o.k && <View style={s.radioDot}/>}
                </View>
                <View style={{flex:1}}>
                  <Text style={s.optLabel}>{o.label}</Text>
                  {!!o.desc && <Text style={s.optDesc}>{o.desc}</Text>}
                </View>
              </TouchableOpacity>
            ))}

            {myTrades.some((t:any)=>t.roadside) && (
              <View style={s.roadBox}>
                <Text style={s.roadTitle}>🛞  Roadside callouts</Text>
                <TouchableOpacity style={s.checkRowPlain}
                  onPress={()=>set('accepts_urgent', !f.accepts_urgent)}>
                  <View style={[s.check, f.accepts_urgent&&s.checkOn]}>
                    {f.accepts_urgent && <Text style={s.checkTxt}>✓</Text>}
                  </View>
                  <View style={{flex:1}}>
                    <Text style={s.optLabel}>I take emergencies</Text>
                    <Text style={s.optDesc}>Drop everything and go. Pays 25% more.</Text>
                  </View>
                </TouchableOpacity>
                <Text style={s.lbl}>How far will you drive?</Text>
                <View style={s.pillWrap}>
                  {[5,10,15,25,40].map(km=>(
                    <TouchableOpacity key={km}
                      style={[s.pill, Number(f.service_radius_km)===km&&s.pillOn]}
                      onPress={()=>set('service_radius_km', String(km))}>
                      <Text style={[s.pillTxt, Number(f.service_radius_km)===km&&s.pillTxtOn]}>
                        {km} km
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <Text style={s.divider}>When can you work?</Text>
            <Text style={s.note}>
              Only jobs in these slots reach you. Most people adjust it after a
              week or two.
            </Text>
            <View style={{marginTop:14}}>
              <AvailabilityGrid value={f.availability} onChange={(v:any)=>set('availability', v)} />
            </View>

            <Text style={s.lbl}>How much notice do you need?</Text>
            <View style={s.pillWrap}>
              {[2,6,12,24,48].map(h=>(
                <TouchableOpacity key={h} style={[s.pill, Number(f.notice_hours)===h&&s.pillOn]}
                  onPress={()=>set('notice_hours', String(h))}>
                  <Text style={[s.pillTxt, Number(f.notice_hours)===h&&s.pillTxtOn]}>
                    {h < 24 ? `${h}h` : `${h/24} day${h>24?'s':''}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.note}>A job starting sooner than this is not offered to you.</Text>
          </View>
        )}

        {/* ══ 4 · YOUR ID ══ */}
        {step===4 && (
          <View style={s.step}>
            <Text style={s.intro}>Who are you?</Text>
            <View style={s.whyBox}>
              <Text style={s.whyTitle}>Why we ask</Text>
              <Text style={s.whyTxt}>
                Clients are letting a stranger into their home. Every provider on
                Poji is ID-checked and that badge sits on your profile — it is the
                single biggest reason someone picks you over a classified ad.
              </Text>
              <Text style={s.whyTxt}>
                Your ID and selfie are seen only by our verification team. Clients
                never see them.
              </Text>
            </View>

            <Text style={s.lbl}>Date of birth</Text>
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
              <TextInput style={s.input} value={f.date_of_birth}
                onChangeText={(t:string)=>set('date_of_birth',t)}
                placeholder="YYYY-MM-DD" placeholderTextColor={C.muted} />
            )}
            {age !== null && (
              <Text style={[s.note, age < 18 && {color:C.red}]}>
                {age < 18 ? `You're ${age} — Poji is for over-18s only.` : `${age} years old`}
              </Text>
            )}

            <Text style={s.lbl}>Nationality</Text>
            <TextInput style={s.input} value={String(f.nationality)}
              onChangeText={(t:string)=>set('nationality',t)}
              placeholder="e.g. Maltese, Italian, Filipino"
              placeholderTextColor={C.muted} autoCapitalize="words" />

            <Text style={s.lbl}>Address in Malta</Text>
            <TextInput style={s.input} value={String(f.address)}
              onChangeText={(t:string)=>set('address',t)}
              placeholder="Flat 3, 12 Tower Road" placeholderTextColor={C.muted} />

            <Text style={s.lbl}>Locality</Text>
            <Picker
              value={f.locality}
              options={MALTA_LOCALITIES}
              onChange={(v:any)=>set('locality', v)}
              placeholder="Where do you live?"
              title="Your locality"
            />

            <Text style={s.divider}>Your document</Text>
            <View style={s.chips}>
              {ID_TYPES.map(t=>(
                <TouchableOpacity key={t.k} style={[s.chip, f.id_type===t.k&&s.chipOn]}
                  onPress={()=>set('id_type',t.k)}>
                  <Text style={[s.chipTxt, f.id_type===t.k&&s.chipTxtOn]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.lbl}>Document number</Text>
            <TextInput style={s.input} value={String(f.id_number)}
              onChangeText={(t:string)=>set('id_number',t)}
              placeholder={f.id_type==='malta_id' ? '0123456M' : 'As printed'}
              placeholderTextColor={C.muted} autoCapitalize="characters" />
            <Text style={s.note}>{ID_TYPES.find(t=>t.k===f.id_type)?.hint}</Text>

            {/* On a phone these open the camera. Saying so beats a
                "choose a file" button that nobody expects to be a
                camera. */}
            <Upload label="Front of your document" required
              value={f.id_front_url} preview={previews.id_front_url}
              meta={f.doc_source?.id_front_url}
              uploading={uploading==='id_front_url'}
              onPress={()=>pickFile('id_front_url','environment')}
              hint="Photograph it flat, in good light, all four corners in frame." />

            <Upload label="Back of your document"
              value={f.id_back_url} preview={previews.id_back_url}
              meta={f.doc_source?.id_back_url}
              uploading={uploading==='id_back_url'}
              onPress={()=>pickFile('id_back_url','environment')}
              hint="Skip this if your passport has everything on the photo page." />

            <Upload label="Selfie holding your document" required
              value={f.selfie_url} preview={previews.selfie_url}
              meta={f.doc_source?.selfie_url}
              uploading={uploading==='selfie_url'}
              onPress={()=>pickFile('selfie_url','user')}
              hint="Hold the ID next to your face so both are readable. This is what stops anyone using someone else's identity." />

            <Text style={s.divider}>Your profile photo</Text>
            <Text style={s.note}>
              Clients see this before they book. A clear, friendly face gets far
              more work than a logo or an empty circle.
            </Text>
            <Upload label="Profile photo" required round
              value={f.profile_photo_url} preview={previews.profile_photo_url}
              meta={f.doc_source?.profile_photo_url}
              uploading={uploading==='profile_photo_url'}
              onPress={()=>pickFile('profile_photo_url','user')} />

            <Text style={s.divider}>Emergency contact</Text>
            <Text style={s.note}>
              Only used if something happens to you on a job. Optional, but we'd
              rather have it.
            </Text>
            <View style={s.row2}>
              <View style={{flex:1}}>
                <Text style={s.lbl}>Name</Text>
                <TextInput style={s.input} value={String(f.emergency_name)}
                  onChangeText={(t:string)=>set('emergency_name',t)}
                  placeholder="Full name" placeholderTextColor={C.muted} />
              </View>
              <View style={{flex:1}}>
                <Text style={s.lbl}>Phone</Text>
                <TextInput style={s.input} value={String(f.emergency_phone)}
                  onChangeText={(t:string)=>set('emergency_phone',t)}
                  placeholder="+356 ..." placeholderTextColor={C.muted}
                  keyboardType="phone-pad" />
              </View>
            </View>
          </View>
        )}

        {/* ══ 5 · LAST BIT ══ */}
        {step===5 && (
          <View style={s.step}>
            <Text style={s.intro}>Last bit</Text>

            <Text style={s.lbl}>Your right to work in Malta</Text>
            {WORK_AUTH.map(w=>(
              <TouchableOpacity key={w.k} style={[s.optCard, f.work_authorization===w.k&&s.optCardOn]}
                onPress={()=>set('work_authorization',w.k)}>
                <View style={[s.radio, f.work_authorization===w.k&&s.radioOn]}>
                  {f.work_authorization===w.k && <View style={s.radioDot}/>}
                </View>
                <View style={{flex:1}}>
                  <Text style={s.optLabel}>{w.label}</Text>
                  <Text style={s.optDesc}>{w.desc}</Text>
                </View>
              </TouchableOpacity>
            ))}

            {f.work_authorization==='work_permit' && (
              <>
                <Upload label="Work permit document" required
                  value={f.work_permit_url} preview={previews.work_permit_url}
                  meta={f.doc_source?.work_permit_url}
                  uploading={uploading==='work_permit_url'}
                  onPress={()=>pickFile('work_permit_url','environment')} />
                <Text style={s.lbl}>Permit expiry date</Text>
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
                  <TextInput style={s.input} value={f.work_permit_expiry}
                    onChangeText={(t:string)=>set('work_permit_expiry',t)}
                    placeholder="YYYY-MM-DD" placeholderTextColor={C.muted} />
                )}
                {f.work_permit_expiry && !isFutureDate(f.work_permit_expiry) && (
                  <Text style={[s.note,{color:C.red}]}>This permit has expired.</Text>
                )}
              </>
            )}

            {f.work_authorization==='none' && (
              <View style={s.noteBox}>
                <Text style={s.noteTxt}>
                  You can still apply. We look at these one by one — say where you
                  are in the process in the box below.
                </Text>
              </View>
            )}

            <Text style={s.divider}>How do you work?</Text>
            {TEAM_TYPES.map(t=>(
              <TouchableOpacity key={t.k} style={[s.optCard, f.team_type===t.k&&s.optCardOn]}
                onPress={()=>set('team_type',t.k)}>
                <View style={[s.radio, f.team_type===t.k&&s.radioOn]}>
                  {f.team_type===t.k && <View style={s.radioDot}/>}
                </View>
                <View style={{flex:1}}>
                  <Text style={s.optLabel}>{t.label}</Text>
                  <Text style={s.optDesc}>{t.desc}</Text>
                </View>
              </TouchableOpacity>
            ))}

            {f.team_type==='company' && (
              <>
                <Text style={s.lbl}>Company name</Text>
                <TextInput style={s.input} value={String(f.company_name)}
                  onChangeText={(t:string)=>set('company_name',t)}
                  placeholder="Your business name" placeholderTextColor={C.muted} />
                <View style={s.row2}>
                  <View style={{flex:1}}>
                    <Text style={s.lbl}>Registration no.</Text>
                    <TextInput style={s.input} value={String(f.company_reg_number)}
                      onChangeText={(t:string)=>set('company_reg_number',t)}
                      placeholder="C 12345" placeholderTextColor={C.muted} />
                  </View>
                  <View style={{flex:1}}>
                    <Text style={s.lbl}>VAT number</Text>
                    <TextInput style={s.input} value={String(f.vat_number)}
                      onChangeText={(t:string)=>set('vat_number',t)}
                      placeholder="MT12345678" placeholderTextColor={C.muted} />
                  </View>
                </View>
                <Text style={s.lbl}>How many people can you send to one job?</Text>
                <View style={s.chips}>
                  {[1,2,3,4,5,6,8,10].map(n=>(
                    <TouchableOpacity key={n} style={[s.chip, Number(f.team_size)===n&&s.chipOn]}
                      onPress={()=>set('team_size',n)}>
                      <Text style={[s.chipTxt, Number(f.team_size)===n&&s.chipTxtOn]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={s.lbl}>A few lines about you</Text>
            <TextInput style={[s.input,{minHeight:96}]} value={String(f.bio)}
              onChangeText={(t:string)=>set('bio',t)}
              placeholder="What you're good at, how long you've done it, anything a client would want to know."
              placeholderTextColor={C.muted} multiline textAlignVertical="top" />
            <Text style={s.note}>Optional, but it is the part clients read.</Text>

            <View style={s.commissionBox}>
              <Text style={s.commissionTitle}>Before you submit</Text>
              {[
                ['Poji takes a commission', 'Shown against each of your prices on the prices step'],
                ['You are paid after approval', 'Into your bank, within three working days'],
                ['Bank details later',       'We only ask once you are actually owed money'],
              ].map(([a,b])=>(
                <View key={a} style={s.commissionRow}>
                  <Text style={s.commissionDot}>•</Text>
                  <View style={{flex:1}}>
                    <Text style={s.commissionA}>{a}</Text>
                    <Text style={s.commissionB}>{b}</Text>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity style={[s.checkRow, f.accepted_commission&&s.checkRowOn]}
              onPress={()=>set('accepted_commission', !f.accepted_commission)}>
              <View style={[s.check, f.accepted_commission&&s.checkOn]}>
                {f.accepted_commission && <Text style={s.checkTxt}>✓</Text>}
              </View>
              <View style={{flex:1}}>
                <Text style={s.optLabel}>I accept the commission</Text>
                <Text style={s.optDesc}>
                  And the{' '}
                  <Text style={s.link} onPress={()=>router.push('/legal?doc=terms')}>
                    Terms of Service
                  </Text>
                  {' '}and{' '}
                  <Text style={s.link} onPress={()=>router.push('/legal?doc=privacy')}>
                    Privacy Notice
                  </Text>
                </Text>
              </View>
            </TouchableOpacity>

            <View style={s.noteBox}>
              <Text style={s.noteTxt}>
                By submitting you confirm everything here is true. False documents
                mean a permanent ban and, where relevant, a report to the police.
              </Text>
            </View>
          </View>
        )}

        <View style={{height:30}} />
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={[s.btn, busy&&s.btnDis]} onPress={next} disabled={busy}>
          {busy ? <ActivityIndicator color={C.white} />
            : <Text style={s.btnTxt}>
                {step < STEPS.length-1 ? 'Continue  →' : '✓  Send my application'}
              </Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * One upload row. When the file turned out to have no camera metadata
 * it says so quietly - not as an accusation, but because the admin will
 * see the same flag and it should not be a surprise.
 */
function Upload({ label, value, preview, uploading, onPress, required, hint, round, meta }: any) {
  return (
    <View style={{gap:6, marginTop:18}}>
      <Text style={s.lbl}>{label}{required ? ' *' : ''}</Text>
      {hint ? <Text style={s.note}>{hint}</Text> : null}

      {value && preview ? (
        <TouchableOpacity style={s.previewBox} onPress={onPress} disabled={uploading}>
          <Image source={{ uri: preview }}
            style={round ? s.previewRound : s.previewImg} resizeMode="cover" />
          <View style={{flex:1}}>
            <Text style={s.previewOk}>✓ Got it</Text>
            <Text style={s.previewSwap}>
              {meta && meta.exif === false ? 'Chosen from a file — tap to photograph instead'
                : 'Tap to retake'}
            </Text>
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[s.uploadBox, value&&s.uploadBoxOn]}
          onPress={onPress} disabled={uploading}>
          {uploading ? <ActivityIndicator color={C.primary} />
            : value ? <Text style={s.uploadDone}>✓  Got it — tap to retake</Text>
            : <Text style={s.uploadTxt}>📷  Take a photo</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  center:{flex:1,backgroundColor:C.bg,alignItems:'center',justifyContent:'center',padding:32,gap:14},
  hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
    paddingHorizontal:20,paddingTop:60,paddingBottom:12},
  back:{fontSize:16,color:C.primary,fontWeight:'600'},
  title:{fontSize:17,fontWeight:'700',color:C.dark},
  stepNum:{fontSize:13,color:C.muted},

  progress:{flexDirection:'row',paddingHorizontal:20,gap:6,marginBottom:10},
  pItem:{flex:1,gap:6},
  bar:{height:4,borderRadius:2,backgroundColor:C.border},
  barOn:{backgroundColor:C.primary},
  barDone:{backgroundColor:C.green},
  pLbl:{fontSize:9,color:C.muted,fontWeight:'600'},
  pLblOn:{color:C.primary},

  body:{flex:1,paddingHorizontal:20},
  step:{paddingBottom:16},
  intro:{fontSize:24,fontWeight:'800',color:C.dark,marginTop:10},
  hint:{fontSize:13,color:C.muted,lineHeight:19,marginTop:6,marginBottom:6},
  divider:{fontSize:14,fontWeight:'800',color:C.dark,marginTop:28,marginBottom:4},
  lbl:{fontSize:12,fontWeight:'700',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.5,marginTop:20,marginBottom:8},
  note:{fontSize:12,color:C.muted,lineHeight:17,marginTop:6},
  link:{fontSize:12,color:C.primary,fontWeight:'700'},
  input:{backgroundColor:C.white,borderRadius:14,paddingHorizontal:16,paddingVertical:14,
    fontSize:15,color:C.text,borderWidth:1.5,borderColor:C.border},
  row2:{flexDirection:'row',gap:12},

  readonly:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
    backgroundColor:C.bgAlt,borderRadius:14,paddingHorizontal:16,paddingVertical:14,
    borderWidth:1,borderColor:C.border,gap:10},
  readonlyTxt:{fontSize:15,color:C.text,fontWeight:'600',flex:1},
  readonlyTag:{fontSize:11,color:C.muted,fontWeight:'700'},

  group:{marginTop:14},
  groupHead:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8},
  groupTitle:{fontSize:13,fontWeight:'800',color:C.dark},
  count:{backgroundColor:C.primary,minWidth:20,height:20,borderRadius:10,
    alignItems:'center',justifyContent:'center',paddingHorizontal:6},
  countTxt:{fontSize:11,fontWeight:'800',color:C.white},
  pillWrap:{flexDirection:'row',flexWrap:'wrap',gap:8},
  pill:{paddingHorizontal:12,paddingVertical:9,borderRadius:20,backgroundColor:C.white,
    borderWidth:1.5,borderColor:C.border},
  pillOn:{backgroundColor:C.primary,borderColor:C.primary},
  pillTxt:{fontSize:12,fontWeight:'600',color:C.muted},
  pillTxtOn:{color:C.white},

  svcGroup:{marginTop:16,gap:8},
  svcGroupTitle:{fontSize:13,fontWeight:'800',color:C.primary},
  svcRow:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:C.white,
    borderRadius:14,padding:13,borderWidth:1.5,borderColor:C.border},
  svcRowOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  svcName:{fontSize:14,fontWeight:'700',color:C.dark},
  svcDesc:{fontSize:11,color:C.muted,marginTop:2,lineHeight:16},

  priceCard:{backgroundColor:C.white,borderRadius:16,padding:14,gap:8,
    borderWidth:1,borderColor:C.border,...S.sm},
  priceName:{fontSize:14,fontWeight:'800',color:C.dark},
  priceNote:{fontSize:12,color:C.muted,lineHeight:17},
  priceRow:{flexDirection:'row',gap:12},
  priceLbl:{fontSize:11,color:C.muted,fontWeight:'700',marginBottom:5},
  priceInput:{backgroundColor:C.bg,borderRadius:12,paddingVertical:13,fontSize:18,
    fontWeight:'800',color:C.dark,textAlign:'center',borderWidth:1.5,borderColor:C.border},
  priceInputWant:{borderColor:C.primary,backgroundColor:C.primaryLt},
  priceKeep:{fontSize:12,color:C.green,fontWeight:'700'},

  optCard:{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:14,
    borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginBottom:8},
  optCardOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  optLabel:{fontSize:14,fontWeight:'700',color:C.dark},
  optDesc:{fontSize:12,color:C.muted,marginTop:3,lineHeight:17},
  radio:{width:22,height:22,borderRadius:11,borderWidth:2,borderColor:C.border,
    alignItems:'center',justifyContent:'center'},
  radioOn:{borderColor:C.primary},
  radioDot:{width:10,height:10,borderRadius:5,backgroundColor:C.primary},

  check:{width:22,height:22,borderRadius:7,borderWidth:2,borderColor:C.border,
    alignItems:'center',justifyContent:'center'},
  checkOn:{backgroundColor:C.primary,borderColor:C.primary},
  checkTxt:{color:C.white,fontSize:13,fontWeight:'800'},
  checkRow:{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:14,
    borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginTop:10},
  checkRowOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  checkRowPlain:{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderRadius:12,
    borderWidth:1.5,borderColor:C.border,backgroundColor:C.white,marginTop:8},

  chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
  chip:{paddingHorizontal:13,paddingVertical:9,borderRadius:12,backgroundColor:C.white,
    borderWidth:1.5,borderColor:C.border},
  chipOn:{backgroundColor:C.primary,borderColor:C.primary},
  chipTxt:{fontSize:12,fontWeight:'600',color:C.muted},
  chipTxtOn:{color:C.white},

  roadBox:{backgroundColor:C.amberLt,borderRadius:16,padding:16,marginTop:16,gap:4,
    borderWidth:1,borderColor:'#FDE68A'},
  roadTitle:{fontSize:14,fontWeight:'800',color:C.amber},

  whyBox:{backgroundColor:C.primaryLt,borderRadius:16,padding:16,gap:8,marginTop:12,
    borderWidth:1,borderColor:C.border},
  whyTitle:{fontSize:14,fontWeight:'800',color:C.primary},
  whyTxt:{fontSize:12,color:C.text,lineHeight:18},

  uploadBox:{backgroundColor:C.white,borderRadius:14,paddingVertical:20,alignItems:'center',
    borderWidth:2,borderStyle:'dashed',borderColor:C.border},
  uploadBoxOn:{borderColor:C.green,borderStyle:'solid',backgroundColor:C.greenLt},
  uploadTxt:{fontSize:14,color:C.muted,fontWeight:'600'},
  uploadDone:{fontSize:14,color:C.green,fontWeight:'700'},
  previewBox:{flexDirection:'row',alignItems:'center',gap:14,backgroundColor:C.greenLt,
    borderRadius:14,padding:12,borderWidth:1,borderColor:'#A7F3D0'},
  previewImg:{width:64,height:64,borderRadius:10,backgroundColor:C.bgAlt},
  previewRound:{width:64,height:64,borderRadius:32,backgroundColor:C.bgAlt},
  previewOk:{fontSize:14,fontWeight:'800',color:C.green},
  previewSwap:{fontSize:12,color:C.muted,marginTop:2,lineHeight:16},

  commissionBox:{backgroundColor:C.white,borderRadius:16,padding:16,marginTop:24,gap:10,
    borderWidth:1,borderColor:C.border,...S.sm},
  commissionTitle:{fontSize:15,fontWeight:'800',color:C.dark,marginBottom:2},
  commissionRow:{flexDirection:'row',gap:10},
  commissionDot:{fontSize:14,color:C.primary,fontWeight:'800'},
  commissionA:{fontSize:13,fontWeight:'700',color:C.text},
  commissionB:{fontSize:12,color:C.muted,marginTop:2,lineHeight:16},

  noteBox:{backgroundColor:C.amberLt,borderRadius:12,padding:14,marginTop:14,
    borderWidth:1,borderColor:'#FDE68A'},
  noteTxt:{fontSize:12,color:C.text,lineHeight:18},

  emptyBox:{alignItems:'center',paddingVertical:36,gap:8},
  emptyTxt:{fontSize:15,fontWeight:'700',color:C.dark},

  errBox:{backgroundColor:C.redLt,borderRadius:12,padding:14,marginTop:12,
    borderWidth:1,borderColor:'#FECACA',gap:2},
  errTitle:{fontSize:13,color:C.red,fontWeight:'800',marginBottom:4},
  errItem:{fontSize:13,color:C.red,fontWeight:'600',lineHeight:20},

  footer:{paddingHorizontal:20,paddingVertical:16,backgroundColor:C.white,
    borderTopWidth:1,borderTopColor:C.border},
  btn:{backgroundColor:C.primary,borderRadius:16,paddingVertical:17,alignItems:'center',...S.md},
  btnDis:{opacity:0.6},
  btnTxt:{color:C.white,fontSize:16,fontWeight:'700'},

  bigIcon:{fontSize:62},
  centerTitle:{fontSize:24,fontWeight:'800',color:C.dark,textAlign:'center'},
  centerTxt:{fontSize:14,color:C.muted,textAlign:'center',lineHeight:21},
  centerNote:{fontSize:12,color:C.amber,textAlign:'center',lineHeight:18,
    backgroundColor:C.amberLt,borderRadius:12,padding:12,
    borderWidth:1,borderColor:'#FDE68A'},
  primaryBtn:{backgroundColor:C.primary,borderRadius:16,paddingVertical:16,
    paddingHorizontal:36,marginTop:12,...S.md},
  primaryTxt:{color:C.white,fontSize:16,fontWeight:'700'},
  outlineBtn:{borderWidth:1.5,borderColor:C.border,borderRadius:16,paddingVertical:14,
    paddingHorizontal:32,marginTop:12,backgroundColor:C.white},
  outlineTxt:{color:C.text,fontSize:15,fontWeight:'600'},
  ghostBtn:{paddingVertical:12},
  ghostTxt:{color:C.muted,fontSize:14,fontWeight:'600'},
});
