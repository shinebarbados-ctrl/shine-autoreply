# Deployment checklist — Shine auto-reply

Everything already discovered from your Meta account is filled in below. Only four values are missing, and all four are secrets that have to be entered by you rather than by me.

## Your Meta assets (confirmed 22 Sep 2026)

| Thing | Value |
|---|---|
| Meta app | Shine Automotive Inc. |
| App ID | `2059096498342484` |
| App mode | In development, unpublished |
| Business portfolio ID | `2009455292652184` |
| WhatsApp Business Account ID | `4431767670426470` (Test WABA) |
| Test phone number | `+1 555-659-7577` |
| **Phone Number ID** | `1164058913458236` |
| Real number `246-252-9099` | Not on Cloud API. Staying on the phone app for now |

## Step 1 — Sign in to Railway

https://railway.com/dashboard, "Continue with GitHub" is the quickest.

## Step 2 — Get the code onto Railway

Easiest route: push the `shine-autoreply` folder to a private GitHub repo, then in Railway choose **New Project > Deploy from GitHub repo**.

Railway auto-detects Node from `package.json`. `railway.json` is already in the folder and sets the health check to `/health`.

## Step 3 — Paste the environment variables

In your Railway service, open **Variables > Raw Editor** and paste this whole block in one go:

```
DRY_RUN=true
ADMIN_TOKEN=Q41pAhAlD5mEui1ytwZT0GgRpiMt-6DL
WEBHOOK_VERIFY_TOKEN=m2zgf618f5JasAhGTDsSHA
GRAPH_VERSION=v23.0
WHATSAPP_PHONE_NUMBER_ID=1164058913458236
HANDOFF_PAUSE_HOURS=12
REPLY_DEBOUNCE_SECONDS=4
OWNER_WHATSAPP=12462529099
ANTHROPIC_API_KEY=
META_APP_SECRET=
WHATSAPP_TOKEN=
BOOKING_URL=
```

`DRY_RUN=true` is deliberate. The server will log replies rather than send them until you flip it.

The two tokens above are randomly generated for you. Replace them with your own if you prefer, just keep `WEBHOOK_VERIFY_TOKEN` matching what you give Meta in Step 6.

### The four blanks

**`ANTHROPIC_API_KEY`** — console.anthropic.com > API keys > Create key.

**`META_APP_SECRET`** — developers.facebook.com > your app > App settings > Basic > App Secret > Show. Facebook will ask for your password, which is why this one is yours to do.

**`WHATSAPP_TOKEN`** — see Step 4.

**`BOOKING_URL`** — your Setmore link, or leave blank and the bot will collect booking details in the chat instead.

## Step 4 — Generate the WhatsApp token

Two options.

**Quick, expires in 24 hours.** App dashboard > Use cases > Connect on WhatsApp > Step 1. Try it out > **Generate token**. Fine for today's testing, will break tomorrow.

**Permanent, do this before going live.** business.facebook.com > Business settings > Users > System users > Add. Give it Admin access to the app, then **Generate new token**, select the app, tick `whatsapp_business_messaging` and `whatsapp_business_management`, and set expiry to Never.

## Step 5 — Whitelist your phone for testing

The test number can only message numbers you register. On the same "Step 1. Try it out" page, under Recipient, add `+1 246 252 9099` (or whichever phone you will test from). Meta sends it a confirmation code.

Note that handoff alerts to `OWNER_WHATSAPP` will only arrive if that number is on this whitelist too.

## Step 6 — Register the webhook

App dashboard > Use cases > Connect on WhatsApp > **Webhooks**.

- Callback URL: `https://YOUR-RAILWAY-URL/webhook/whatsapp`
- Verify token: `m2zgf618f5JasAhGTDsSHA`
- Click Verify and save. It should go green immediately. If it does not, open `https://YOUR-RAILWAY-URL/health` in a browser first to confirm the server is awake.
- Then subscribe to the **messages** field.

## Step 7 — Test

1. Open `https://YOUR-RAILWAY-URL/` and enter the admin token.
2. From your whitelisted phone, WhatsApp the test number `+1 555-659-7577`. Say something like "how much to detail my SUV interior".
3. Railway logs will show `[DRY_RUN] whatsapp -> ...` with the reply the bot wanted to send.
4. Try "what time do you open on Saturday". Opening hours are still `[FILL IN]` in `knowledge.md`, so this should produce a holding message and a `[handoff]` line rather than an invented answer.

## Step 8 — Go live on the test number

Set `DRY_RUN=false` in Railway and redeploy. Messages now actually send.

## Before the real number moves to Cloud API

- `knowledge.md` has no `[FILL IN]` left that customers ask about
- You have watched a day or two of dry-run replies and are happy with the tone
- Your team knows they will answer from Business Suite inbox or the dashboard, not the WhatsApp Business phone app
- A permanent System User token is in place, not the 24-hour one

---

# Appendix — Instagram

## Current state

The Instagram messaging use case is **not** added to app `2059096498342484`. The app is also unpublished and in development mode.

## Why Instagram cannot go live yet

Meta requires App Review for `instagram_business_manage_messages` before DMs from ordinary customers reach your app. The review submission requires a **screencast of the working feature**, which cannot be recorded until the server is deployed and Instagram is connected in test mode. So the Instagram clock realistically starts the day WhatsApp is up, not before.

## Order of operations once Railway is live

1. App dashboard > Use cases > Add use case > **Instagram API**.
2. Instagram > API setup with Instagram login. Collect `IG_ACCOUNT_ID`, generate `IG_ACCESS_TOKEN`, note the Instagram app secret for `IG_APP_SECRET`.
3. In the Instagram app on your phone: Settings > Messages and story replies > **Allow access to messages**. Without this toggle Meta sends nothing, and it is the single most common reason an Instagram integration goes silent.
4. Webhook callback `https://YOUR-RAILWAY-URL/webhook/instagram`, same verify token. Subscribe to **messages** and **messaging_postbacks**.
5. Add yourself and anyone else testing under App roles > Roles as testers. Their DMs will reach the app immediately, without review.
6. Record the screencast, submit for review.

## What the review submission needs to say

Meta rejects vague justifications. The permission request should state plainly:

> Shine Automotive Inc. is a vehicle protection and detailing company in Barbados. We use `instagram_business_manage_messages` to read customer enquiries sent to our own business Instagram account and reply with information about our detailing services, pricing and booking. Messages are answered automatically during and outside business hours, and are escalated to a human team member when the enquiry falls outside our published service information. We do not message people who have not messaged us first, and we do not use this permission for any account other than our own.

The screencast must show, in one unbroken take: a customer account sending a DM to the Shine account, the message arriving in the system, and the reply going back.
