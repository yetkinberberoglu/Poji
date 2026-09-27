import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { C } from '../constants/theme';

export default function Index() {
  return (
    <View style={s.wrap}>
      <View style={s.logo}><Text style={s.logoTxt}>P</Text></View>
      <Text style={s.brand}>Poji</Text>
      <ActivityIndicator color={C.primary} size="large" style={{marginTop:20}} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:C.bg},
  logo:{width:72,height:72,borderRadius:22,backgroundColor:C.primary,alignItems:'center',justifyContent:'center',marginBottom:12},
  logoTxt:{color:C.white,fontSize:34,fontWeight:'800'},
  brand:{fontSize:26,fontWeight:'800',color:C.dark},
});
