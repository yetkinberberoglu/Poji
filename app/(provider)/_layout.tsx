import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { C } from '../../constants/theme';
import { useApp } from '../../context/AppContext';

function Icon({ e, focused }: { e:string; focused:boolean }) {
  return <Text style={{ fontSize:22, opacity: focused?1:0.45 }}>{e}</Text>;
}

export default function ProviderTabs() {
  const { bookings, userId } = useApp();

  const live = bookings.filter(b =>
    ['pending','pending_pool','accepted','en_route','arrived','in_progress']
      .includes(b.status)).length;

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor:C.white, borderTopColor:C.border, height:82, paddingBottom:14 },
      tabBarActiveTintColor: C.primary,
      tabBarInactiveTintColor: C.muted,
      tabBarLabelStyle: { fontSize:11, fontWeight:'600' },
    }}>
      <Tabs.Screen name="jobs" options={{
        title:'Jobs',
        tabBarIcon:({focused})=>(
          <View>
            <Icon e="🧰" focused={focused}/>
            {live>0 && (
              <View style={{position:'absolute',top:-2,right:-6,backgroundColor:C.red,
                borderRadius:8,minWidth:16,height:16,alignItems:'center',justifyContent:'center',
                paddingHorizontal:3}}>
                <Text style={{color:C.white,fontSize:10,fontWeight:'700'}}>{live}</Text>
              </View>
            )}
          </View>
        ),
      }} />
      <Tabs.Screen name="earnings" options={{
        title:'Earnings', tabBarIcon:({focused})=><Icon e="💶" focused={focused}/>,
      }} />
      <Tabs.Screen name="profile" options={{
        title:'Profile', tabBarIcon:({focused})=><Icon e="👤" focused={focused}/>,
      }} />
    </Tabs>
  );
}
