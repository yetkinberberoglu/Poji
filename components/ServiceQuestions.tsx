import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { C } from '../constants/theme';
import type { ServiceQuestion } from '../lib/services';

/**
 * The handful of things a provider needs to know before setting off.
 * Each service carries its own — a filter job asks about stages, a tow
 * asks where it's going.
 */
export default function ServiceQuestions({
  questions, answers, onChange,
}: {
  questions: ServiceQuestion[];
  answers: Record<string, string>;
  onChange: (id: string, value: string) => void;
}) {
  if (!questions?.length) return null;

  return (
    <View style={s.wrap}>
      {questions.map(q=>(
        <View key={q.id} style={s.block}>
          <Text style={s.label}>
            {q.label}
            {q.required ? '' : <Text style={s.optional}>  optional</Text>}
          </Text>

          {q.type === 'choice' && q.options ? (
            <View style={s.chips}>
              {q.options.map(o=>{
                const on = answers[q.id] === o;
                return (
                  <TouchableOpacity key={o} style={[s.chip, on&&s.chipOn]}
                    onPress={()=>onChange(q.id, on ? '' : o)}>
                    <Text style={[s.chipTxt, on&&s.chipTxtOn]}>{o}</Text>
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
        </View>
      ))}
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
    borderWidth:1.5,borderColor:C.border},
  chipOn:{backgroundColor:C.primary,borderColor:C.primary},
  chipTxt:{fontSize:13,fontWeight:'600',color:C.muted},
  chipTxtOn:{color:C.white},
  input:{backgroundColor:C.white,borderRadius:14,paddingHorizontal:16,paddingVertical:14,
    fontSize:15,color:C.text,borderWidth:1.5,borderColor:C.border},
});
