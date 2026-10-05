import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { notify } from '../lib/notify';
import { canTakeJob } from '../lib/availability';
import { seedChecklist, seedExtraTasks, finalQuote, fixedQuote, loadParts, partsSummary } from '../lib/services';

export const MOCK_CLEANERS: any[] = [];

export const CLEANERS = MOCK_CLEANERS;

export interface Booking {
  id: string; cleanerId: string; clientId?: string; address: string;
  date: string; time: string; hours: number; numCleaners: number;
  propertyType: string; serviceType: string;
  total: number; status: string; createdAt: string;
  pinCode?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  completionPhotos?: string[] | null;
  clientConfirmedAt?: string | null;
  autoConfirmAt?: string | null;
  disputeReason?: string | null;
  preferredCleanerId?: string | null;
  preferredUntil?: string | null;
  releasedToPool?: boolean;
  actualMinutes?: number | null;
  finalTotal?: number | null;
  finalCleanerPayment?: number | null;
  finalPlatformCommission?: number | null;
  finalVat?: number | null;
  estimatedTotal?: number | null;
  hourlyRate?: number | null;
  serviceMultiplier?: number | null;
  suppliesBy?: string | null;
  proposedDate?: string | null;
  proposedTime?: string | null;
  proposedNote?: string | null;
  proposedBy?: string | null;
  rescheduleCount?: number | null;
  partsTotal?: number | null;
  partsCommission?: number | null;
  pricingModel?: string | null;
  calloutFee?: number | null;
  isUrgent?: boolean | null;
  lat?: number | null;
  lng?: number | null;
  locationNote?: string | null;
  vehicleInfo?: string | null;
  tradeId?: string | null;
  answers?: Record<string,string> | null;
  labourTotal?: number | null;
  quoteAmount?: number | null;
  quoteParts?: number | null;
  quoteNote?: string | null;
}

export type Cleaner = {
  id: string; name: string; initials: string; color: string;
  rating: number; reviews: number; rate: number;
  available: boolean; verified: boolean;
  areas: string[]; specialties: string[]; badges: string[];
  bio: string; completionRate: number;
  minHours?: number; bringsOwnSupplies?: boolean;
  teamType?: string; teamSize?: number;
  categories?: string[]; acceptsUrgent?: boolean; serviceRadiusKm?: number;
  photoPath?: string | null; photoUrl?: string | null;
  insured?: boolean; coversAllMalta?: boolean; coversAllGozo?: boolean;
  availability?: any; noticeHours?: number;
  timeOff?: { starts_on:string; ends_on:string }[];
};

interface Ctx {
  bookings: Booking[];
  cleaners: Cleaner[];
  providers: Cleaner[];
  availableTrades: string[];
  providersFor: (tradeId: string) => Cleaner[];
  addBooking: (
    b: Omit<Booking,'id'|'createdAt'>,
    meta?: { multiplier?: number; suppliesByCleaner?: boolean; hourlyRate?: number;
             extraIds?: string[]; propertySize?: string; estimatedMinutes?: number;
             extrasForChecklist?: any[];
             pricingModel?: string; calloutFee?: number; isUrgent?: boolean;
             lat?: number|null; lng?: number|null; locationAccuracy?: number|null;
             locationNote?: string|null; vehicleInfo?: string|null;
             releasedToPool?: boolean; tradeId?: string|null;
             labourTotal?: number|null; partsTotal?: number|null;
             answers?: Record<string,string> }
  ) => Promise<void>;
  updateStatus: (id: string, status: string) => Promise<void>;
  markArrived: (id: string) => Promise<string>;
  verifyPin: (id: string, pin: string) => Promise<boolean>;
  finishJob: (id: string, photos?: string[]) => Promise<void>;
  clientConfirm: (id: string) => Promise<void>;
  clientDispute: (id: string, reason: string) => Promise<void>;
  releaseToPool: (id: string) => Promise<void>;
  reassignCleaner: (id: string, newCleanerId: string) => Promise<void>;
  acceptJob: (id: string, myCleanerId: string) => Promise<boolean>;
  proposeTime: (id: string, date: string, time: string, note: string, myId: string) => Promise<void>;
  sendQuote: (id: string, labour: number, parts: number, note: string, myId: string) => Promise<void>;
  respondToQuote: (id: string, accept: boolean) => Promise<void>;
  respondToProposal: (id: string, accept: boolean) => Promise<void>;
  loadBookings: () => Promise<void>;
  getCleanerById: (id: string) => Cleaner | undefined;
  userRole: string;
  userName: string;
  userId: string;
  myCategories: string[];
}

const AppContext = createContext<Ctx>({} as Ctx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [bookings,  setBookings]  = useState<Booking[]>([]);
  const [cleaners,  setCleaners]  = useState<Cleaner[]>([]);
  const [userRole,  setUserRole]  = useState('client');
  const [userName,  setUserName]  = useState('');
  const [userId,    setUserId]    = useState('');
  const [myCategories, setMyCats] = useState<string[]>(['cleaning']);

  const loadCleaners = async () => {
    // providers_public is the safe half of cleaner_profiles — no IBAN,
    // no ID number, no documents. Clients never need those.
    const { data, error } = await supabase
      .from('providers_public')
      .select('*');

    if (error) { console.log('loadCleaners error:', error.message); return; }

    const colors = ['#4F46E5','#059669','#D97706','#0891B2','#7C3AED','#DC2626'];
    const list: Cleaner[] = (data || []).map((c: any, i: number) => {
      const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Cleaner';
      return {
        id: c.id,
        name,
        initials: name.split(' ').map((w: string) => w[0] || '').join('').slice(0,2).toUpperCase(),
        color: colors[i % colors.length],
        rating: 5.0,
        reviews: 0,
        rate: Number(c.hourly_rate) || 15,
        available: c.available !== false,
        verified: true,
        areas: c.service_areas && c.service_areas.length ? c.service_areas : ['Malta'],
        specialties: c.specialties && c.specialties.length ? c.specialties : ['Standard'],
        badges: [
          c.team_type === 'duo'     ? 'Works in pairs'
        : c.team_type === 'company' ? `Team of ${Number(c.team_size) || 2}`
        : 'Solo cleaner',
          'Verified',
        ],
        bio: c.bio || 'Professional cleaner based in Malta.',
        completionRate: 100,
        minHours: Number(c.min_hours) || 3,
        bringsOwnSupplies: !!c.brings_own_supplies,
        teamType: c.team_type || 'solo',
        teamSize: Number(c.team_size) || 1,
        categories: (c.categories && c.categories.length) ? c.categories : ['cleaning'],
        acceptsUrgent: !!c.accepts_urgent,
        serviceRadiusKm: Number(c.service_radius_km) || 15,
        photoPath: c.profile_photo_url || null,
        photoUrl: null as string | null,
        insured: !!c.has_insurance,
        coversAllMalta: !!c.covers_all_malta,
        coversAllGozo: !!c.covers_all_gozo,
        availability: c.availability || null,
        noticeHours: Number(c.notice_hours) || 12,
      } as any;
    });

    setCleaners(list);

    // Who is away, so we don't offer them dates they can't do
    if (list.length) {
      const { data: offs } = await supabase
        .from('time_off').select('provider_id, starts_on, ends_on')
        .in('provider_id', list.map(c=>c.id))
        .gte('ends_on', new Date().toISOString().slice(0,10));
      if (offs?.length) {
        const byId: Record<string, any[]> = {};
        offs.forEach((o:any)=>{ (byId[o.provider_id] ||= []).push(o); });
        setCleaners(prev => prev.map((c:any) =>
          byId[c.id] ? { ...c, timeOff: byId[c.id] } : c));
      }
    }

    // Profile photos sit in a private bucket — sign them so clients can see them
    const withPhotos = list.filter((c:any)=>c.photoPath);
    if (withPhotos.length) {
      const { data: signed } = await supabase.storage
        .from('verification-docs')
        .createSignedUrls(withPhotos.map((c:any)=>c.photoPath), 60 * 60 * 6);
      if (signed) {
        const byPath: Record<string,string> = {};
        signed.forEach((r:any, i:number) => {
          if (r.signedUrl) byPath[withPhotos[i].photoPath] = r.signedUrl;
        });
        setCleaners(prev => prev.map((c:any) =>
          c.photoPath && byPath[c.photoPath] ? { ...c, photoUrl: byPath[c.photoPath] } : c));
      }
    }
  };

  const loadUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUserRole('client'); setUserName(''); setUserId(''); return; }
    setUserId(user.id);
    const { data } = await supabase
      .from('profiles').select('full_name, role').eq('id', user.id).maybeSingle();
    if (data) {
      setUserRole(data.role || 'client');
      setUserName(data.full_name || user.email || '');
    }

    if (data?.role === 'cleaner') {
      const { data: prof } = await supabase
        .from('cleaner_profiles').select('categories').eq('id', user.id).maybeSingle();
      if (prof?.categories?.length) setMyCats(prof.categories);
    }
  };

  const loadBookings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBookings([]); return; }

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle();
    const role = profile?.role || 'client';

    let query = supabase.from('bookings').select('*').order('created_at', { ascending: false });

    if (role === 'client') {
      query = query.eq('client_id', user.id);
    } else if (role === 'cleaner') {
      query = query.or(
        `cleaner_id.eq.${user.id},preferred_cleaner_id.eq.${user.id},released_to_pool.eq.true`
      );
    }

    const { data, error } = await query;
    if (error) { console.log('loadBookings error:', error.message); return; }

    if (data) {
      setBookings(data.map(b => ({
        id: b.id,
        cleanerId: b.cleaner_id,
        clientId: b.client_id,
        address: b.address,
        date: b.date,
        time: b.start_time,
        hours: b.hours,
        numCleaners: b.num_cleaners,
        propertyType: b.property_type,
        serviceType: b.service_type,
        total: b.total_price,
        status: b.status,
        createdAt: b.created_at,
        pinCode: b.pin_code,
        startedAt: b.started_at,
        finishedAt: b.finished_at,
        completionPhotos: b.completion_photos,
        clientConfirmedAt: b.client_confirmed_at,
        autoConfirmAt: b.auto_confirm_at,
        disputeReason: b.dispute_reason,
        preferredCleanerId: b.preferred_cleaner_id,
        preferredUntil: b.preferred_until,
        releasedToPool: b.released_to_pool,
        actualMinutes: b.actual_minutes,
        finalTotal: b.final_total,
        finalCleanerPayment: b.final_cleaner_payment,
        finalPlatformCommission: b.final_platform_commission,
        finalVat: b.final_vat,
        estimatedTotal: b.estimated_total ?? b.total_price,
        hourlyRate: b.hourly_rate,
        serviceMultiplier: b.service_multiplier,
        suppliesBy: b.supplies_by,
        proposedDate: b.proposed_date,
        proposedTime: b.proposed_time,
        proposedNote: b.proposed_note,
        proposedBy: b.proposed_by,
        rescheduleCount: b.reschedule_count,
        partsTotal: b.parts_total,
        partsCommission: b.parts_commission,
        pricingModel: b.pricing_model,
        calloutFee: b.callout_fee,
        isUrgent: b.is_urgent,
        lat: b.lat,
        lng: b.lng,
        locationNote: b.location_note,
        vehicleInfo: b.vehicle_info,
        tradeId: b.trade_id,
        answers: b.answers,
        labourTotal: b.labour_total,
        quoteAmount: b.quote_amount,
        quoteParts: b.quote_parts,
        quoteNote: b.quote_note,
      })));
    }
  };

  const autoConfirmExpired = async () => {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from('bookings').select('id')
      .eq('status', 'awaiting_confirmation').lt('auto_confirm_at', now);
    if (data && data.length > 0) {
      const ids = data.map(d => d.id);
      await supabase.from('bookings')
        .update({ status: 'completed', client_confirmed_at: now }).in('id', ids);
      setBookings(prev => prev.map(b => ids.includes(b.id) ? { ...b, status: 'completed' } : b));
    }
  };

  useEffect(() => {
    loadUser(); loadBookings(); loadCleaners(); autoConfirmExpired();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) { loadUser(); loadBookings(); loadCleaners(); }
      else { setUserRole('client'); setUserName(''); setUserId(''); setBookings([]); }
    });
    return () => subscription.unsubscribe();
  }, []);

  /**
   * Providers who do this trade, are taking work, and are actually free
   * at that date and time. Used every time a job goes out to the pool.
   */
  const matchingProviders = async (opts: {
    tradeId?: string | null;
    date: string;
    time: string;
    exclude?: string | null;
  }) => {
    const { data } = await supabase
      .from('providers_public')
      .select('id, categories, availability, notice_hours')
      .eq('available', true);

    if (!data?.length) return [];

    const ids = data.map(c => c.id);
    const { data: offs } = await supabase
      .from('time_off').select('provider_id, starts_on, ends_on').in('provider_id', ids);

    const offByProvider: Record<string, any[]> = {};
    (offs || []).forEach((o:any) => {
      (offByProvider[o.provider_id] ||= []).push(o);
    });

    return data.filter((c:any) => {
      if (opts.exclude && c.id === opts.exclude) return false;
      if (opts.tradeId && !(c.categories || []).includes(opts.tradeId)) return false;
      return canTakeJob({
        availability: c.availability,
        notice_hours: c.notice_hours,
        timeOff: offByProvider[c.id] || [],
      }, opts.date, opts.time).ok;
    });
  };

  const addBooking = async (
    b: Omit<Booking,'id'|'createdAt'>,
    meta?: { multiplier?: number; suppliesByCleaner?: boolean; hourlyRate?: number;
             extraIds?: string[]; propertySize?: string; estimatedMinutes?: number;
             extrasForChecklist?: any[];
             pricingModel?: string; calloutFee?: number; isUrgent?: boolean;
             lat?: number|null; lng?: number|null; locationAccuracy?: number|null;
             locationNote?: string|null; vehicleInfo?: string|null;
             releasedToPool?: boolean; tradeId?: string|null;
             labourTotal?: number|null; partsTotal?: number|null;
             answers?: Record<string,string> }
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { console.log('addBooking: no user'); return; }

    const exVat = b.total / 1.029 / 1.18;
    const { data, error } = await supabase.from('bookings').insert({
      client_id: user.id,
      cleaner_id: b.cleanerId || null,
      address: b.address,
      date: b.date,
      start_time: b.time,
      hours: b.hours,
      num_cleaners: b.numCleaners,
      property_type: b.propertyType,
      service_type: b.serviceType,
      price_ex_vat: +exVat.toFixed(2),
      vat_amount: +(exVat * 0.18).toFixed(2),
      stripe_fee: +(b.total - b.total / 1.029).toFixed(2),
      total_price: b.total,
      estimated_total: b.total,
      cleaner_payment: +(exVat * 0.80).toFixed(2),
      platform_commission: +(exVat * 0.20).toFixed(2),
      status: 'pending',
      service_multiplier: meta?.multiplier ?? 1,
      extras_total: 0,
      supplies_by: meta?.suppliesByCleaner ? 'cleaner' : 'client',
      hourly_rate: meta?.hourlyRate ?? 15,
      property_size: meta?.propertySize ?? '1bed',
      estimated_minutes: meta?.estimatedMinutes ?? null,
      pricing_model: meta?.pricingModel ?? 'hourly',
      callout_fee: meta?.calloutFee ?? 0,
      is_urgent: meta?.isUrgent ?? false,
      lat: meta?.lat ?? null,
      lng: meta?.lng ?? null,
      location_accuracy: meta?.locationAccuracy ?? null,
      location_note: meta?.locationNote ?? null,
      vehicle_info: meta?.vehicleInfo ?? null,
      trade_id: meta?.tradeId ?? null,
      answers: meta?.answers && Object.keys(meta.answers).length ? meta.answers : null,
      labour_total: meta?.labourTotal ?? null,
      parts_total: meta?.partsTotal ?? 0,
      preferred_cleaner_id: b.cleanerId || null,
      preferred_until: meta?.releasedToPool ? null : new Date(Date.now() + 5*60*1000).toISOString(),
      released_to_pool: meta?.releasedToPool ?? false,
    }).select().single();

    if (error) { console.log('addBooking error:', error.message); throw error; }

    if (data) {
      // Save chosen extras
      if (meta?.extraIds?.length) {
        const rows = meta.extraIds.map(id => ({
          booking_id: data.id, extra_id: id, price: 0,
        }));
        await supabase.from('booking_extras').insert(rows);
      }

      // Build the task checklist for this service type, then append extras
      seedChecklist(data.id, b.serviceType)
        .then(() => seedExtraTasks(data.id, meta?.extrasForChecklist || []));

      // Roadside and pool jobs: alert every approved provider at once
      if (meta?.releasedToPool) {
        matchingProviders({ tradeId: meta?.tradeId, date: b.date, time: b.time })
          .then(list => list.forEach(c => notify(c.id, 'job_in_pool', {
            address: b.address, date: b.date, time: b.time, hours: b.hours,
            earnings: (b.total / 1.029 / 1.18 * 0.80),
          }, data.id)));
      } else
      // Tell the preferred cleaner they have a 5-minute priority window
      notify(b.cleanerId, 'new_job_offer', {
        address: b.address,
        date: b.date,
        time: b.time,
        hours: b.hours,
        model: meta?.pricingModel || 'hourly',
        earnings: meta?.pricingModel === 'quote'
          ? null
          : (b.total / 1.029 / 1.18 * 0.80),
      }, data.id);

      setBookings(prev => [{
        id: data.id, cleanerId: data.cleaner_id, clientId: data.client_id,
        address: data.address, date: data.date, time: data.start_time,
        hours: data.hours, numCleaners: data.num_cleaners,
        propertyType: data.property_type, serviceType: data.service_type,
        total: data.total_price, status: data.status, createdAt: data.created_at,
        preferredCleanerId: data.preferred_cleaner_id,
        preferredUntil: data.preferred_until,
        releasedToPool: data.released_to_pool,
      }, ...prev]);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    const bk = bookings.find(x => x.id === id);
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b));
    const { error } = await supabase.from('bookings').update({ status }).eq('id', id);
    if (error) console.log('updateStatus error:', error.message);

    if (status === 'en_route' && bk?.clientId) {
      notify(bk.clientId, 'cleaner_on_way', {
        cleanerName: userName || 'Your cleaner', address: bk.address,
      }, id);
    }
  };

  const releaseToPool = async (id: string) => {
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status:'pending_pool', releasedToPool:true } : b));
    const { error } = await supabase.from('bookings')
      .update({ status:'pending_pool', released_to_pool:true }).eq('id', id);
    if (error) console.log('releaseToPool error:', error.message);

    const bk = bookings.find(x => x.id === id);
    if (bk) {
      const pool = await matchingProviders({
        tradeId: bk.tradeId, date: bk.date, time: bk.time, exclude: bk.cleanerId,
      });
      pool.forEach(c => notify(c.id, 'job_in_pool', {
        address: bk.address, date: bk.date, time: bk.time, hours: bk.hours,
        earnings: (bk.total / 1.029 / 1.18 * 0.80),
      }, id));
    }
  };

  const reassignCleaner = async (id: string, newCleanerId: string) => {
    const until = new Date(Date.now() + 5*60*1000).toISOString();
    setBookings(prev => prev.map(b => b.id === id
      ? { ...b, cleanerId:newCleanerId, preferredCleanerId:newCleanerId,
          preferredUntil:until, releasedToPool:false, status:'pending' } : b));
    const { error } = await supabase.from('bookings').update({
      cleaner_id: newCleanerId, preferred_cleaner_id: newCleanerId,
      preferred_until: until, released_to_pool: false, status: 'pending',
    }).eq('id', id);
    if (error) console.log('reassignCleaner error:', error.message);

    const bk = bookings.find(x => x.id === id);
    if (bk) {
      notify(newCleanerId, 'new_job_offer', {
        address: bk.address, date: bk.date, time: bk.time,
        hours: bk.hours, numCleaners: bk.numCleaners, serviceType: bk.serviceType,
        earnings: (bk.total / 1.029 / 1.18 * 0.80),
      }, id);
    }
  };

  const acceptJob = async (id: string, myCleanerId: string): Promise<boolean> => {
    // a suspended account cannot pick up work
    const { data: me } = await supabase.from('profiles')
      .select('suspended_until').eq('id', myCleanerId).maybeSingle();
    if (me?.suspended_until && new Date(me.suspended_until) >= new Date()) {
      console.log('acceptJob: account suspended until', me.suspended_until);
      return false;
    }

    const { data: current } = await supabase
      .from('bookings').select('status').eq('id', id).maybeSingle();
    if (!current || !['pending','pending_pool'].includes(current.status)) return false;

    setBookings(prev => prev.map(b => b.id === id ? { ...b, status:'accepted', cleanerId:myCleanerId } : b));
    const { error } = await supabase.from('bookings')
      .update({ status:'accepted', cleaner_id: myCleanerId })
      .eq('id', id).in('status', ['pending','pending_pool']);
    if (error) { console.log('acceptJob error:', error.message); return false; }

    const bk = bookings.find(x => x.id === id);
    if (bk?.clientId) {
      notify(bk.clientId, 'booking_confirmed', {
        cleanerName: userName || 'Your cleaner',
        date: bk.date, time: bk.time, address: bk.address,
      }, id);
    }
    return true;
  };

  /** Price a job that couldn't be quoted sight unseen */
  const sendQuote = async (
    id: string, labour: number, parts: number, note: string, myId: string
  ) => {
    const bk = bookings.find(x => x.id === id);
    const q = fixedQuote({ labourPrice: labour, partsPrice: parts });

    setBookings(prev => prev.map(b => b.id === id
      ? { ...b, status:'quoted', cleanerId: myId,
          quoteAmount: labour, quoteParts: parts, quoteNote: note,
          total: q.clientPays }
      : b));

    const { error } = await supabase.from('bookings').update({
      status: 'quoted',
      cleaner_id: myId,
      quote_amount: labour,
      quote_parts: parts,
      quote_note: note || null,
      quoted_at: new Date().toISOString(),
      quote_expires_at: new Date(Date.now() + 24*3600*1000).toISOString(),
      total_price: q.clientPays,
      labour_total: q.labourSide,
      parts_total: parts,
    }).eq('id', id);

    if (error) { console.log('sendQuote error:', error.message); return; }

    if (bk?.clientId) {
      notify(bk.clientId, 'quote_sent', {
        cleanerName: userName || 'Your provider',
        amount: q.clientPays.toFixed(2),
        note: note || '',
      }, id);
    }
  };

  /** Client accepts the figure, or the job is dropped */
  const respondToQuote = async (id: string, accept: boolean) => {
    const bk = bookings.find(x => x.id === id);
    if (!bk) return;

    if (accept) {
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status:'accepted' } : b));
      const { error } = await supabase.from('bookings')
        .update({ status: 'accepted' }).eq('id', id);
      if (error) console.log('respondToQuote error:', error.message);

      if (bk.cleanerId) {
        notify(bk.cleanerId, 'quote_accepted', {
          amount: Number(bk.total).toFixed(2),
          address: bk.address, date: bk.date, time: bk.time,
        }, id);
      }
    } else {
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status:'cancelled' } : b));
      const { error } = await supabase.from('bookings')
        .update({ status: 'cancelled' }).eq('id', id);
      if (error) console.log('respondToQuote error:', error.message);

      if (bk.cleanerId) {
        notify(bk.cleanerId, 'quote_declined', { address: bk.address }, id);
      }
    }
  };

  /** Provider can't make the slot and offers another one */
  const proposeTime = async (
    id: string, date: string, time: string, note: string, myId: string
  ) => {
    const bk = bookings.find(x => x.id === id);

    setBookings(prev => prev.map(b => b.id === id
      ? { ...b, status:'reschedule_proposed', cleanerId: myId,
          proposedDate: date, proposedTime: time, proposedNote: note, proposedBy: myId }
      : b));

    const { error } = await supabase.from('bookings').update({
      status: 'reschedule_proposed',
      cleaner_id: myId,
      proposed_date: date,
      proposed_time: time,
      proposed_note: note || null,
      proposed_by: myId,
      proposed_at: new Date().toISOString(),
      reschedule_count: (Number(bk?.rescheduleCount) || 0) + 1,
    }).eq('id', id);

    if (error) { console.log('proposeTime error:', error.message); return; }

    if (bk?.clientId) {
      notify(bk.clientId, 'time_proposed', {
        cleanerName: userName || 'Your provider',
        oldDate: bk.date, oldTime: bk.time,
        newDate: date, newTime: time,
        note: note || '',
      }, id);
    }
  };

  /** Client says yes or no to the new slot */
  const respondToProposal = async (id: string, accept: boolean) => {
    const bk = bookings.find(x => x.id === id);
    if (!bk) return;

    if (accept) {
      setBookings(prev => prev.map(b => b.id === id
        ? { ...b, status:'accepted',
            date: b.proposedDate || b.date, time: b.proposedTime || b.time,
            proposedDate: null, proposedTime: null, proposedNote: null }
        : b));

      const { error } = await supabase.from('bookings').update({
        status: 'accepted',
        date: bk.proposedDate,
        start_time: bk.proposedTime,
        proposed_date: null, proposed_time: null,
        proposed_note: null, proposed_by: null, proposed_at: null,
      }).eq('id', id);
      if (error) console.log('respondToProposal error:', error.message);

      if (bk.cleanerId) {
        notify(bk.cleanerId, 'time_accepted', {
          date: bk.proposedDate, time: bk.proposedTime, address: bk.address,
        }, id);
      }
    } else {
      // back to the pool so someone else can take the original slot
      setBookings(prev => prev.map(b => b.id === id
        ? { ...b, status:'pending_pool', releasedToPool:true, cleanerId:'',
            proposedDate: null, proposedTime: null, proposedNote: null }
        : b));

      const { error } = await supabase.from('bookings').update({
        status: 'pending_pool',
        released_to_pool: true,
        cleaner_id: null,
        proposed_date: null, proposed_time: null,
        proposed_note: null, proposed_by: null, proposed_at: null,
      }).eq('id', id);
      if (error) console.log('respondToProposal error:', error.message);

      if (bk.cleanerId) {
        notify(bk.cleanerId, 'time_declined', {
          address: bk.address, date: bk.date, time: bk.time,
        }, id);
      }

      // tell everyone else it's going spare
      const pool = await matchingProviders({
        tradeId: bk.tradeId, date: bk.date, time: bk.time, exclude: bk.cleanerId,
      });
      pool.forEach(c => notify(c.id, 'job_in_pool', {
        address: bk.address, date: bk.date, time: bk.time, hours: bk.hours,
        earnings: (bk.total / 1.029 / 1.18 * 0.80),
      }, id));
    }
  };

  const markArrived = async (id: string): Promise<string> => {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'arrived', pinCode: pin } : b));
    const { error } = await supabase.from('bookings')
      .update({ status: 'arrived', pin_code: pin }).eq('id', id);
    if (error) console.log('markArrived error:', error.message);

    const bk = bookings.find(x => x.id === id);
    if (bk?.clientId) {
      notify(bk.clientId, 'cleaner_arrived', {
        cleanerName: userName || 'Your cleaner', pin,
      }, id);
    }
    return pin;
  };

  const verifyPin = async (id: string, pin: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('bookings').select('pin_code').eq('id', id).maybeSingle();
    if (error || !data) { console.log('verifyPin error:', error?.message); return false; }
    if (data.pin_code !== pin.trim()) return false;

    const now = new Date().toISOString();
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'in_progress', startedAt: now } : b));
    await supabase.from('bookings').update({ status: 'in_progress', started_at: now }).eq('id', id);
    return true;
  };

  const finishJob = async (id: string, photos?: string[]) => {
    const bk  = bookings.find(x => x.id === id);
    const now = new Date();
    const autoAt = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    // Work out what the job really cost, based on the timer
    // Parts the client already agreed to go on the final bill
    const parts = await loadParts(id);
    const ps    = partsSummary(parts);

    let settle: any = null;
    if (bk?.startedAt) {
      settle = finalQuote({
        startedAt: bk.startedAt,
        finishedAt: now.toISOString(),
        baseRate: Number(bk.hourlyRate) || 15,
        multiplier: Number(bk.serviceMultiplier) || 1,
        suppliesByCleaner: bk.suppliesBy === 'cleaner',
        numCleaners: bk.numCleaners || 1,
      });
    }

    setBookings(prev => prev.map(b => b.id === id
      ? { ...b,
          status: 'awaiting_confirmation',
          finishedAt: now.toISOString(),
          autoConfirmAt: autoAt.toISOString(),
          completionPhotos: photos || null,
          actualMinutes: settle?.actualMinutes ?? null,
          finalTotal: settle ? +(settle.total + ps.approvedTotal).toFixed(2)
                     : ps.approvedTotal > 0 ? +(Number(bk?.total||0) + ps.approvedTotal).toFixed(2)
                     : null,
          finalCleanerPayment: settle ? +(settle.cleanerGets + ps.providerGets).toFixed(2) : null,
          finalPlatformCommission: settle ? +(settle.platform + ps.commission).toFixed(2) : null,
          finalVat: settle?.vat ?? null,
          partsTotal: ps.approvedTotal,
        }
      : b));

    const payload: any = {
      status: 'awaiting_confirmation',
      finished_at: now.toISOString(),
      auto_confirm_at: autoAt.toISOString(),
      completion_photos: photos || null,
    };
    payload.parts_total      = ps.approvedTotal;
    payload.parts_commission = ps.commission;

    if (settle) {
      payload.actual_minutes            = settle.actualMinutes;
      payload.final_total               = +(settle.total + ps.approvedTotal).toFixed(2);
      payload.final_cleaner_payment     = +(settle.cleanerGets + ps.providerGets).toFixed(2);
      payload.final_platform_commission = +(settle.platform + ps.commission).toFixed(2);
      payload.final_vat                 = settle.vat;
    } else if (ps.approvedTotal > 0 && bk) {
      // fixed-price job — labour was already agreed, just add the parts
      const labour = Number(bk.total) || 0;
      payload.final_total           = +(labour + ps.approvedTotal).toFixed(2);
      payload.final_cleaner_payment = +(labour/1.029/1.18*0.80 + ps.providerGets).toFixed(2);
      payload.final_platform_commission = +(labour/1.029/1.18*0.20 + ps.commission).toFixed(2);
    }

    const { error } = await supabase.from('bookings').update(payload).eq('id', id);
    if (error) console.log('finishJob error:', error.message);

    if (bk?.clientId) {
      notify(bk.clientId, 'job_finished', {
        cleanerName: userName || 'Your cleaner',
      }, id);
    }
  };

  const clientConfirm = async (id: string) => {
    const now = new Date().toISOString();
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'completed', clientConfirmedAt: now } : b));
    const bk = bookings.find(x => x.id === id);
    const payload: any = { status: 'completed', client_confirmed_at: now };

    // The final figure becomes the billed amount
    if (bk?.finalTotal) {
      payload.total_price         = bk.finalTotal;
      payload.parts_total         = bk.partsTotal ?? 0;
      payload.cleaner_payment     = bk.finalCleanerPayment;
      payload.platform_commission = bk.finalPlatformCommission;
      payload.vat_amount          = bk.finalVat;
      payload.hours               = +((bk.actualMinutes || 0) / 60).toFixed(2);
    }

    const { error } = await supabase.from('bookings').update(payload).eq('id', id);
    if (error) console.log('clientConfirm error:', error.message);

    if (bk?.cleanerId) {
      notify(bk.cleanerId, 'job_completed', {
        earnings: bk.finalCleanerPayment ?? (bk.total / 1.029 / 1.18 * 0.80),
      }, id);
    }
  };

  const clientDispute = async (id: string, reason: string) => {
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'disputed', disputeReason: reason } : b));
    const { error } = await supabase.from('bookings')
      .update({ status: 'disputed', dispute_reason: reason }).eq('id', id);
    if (error) console.log('clientDispute error:', error.message);
  };

  const getCleanerById = (id: string) => cleaners.find(c => c.id === id);


  /** Trades with at least one approved provider signed up */
  const availableTrades = Array.from(new Set(
    cleaners.flatMap(c => (c as any).categories || [])
  ));

  const providersFor = (tradeId: string) =>
    cleaners.filter(c => ((c as any).categories || []).includes(tradeId));

  return (
    <AppContext.Provider value={{
      bookings, cleaners, providers: cleaners, availableTrades, providersFor,
      addBooking, updateStatus,
      markArrived, verifyPin, finishJob, clientConfirm, clientDispute,
      releaseToPool, reassignCleaner, acceptJob, proposeTime, respondToProposal,
      sendQuote, respondToQuote,
      loadBookings, getCleanerById,
      userRole, userName, userId, myCategories,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
