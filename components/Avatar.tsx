import { View, Text, Image, StyleSheet } from 'react-native';
import { C } from '../constants/theme';

/** Provider avatar — the real photo when we have one, initials when we don't. */
export default function Avatar({
  photoUrl, initials, color, size = 52,
}: { photoUrl?: string|null; initials?: string; color?: string; size?: number }) {
  const tint = color || C.primary;

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{ width:size, height:size, borderRadius:size/2, backgroundColor: tint + '22' }}
        resizeMode="cover"
      />
    );
  }

  return (
    <View style={[s.box, {
      width:size, height:size, borderRadius:size/2, backgroundColor: tint + '22',
    }]}>
      <Text style={{ fontSize: size * 0.34, fontWeight:'800', color: tint }}>
        {initials || '?'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  box:{alignItems:'center',justifyContent:'center'},
});
