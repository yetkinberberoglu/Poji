import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C } from '../constants/theme';
import {
  DAYS, SLOTS, PRESETS, describe, countSlots,
  type Availability, type DayKey, type SlotKey,
} from '../lib/availability';

/**
 * The week at a glance. Tap a cell to work that slot, tap a day or a
 * slot label to toggle the whole row or column.
 */
export default function AvailabilityGrid({
  value, onChange,
}: {
  value: Availability;
  onChange: (v: Availability) => void;
}) {
  const has = (d: DayKey, s: SlotKey) => (value[d] || []).includes(s);

  const toggleCell = (d: DayKey, s: SlotKey) => {
    const cur = value[d] || [];
    onChange({ ...value, [d]: cur.includes(s) ? cur.filter(x=>x!==s) : [...cur, s] });
  };

  const toggleDay = (d: DayKey) => {
    const cur = value[d] || [];
    onChange({ ...value, [d]: cur.length > 0 ? [] : SLOTS.map(s=>s.k) });
  };

  const toggleSlot = (s: SlotKey) => {
    const everyone = DAYS.every(d => has(d.k, s));
    const next: Availability = { ...value };
    DAYS.forEach(d => {
      const cur = next[d.k] || [];
      next[d.k] = everyone ? cur.filter(x=>x!==s) : Array.from(new Set([...cur, s]));
    });
    onChange(next);
  };

  const total = countSlots(value);

  return (
    <View style={s.wrap}>
      <View style={s.presetRow}>
        {PRESETS.map(p=>(
          <TouchableOpacity key={p.id} style={s.preset} onPress={()=>onChange(p.value)}>
            <Text style={s.presetTxt}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.grid}>
        {/* slot labels down the side */}
        <View style={s.labelCol}>
          <View style={s.corner} />
          {SLOTS.map(sl=>(
            <TouchableOpacity key={sl.k} style={s.slotLabel} onPress={()=>toggleSlot(sl.k)}>
              <Text style={s.slotName}>{sl.label}</Text>
              <Text style={s.slotRange}>{sl.range}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* one column per day */}
        {DAYS.map(d=>{
          const dayOn = (value[d.k] || []).length > 0;
          return (
            <View key={d.k} style={s.col}>
              <TouchableOpacity style={[s.dayHead, dayOn&&s.dayHeadOn]}
                onPress={()=>toggleDay(d.k)}>
                <Text style={[s.dayTxt, dayOn&&s.dayTxtOn]}>{d.short}</Text>
              </TouchableOpacity>
              {SLOTS.map(sl=>{
                const on = has(d.k, sl.k);
                return (
                  <TouchableOpacity key={sl.k} style={[s.cell, on&&s.cellOn]}
                    onPress={()=>toggleCell(d.k, sl.k)}>
                    {on && <Text style={s.tick}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </View>

      <View style={s.summary}>
        <Text style={s.summaryTxt}>{describe(value)}</Text>
        <Text style={s.summaryCount}>
          {total} slot{total===1?'':'s'} a week
        </Text>
      </View>

      {total === 0 && (
        <Text style={s.warn}>
          With nothing selected you won't hear about any jobs.
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{gap:12},
  presetRow:{flexDirection:'row',flexWrap:'wrap',gap:7},
  preset:{paddingHorizontal:11,paddingVertical:7,borderRadius:16,backgroundColor:C.bgAlt,
    borderWidth:1,borderColor:C.border},
  presetTxt:{fontSize:11,fontWeight:'700',color:C.primary},

  grid:{flexDirection:'row',gap:4},
  labelCol:{width:86,gap:4},
  corner:{height:30},
  slotLabel:{height:44,justifyContent:'center'},
  slotName:{fontSize:11,fontWeight:'800',color:C.dark},
  slotRange:{fontSize:9,color:C.muted,marginTop:1},

  col:{flex:1,gap:4},
  dayHead:{height:30,borderRadius:8,backgroundColor:C.bgAlt,alignItems:'center',
    justifyContent:'center',borderWidth:1,borderColor:C.border},
  dayHeadOn:{backgroundColor:C.primary,borderColor:C.primary},
  dayTxt:{fontSize:11,fontWeight:'800',color:C.muted},
  dayTxtOn:{color:C.white},

  cell:{height:44,borderRadius:8,backgroundColor:C.white,borderWidth:1.5,
    borderColor:C.border,alignItems:'center',justifyContent:'center'},
  cellOn:{backgroundColor:C.green,borderColor:C.green},
  tick:{color:C.white,fontSize:15,fontWeight:'800'},

  summary:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',
    backgroundColor:C.bgAlt,borderRadius:10,paddingHorizontal:12,paddingVertical:9,
    borderWidth:1,borderColor:C.border},
  summaryTxt:{fontSize:12,fontWeight:'700',color:C.dark,flex:1},
  summaryCount:{fontSize:11,color:C.muted},
  warn:{fontSize:12,color:C.amber,fontWeight:'700'},
});
