# Shine Automotive auto-reply

Answers WhatsApp and Instagram DMs automatically with Claude, using `knowledge.md` as the only source of facts, and hands the chat to a human when it should not answer.

## What it does

- One server, both channels. WhatsApp Cloud API and Instagram Messaging API hit the same engine.
- Answers from `knowledge.md` only. It will not invent a price, an opening time, or a policy. Anything marked `[FILL IN]` triggers a handoff instead of a guess.
- Hands off to a human on: unknown questions, discounts or custom quotes, complaints, cancellations, "let me speak to someone", suppliers and recruiters, and any attachment.
- Goes quiet automatically when a human replies. If someone from the team answers in the Meta inbox or in the dashboard, the bot stays silent in that chat for `HANDOFF_PAUSE_HOURS`.
- Bundles rapid messages. Customers who send four lines in a row get one reply, not four.
- Ignores duplicates. Meta retries webhooks; each message ID is processed once.
- STOP / START opt-out handling.
- Dashboard at `/` to watch chats, pause the bot, and reply as Shine.

## Files

| File | Purpose |
|---|---|
| `server.js` | Webhooks, admin API, dashboard hosting |
| `lib/webhooks.js` | Parses Meta payloads, verifies signatures |
| `lib/engine.js` | Debounce, opt-out, handoff triggers, reply loop |
| `lib/brain.js` | Claude prompt and guardrails |
| `lib/channels.js` | Sends WhatsApp and Instagram messages |
| `lib/handoff.js` | Alerts you and pauses the bot |
| `lib/store.js` | Conversation memory (in-process) |
| `knowledge.md` | **Edit this.** Everything the bot is allowed to say |
| `public/index.html` | Team inbox dashboard |
| `test/simulate.js` | Fires fake customer messages at a local server |

## Setup

### 1. Fill in the knowledge base
Open `knowledge.md` and replace every `[FILL IN]`. Whatever is not in that file, the bot will not say. This is the single highest-value step.

### 2. Configure

```bash
cp .env.example .env
```

Fill in:

| Variable | Where it comes from |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `WEBHOOK_VERIFY_TOKEN` | You invent it. Paste the same string into Meta |
| `META_APP_SECRET` | Meta app > App settings > Basic |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN` | Meta app > WhatsApp > API setup. Use a permanent System User token, not the 24h test one |
| `IG_ACCOUNT_ID`, `IG_ACCESS_TOKEN`, `IG_APP_SECRET` | Meta app > Instagram > API setup with Instagram login |
| `ADMIN_TOKEN` | You invent it. Protects the dashboard |
| `OWNER_WHATSAPP` | Your number, no `+`, e.g. `12462529099` |
| `HANDOFF_WEBHOOK_URL` | Optional Make.com webhook for handoff alerts |
| `BOOKING_URL` | Your Setmore link |

### 3. Run locally

```bash
npm install
DRY_RUN=true npm start
```

`DRY_RUN=true` logs replies instead of sending them. In a second terminal:

```bash
npm test
```

Dashboard: http://localhost:3000, enter your `ADMIN_TOKEN`.

### 4. Deploy

Railway or Render. Push the folder, set every `.env` value as an environment variable, and note the public URL.

### 5. Register the webhooks in Meta

Both channels can share one endpoint, but separate ones are cleaner.

- WhatsApp > Configuration > Callback URL: `https://YOUR-URL/webhook/whatsapp`, verify token = `WEBHOOK_VERIFY_TOKEN`. Subscribe to **messages**.
- Instagram > API setup with Instagram login > Webhooks: `https://YOUR-URL/webhook/instagram`, same verify token. Subscribe to **messages** and **messaging_postbacks**.

Then in the Instagram app: Settings > Messages and story replies > turn on **Allow access to messages**. Without it, Meta sends nothing.

### 6. Go live

Set `DRY_RUN=false`, message the business number and the Instagram account from your own phone, and watch the dashboard.

## Instagram 24-hour rule

Meta only lets you reply within 24 hours of the customer's last message. The bot replies in seconds so this is normally fine, but a handoff alert to `OWNER_WHATSAPP` will fail if you have not messaged the business WhatsApp number in the last 24 hours. Use `HANDOFF_WEBHOOK_URL` (Make.com to email or Slack) as the reliable alert channel.

## Tuning it

- **Bot too chatty or too formal**: edit `HOW TO WRITE` in `lib/brain.js`.
- **Bot hands off too often**: fill in more of `knowledge.md`. That is almost always the cause.
- **Bot hands off too rarely**: add cases to the `HANDOFF` list in `lib/brain.js`.
- **Cost**: switch `ANTHROPIC_MODEL` to `claude-haiku-4-5-20251001`.
- **History lost on restart**: conversations live in memory. Move `lib/store.js` to Supabase when you want durable history and reporting.

## Before you switch off DRY_RUN

- Every `[FILL IN]` in `knowledge.md` is filled or deliberately left for handoff
- `ADMIN_TOKEN` is long and random
- `META_APP_SECRET` is set, so forged webhooks are rejected
- You have sent yourself a test handoff alert and received it
