# Poji — WhatsApp Notification Setup

The app already calls the notification function at every step.
Until you deploy it, calls fail silently — nothing breaks.

## 1. Get Twilio credentials

1. Sign up at twilio.com
2. Console → Messaging → Try it out → **Send a WhatsApp message**
3. Note down:
   - Account SID
   - Auth Token
   - WhatsApp sandbox number (e.g. `whatsapp:+14155238886`)

For the sandbox, each recipient must first send the join code
(e.g. `join happy-tiger`) to that number once.

## 2. Install Supabase CLI

npm install -g supabase

## 3. Log in and link your project

supabase login

supabase link --project-ref tmsqcxbdawymfvbwomte

## 4. Set the secrets

supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxx

supabase secrets set TWILIO_AUTH_TOKEN=your_auth_token

supabase secrets set TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

## 5. Deploy the function

supabase functions deploy send-notification

## 6. Test

Make a booking as a client. The cleaner should get a WhatsApp
message within seconds.

Check delivery in Supabase → Table Editor → `notifications`:
- `status: sent`      → delivered to Twilio
- `status: failed`    → see the `error` column
- `no phone on file`  → that user hasn't completed onboarding

## Messages the app sends

| When | Who gets it |
|---|---|
| Client books | Preferred cleaner (5-min priority) |
| Client releases to pool | All approved cleaners |
| Cleaner accepts | Client |
| Cleaner sets "on my way" | Client |
| Cleaner arrives | Client — includes the PIN |
| Cleaner finishes | Client — asks to confirm |
| Client confirms | Cleaner — payment released |
| Admin approves application | Cleaner |
| Admin rejects application | Cleaner — with reason |
