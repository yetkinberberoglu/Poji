import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ScrollView
} from 'react-native';
import { useState, useMemo } from 'react';
import { C, S } from '../constants/theme';

/**
 * A compact dropdown. Shows one row until tapped, then opens a
 * searchable sheet — far better than a wall of chips on a phone.
 */
export default function Picker({
  value, options, onChange, placeholder = 'Select…', title, searchable = true,
}: {
  value?: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  title?: string;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState('');

  const list = useMemo(() => {
    if (!q.trim()) return options;
    const needle = q.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(needle));
  }, [q, options]);

  return (
    <>
      <TouchableOpacity style={s.field} onPress={()=>{ setQ(''); setOpen(true); }}>
        <Text style={[s.value, !value && s.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Text style={s.caret}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent
        onRequestClose={()=>setOpen(false)}>
        <View style={s.backdrop}>
          <TouchableOpacity style={{flex:1}} activeOpacity={1} onPress={()=>setOpen(false)} />
          <View style={s.sheet}>
            <View style={s.sheetHdr}>
              <Text style={s.sheetTitle}>{title || placeholder}</Text>
              <TouchableOpacity onPress={()=>setOpen(false)}>
                <Text style={s.close}>✕</Text>
              </TouchableOpacity>
            </View>

            {searchable && (
              <View style={s.searchBox}>
                <Text>🔍  </Text>
                <TextInput
                  style={s.searchInput}
                  value={q}
                  onChangeText={setQ}
                  placeholder="Type to narrow it down"
                  placeholderTextColor={C.muted}
                  autoFocus
                />
              </View>
            )}

            <ScrollView style={s.list} keyboardShouldPersistTaps="handled">
              {list.length === 0 && (
                <Text style={s.none}>Nothing matches "{q}"</Text>
              )}
              {list.map(o=>(
                <TouchableOpacity key={o} style={[s.row, value===o && s.rowOn]}
                  onPress={()=>{ onChange(o); setOpen(false); }}>
                  <Text style={[s.rowTxt, value===o && s.rowTxtOn]}>{o}</Text>
                  {value===o && <Text style={s.tick}>✓</Text>}
                </TouchableOpacity>
              ))}
              <View style={{height:20}} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

/**
 * Same sheet, but you can tick several. Used for service areas.
 */
export function MultiPicker({
  values, options, onChange, placeholder = 'Select…', title,
}: {
  values: string[];
  options: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState('');

  const list = useMemo(() => {
    if (!q.trim()) return options;
    const needle = q.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(needle));
  }, [q, options]);

  const toggle = (o: string) =>
    onChange(values.includes(o) ? values.filter(v=>v!==o) : [...values, o]);

  const label = values.length === 0 ? placeholder
    : values.length <= 2 ? values.join(', ')
    : `${values.slice(0,2).join(', ')} +${values.length - 2}`;

  return (
    <>
      <TouchableOpacity style={s.field} onPress={()=>{ setQ(''); setOpen(true); }}>
        <Text style={[s.value, values.length===0 && s.placeholder]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={s.caret}>▾</Text>
      </TouchableOpacity>

      {values.length > 0 && (
        <View style={s.tagWrap}>
          {values.map(v=>(
            <TouchableOpacity key={v} style={s.tag} onPress={()=>toggle(v)}>
              <Text style={s.tagTxt}>{v}</Text>
              <Text style={s.tagX}>✕</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Modal visible={open} animationType="slide" transparent
        onRequestClose={()=>setOpen(false)}>
        <View style={s.backdrop}>
          <TouchableOpacity style={{flex:1}} activeOpacity={1} onPress={()=>setOpen(false)} />
          <View style={s.sheet}>
            <View style={s.sheetHdr}>
              <Text style={s.sheetTitle}>
                {title || placeholder}
                {values.length > 0 ? `  ·  ${values.length}` : ''}
              </Text>
              <TouchableOpacity onPress={()=>setOpen(false)}>
                <Text style={s.close}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={s.searchBox}>
              <Text>🔍  </Text>
              <TextInput
                style={s.searchInput}
                value={q}
                onChangeText={setQ}
                placeholder="Type to narrow it down"
                placeholderTextColor={C.muted}
              />
            </View>

            <View style={s.bulkRow}>
              <TouchableOpacity onPress={()=>onChange(options)}>
                <Text style={s.bulkTxt}>Select all</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>onChange([])}>
                <Text style={s.bulkTxt}>Clear</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={s.list} keyboardShouldPersistTaps="handled">
              {list.map(o=>{
                const on = values.includes(o);
                return (
                  <TouchableOpacity key={o} style={[s.row, on && s.rowOn]} onPress={()=>toggle(o)}>
                    <View style={[s.check, on && s.checkOn]}>
                      {on && <Text style={s.checkTxt}>✓</Text>}
                    </View>
                    <Text style={[s.rowTxt, on && s.rowTxtOn]}>{o}</Text>
                  </TouchableOpacity>
                );
              })}
              <View style={{height:20}} />
            </ScrollView>

            <TouchableOpacity style={s.doneBtn} onPress={()=>setOpen(false)}>
              <Text style={s.doneTxt}>
                Done{values.length > 0 ? `  ·  ${values.length} selected` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  field:{flexDirection:'row',alignItems:'center',backgroundColor:C.white,borderRadius:14,
    paddingHorizontal:16,paddingVertical:15,borderWidth:1.5,borderColor:C.border,gap:10},
  value:{flex:1,fontSize:15,color:C.text},
  placeholder:{color:C.muted},
  caret:{fontSize:13,color:C.muted},

  tagWrap:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8},
  tag:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:C.primaryLt,
    paddingHorizontal:10,paddingVertical:6,borderRadius:16,borderWidth:1,borderColor:C.border},
  tagTxt:{fontSize:12,color:C.primary,fontWeight:'700'},
  tagX:{fontSize:11,color:C.primary,opacity:0.6},

  backdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.4)',justifyContent:'flex-end'},
  sheet:{backgroundColor:C.bg,borderTopLeftRadius:24,borderTopRightRadius:24,
    maxHeight:'80%',paddingBottom:12},
  sheetHdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
    padding:18,borderBottomWidth:1,borderBottomColor:C.border},
  sheetTitle:{fontSize:17,fontWeight:'800',color:C.dark},
  close:{fontSize:19,color:C.muted,fontWeight:'700'},
  searchBox:{flexDirection:'row',alignItems:'center',margin:16,marginBottom:8,
    backgroundColor:C.white,borderRadius:12,paddingHorizontal:14,borderWidth:1,borderColor:C.border},
  searchInput:{flex:1,paddingVertical:12,fontSize:15,color:C.text},
  bulkRow:{flexDirection:'row',justifyContent:'space-between',paddingHorizontal:18,paddingBottom:8},
  bulkTxt:{fontSize:13,color:C.primary,fontWeight:'700'},
  list:{paddingHorizontal:16},
  row:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:14,paddingHorizontal:14,
    borderRadius:12,marginBottom:4,backgroundColor:C.white,borderWidth:1,borderColor:C.border},
  rowOn:{backgroundColor:C.primaryLt,borderColor:C.primary},
  rowTxt:{flex:1,fontSize:15,color:C.text},
  rowTxtOn:{color:C.primary,fontWeight:'700'},
  tick:{fontSize:15,color:C.primary,fontWeight:'800'},
  check:{width:22,height:22,borderRadius:7,borderWidth:2,borderColor:C.border,
    alignItems:'center',justifyContent:'center'},
  checkOn:{backgroundColor:C.primary,borderColor:C.primary},
  checkTxt:{color:C.white,fontSize:13,fontWeight:'800'},
  none:{fontSize:14,color:C.muted,textAlign:'center',paddingVertical:30},
  doneBtn:{marginHorizontal:16,marginTop:8,backgroundColor:C.primary,borderRadius:14,
    paddingVertical:15,alignItems:'center'},
  doneTxt:{color:C.white,fontSize:15,fontWeight:'700'},
});
