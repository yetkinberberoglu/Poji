import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Platform
} from 'react-native';
import { useState } from 'react';
import { C, S } from '../constants/theme';

const TIMES = ['07:00','08:00','09:00','10:00','11:00','12:00',
               '13:00','14:00','15:00','16:00','17:00','18:00'];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const buildDays = (count = 14) => {
  const out = [];
  const today = new Date(); today.setHours(0,0,0,0);
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({
      value: iso(d),
      dayName: d.toLocaleDateString('en-GB', { weekday:'short' }),
      dayNum: d.getDate(),
      month: d.toLocaleDateString('en-GB', { month:'short' }),
      isToday: i === 0,
      isTomorrow: i === 1,
    });
  }
  return out;
};

const pretty = (d?: string) => {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
};

/**
 * Provider offers a different slot. The client's original request stays
 * visible so they can see exactly what is being changed.
 */
export default function ProposeTime({
  currentDate, currentTime, onSubmit, onCancel, busy,
}: {
  currentDate: string;
  currentTime: string;
  onSubmit: (date: string, time: string, note: string) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [days] = useState(buildDays);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (!date) { setError('Pick a day'); return; }
    if (!time) { setError('Pick a time'); return; }
    if (date === currentDate && time === currentTime) {
      setError("That's the time they already asked for"); return;
    }
    onSubmit(date, time, note.trim());
  };

  return (
    <View style={s.box}>
      <Text style={s.title}>📅  Offer another time</Text>

      <View style={s.theirs}>
        <Text style={s.theirsLbl}>They asked for</Text>
        <Text style={s.theirsVal}>{pretty(currentDate)} at {currentTime}</Text>
      </View>

      <Text style={s.lbl}>When can you come?</Text>
      <View style={s.dayWrap}>
        {days.map(d=>(
          <TouchableOpacity key={d.value}
            style={[s.day, date===d.value&&s.dayOn]}
            onPress={()=>{ setDate(d.value); setError(''); }}>
            <Text style={[s.dayName, date===d.value&&s.dayOnTxt]}>
              {d.isToday ? 'Today' : d.isTomorrow ? 'Tmrw' : d.dayName}
            </Text>
            <Text style={[s.dayNum, date===d.value&&s.dayOnTxt]}>{d.dayNum}</Text>
            <Text style={[s.dayMonth, date===d.value&&s.dayOnTxt]}>{d.month}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!!date && (
        <>
          <Text style={s.lbl}>What time?</Text>
          <View style={s.timeWrap}>
            {TIMES.map(t=>(
              <TouchableOpacity key={t} style={[s.time, time===t&&s.timeOn]}
                onPress={()=>{ setTime(t); setError(''); }}>
                <Text style={[s.timeTxt, time===t&&s.timeTxtOn]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <Text style={s.lbl}>Tell them why (optional)</Text>
      <TextInput style={s.input} value={note} onChangeText={setNote}
        placeholder="I'm booked solid today but I'm free first thing tomorrow"
        placeholderTextColor={C.muted} multiline textAlignVertical="top" />

      <Text style={s.warn}>
        They can accept your time or put the job back out to other providers.
      </Text>

      {error ? <Text style={s.err}>{error}</Text> : null}

      <View style={s.btnRow}>
        <TouchableOpacity style={s.cancel} onPress={onCancel} disabled={busy}>
          <Text style={s.cancelTxt}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.send, busy&&s.dis]} disabled={busy} onPress={submit}>
          {busy ? <ActivityIndicator color={C.white} size="small" />
            : <Text style={s.sendTxt}>Send suggestion</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  box:{backgroundColor:C.tealLt,borderRadius:14,padding:14,gap:4,borderWidth:1,borderColor:'#BAE6FD'},
  title:{fontSize:14,fontWeight:'800',color:C.teal},
  theirs:{backgroundColor:C.white,borderRadius:10,padding:11,marginTop:8,
    borderWidth:1,borderColor:C.border},
  theirsLbl:{fontSize:11,color:C.muted,fontWeight:'600'},
  theirsVal:{fontSize:14,fontWeight:'700',color:C.dark,marginTop:2},
  lbl:{fontSize:11,fontWeight:'700',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.4,marginTop:14,marginBottom:8},
  dayWrap:{flexDirection:'row',flexWrap:'wrap',gap:6},
  day:{width:56,paddingVertical:9,borderRadius:11,backgroundColor:C.white,
    borderWidth:1.5,borderColor:C.border,alignItems:'center',gap:1},
  dayOn:{backgroundColor:C.teal,borderColor:C.teal},
  dayName:{fontSize:10,fontWeight:'700',color:C.muted},
  dayNum:{fontSize:17,fontWeight:'800',color:C.dark},
  dayMonth:{fontSize:9,color:C.muted,fontWeight:'600'},
  dayOnTxt:{color:C.white},
  timeWrap:{flexDirection:'row',flexWrap:'wrap',gap:6},
  time:{paddingHorizontal:13,paddingVertical:9,borderRadius:11,backgroundColor:C.white,
    borderWidth:1.5,borderColor:C.border},
  timeOn:{backgroundColor:C.teal,borderColor:C.teal},
  timeTxt:{fontSize:12,fontWeight:'600',color:C.muted},
  timeTxtOn:{color:C.white},
  input:{backgroundColor:C.white,borderRadius:11,padding:12,fontSize:13,color:C.text,
    borderWidth:1.5,borderColor:C.border,minHeight:64},
  warn:{fontSize:11,color:C.text,lineHeight:16,marginTop:10},
  err:{fontSize:12,color:C.red,fontWeight:'700',marginTop:8},
  btnRow:{flexDirection:'row',gap:10,marginTop:12},
  cancel:{flex:1,borderWidth:1.5,borderColor:C.border,borderRadius:12,
    paddingVertical:12,alignItems:'center',backgroundColor:C.white},
  cancelTxt:{fontSize:13,fontWeight:'600',color:C.muted},
  send:{flex:1.6,backgroundColor:C.teal,borderRadius:12,paddingVertical:12,alignItems:'center'},
  sendTxt:{fontSize:13,fontWeight:'700',color:C.white},
  dis:{opacity:0.5},
});
