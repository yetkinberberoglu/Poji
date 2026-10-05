import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useState } from 'react';
import { C } from '../constants/theme';
import { optionLabel, optionDelta, type ServiceQuestion } from '../lib/services';

/**
 * A provider's own questions. Whatever stages they fit, whatever brands they
 * carry, priced however they price them — the platform doesn't get a say.
 */
export default function QuestionEditor({
  value, onChange,
}: {
  value: ServiceQuestion[];
  onChange: (q: ServiceQuestion[]) => void;
}) {
  const [newOpt, setNewOpt] = useState<Record<string, string>>({});

  const update = (i: number, patch: Partial<ServiceQuestion>) =>
    onChange(value.map((q, j) => j === i ? { ...q, ...patch } : q));

  const addQuestion = () =>
    onChange([...value, {
      id: `q${Date.now().toString(36)}`,
      label: '',
      type: 'choice',
      options: [],
      required: true,
      affects: 'parts',
    }]);

  const removeQuestion = (i: number) =>
    onChange(value.filter((_, j) => j !== i));

  const addOption = (i: number) => {
    const label = (newOpt[String(i)] || '').trim();
    if (!label) return;
    const q = value[i];
    const opts = [...(q.options || []), { label, delta: 0 }];
    update(i, { options: opts });
    setNewOpt(p => ({ ...p, [String(i)]: '' }));
  };

  const setOption = (i: number, oi: number, patch: { label?: string; delta?: number }) => {
    const q = value[i];
    const opts = (q.options || []).map((o, k) => {
      if (k !== oi) return o;
      return {
        label: patch.label !== undefined ? patch.label : optionLabel(o),
        delta: patch.delta !== undefined ? patch.delta : optionDelta(o),
      };
    });
    update(i, { options: opts });
  };

  const removeOption = (i: number, oi: number) =>
    update(i, { options: (value[i].options || []).filter((_, k) => k !== oi) });

  return (
    <View style={s.wrap}>
      <Text style={s.intro}>
        What you ask a client before you turn up. Add your own stages, brands or
        sizes and price each one the way you work.
      </Text>

      {value.map((q, i) => (
        <View key={q.id} style={s.card}>
          <View style={s.cardHead}>
            <TextInput
              style={s.qLabel}
              value={q.label}
              onChangeText={(t)=>update(i, { label: t })}
              placeholder="e.g. How many stages does your system have?"
              placeholderTextColor={C.muted}
              multiline
            />
            <TouchableOpacity onPress={()=>removeQuestion(i)}>
              <Text style={s.remove}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={s.typeRow}>
            {[
              { k:'choice', l:'Pick from a list' },
              { k:'text',   l:'They type an answer' },
            ].map(o=>(
              <TouchableOpacity key={o.k}
                style={[s.typeChip, q.type===o.k&&s.typeChipOn]}
                onPress={()=>update(i, { type: o.k as any })}>
                <Text style={[s.typeTxt, q.type===o.k&&s.typeTxtOn]}>{o.l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {q.type === 'choice' ? (
            <>
              <View style={s.affectsRow}>
                <Text style={s.affectsLbl}>Different answers cost</Text>
                {[
                  { k:undefined,  l:'The same' },
                  { k:'parts',    l:'More in parts' },
                  { k:'labour',   l:'More in work' },
                ].map(o=>(
                  <TouchableOpacity key={String(o.k)}
                    style={[s.affChip, q.affects===o.k&&s.affChipOn]}
                    onPress={()=>update(i, { affects: o.k as any })}>
                    <Text style={[s.affTxt, q.affects===o.k&&s.affTxtOn]}>{o.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {(q.options || []).map((o, oi)=>(
                <View key={oi} style={s.optRow}>
                  <TextInput
                    style={s.optLabel}
                    value={optionLabel(o)}
                    onChangeText={(t)=>setOption(i, oi, { label: t })}
                    placeholder="Option"
                    placeholderTextColor={C.muted}
                  />
                  {q.affects && (
                    <View style={s.priceWrap}>
                      <Text style={s.currency}>+€</Text>
                      <TextInput
                        style={s.priceInput}
                        value={String(optionDelta(o) || '')}
                        onChangeText={(t)=>setOption(i, oi, { delta: Number(t.replace(/[^0-9.]/g,'')) || 0 })}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={C.muted}
                      />
                    </View>
                  )}
                  <TouchableOpacity onPress={()=>removeOption(i, oi)}>
                    <Text style={s.removeSmall}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <View style={s.addRow}>
                <TextInput
                  style={s.addInput}
                  value={newOpt[String(i)] || ''}
                  onChangeText={(t)=>setNewOpt(p=>({ ...p, [String(i)]: t }))}
                  onSubmitEditing={()=>addOption(i)}
                  placeholder="Add an option — 6 stages, Aquafilter…"
                  placeholderTextColor={C.muted}
                />
                <TouchableOpacity style={s.addBtn} onPress={()=>addOption(i)}>
                  <Text style={s.addBtnTxt}>Add</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <TextInput
              style={s.placeholderInput}
              value={q.placeholder || ''}
              onChangeText={(t)=>update(i, { placeholder: t })}
              placeholder="Hint text, e.g. Brand and model if you know it"
              placeholderTextColor={C.muted}
            />
          )}

          <TouchableOpacity style={s.reqRow} onPress={()=>update(i, { required: !q.required })}>
            <View style={[s.check, q.required&&s.checkOn]}>
              {q.required && <Text style={s.checkTxt}>✓</Text>}
            </View>
            <Text style={s.reqTxt}>They must answer this before booking</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={s.addQ} onPress={addQuestion}>
        <Text style={s.addQTxt}>＋  Add a question</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{gap:10},
  intro:{fontSize:11,color:C.muted,lineHeight:16},
  card:{backgroundColor:C.white,borderRadius:12,padding:12,gap:10,
    borderWidth:1,borderColor:C.border},
  cardHead:{flexDirection:'row',alignItems:'flex-start',gap:10},
  qLabel:{flex:1,fontSize:14,fontWeight:'700',color:C.dark,paddingVertical:4,lineHeight:19},
  remove:{fontSize:15,color:C.red,fontWeight:'800',padding:4},
  removeSmall:{fontSize:13,color:C.red,fontWeight:'800',paddingHorizontal:6},

  typeRow:{flexDirection:'row',gap:7},
  typeChip:{paddingHorizontal:11,paddingVertical:7,borderRadius:14,backgroundColor:C.bg,
    borderWidth:1.5,borderColor:C.border},
  typeChipOn:{backgroundColor:C.primary,borderColor:C.primary},
  typeTxt:{fontSize:11,fontWeight:'600',color:C.muted},
  typeTxtOn:{color:C.white},

  affectsRow:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:6},
  affectsLbl:{fontSize:11,color:C.muted,fontWeight:'600',marginRight:2},
  affChip:{paddingHorizontal:9,paddingVertical:5,borderRadius:12,backgroundColor:C.bg,
    borderWidth:1,borderColor:C.border},
  affChipOn:{backgroundColor:C.primaryLt,borderColor:C.primary},
  affTxt:{fontSize:10,fontWeight:'700',color:C.muted},
  affTxtOn:{color:C.primary},

  optRow:{flexDirection:'row',alignItems:'center',gap:8},
  optLabel:{flex:1,backgroundColor:C.bg,borderRadius:9,paddingHorizontal:11,paddingVertical:9,
    fontSize:13,color:C.text,borderWidth:1,borderColor:C.border},
  priceWrap:{flexDirection:'row',alignItems:'center',backgroundColor:C.bg,borderRadius:9,
    borderWidth:1,borderColor:C.border,paddingLeft:9,width:86},
  currency:{fontSize:12,color:C.muted,fontWeight:'700'},
  priceInput:{flex:1,paddingVertical:9,paddingHorizontal:4,fontSize:13,color:C.text},

  addRow:{flexDirection:'row',gap:8,marginTop:2},
  addInput:{flex:1,backgroundColor:C.bg,borderRadius:9,paddingHorizontal:11,paddingVertical:9,
    fontSize:13,color:C.text,borderWidth:1,borderStyle:'dashed',borderColor:C.border},
  addBtn:{backgroundColor:C.primary,borderRadius:9,paddingHorizontal:15,justifyContent:'center'},
  addBtnTxt:{fontSize:12,fontWeight:'700',color:C.white},

  placeholderInput:{backgroundColor:C.bg,borderRadius:9,paddingHorizontal:11,paddingVertical:9,
    fontSize:13,color:C.text,borderWidth:1,borderColor:C.border},

  reqRow:{flexDirection:'row',alignItems:'center',gap:9,marginTop:2},
  check:{width:19,height:19,borderRadius:6,borderWidth:2,borderColor:C.border,
    alignItems:'center',justifyContent:'center'},
  checkOn:{backgroundColor:C.primary,borderColor:C.primary},
  checkTxt:{color:C.white,fontSize:11,fontWeight:'800'},
  reqTxt:{fontSize:11,color:C.muted},

  addQ:{borderRadius:11,paddingVertical:12,alignItems:'center',
    borderWidth:1.5,borderStyle:'dashed',borderColor:C.border,backgroundColor:C.bg},
  addQTxt:{fontSize:13,fontWeight:'700',color:C.primary},
});
