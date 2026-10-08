import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { C, S } from '../constants/theme';

const UPDATED = '30 September 2026';
const COMPANY = 'Pojico Ltd';
const EMAIL   = 'supportpoji@gmail.com';
const SITE    = 'po-ji.com';

type Section = { h: string; p?: string[]; bullets?: string[]; table?: [string,string][] };

const PRIVACY: Section[] = [
  {
    h: 'Who we are',
    p: [
      `${COMPANY} ("Poji", "we") runs the Poji platform at ${SITE}. We connect people in Malta who need home and vehicle services with providers who supply them.`,
      `We are the data controller for the personal data described here. For anything in this notice, write to ${EMAIL}.`,
    ],
  },
  {
    h: 'What we collect from clients',
    table: [
      ['Name and email',        'To create your account and send booking updates'],
      ['Mobile number',         'So your provider can reach you on the day, and for WhatsApp updates'],
      ['Default address',       'To pre-fill your bookings and route the provider to you'],
      ['Job address',           'Given per booking, shared with the provider who accepts'],
      ['GPS location',          'Roadside jobs only, and only when you tap "Use my location"'],
      ['Vehicle details',       'Roadside jobs only — so the provider brings the right parts'],
      ['Booking history',       'Prices, times, ratings, disputes'],
      ['Reviews you write',     'Shown publicly with your first name'],
    ],
  },
  {
    h: 'What we collect from providers',
    p: ['Providers go through identity checks because clients let them into their homes.'],
    table: [
      ['Name, date of birth, nationality',   'Identity verification'],
      ['ID document or passport, both sides','Verifying you are who you say you are'],
      ['Selfie holding your ID',             'Confirming the document belongs to you'],
      ['Right-to-work document',             'Checking you may legally work in Malta'],
      ['Home address and phone',             'Verification and contact'],
      ['Emergency contact',                  'Only used if something happens on a job'],
      ['IBAN, bank name, account holder',    'Paying you'],
      ['VAT and company registration',       'Companies only, for invoicing'],
      ['Trades, rates, service areas',       'Shown to clients so they can choose you'],
      ['Job history and earnings',           'Your dashboard, our accounting, tax reporting'],
    ],
  },
  {
    h: 'Why we are allowed to hold it',
    bullets: [
      'Contract — we cannot run a booking without your name, contact details and address.',
      'Legal obligation — VAT records, invoices and tax reporting under Maltese law.',
      'Legitimate interest — verifying provider identity keeps clients safe; fraud checks protect everyone.',
      'Consent — WhatsApp updates and GPS location. You can withdraw either at any time.',
    ],
  },
  {
    h: 'Who sees what',
    p: [
      'A provider sees your first name, the job address, your phone number and any notes you added — only after they accept the job.',
      'A client sees the provider\'s name, photo initials, rating, trades, rates and service areas. Clients never see ID documents, IBANs or home addresses.',
      'Identity documents are visible only to our verification team. They sit in encrypted storage behind access controls, and are opened during review or a dispute.',
    ],
  },
  {
    h: 'Processors we use',
    table: [
      ['Supabase',  'Database, authentication and document storage — hosted in the EU'],
      ['Twilio',    'WhatsApp notifications'],
      ['Vercel',    'Hosting the app'],
      ['Stripe',    'Card payments. Stripe holds your card details, not us'],
      ['Google Maps','Turning an address into directions for your provider'],
      ['OpenStreetMap','Turning GPS coordinates into a readable street name'],
    ],
  },
  {
    h: 'How long we keep it',
    table: [
      ['Account data',          'While your account is open, then 30 days'],
      ['Booking and invoices',  '10 years — Maltese VAT and company law'],
      ['ID documents',          '5 years after a provider leaves the platform'],
      ['GPS location',          '90 days, then deleted'],
      ['WhatsApp message log',  '12 months'],
      ['Reviews',               'Kept while the platform runs, under your first name only'],
    ],
  },
  {
    h: 'Your rights',
    p: ['Under the GDPR and the Maltese Data Protection Act you can:'],
    bullets: [
      'Ask for a copy of everything we hold on you',
      'Correct anything wrong',
      'Ask us to delete your account and data, subject to the retention periods above',
      'Object to processing based on legitimate interest',
      'Withdraw consent for WhatsApp or location at any time',
      'Take your data elsewhere in a machine-readable format',
      'Complain to the Information and Data Protection Commissioner in Malta',
    ],
    p2: true,
  },
  {
    h: 'Location data',
    p: [
      'We only read your GPS when you tap "Use my location" on a roadside request. We never track you in the background, and the app does not ask for location at any other point.',
      'The coordinates go to the provider who accepts the job so they can drive to you. They are deleted after 90 days.',
    ],
  },
  {
    h: 'Children',
    p: ['Poji is not for anyone under 18. We do not knowingly collect data from children.'],
  },
  {
    h: 'Changes',
    p: [`We will post any change here and, if it matters, message you. Last updated ${UPDATED}.`],
  },
];

const TERMS: Section[] = [
  {
    h: 'What Poji is',
    p: [
      `${COMPANY} runs a marketplace. We introduce clients to independent providers. We do not employ providers and we do not perform the work ourselves.`,
      'The contract for the work itself is between you and the provider. Poji handles the booking, the payment and the record of what was agreed.',
    ],
  },
  {
    h: 'Accounts',
    bullets: [
      'You must be 18 or over.',
      'Give us true information. False identity documents mean a permanent ban.',
      'One account per person. Do not let anyone else use yours.',
      'Keep your password to yourself.',
    ],
  },
  {
    h: 'How pricing works',
    p: [
      'Hourly jobs — the provider sets their rate. We estimate how long the job should take, but you pay for the time actually worked, measured from the moment your PIN starts the job to the moment the provider marks it finished, rounded up to the nearest 15 minutes.',
      'Fixed-price jobs — roadside and similar callouts carry one agreed price. If the job needs parts beyond the standard fix, the provider must quote you separately before continuing.',
      'All prices include 18% Maltese VAT. Poji takes a 20% commission from the provider\'s side; you are not charged extra for it.',
    ],
  },
  {
    h: 'The PIN',
    p: [
      'A job starts when you give your provider the four-digit PIN shown in your app. Do not share it before they arrive — the PIN is what proves they were on site and starts the clock.',
    ],
  },
  {
    h: 'Approving the work',
    p: [
      'When the provider finishes, you see the completed task checklist and the final price. You have 6 hours to approve or raise a problem. If you do neither, the job is approved automatically and payment is released.',
      'If you raise a problem, we look at the checklist, the timings and both accounts before deciding. We may refund you in full or in part, or release payment to the provider.',
    ],
  },
  {
    h: 'Cancelling',
    bullets: [
      'Before a provider accepts — free.',
      'After acceptance, more than 12 hours before the start — free.',
      'Less than 12 hours before — the provider may charge up to one hour at their rate.',
      'Nobody home when the provider arrives — the callout is chargeable.',
      'A provider who cancels repeatedly at short notice may be removed.',
    ],
  },
  {
    h: 'Provider obligations',
    bullets: [
      'Turn up when you said you would, or tell the client as early as you can.',
      'Do the work on the checklist. Tick items honestly.',
      'Hold your own public liability insurance. Poji does not insure your work.',
      'Handle your own tax and social security. You are self-employed, not our employee.',
      'Do not take clients off the platform. Doing so is grounds for removal.',
    ],
  },
  {
    h: 'Keeping work on Poji',
    p: [
      'Poji exists because both sides are protected: payment is held until the work is approved, disputes are reviewed with evidence, and every job is on record. That only works if the job stays on the platform.',
      'Taking a client off Poji — arranging the same work privately, asking to cancel a booking and pay in cash, or soliciting direct contact for future jobs — breaches these terms.',
    ],
    table: [
      ['First breach',  'Written warning on your account'],
      ['Second breach', '€50 penalty, taken from your next payout'],
      ['Third breach',  '30-day suspension and a €100 penalty'],
      ['Fourth breach', 'Permanent ban. Outstanding balance held pending review'],
    ],
    p2b: true,
  },
  {
    h: 'What Poji is not responsible for',
    p: [
      'We check identity and documents, but we do not supervise the work. The provider is responsible for what they do in your home or to your vehicle.',
      'Where the law allows, our liability to you is limited to the value of the booking in question.',
      'Nothing here removes rights you have as a consumer under Maltese law.',
    ],
  },
  {
    h: 'Behaviour',
    p: [
      'Abuse, harassment, discrimination or threats end an account immediately, on either side. Serious cases go to the police.',
    ],
  },
  {
    h: 'Law',
    p: [
      'These terms are governed by the law of Malta, and the Maltese courts have jurisdiction.',
      `Last updated ${UPDATED}.`,
    ],
  },
];

export default function Legal() {
  const { doc } = useLocalSearchParams<{doc?: string}>();
  const [tab, setTab] = useState(doc === 'terms' ? 1 : 0);
  const sections = tab === 0 ? PRIVACY : TERMS;

  return (
    <View style={s.wrap}>
      <View style={s.hdr}>
        <TouchableOpacity onPress={()=>router.back()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Legal</Text>
        <View style={{width:54}}/>
      </View>

      <View style={s.tabs}>
        {['Privacy','Terms'].map((t,i)=>(
          <TouchableOpacity key={t} style={[s.tab, tab===i&&s.tabOn]} onPress={()=>setTab(i)}>
            <Text style={[s.tabTxt, tab===i&&s.tabTxtOn]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.docTitle}>
          {tab === 0 ? 'Privacy Notice' : 'Terms of Service'}
        </Text>
        <Text style={s.updated}>Last updated {UPDATED} · {COMPANY}, Malta</Text>

        {sections.map((sec, i)=>(
          <View key={i} style={s.section}>
            <Text style={s.h}>{sec.h}</Text>

            {sec.p?.map((para, j)=>(
              <Text key={j} style={s.p}>{para}</Text>
            ))}

            {sec.bullets?.map((b, j)=>(
              <View key={j} style={s.bulletRow}>
                <Text style={s.bulletDot}>•</Text>
                <Text style={s.bulletTxt}>{b}</Text>
              </View>
            ))}

            {sec.table && (
              <View style={s.table}>
                {sec.table.map(([k,v], j)=>(
                  <View key={j} style={[s.tRow, j===0&&{borderTopWidth:0}]}>
                    <Text style={s.tKey}>{k}</Text>
                    <Text style={s.tVal}>{v}</Text>
                  </View>
                ))}
              </View>
            )}

            {(sec as any).p2 && (
              <Text style={s.p}>
                To exercise any of these, email {EMAIL}. We answer within 30 days.
              </Text>
            )}

            {(sec as any).p2b && (
              <Text style={s.p}>
                A client who takes a provider off the platform has their account closed.
                We read flagged messages before acting, and you can reply before any
                penalty stands.
              </Text>
            )}
          </View>
        ))}

        <View style={s.contactBox}>
          <Text style={s.contactTitle}>Questions?</Text>
          <Text style={s.contactTxt}>{EMAIL}</Text>
          <Text style={s.contactTxt}>{COMPANY} · Malta</Text>
        </View>

        <View style={{height:40}}/>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:60,paddingBottom:12},
  back:{fontSize:16,color:C.primary,fontWeight:'600',width:54},
  title:{fontSize:17,fontWeight:'700',color:C.dark},
  tabs:{flexDirection:'row',marginHorizontal:20,backgroundColor:C.bgAlt,borderRadius:14,padding:4,marginBottom:16,borderWidth:1,borderColor:C.border},
  tab:{flex:1,paddingVertical:11,alignItems:'center',borderRadius:11},
  tabOn:{backgroundColor:C.white,...S.sm},
  tabTxt:{fontSize:14,fontWeight:'600',color:C.muted},
  tabTxtOn:{color:C.primary,fontWeight:'700'},
  body:{flex:1,paddingHorizontal:20},
  docTitle:{fontSize:26,fontWeight:'800',color:C.dark},
  updated:{fontSize:12,color:C.muted,marginTop:4,marginBottom:20},
  section:{marginBottom:24},
  h:{fontSize:16,fontWeight:'800',color:C.dark,marginBottom:8},
  p:{fontSize:14,color:C.text,lineHeight:22,marginBottom:10},
  bulletRow:{flexDirection:'row',gap:10,marginBottom:7},
  bulletDot:{fontSize:14,color:C.primary,fontWeight:'800',lineHeight:21},
  bulletTxt:{fontSize:14,color:C.text,flex:1,lineHeight:21},
  table:{backgroundColor:C.white,borderRadius:14,borderWidth:1,borderColor:C.border,marginTop:4,overflow:'hidden'},
  tRow:{flexDirection:'row',gap:12,padding:12,borderTopWidth:1,borderTopColor:C.bg},
  tKey:{fontSize:13,fontWeight:'700',color:C.dark,flex:1},
  tVal:{fontSize:13,color:C.muted,flex:1.4,lineHeight:19},
  contactBox:{backgroundColor:C.primaryLt,borderRadius:16,padding:18,gap:4,borderWidth:1,borderColor:C.border},
  contactTitle:{fontSize:15,fontWeight:'800',color:C.primary,marginBottom:4},
  contactTxt:{fontSize:13,color:C.text},
});

