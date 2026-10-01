import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useState, useEffect } from 'react';
import { C, S } from '../constants/theme';
import Logo from '../components/Logo';

const DISMISS_KEY = 'poji_install_dismissed';

/**
 * Nudges people to add Poji to their home screen.
 * Chrome/Android fires a real prompt we can trigger; iOS Safari has no API,
 * so we tell them where the button is.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow]         = useState(false);
  const [isIOS, setIsIOS]       = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    // already installed?
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (standalone) return;

    // dismissed before?
    try {
      const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (until > Date.now()) return;
    } catch {}

    const ua = window.navigator.userAgent || '';
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(ios);

    if (ios) {
      const t = setTimeout(() => setShow(true), 8000);
      return () => clearTimeout(t);
    }

    const onPrompt = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = (days = 14) => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 864e5));
    } catch {}
    setShow(false);
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') setShow(false);
    else dismiss(30);
    setDeferred(null);
  };

  if (!show) return null;

  return (
    <View style={s.wrap}>
      <View style={s.card}>
        <Logo size={42} />

        <View style={{flex:1}}>
          <Text style={s.title}>Add Poji to your home screen</Text>
          <Text style={s.desc}>
            {isIOS
              ? 'Tap the share button below, then "Add to Home Screen".'
              : 'Opens like an app — no address bar, works offline.'}
          </Text>
        </View>

        {!isIOS && (
          <TouchableOpacity style={s.addBtn} onPress={install}>
            <Text style={s.addTxt}>Add</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={s.closeBtn} onPress={()=>dismiss()}>
          <Text style={s.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:{position:'absolute',left:0,right:0,bottom:0,padding:12,zIndex:999},
  card:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:C.dark,borderRadius:18,padding:14,...S.md},
  iconBox:{width:42,height:42,borderRadius:12,backgroundColor:C.primary,alignItems:'center',justifyContent:'center'},
  icon:{fontSize:22,color:C.white,fontWeight:'800'},
  title:{fontSize:14,fontWeight:'800',color:C.white},
  desc:{fontSize:12,color:'#C7D2FE',marginTop:3,lineHeight:16},
  addBtn:{backgroundColor:C.white,borderRadius:10,paddingHorizontal:16,paddingVertical:9},
  addTxt:{fontSize:13,fontWeight:'800',color:C.dark},
  closeBtn:{padding:6},
  closeTxt:{fontSize:16,color:'#818CF8',fontWeight:'700'},
});
