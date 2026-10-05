# Turning push notifications on

Three steps. The code is already in place.

## 1. Supabase secrets

Supabase → Edge Functions → Secrets. Add all three:

```
VAPID_PUBLIC_KEY   = BL0TumMXiimVx6ZLNRJUWNnIzReIPKvBebiCaVKg2O5cd0-eQxxNH4P3r-om-enjmiHflwGHgR9q7FMRnEQiX6g
VAPID_PRIVATE_KEY  = mSRR4T5A7CspqsOiuIBEewP-pglquxFWhFXNbPHyKV4
VAPID_SUBJECT      = mailto:support@po-ji.com
```

Keep the private key to yourself. Anyone holding it can send notifications
that look like they came from Poji.

## 2. Vercel environment variable

Vercel → Project → Settings → Environment Variables:

```
EXPO_PUBLIC_VAPID_KEY = BL0TumMXiimVx6ZLNRJUWNnIzReIPKvBebiCaVKg2O5cd0-eQxxNH4P3r-om-enjmiHflwGHgR9q7FMRnEQiX6g
```

Add it to Production, Preview and Development, then redeploy.

The same value is in `.env` for local work.

## 3. Deploy the functions

    supabase functions deploy send-push

    supabase functions deploy send-notification

## Testing it

Notifications only work from the installed app, not a browser tab.

1. Open po-ji.com on a phone
2. Add to Home Screen
3. Open it from the home screen icon
4. Profile → Turn on notifications
5. Make a booking from another account and watch it arrive

iPhone needs iOS 16.4 or later, and the app must be opened from the home
screen icon. Safari in a tab will not show the prompt.

## If you ever need new keys

    node -e "const c=require('crypto');const{publicKey,privateKey}=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const b=x=>x.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');console.log('public',b(publicKey.export({type:'spki',format:'der'}).slice(-65)));console.log('private',b(privateKey.export({type:'pkcs8',format:'der'}).slice(36,68)))"

Changing them logs every device out of notifications. Everyone has to
turn them on again.
