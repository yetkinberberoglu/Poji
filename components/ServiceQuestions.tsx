import { View, Text, StyleSheet, TouchableOpacity, TextInput, Linking } from 'react-native';
import { C } from '../constants/theme';
import { optionLabel, optionDelta, type ServiceQuestion } from '../lib/services';

/**
 * The handful of things a provider needs to know before setting off.
 * Each service carries its own — a filter job asks about stages, a tow
 * asks where it's going.
 *
 * A question may also carry a `danger` block. When the client picks that
 * option we stop and point them at the emergency services first, because
 * some answers mean the right next step is not a booking. The rule lives
 * in the service data, not in here — any service can add one.
 */
type Danger = {
  option: string;
  title?: string;
  body?: string;
  call?: string;
};

export default function ServiceQuestions({
  questions, answers, onChange,
}: {
  questions: ServiceQuestion[];
  answers: Record<string, string>;
  onChange: (id: string, value: string) => void;
}) {
  if (!questions?.length) return null;

  const dial = (number: string) => {
    Linking.openURL(`tel:${number}`).catch(()=>{});
  };

  return (
    <View style={s.wrap}>
      {questions.map(q=>{
        const danger = (q as any).danger as Danger | undefined;
        const tripped = !!danger && answers[q.id] === danger.option;

        return (
          <View key={q.id} style={s.block}>
            <Text style={s.label}>
              {q.label}
              {q.required ? '' : <Text style={s.optional}>  optional</Text>}
            </Text>

            {q.type === 'choice' && q.options ? (
              <View style={s.chips}>
                {q.options.map(o=>{
                  const label = optionLabel(o);
                  const delta = optionDelta(o);
                  const on = answers[q.id] === label;
                  const isDanger = !!danger && label === danger.option;
                  return (
                    <TouchableOpacity key={label}
                      style={[s.chip, on&&s.chipOn, on&&isDanger&&s.chipDanger]}
                      onPress={()=>onChange(q.id, on ? '' : label)}>
                      <Text style={[s.chipTxt, on&&s.chipTxtOn]}>{label}</Text>
                      {delta > 0 && (
                        <Text style={[s.chipDelta, on&&s.chipDeltaOn]}>+€{delta}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <TextInput
                style={s.input}
                value={answers[q.id] || ''}
                onChangeText={(t)=>onChange(q.id, t)}
                placeholder={q.placeholder || ''}
                placeholderTextColor={C.muted}
              />
            )}

            {tripped && (
              <View style={s.alert}>
                <Text style={s.alertTitle}>{danger!.title || 'Call the emergency services'}</Text>
                {danger!.body ? <Text style={s.alertBody}>{danger!.body}</Text> : null}
                {danger!.call ? (
                  <TouchableOpacity style={s.alertBtn} onPress={()=>dial(danger!.call!)}>
                    <Text style={s.alertBtnTxt}>Call {danger!.call} now</Text>
                  </TouchableOpacity>
                ) : null}
                <Text style={s.alertFoot}>
                  You can carry on with this booking below — just make the call first.
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{gap:4},
  block:{marginTop:20},
  label:{fontSize:14,fontWeight:'700',color:C.dark,marginBottom:10,lineHeight:20},
  optional:{fontSize:11,color:C.muted,fontWeight:'600'},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
  chip:{paddingHorizontal:14,paddingVertical:10,borderRadius:12,backgroundColor:C.white,
    borderWidth:1.5,borderColor:C.border,alignItems:'center'},
  chipOn:{backgroundColor:C.primary,borderColor:C.primary},
  chipDanger:{backgroundColor:'#B42318',borderColor:'#B42318'},
  chipTxt:{fontSize:13,fontWeight:'600',color:C.muted},
  chipTxtOn:{color:C.white},
  chipDelta:{fontSize:10,color:C.primary,fontWeight:'800',marginTop:2},
  chipDeltaOn:{color:'#C7D2FE'},
  input:{backgroundColor:C.white,borderRadius:14,paddingHorizontal:16,paddingVertical:14,
    fontSize:15,color:C.text,borderWidth:1.5,borderColor:C.border},

  alert:{marginTop:14,backgroundColor:'#FEF3F2',borderWidth:1.5,borderColor:'#FDA29B',
    borderRadius:14,padding:16,gap:10},
  alertTitle:{fontSize:16,fontWeight:'800',color:'#912018'},
  alertBody:{fontSize:13,lineHeight:20,color:'#912018'},
  alertBtn:{backgroundColor:'#B42318',borderRadius:12,paddingVertical:14,alignItems:'center'},
  alertBtnTxt:{color:'#fff',fontSize:16,fontWeight:'800'},
  alertFoot:{fontSize:11,color:'#B42318',lineHeight:16},
});
