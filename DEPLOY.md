# Poji — Deploy to po-ji.com

## 1. Test the production build locally

npx expo export --platform web

npx serve dist

Open http://localhost:3000 — this is exactly what will go live.

## 2. Push to GitHub

git init

git add .

git commit -m "Poji v1"

Create an empty repo on github.com called `poji`, then:

git remote add origin https://github.com/YOUR_USERNAME/poji.git

git branch -M main

git push -u origin main

## 3. Deploy on Vercel

1. Go to vercel.com, sign in with GitHub
2. Add New → Project → import `poji`
3. Vercel reads vercel.json automatically — leave the settings alone
4. Deploy

You get a URL like poji-xxxx.vercel.app straight away.

## 4. Point po-ji.com at it

In Vercel: Project → Settings → Domains → Add

Add both:
- po-ji.com
- www.po-ji.com

Vercel shows you DNS records. At your domain registrar set:

| Type  | Name | Value                |
|-------|------|----------------------|
| A     | @    | 76.76.21.21          |
| CNAME | www  | cname.vercel-dns.com |

DNS takes 10 minutes to a few hours. HTTPS is automatic.

## 5. Redirect po-ji.co

Add po-ji.co in Vercel the same way, then set it to redirect to po-ji.com
(Vercel: Domains → po-ji.co → Redirect to po-ji.com).

## 6. Update Supabase

Supabase → Authentication → URL Configuration:

- Site URL: https://po-ji.com
- Redirect URLs: https://po-ji.com/**

Otherwise password-reset emails will still point at localhost.

## 7. Update the WhatsApp links

The notification templates link to po-ji.com. If that ever changes, update it in
supabase/functions/send-notification/index.ts, then:

supabase functions deploy send-notification

## Deploying changes later

git add .

git commit -m "what changed"

git push

Vercel rebuilds automatically on every push.
