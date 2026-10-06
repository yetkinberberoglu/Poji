import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { C, S } from '../constants/theme';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';

export default function ReviewScreen() {
  const params = useLocalSearchParams<{bookingId?: string; cleanerId?: string; cleanerName?: string}>();
  const { loadBookings } = useApp();
  const [rating, setRating]   = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);
  const [error, setError]     = useState('');

  const cleanerName = params.cleanerName || 'your cleaner';

  const submit = async () => {
    setError('');
    if (rating === 0) { setError('Please select a rating first.'); return; }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setError('Not logged in.'); return; }
    const { error: err } = await supabase.from('reviews').insert({
      booking_id: params.bookingId, reviewer_id: user.id,
      cleaner_id: params.cleanerId, rating, comment: comment || null,
    });

    if (err?.code === '23505') {
      // one review per job, enforced in the database
      setError("You've already rated this job.");
      setLoading(false);
      return;
    }
    setLoading(false);
    if (err) { setError(err.message); return; }
    setDone(true);
    await loadBookings();
  };

  if (done) {
    return (
      <View style={s.doneWrap}>
        <Text style={s.doneIcon}>🎉</Text>
        <Text style={s.doneTitle}>Thank you!</Text>
        <Text style={s.doneSub}>Your review helps other clients choose well.</Text>
        <View style={s.doneStars}>
          {[1,2,3,4,5].map(i => <Text key={i} style={s.doneStar}>{i <= rating ? '⭐' : '☆'}</Text>)}
        </View>
        <TouchableOpacity style={s.doneBtn} onPress={() => router.replace('/(tabs)/bookings')}>
          <Text style={s.doneBtnTxt}>Back to Bookings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{paddingBottom:40}}>
      <View style={s.hdr}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Leave a Review</Text>
        <View style={{width:60}} />
      </View>

      <View style={s.body}>
        <Text style={s.question}>How was your experience with{'\n'}{cleanerName}?</Text>
        <View style={s.starsRow}>
          {[1,2,3,4,5].map(i => (
            <TouchableOpacity key={i} onPress={() => { setRating(i); setError(''); }}>
              <Text style={s.star}>{i <= rating ? '⭐' : '☆'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {rating > 0 && (
          <Text style={s.ratingLabel}>{['','Poor','Fair','Good','Very Good','Excellent'][rating]}</Text>
        )}
        {error ? <View style={s.errorBox}><Text style={s.errorTxt}>⚠️  {error}</Text></View> : null}

        <Text style={s.label}>Add a comment (optional)</Text>
        <TextInput style={s.input} placeholder="Tell others about your experience..."
          placeholderTextColor={C.muted} value={comment} onChangeText={setComment}
          multiline numberOfLines={5} textAlignVertical="top" />

        <Text style={s.label}>Quick tags</Text>
        <View style={s.tagsRow}>
          {['Punctual','Thorough','Friendly','Great value','Would rebook'].map(t => (
            <TouchableOpacity key={t} style={[s.tag, comment.includes(t) && s.tagOn]}
              onPress={() => setComment(c => c.includes(t) ? c.replace(t + '. ','') : (c ? c + ' ' : '') + t + '. ')}>
              <Text style={[s.tagTxt, comment.includes(t) && s.tagTxtOn]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={[s.submitBtn, (loading || rating === 0) && s.submitDis]}
          onPress={submit} disabled={loading || rating === 0}>
          {loading ? <ActivityIndicator color={C.white} /> : <Text style={s.submitTxt}>Submit Review</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,backgroundColor:C.bg},
  hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:20,paddingTop:60,paddingBottom:16},
  back:{fontSize:16,color:C.primary,fontWeight:'600',width:60},
  title:{fontSize:17,fontWeight:'700',color:C.dark},
  body:{paddingHorizontal:20,gap:16},
  question:{fontSize:22,fontWeight:'800',color:C.dark,textAlign:'center',marginTop:12,lineHeight:30},
  starsRow:{flexDirection:'row',justifyContent:'center',gap:8,marginTop:8},
  star:{fontSize:44},
  ratingLabel:{fontSize:16,fontWeight:'700',color:C.primary,textAlign:'center'},
  errorBox:{backgroundColor:C.redLt,borderRadius:12,padding:12,borderWidth:1,borderColor:'#FECACA'},
  errorTxt:{fontSize:14,color:C.red,fontWeight:'600'},
  label:{fontSize:12,fontWeight:'700',color:C.muted,textTransform:'uppercase',letterSpacing:0.5,marginTop:8},
  input:{backgroundColor:C.white,borderRadius:14,padding:16,fontSize:15,color:C.text,borderWidth:1.5,borderColor:C.border,minHeight:120},
  tagsRow:{flexDirection:'row',flexWrap:'wrap',gap:8},
  tag:{backgroundColor:C.white,paddingHorizontal:14,paddingVertical:9,borderRadius:20,borderWidth:1.5,borderColor:C.border},
  tagOn:{backgroundColor:C.primaryLt,borderColor:C.primary},
  tagTxt:{fontSize:13,fontWeight:'600',color:C.muted},
  tagTxtOn:{color:C.primary},
  submitBtn:{backgroundColor:C.primary,borderRadius:16,paddingVertical:18,alignItems:'center',marginTop:12,...S.md},
  submitDis:{backgroundColor:C.muted},
  submitTxt:{color:C.white,fontSize:17,fontWeight:'700'},
  doneWrap:{flex:1,backgroundColor:C.bg,alignItems:'center',justifyContent:'center',padding:32,gap:16},
  doneIcon:{fontSize:72},
  doneTitle:{fontSize:28,fontWeight:'800',color:C.dark},
  doneSub:{fontSize:15,color:C.muted,textAlign:'center',lineHeight:22},
  doneStars:{flexDirection:'row',gap:6,marginVertical:8},
  doneStar:{fontSize:28},
  doneBtn:{backgroundColor:C.primary,borderRadius:16,paddingVertical:16,paddingHorizontal:32,marginTop:16,...S.md},
  doneBtnTxt:{color:C.white,fontSize:16,fontWeight:'700'},
});
