import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator
} from 'react-native';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import { supabase } from '../lib/supabase';

/**
 * One question about Poji itself, asked after someone has used it enough
 * to have a view. Asked once, then not again for three months.
 *
 * Deliberately separate from rating a provider — mixing the two gets you
 * a score about the cleaner when you wanted a score about the product.
 */
export default function PlatformFeedback({
  role, jobsDone,
}: {
  role: 'client' | 'cleaner';
  jobsDone: number;
}) {
  const [show, setShow]     = useState(false);
  const [score, setScore]   = useState<number|null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy]     = useState(false);
  const [done, setDone]     = useState(false);

  // Two finished jobs is enough to have an opinion; one isn't.
  const THRESHOLD = 2;

  useEffect(() => {
    if (jobsDone < THRESHOLD) return;
    (async () => {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles')
        .select('feedback_asked_at, feedback_dismissed_until')
        .eq('id', user.id).maybeSingle();

      if (data?.feedback_asked_at) return;
      if (data?.feedback_dismissed_until &&
          new Date(data.feedback_dismissed_until) > new Date()) return;

      setShow(true);
    })();
  }, [jobsDone]);

  const later = async () => {
    setShow(false);
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) return;
    const until = new Date(Date.now() + 30 * 864e5).toISOString().slice(0,10);
    await supabase.from('profiles')
      .update({ feedback_dismissed_until: until }).eq('id', user.id);
  };

  const send = async () => {
    if (score === null) return;
    setBusy(true);
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }

    await supabase.from('platform_feedback').insert({
      user_id: user.id, role, score, comment: comment.trim() || null, jobs_done: jobsDone,
    });

    await supabase.from('profiles')
      .update({ feedback_asked_at: new Date().toISOString() }).eq('id', user.id);

    setBusy(false);
    setDone(true);
    setTimeout(()=>setShow(false), 2600);
  };

  if (!show) return null;

  if (done) {
    return (
      <View style={s.thanks}>
        <Text style={s.thanksIcon}>{score !== null && score >= 9 ? '🙏' : '✓'}</Text>
        <Text style={s.thanksTxt}>
          {score !== null && score >= 9
            ? 'Thank you. If you know someone who could use Poji, telling them is the best thing you can do for us.'
            : 'Thank you — this is how it gets better.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={s.box}>
      <Text style={s.title}>
        {role === 'cleaner'
          ? 'How are we doing as a platform?'
          : 'How likely are you to recommend Poji?'}
      </Text>
      <Text style={s.sub}>
        {role === 'cleaner'
          ? 'Not the clients — us. The app, the fees, the way jobs reach you.'
          : 'This is about Poji itself, not the people who did the work.'}
      </Text>

      <View style={s.scale}>
        {Array.from({length:11}, (_,i)=>i).map(n=>(
          <TouchableOpacity key={n}
            style={[
              s.num,
              score===n && s.numOn,
              score===n && n <= 6 && s.numLow,
              score===n && n >= 9 && s.numHigh,
            ]}
            onPress={()=>setScore(n)}>
            <Text style={[s.numTxt, score===n && s.numTxtOn]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={s.ends}>
        <Text style={s.endTxt}>Not at all</Text>
        <Text style={s.endTxt}>Definitely</Text>
      </View>

      {score !== null && (
        <>
          <TextInput
            style={s.input}
            value={comment}
            onChangeText={setComment}
            placeholder={
              score <= 6 ? "What went wrong? We'd rather know."
                : score <= 8 ? 'What would make it a nine or a ten?'
                : 'What works well? Anything missing?'
            }
            placeholderTextColor={C.muted}
            multiline
            textAlignVertical="top"
          />
          <TouchableOpacity style={[s.send, busy&&s.dis]} disabled={busy} onPress={send}>
            {busy ? <ActivityIndicator color={C.white} size="small" />
              : <Text style={s.sendTxt}>Send</Text>}
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity onPress={later}>
        <Text style={s.later}>Not now</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  box:{marginHorizontal:20,marginBottom:16,backgroundColor:C.white,borderRadius:16,
    padding:16,gap:8,borderWidth:1.5,borderColor:C.primary,...S.sm},
  title:{fontSize:15,fontWeight:'800',color:C.dark},
  sub:{fontSize:12,color:C.muted,lineHeight:17},
  scale:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:6},
  num:{flex:1,minWidth:26,aspectRatio:1,borderRadius:8,backgroundColor:C.bg,
    alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:C.border},
  numOn:{backgroundColor:C.primary,borderColor:C.primary},
  numLow:{backgroundColor:C.amber,borderColor:C.amber},
  numHigh:{backgroundColor:C.green,borderColor:C.green},
  numTxt:{fontSize:12,fontWeight:'700',color:C.muted},
  numTxtOn:{color:C.white},
  ends:{flexDirection:'row',justifyContent:'space-between',marginTop:2},
  endTxt:{fontSize:10,color:C.muted},
  input:{backgroundColor:C.bg,borderRadius:11,padding:12,fontSize:14,color:C.text,
    borderWidth:1.5,borderColor:C.border,minHeight:76,marginTop:10},
  send:{backgroundColor:C.primary,borderRadius:12,paddingVertical:13,alignItems:'center',marginTop:9},
  sendTxt:{color:C.white,fontSize:14,fontWeight:'700'},
  dis:{opacity:0.6},
  later:{fontSize:12,color:C.muted,fontWeight:'600',textAlign:'center',paddingTop:6},
  thanks:{marginHorizontal:20,marginBottom:16,backgroundColor:C.greenLt,borderRadius:16,
    padding:16,alignItems:'center',gap:8,borderWidth:1,borderColor:'#A7F3D0'},
  thanksIcon:{fontSize:28},
  thanksTxt:{fontSize:13,color:C.text,textAlign:'center',lineHeight:19},
});
