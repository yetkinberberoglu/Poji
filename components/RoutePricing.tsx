import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { C } from '../constants/theme';
import { VEHICLES, BANDS, routeKey } from '../lib/transport';

/**
 * A driver's price list. Which vehicles they run, and what each one costs
 * on each kind of run. Empty means they don't do it.
 */
export default function RoutePricing({
  vehicles, prices, onChange,
}: {
  vehicles: string[];
  prices: Record<string, number>;
  onChange: (vehicles: string[], prices: Record<string, number>) => void;
}) {
  const toggleVehicle = (k: string) => {
    const has = vehicles.includes(k);
    const nextV = has ? vehicles.filter(v => v !== k) : [...vehicles, k];
    const nextP = { ...prices };
    if (has) BANDS.forEach(b => { delete nextP[routeKey(k, b.k)]; });
    onChange(nextV, nextP);
  };

  const setPrice = (v: string, b: string, raw: string) => {
    const clean = raw.replace(/[^0-9.]/g, '');
    const next = { ...prices };
    if (clean === '') delete next[routeKey(v, b)];
    else next[routeKey(v, b)] = Number(clean);
    onChange(vehicles, next);
  };

  return (
    <View style={s.wrap}>
      <Text style={s.lbl}>What do you drive?</Text>
      <View style={s.vWrap}>
        {VEHICLES.map(v => {
          const on = vehicles.includes(v.k);
          return (
            <TouchableOpacity key={v.k} style={[s.vCard, on && s.vCardOn]}
              onPress={() => toggleVehicle(v.k)}>
              <View style={[s.check, on && s.checkOn]}>
                {on && <Text style={s.checkTxt}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.vName, on && s.vNameOn]}>{v.label}</Text>
                <Text style={s.vHint}>{v.hint}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {vehicles.length === 0 ? (
        <Text style={s.empty}>
          Pick a vehicle and you can set what each run costs.
        </Text>
      ) : (
        <>
          <Text style={s.lbl}>What you charge per run</Text>
          <Text style={s.hint}>
            Kerbside to kerbside. Leave a box empty for a run you won't do —
            clients won't see you for it.
          </Text>

          {vehicles.map(vk => {
            const v = VEHICLES.find(x => x.k === vk);
            return (
              <View key={vk} style={s.block}>
                <Text style={s.blockTitle}>{v?.label || vk}</Text>
                {BANDS.map(b => (
                  <View key={b.k} style={s.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.bandName}>{b.label}</Text>
                      <Text style={s.bandHint}>{b.hint}</Text>
                    </View>
                    <View style={s.priceWrap}>
                      <Text style={s.currency}>€</Text>
                      <TextInput
                        style={s.priceInput}
                        value={prices[routeKey(vk, b.k)] != null
                          ? String(prices[routeKey(vk, b.k)]) : ''}
                        onChangeText={(t) => setPrice(vk, b.k, t)}
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor={C.muted}
                      />
                    </View>
                  </View>
                ))}
              </View>
            );
          })}

          <View style={s.noteBox}>
            <Text style={s.noteTxt}>
              This is the driving. Carrying things up stairs, packing, waiting
              around — agree that in the chat and add it as a line on the job.
              Poji takes 5% of those, not 20%.
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{gap:4},
  lbl:{fontSize:11,fontWeight:'700',color:C.muted,textTransform:'uppercase',
    letterSpacing:0.4,marginTop:16,marginBottom:8},
  hint:{fontSize:11,color:C.muted,lineHeight:16,marginBottom:10,marginTop:-4},
  empty:{fontSize:12,color:C.muted,lineHeight:17,marginTop:8},

  vWrap:{gap:7},
  vCard:{flexDirection:'row',alignItems:'center',gap:11,padding:11,borderRadius:11,
    borderWidth:1.5,borderColor:C.border,backgroundColor:C.bg},
  vCardOn:{borderColor:C.primary,backgroundColor:C.primaryLt},
  vName:{fontSize:13,fontWeight:'700',color:C.dark},
  vNameOn:{color:C.primary},
  vHint:{fontSize:11,color:C.muted,marginTop:1},
  check:{width:20,height:20,borderRadius:6,borderWidth:2,borderColor:C.border,
    alignItems:'center',justifyContent:'center'},
  checkOn:{backgroundColor:C.primary,borderColor:C.primary},
  checkTxt:{color:C.white,fontSize:12,fontWeight:'800'},

  block:{marginTop:14,backgroundColor:C.bg,borderRadius:12,padding:12,
    borderWidth:1,borderColor:C.border},
  blockTitle:{fontSize:13,fontWeight:'800',color:C.dark,marginBottom:8},
  row:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:7,
    borderTopWidth:1,borderTopColor:C.border},
  bandName:{fontSize:12,color:C.text,fontWeight:'600'},
  bandHint:{fontSize:10,color:C.muted,marginTop:1},
  priceWrap:{flexDirection:'row',alignItems:'center',backgroundColor:C.white,
    borderRadius:9,borderWidth:1.5,borderColor:C.border,paddingLeft:10,width:88},
  currency:{fontSize:13,color:C.muted,fontWeight:'700'},
  priceInput:{flex:1,paddingVertical:9,paddingHorizontal:5,fontSize:14,color:C.text},

  noteBox:{backgroundColor:C.amberLt,borderRadius:11,padding:12,marginTop:14,
    borderWidth:1,borderColor:'#FDE68A'},
  noteTxt:{fontSize:11,color:C.text,lineHeight:17},
});
