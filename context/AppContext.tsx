import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { notify } from '../lib/notify';
import { canTakeJob } from '../lib/availability';
import { touchPush } from '../lib/push';
import { seedChecklist, seedExtraTasks, finalQuote, fixedQuote, loadParts, partsSummary } from '../lib/services';

export const MOCK_CLEANERS: any[] = [];

export const CLEANERS = MOCK_CLEANERS;

export interface Booking {
  id: string; providerId: string; clientId?: string; address: string;
  date: string; time: string; hours: number; numWorkers: number;
  propertyType: string; serviceType: string;
  total: number; status: string; createdAt: string;
  /** Which side of this booking you are on. A provider who books a
      service is the client of that one, and it belongs on the client
      screens rather than in their job list. */
  side?: 'client' | 'provider';
  pinCode?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  completionPhotos?: string[] | null;
  clientConfirmedAt?: string | null;
  autoConfirmAt?: string | null;
  disputeReason?: string | null;
  preferredProviderId?: string | null;
  preferredUntil?: string | null;
  releasedToPool?: boolean;
  actualMinutes?: number | null;
  finalTotal?: number | null;
  finalProviderPayment?: number | null;
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
  fromLocality?: string | null; toLocality?: string | null;
  vehicleType?: string | null; routeBand?: string | null; loadNote?: string | null;
  promoCode?: string | null; discount?: number | null;
  noShow?: boolean | null;
  labourTotal?: number | null;
  /* What the booking was priced at when it was made. Written by the
     price_new_booking() trigger, never by this app. */
  providerPayment?: number | null;
  platformCommission?: number | null;
  commissionRate?: number | null;
  quoteAmount?: number | null;
  quoteParts?: number | null;
  quoteNote?: string | null;
}

/**
 * What the provider will be paid. There is nothing to work out here: the
 * database writes provider_payment when the booking is made and
 * final_provider_payment when the job settles, so this only chooses
 * between the two. The old code multiplied the client's total by 0.80
 * after dividing out an 18% VAT that no longer exists, which came out
 * roughly 15% short and was shown to the provider as their earnings.
 */
export const providerEarnings = (b: Partial<Booking> | null | undefined) =>
  Number(b?.finalProviderPayment ?? b?.providerPayment ?? 0);

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
             answers?: Record<string,string>;
             fromLocality?: string|null; toLocality?: string|null;
             vehicleType?: string|null; routeBand?: string|null; loadNote?: string|null;
             promoCode?: string|null; discount?: number }
  ) => Promise<void>;
  updateStatus: (id: string, status: string) => Promise<void>;
  markArrived: (id: string) => Promise<string>;
  verifyPin: (id: string, pin: string) => Promise<boolean>;
  finishJob: (id: string, photos?: string[]) => Promise<void>;
  clientConfirm: (id: string) => Promise<void>;
  hideBooking: (id: string, who: 'client'|'provider') => Promise<void>;
  reportNoShow: (id: string) => Promise<string>;
  clientDispute: (id: string, reason: string) => Promise<void>;
  handBack: (id: string) => Promise<void>;
  reassignProvider: (id: string, newProviderId: string) => Promise<void>;
  acceptJob: (id: string, myProviderId: string) => Promise<boolean>;
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
  /* Empty, not cleaning. A provider with no approved trade should be
     offered no work - inventing one for them put plumbers on cleaning
     jobs and showed a trade nobody picked on their own dashboard. */
  const [myCategories, setMyCats] = useState<string[]>([]);

  const loadCleaners = async () => {
    // providers_public is the safe half of cleaner_profiles — no IBAN,
    // no ID number, no documents. Clients never need those.
    const { data, error } = await supabase
      .from('providers_public')
      .select('*');

    if (error) { console.log('loadCleaners error:', error.message); return; }

    const colors = ['#4F46E5','#059669','#D97706','#0891B2','#7C3AED','#DC2626'];
    const list: Cleaner[] = (data || []).map((c: any, i: number) => {
      const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Provider';
      return {
        id: c.id,
        name,
        initials: name.split(' ').map((w: string) => w[0] || '').join('').slice(0,2).toUpperCase(),
        color: colors[i % colors.length],
        rating: 5.0,
        reviews: 0,
        /* No invented rate. The database carried a default of 15 on this
           column until it was dropped; this line was quietly putting it
           back, so a DJ charging €100 an hour read as €15 wherever this
           figure was shown. Zero means "they have not set a blanket
           rate", which is the truth, and the booking screen already
           knows how to treat a service with no price: it cannot be
           booked, rather than booked at a price nobody agreed. */
        rate: Number(c.hourly_rate) || 0,
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
        /* No fabricated trade. The column is derived from approved
           provider_trades rows by a trigger, so empty means exactly
           that: nothing approved yet. Filling it in here is how a
           provider who picked four trades came back as a cleaner. */
        categories: c.categories || [],
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
      /* Assigned even when empty, so dropping a trade actually clears
         it rather than leaving the last non-empty list in place. */
      setMyCats(prof?.categories || []);
    }
  };

  const loadBookings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBookings([]); return; }

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle();
    const role = profile?.role || 'client';

    /* Two sides, two queries.
     *
     * Which side of a booking somebody is on is a property of the
     * booking, not of their account, and reading it off the account is
     * what broke this. A provider is allowed to book services like
     * anybody else — a plumber needs a cleaner — but the cleaner branch
     * only ever looked at provider_id, so three jobs a provider had
     * paid for did not appear anywhere at all, while their old work
     * showed up in the client list instead.
     *
     * One query with an OR cannot do it: the hidden flag is per side,
     * and hidden_for_provider has nothing to say about a job you are
     * the client of.
     */
    const asClient = await supabase.from('bookings').select('*')
      .eq('client_id', user.id)
      .eq('hidden_for_client', false);

    const asProvider = role === 'cleaner'
      ? await supabase.from('bookings').select('*')
          /* Mine, or offered to me. Nothing else.
             This used to include every job released to the pool, which
             is how a provider came to see work nobody had offered them
             and a client came to be matched with somebody they had not
             chosen. */
          .or(`provider_id.eq.${user.id},preferred_provider_id.eq.${user.id}`)
          .eq('hidden_for_provider', false)
      : { data: [] as any[], error: null };

    if (asClient.error)   console.log('loadBookings (client side):',   asClient.error.message);
    if (asProvider.error) console.log('loadBookings (provider side):', asProvider.error.message);
    if (asClient.error && asProvider.error) return;

    const seen = new Set<string>();
    const data = [...(asClient.data || []), ...(asProvider.data || [])]
      .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    if (data) {
      setBookings(data.map(b => ({
        /* Which side this booking puts you on. Every screen reads this
           rather than guessing from the account's role. */
        side: b.client_id === user.id ? 'client' : 'provider',
        id: b.id,
        providerId: b.provider_id,
        clientId: b.client_id,
        address: b.address,
        date: b.date,
        time: b.start_time,
        hours: b.hours,
        numWorkers: b.num_workers,
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
        preferredProviderId: b.preferred_provider_id,
        preferredUntil: b.preferred_until,
        releasedToPool: b.released_to_pool,
        actualMinutes: b.actual_minutes,
        finalTotal: b.final_total,
        finalProviderPayment: b.final_provider_payment,
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
        fromLocality: b.from_locality,
        toLocality: b.to_locality,
        vehicleType: b.vehicle_type,
        routeBand: b.route_band,
        loadNote: b.load_note,
        promoCode: b.promo_code,
        noShow: b.no_show,
        discount: b.discount,
        labourTotal: b.labour_total,
        providerPayment: b.provider_payment,
        platformCommission: b.platform_commission,
        commissionRate: b.commission_rate,
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
    if (!data?.length) return;

    // Each one goes through the same settlement as a manual approval,
    // so the figures are worked out in exactly one place.
    const done: string[] = [];
    for (const row of data) {
      const { error } = await supabase.rpc('confirm_job', { p_booking: row.id });
      if (!error) done.push(row.id);
      else console.log('autoConfirm skipped', row.id, error.message);
    }

    if (done.length) {
      setBookings(prev => prev.map(b =>
        done.includes(b.id) ? { ...b, status: 'completed' } : b));
    }
  };

  useEffect(() => {
    loadUser(); loadBookings(); loadCleaners(); autoConfirmExpired(); touchPush();
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
             answers?: Record<string,string>;
             fromLocality?: string|null; toLocality?: string|null;
             vehicleType?: string|null; routeBand?: string|null; loadNote?: string|null;
             promoCode?: string|null; discount?: number }
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { console.log('addBooking: no user'); return; }

    /* No money is worked out here. The price_new_booking() trigger reads
       labour_total, parts_total, the urgency flag and the service's own
       commission rate, and writes price_ex_vat, vat_amount, stripe_fee,
       total_price, provider_payment, platform_commission and
       commission_rate itself. Anything this app sent for those columns
       was overwritten anyway, and what it used to send was wrong: a
       hardcoded 18% VAT and a flat 20% commission. */
    const { data, error } = await supabase.from('bookings').insert({
      client_id: user.id,
      provider_id: b.providerId || null,
      address: b.address,
      date: b.date,
      start_time: b.time,
      hours: b.hours,
      num_workers: b.numWorkers,
      property_type: b.propertyType,
      service_type: b.serviceType,
      total_price: b.total,
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
      from_locality: meta?.fromLocality ?? null,
      to_locality: meta?.toLocality ?? null,
      vehicle_type: meta?.vehicleType ?? null,
      route_band: meta?.routeBand ?? null,
      load_note: meta?.loadNote ?? null,
      promo_code: meta?.promoCode ?? null,
      discount: meta?.discount ?? 0,
      labour_total: meta?.labourTotal ?? null,
      parts_total: meta?.partsTotal ?? 0,
      preferred_provider_id: b.providerId || null,
      /* How long the chosen provider has before the client is asked to
         pick somebody else. An hour for ordinary work — a provider
         booked for next week will not lose the job because they were up
         a ladder for ten minutes — and ten minutes when it is urgent,
         where waiting an hour helps nobody.

         Nothing goes to a pool any more, so when this runs out the job
         goes back to the client rather than to strangers. */
      preferred_until: new Date(
        Date.now() + (meta?.isUrgent ? 10 : 60) * 60 * 1000
      ).toISOString(),
      released_to_pool: false,
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
      if (meta?.promoCode) {
        supabase.from('promo_uses').insert({
          code: meta.promoCode,
          user_id: b.clientId || null,
          booking_id: data.id,
          amount: meta.discount ?? 0,
        }).then(({ error: pe }) => {
          if (pe) console.log('promo_uses:', pe.message);
          else supabase.rpc('bump_promo', { p_code: meta.promoCode }).then(()=>{});
        });
      }

      /* No more telling everybody about a job nobody has been given.
         Every booking now belongs to the provider the client chose. */
      // Tell the chosen provider the job is theirs to take
      notify(b.providerId, 'new_job_offer', {
        address: b.address,
        date: b.date,
        time: b.time,
        hours: b.hours,
        model: meta?.pricingModel || 'hourly',
        earnings: meta?.pricingModel === 'quote'
          ? null
          : Number(data.provider_payment ?? 0),
      }, data.id);

      setBookings(prev => [{
        id: data.id, providerId: data.provider_id, clientId: data.client_id,
        address: data.address, date: data.date, time: data.start_time,
        hours: data.hours, numWorkers: data.num_workers,
        propertyType: data.property_type, serviceType: data.service_type,
        total: data.total_price, status: data.status, createdAt: data.created_at,
        preferredProviderId: data.preferred_provider_id,
        preferredUntil: data.preferred_until,
        releasedToPool: data.released_to_pool,
        /* straight from the row the trigger just priced, so the list
           shows the same figure the database holds */
        labourTotal: data.labour_total,
        partsTotal: data.parts_total,
        providerPayment: data.provider_payment,
        platformCommission: data.platform_commission,
        commissionRate: data.commission_rate,
        pricingModel: data.pricing_model,
        isUrgent: data.is_urgent,
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

  /**
   * A provider stepping away, and the job going back to the client.
   *
   * It used to go to a pool: open to everyone, first to accept wins. It
   * never worked. Nobody took the jobs that landed there, and if anyone
   * had they would have worked at the original provider's price,
   * because accepting never repriced anything. Worse, a client who
   * chose a name and a rating could have been sent a stranger — or
   * somebody they had already turned down.
   *
   * So the job goes back to the person who is entitled to decide:
   * the client. withdraw_offer does the work server-side and records
   * the refusal, so this provider is not put in front of them again.
   */
  const handBack = async (id: string) => {
    const bk = bookings.find(x => x.id === id);

    const { error } = await supabase.rpc('withdraw_offer', { p_booking: id });
    if (error) { console.log('handBack error:', error.message); throw new Error(error.message); }

    setBookings(prev => prev.map(b => b.id === id
      ? { ...b, status:'needs_provider', releasedToPool:false, providerId:'' } : b));

    if (bk?.clientId) {
      notify(bk.clientId, 'pick_again', {
        address: bk.address, date: bk.date, time: bk.time,
      }, id);
    }
  };

  const reassignProvider = async (id: string, newProviderId: string) => {
    const until = new Date(Date.now() + 5*60*1000).toISOString();
    setBookings(prev => prev.map(b => b.id === id
      ? { ...b, providerId:newProviderId, preferredProviderId:newProviderId,
          preferredUntil:until, releasedToPool:false, status:'pending' } : b));
    const { error } = await supabase.from('bookings').update({
      provider_id: newProviderId, preferred_provider_id: newProviderId,
      preferred_until: until, released_to_pool: false, status: 'pending',
    }).eq('id', id);
    if (error) console.log('reassignProvider error:', error.message);

    const bk = bookings.find(x => x.id === id);
    if (bk) {
      notify(newProviderId, 'new_job_offer', {
        address: bk.address, date: bk.date, time: bk.time,
        hours: bk.hours, numWorkers: bk.numWorkers, serviceType: bk.serviceType,
        earnings: providerEarnings(bk),
      }, id);
    }
  };

  const acceptJob = async (id: string, myProviderId: string): Promise<boolean> => {
    // a suspended account cannot pick up work
    const { data: me } = await supabase.from('profiles')
      .select('suspended_until').eq('id', myProviderId).maybeSingle();
    if (me?.suspended_until && new Date(me.suspended_until) >= new Date()) {
      console.log('acceptJob: account suspended until', me.suspended_until);
      return false;
    }

    const { data: current } = await supabase
      .from('bookings').select('status').eq('id', id).maybeSingle();
    /* Only a job that is actually yours to take. needs_provider is not
       on this list on purpose: that one is waiting on the client to
       choose, and a provider helping themselves to it is exactly what
       the pool used to allow. */
    if (!current || current.status !== 'pending') return false;

    setBookings(prev => prev.map(b => b.id === id ? { ...b, status:'accepted', providerId:myProviderId } : b));
    const { error } = await supabase.from('bookings')
      .update({ status:'accepted', provider_id: myProviderId })
      .eq('id', id).eq('status', 'pending');
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

    const { data, error } = await supabase.rpc('send_quote', {
      p_booking: id,
      p_labour: labour,
      p_parts: parts || 0,
      p_note: note || null,
    });

    if (error) { console.log('sendQuote error:', error.message); throw new Error(error.message); }

    const s: any = data || {};

    setBookings(prev => prev.map(b => b.id === id
      ? { ...b, status:'quoted', providerId: myId,
          quoteAmount: labour, quoteParts: parts, quoteNote: note,
          total: s.total ?? b.total }
      : b));

    if (bk?.clientId) {
      notify(bk.clientId, 'quote_sent', {
        cleanerName: userName || 'Your provider',
        amount: Number(s.total || 0).toFixed(2),
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

      if (bk.providerId) {
        notify(bk.providerId, 'quote_accepted', {
          amount: Number(bk.total).toFixed(2),
          address: bk.address, date: bk.date, time: bk.time,
        }, id);
      }
    } else {
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status:'cancelled' } : b));
      const { error } = await supabase.from('bookings')
        .update({ status: 'cancelled' }).eq('id', id);
      if (error) console.log('respondToQuote error:', error.message);

      if (bk.providerId) {
        notify(bk.providerId, 'quote_declined', { address: bk.address }, id);
      }
    }
  };

  /** Provider can't make the slot and offers another one */
  const proposeTime = async (
    id: string, date: string, time: string, note: string, myId: string
  ) => {
    const bk = bookings.find(x => x.id === id);

    setBookings(prev => prev.map(b => b.id === id
      ? { ...b, status:'reschedule_proposed', providerId: myId,
          proposedDate: date, proposedTime: time, proposedNote: note, proposedBy: myId }
      : b));

    const { error } = await supabase.from('bookings').update({
      status: 'reschedule_proposed',
      provider_id: myId,
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

      if (bk.providerId) {
        notify(bk.providerId, 'time_accepted', {
          date: bk.proposedDate, time: bk.proposedTime, address: bk.address,
        }, id);
      }
    } else {
      /* The client said no to the new time, so this provider is out of
         it. Back to the client to choose somebody else — not out to
         everybody, which is what used to happen and meant the client
         could end up with whoever answered first. */
      setBookings(prev => prev.map(b => b.id === id
        ? { ...b, status:'needs_provider', releasedToPool:false, providerId:'',
            proposedDate: null, proposedTime: null, proposedNote: null }
        : b));

      const { error } = await supabase.from('bookings').update({
        status: 'needs_provider',
        released_to_pool: false,
        provider_id: null,
        preferred_provider_id: null,
        preferred_until: null,
        proposed_date: null, proposed_time: null,
        proposed_note: null, proposed_by: null, proposed_at: null,
      }).eq('id', id);
      if (error) console.log('respondToProposal error:', error.message);

      if (bk.providerId) {
        notify(bk.providerId, 'time_declined', {
          address: bk.address, date: bk.date, time: bk.time,
        }, id);
      }
    }
  };

  const markArrived = async (id: string): Promise<string> => {
    const { data, error } = await supabase.rpc('arrive_at_job', { p_booking: id });
    if (error) { console.log('markArrived error:', error.message); throw new Error(error.message); }

    const pin = (data as any)?.pin || '';

    setBookings(prev => prev.map(b => b.id === id
      ? { ...b, status: 'arrived', pinCode: pin } : b));

    const bk = bookings.find(x => x.id === id);
    if (bk?.clientId) {
      notify(bk.clientId, 'cleaner_arrived', {
        cleanerName: userName || 'Your provider',
        pin,
      }, id);
    }

    return pin;
  };

  const verifyPin = async (id: string, pin: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('start_job', {
      p_booking: id,
      p_pin: pin.trim(),
    });

    if (error) { console.log('verifyPin error:', error.message); throw new Error(error.message); }
    if (data !== true) return false;

    setBookings(prev => prev.map(b => b.id === id
      ? { ...b, status: 'in_progress', startedAt: new Date().toISOString() } : b));

    return true;
  };

  const finishJob = async (id: string, photos?: string[]) => {
    const bk = bookings.find(x => x.id === id);

    // The database settles this — rate, minutes, approved parts and commission
    // are all worked out server-side so nothing here can be tampered with.
    const { data, error } = await supabase.rpc('finish_job', {
      p_booking: id,
      p_photos: photos || null,
    });

    if (error) { console.log('finishJob error:', error.message); throw new Error(error.message); }

    const s: any = data || {};
    const autoAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

    setBookings(prev => prev.map(b => b.id === id
      ? { ...b,
          status: 'awaiting_confirmation',
          finishedAt: new Date().toISOString(),
          autoConfirmAt: autoAt,
          completionPhotos: photos || null,
          actualMinutes: s.billed_minutes ?? null,
          finalTotal: s.total ?? null,
          finalProviderPayment: s.provider_gets ?? null,
          finalPlatformCommission:
            (Number(s.labour_commission) || 0) + (Number(s.parts_commission) || 0),
          finalVat: s.vat ?? null,
          partsTotal: s.parts ?? 0,
        }
      : b));

    if (bk?.clientId) {
      notify(bk.clientId, 'job_finished', {
        cleanerName: userName || 'Your provider',
      }, id);
    }
  };

  /** Tidy a finished job out of your own list. The record stays for both
      sides and for the books — this is a view, not a delete. */
  const hideBooking = async (id: string, who: 'client' | 'provider') => {
    const col = who === 'client' ? 'hidden_for_client' : 'hidden_for_provider';
    setBookings(prev => prev.filter(b => b.id !== id));
    const { error } = await supabase.from('bookings')
      .update({ [col]: true }).eq('id', id);
    if (error) { console.log('hideBooking:', error.message); await loadBookings(); }
  };

  /** Nobody turned up. Cancel at no cost, and put it on the record. */
  const reportNoShow = async (id: string): Promise<string> => {
    const bk = bookings.find(x => x.id === id);

    const { data, error } = await supabase.rpc('report_no_show', { p_booking: id });
    if (error) { console.log('reportNoShow:', error.message); throw new Error(error.message); }

    setBookings(prev => prev.map(b => b.id === id
      ? { ...b, status: 'cancelled', noShow: true } : b));

    if (bk?.providerId) {
      notify(bk.providerId, 'no_show_recorded', {
        address: bk.address, date: bk.date, time: bk.time,
      }, id);
    }

    return (data as any)?.code || '';
  };

  const clientConfirm = async (id: string) => {
    const bk = bookings.find(x => x.id === id);

    const { data, error } = await supabase.rpc('confirm_job', { p_booking: id });
    if (error) { console.log('clientConfirm error:', error.message); throw new Error(error.message); }

    const s: any = data || {};

    setBookings(prev => prev.map(b => b.id === id
      ? { ...b,
          status: 'completed',
          clientConfirmedAt: new Date().toISOString(),
          total: s.total ?? b.total,
        }
      : b));

    if (bk?.providerId) {
      notify(bk.providerId, 'job_completed', {
        earnings: s.provider_gets ?? bk.finalProviderPayment ?? 0,
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


  /**
   * Trades somebody can actually be sent to right now.
   *
   * "Approved" is not the same as "working". A provider who has switched
   * themselves off is still approved and still holds the trade, and
   * counting them told a client on a roadside that one provider was
   * available when the only match was switched off - the job went into
   * the pool and sat there with nobody able to take it.
   */
  const workingNow = cleaners.filter(c => c.available);

  const availableTrades = Array.from(new Set(
    workingNow.flatMap(c => (c as any).categories || [])
  ));

  const providersFor = (tradeId: string) =>
    workingNow.filter(c => ((c as any).categories || []).includes(tradeId));

  return (
    <AppContext.Provider value={{
      bookings, cleaners, providers: cleaners, availableTrades, providersFor,
      addBooking, updateStatus,
      markArrived, verifyPin, finishJob, clientConfirm, clientDispute,
      handBack, reassignProvider, acceptJob, proposeTime, respondToProposal,
      sendQuote, respondToQuote, hideBooking, reportNoShow,
      loadBookings, getCleanerById,
      userRole, userName, userId, myCategories,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
