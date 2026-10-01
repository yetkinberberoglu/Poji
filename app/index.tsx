import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { C } from '../constants/theme';
import Logo from '../components/Logo';

export default function Index() {
  return (
    <View style={s.wrap}>
      <Logo size={76} />
      <Text style={s.brand}>Poji</Text>
      <ActivityIndicator color={C.primary} size="large" style={{marginTop:22}} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:C.bg},
  brand:{fontSize:26,fontWeight:'800',color:C.dark,marginTop:14},
});
