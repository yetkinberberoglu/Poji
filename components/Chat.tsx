import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Modal, Linking
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { scanMessage, contactUnlocked, CONTACT_WINDOW_HOURS } from '../lib/moderation';

type Msg = {
  id: string; booking_id: string; sender_id: string; sender_role: string;
  body: string; flagged: boolean; created_at: string;
};

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

const day = (iso: string) => {
  const d = new Date(iso); d.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
};

export default function Chat({
  booking, role, myId, otherName,
}: {
  booking: any;
  role: 'client' | 'cleaner';
  myId: string;
  otherName: string;
}) {
  const [open, setOpen]   = useState(false);
  const [msgs, setMsgs]   = useState<Msg[]>([]);
  const [text, setText]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [loading, setLoad]= useState(true);
  const [warn, setWarn]   = useState<string[]>([]);
  const [calling, setCalling]   = useState(false);
  const [callError, setCallErr] = useState('');
  const scroller = useRef<ScrollView>(null);

  const canSeeContact = contactUnlocked(booking);
  const unread = msgs.filter(m => m.sender_id !== myId && !m.read_at).length;

  const placeCall = async () => {
    setCalling(true); setCallErr('');
    try {
      const { data, error } = await supabase.functions.invoke('bridge-call', {
        body: { bookingId: booking.id },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || 'Could not connect the call');

      // Poji rings this side first, then the other
      setCallErr('');
    } catch (e: any) {
      setCallErr(
        e?.message?.includes('not configured')
          ? 'Calling is not switched on yet — send a message instead.'
          : (e?.message || 'Could not connect the call. Try a message.')
      );
    }
    setCalling(false);
  };

  const load = async () => {
    const { data } = await supabase.from('messages')
      .select('*').eq('booking_id', booking.id).order('created_at');
    setMsgs(data || []);
    setLoad(false);
  };

  useEffect(() => { load(); }, [booking.id]);

  // live updates while the sheet is open
  useEffect(() => {
    if (!open) return;
    load();
    const ch = supabase
      .channel(`msgs-${booking.id}`)
      .on('postgres_changes',
        { event:'INSERT', schema:'public', table:'messages', filter:`booking_id=eq.${booking.id}` },
        payload => setMsgs(prev => [...prev, payload.new as Msg]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [open, booking.id]);

  // mark the other side's messages read
  useEffect(() => {
    if (!open || !msgs.length) return;
    const theirs = msgs.filter(m => m.sender_id !== myId && !m.read_at).map(m => m.id);
    if (!theirs.length) return;
    supabase.from('messages')
      .update({ read_at: new Date().toISOString() }).in('id', theirs)
      .then(() => {});
  }, [open, msgs.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;

    const scan = scanMessage(body);
    setBusy(true);

    const { error } = await supabase.from('messages').insert({
      booking_id: booking.id,
      sender_id: myId,
      sender_role: role,
      body,
      flagged: scan.flagged,
      flag_reasons: scan.flagged ? scan.reasons : null,
    });

    setBusy(false);
    if (error) { console.log('send:', error.message); return; }

    setText('');

    // tell the other side — they are almost certainly not looking at this screen
    const otherId = role === 'client' ? booking.cleanerId : booking.clientId;
    if (otherId) {
      supabase.functions.invoke('send-notification', {
        body: {
          userId: otherId,
          bookingId: booking.id,
          template: 'new_message',
          data: {
            fromName: role === 'client' ? 'Your client' : otherName,
            preview: body,
            role: role === 'client' ? 'cleaner' : 'client',
          },
        },
      }).catch(()=>{});
    }

    if (scan.flagged) setWarn(scan.reasons);
    setTimeout(()=>scroller.current?.scrollToEnd({ animated:true }), 120);
  };

  return (
    <>
      <TouchableOpacity style={s.trigger} onPress={()=>setOpen(true)}>
        <Text style={s.triggerIcon}>💬</Text>
        <View style={{flex:1}}>
          <Text style={s.triggerTitle}>Message {otherName.split(' ')[0]}</Text>
          <Text style={s.triggerSub}>
            {msgs.length === 0 ? 'Ask a question about the job'
              : msgs[msgs.length-1].body.slice(0, 44) + (msgs[msgs.length-1].body.length > 44 ? '…' : '')}
          </Text>
        </View>
        {unread > 0 && (
          <View style={s.badge}><Text style={s.badgeTxt}>{unread}</Text></View>
        )}
        <Text style={s.chev}>›</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={()=>setOpen(false)}>
        <View style={s.sheet}>
          <View style={s.hdr}>
            <TouchableOpacity onPress={()=>setOpen(false)}>
              <Text style={s.close}>← Back</Text>
            </TouchableOpacity>
            <View style={{flex:1,alignItems:'center'}}>
              <Text style={s.hdrName}>{otherName}</Text>
              <Text style={s.hdrSub}>{booking.address}</Text>
            </View>
            <View style={{width:54}} />
          </View>

          {/* Numbers stay private. When the job is close enough to need a
              voice, the call is placed through Poji so neither side sees the
              other's number. */}
          {canSeeContact ? (
            <TouchableOpacity style={s.callRow} onPress={placeCall} disabled={calling}>
              <Text style={s.callIcon}>{calling ? '…' : '📞'}</Text>
              <View style={{flex:1}}>
                <Text style={s.callTxt}>
                  {calling ? 'Connecting you…' : `Call ${otherName.split(' ')[0]}`}
                </Text>
                <Text style={s.callSub}>Through Poji — your number stays private</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={s.lockRow}>
              <Text style={s.lockTxt}>
                💬  Message here. Calling opens {CONTACT_WINDOW_HOURS} hours before the
                job, and goes through Poji so neither of you sees the other's number.
              </Text>
            </View>
          )}

          {callError ? (
            <View style={s.callErr}><Text style={s.callErrTxt}>{callError}</Text></View>
          ) : null}

          <ScrollView ref={scroller} style={s.list}
            contentContainerStyle={{padding:16, gap:4}}
            onContentSizeChange={()=>scroller.current?.scrollToEnd({animated:false})}>

            {loading ? (
              <ActivityIndicator color={C.primary} style={{marginTop:30}} />
            ) : msgs.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyIcon}>💬</Text>
                <Text style={s.emptyTitle}>No messages yet</Text>
                <Text style={s.emptyTxt}>
                  Anything about the job — access, parking, what to bring.
                  Everything here is kept with the booking.
                </Text>
              </View>
            ) : msgs.map((m, i) => {
              const mine = m.sender_id === myId;
              const showDay = i === 0 || day(msgs[i-1].created_at) !== day(m.created_at);
              return (
                <View key={m.id}>
                  {showDay && <Text style={s.dayLine}>{day(m.created_at)}</Text>}
                  <View style={[s.bubbleRow, mine && {justifyContent:'flex-end'}]}>
                    <View style={[s.bubble, mine ? s.mine : s.theirs]}>
                      <Text style={[s.body, mine && {color:C.white}]}>{m.body}</Text>
                      <Text style={[s.time, mine && {color:'#C7D2FE'}]}>
                        {time(m.created_at)}
                        {m.flagged && mine ? '  ⚠️' : ''}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {warn.length > 0 && (
            <View style={s.warnBox}>
              <Text style={s.warnTitle}>⚠️  A quick word</Text>
              <Text style={s.warnTxt}>
                That message mentioned {warn.slice(0,2).join(' and ').toLowerCase()}.
                Arranging work outside Poji costs you the payment protection,
                the dispute cover and your rating — and repeated attempts end
                in a ban. Keep it here and you're covered.
              </Text>
              <TouchableOpacity onPress={()=>setWarn([])}>
                <Text style={s.warnBtn}>Understood</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={s.composer}>
            <TextInput
              style={s.input}
              value={text}
              onChangeText={setText}
              placeholder="Write a message"
              placeholderTextColor={C.muted}
              multiline
            />
            <TouchableOpacity
              style={[s.sendBtn, (!text.trim()||busy) && s.sendDis]}
              disabled={!text.trim()||busy}
              onPress={send}>
              {busy ? <ActivityIndicator color={C.white} size="small" />
                : <Text style={s.sendTxt}>Send</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  trigger:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:C.white,
    borderRadius:12,padding:13,borderWidth:1,borderColor:C.border},
  triggerIcon:{fontSize:20},
  triggerTitle:{fontSize:14,fontWeight:'700',color:C.dark},
  triggerSub:{fontSize:12,color:C.muted,marginTop:2},
  badge:{backgroundColor:C.red,minWidth:20,height:20,borderRadius:10,
    alignItems:'center',justifyContent:'center',paddingHorizontal:6},
  badgeTxt:{color:C.white,fontSize:11,fontWeight:'800'},
  chev:{fontSize:20,color:C.border},

  sheet:{flex:1,backgroundColor:C.bg},
  hdr:{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:56,
    paddingBottom:12,backgroundColor:C.white,borderBottomWidth:1,borderBottomColor:C.border},
  close:{fontSize:16,color:C.primary,fontWeight:'600',width:54},
  hdrName:{fontSize:16,fontWeight:'800',color:C.dark},
  hdrSub:{fontSize:11,color:C.muted,marginTop:2},

  phoneRow:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:C.greenLt,
    paddingHorizontal:16,paddingVertical:11,borderBottomWidth:1,borderBottomColor:'#A7F3D0'},
  phoneIcon:{fontSize:16},
  phoneTxt:{flex:1,fontSize:14,fontWeight:'700',color:C.dark},
  phoneCall:{fontSize:13,color:C.green,fontWeight:'800'},
  callRow:{flexDirection:'row',alignItems:'center',gap:11,backgroundColor:C.greenLt,
    paddingHorizontal:16,paddingVertical:11,borderBottomWidth:1,borderBottomColor:'#A7F3D0'},
  callIcon:{fontSize:17},
  callTxt:{fontSize:14,fontWeight:'800',color:C.dark},
  callSub:{fontSize:11,color:C.muted,marginTop:1},
  callErr:{backgroundColor:C.amberLt,paddingHorizontal:16,paddingVertical:9,
    borderBottomWidth:1,borderBottomColor:'#FDE68A'},
  callErrTxt:{fontSize:12,color:C.amber,fontWeight:'600',lineHeight:17},
  lockRow:{backgroundColor:C.bgAlt,paddingHorizontal:16,paddingVertical:11,
    borderBottomWidth:1,borderBottomColor:C.border},
  lockTxt:{fontSize:12,color:C.muted,lineHeight:17},

  list:{flex:1},
  dayLine:{fontSize:11,color:C.muted,textAlign:'center',marginVertical:12,fontWeight:'600'},
  bubbleRow:{flexDirection:'row',marginBottom:6},
  bubble:{maxWidth:'82%',borderRadius:16,paddingHorizontal:14,paddingVertical:10},
  mine:{backgroundColor:C.primary,borderBottomRightRadius:4},
  theirs:{backgroundColor:C.white,borderBottomLeftRadius:4,borderWidth:1,borderColor:C.border},
  body:{fontSize:14,color:C.text,lineHeight:20},
  time:{fontSize:10,color:C.muted,marginTop:4,alignSelf:'flex-end'},

  emptyBox:{alignItems:'center',paddingTop:50,gap:8},
  emptyIcon:{fontSize:44},
  emptyTitle:{fontSize:16,fontWeight:'700',color:C.dark},
  emptyTxt:{fontSize:13,color:C.muted,textAlign:'center',lineHeight:19,paddingHorizontal:30},

  warnBox:{backgroundColor:C.amberLt,padding:14,gap:8,borderTopWidth:1,borderTopColor:'#FDE68A'},
  warnTitle:{fontSize:13,fontWeight:'800',color:C.amber},
  warnTxt:{fontSize:12,color:C.text,lineHeight:18},
  warnBtn:{fontSize:13,color:C.amber,fontWeight:'800',alignSelf:'flex-end'},

  composer:{flexDirection:'row',alignItems:'flex-end',gap:10,padding:12,
    backgroundColor:C.white,borderTopWidth:1,borderTopColor:C.border},
  input:{flex:1,backgroundColor:C.bg,borderRadius:20,paddingHorizontal:16,paddingVertical:11,
    fontSize:14,color:C.text,maxHeight:110,borderWidth:1,borderColor:C.border},
  sendBtn:{backgroundColor:C.primary,borderRadius:20,paddingHorizontal:18,paddingVertical:11},
  sendDis:{opacity:0.4},
  sendTxt:{color:C.white,fontSize:14,fontWeight:'700'},
});
