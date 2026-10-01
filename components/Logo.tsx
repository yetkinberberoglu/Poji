import { View, Image, StyleSheet, Platform } from 'react-native';
import { C } from '../constants/theme';

/**
 * The Poji mark — a nazar bead drawn as concentric rings.
 * Uses the real PNG on web (it's served from public/), and draws
 * the same shape natively so it never depends on a missing file.
 */
export default function Logo({ size = 80 }: { size?: number }) {
  if (Platform.OS === 'web') {
    return (
      <Image
        source={{ uri: '/icon-512.png' }}
        style={{ width: size, height: size, borderRadius: size * 0.28 }}
        resizeMode="cover"
      />
    );
  }

  const ring  = size * 0.60;
  const inner = size * 0.31;
  const pupil = size * 0.15;

  return (
    <View style={[s.box, { width:size, height:size, borderRadius:size*0.28 }]}>
      <View style={[s.ring, {
        width: ring, height: ring, borderRadius: ring/2,
        borderWidth: size * 0.075,
      }]}>
        <View style={[s.inner, { width: inner, height: inner, borderRadius: inner/2 }]}>
          <View style={{
            width: pupil, height: pupil, borderRadius: pupil/2,
            backgroundColor: C.primary,
          }} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  box:{backgroundColor:C.primary,alignItems:'center',justifyContent:'center'},
  ring:{borderColor:C.white,alignItems:'center',justifyContent:'center'},
  inner:{backgroundColor:C.white,alignItems:'center',justifyContent:'center'},
});
