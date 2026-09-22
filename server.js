import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse, verifySignature } from './lib/webhooks.js';
import { handleIncoming } from './lib/engine.js';
import { listConversations, findConversation, pause, resume } from './lib/store.js';
import { send } from './lib/channels.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Keep the raw body so webhook signatures can be verified
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) =>
  res.json({
    ok: true,
    dryRun: String(process.env.DRY_RUN).toLowerCase() === 'true',
    whatsapp: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TOKEN),
    instagram: Boolean(process.env.IG_ACCOUNT_ID && process.env.IG_ACCESS_TOKEN),
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    uptimeSeconds: Math.round(process.uptime()),
  }),
);

// ---------- Webhook verification (Meta GET handshake) ----------
function verifyHandshake(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('[webhook] verified');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

app.get('/webhook/whatsapp', verifyHandshake);
app.get('/webhook/instagram', verifyHandshake);
app.get('/webhook', verifyHandshake); // one shared endpoint also works

// ---------- Webhook receiver ----------
async function receive(req, res, secret) {
  if (!verifySignature(req, secret)) {
    console.warn('[webhook] bad signature');
    return res.sendStatus(403);
  }
  res.sendStatus(200); // acknowledge fast, Meta retries after 20s

  const messages = parse(req.body);
  for (const m of messages) {
    if (!m.userId) continue;
    handleIncoming(m).catch((err) => console.error('[webhook] handler error:', err.message));
  }
}

app.post('/webhook/whatsapp', (req, res) => receive(req, res, process.env.META_APP_SECRET));
app.post('/webhook/instagram', (req, res) =>
  receive(req, res, process.env.IG_APP_SECRET || process.env.META_APP_SECRET),
);
app.post('/webhook', (req, res) => receive(req, res, process.env.META_APP_SECRET));

// ---------- Admin API (used by the dashboard) ----------
function auth(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return res.status(500).json({ error: 'ADMIN_TOKEN not set' });
  const given = req.get('x-admin-token') || req.query.token;
  if (given !== token) return res.status(401).json({ error: 'unauthorised' });
  next();
}

app.get('/admin/conversations', auth, (_req, res) => res.json(listConversations()));

app.get('/admin/conversation', auth, (req, res) => {
  const c = findConversation(req.query.channel, req.query.userId);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json({ channel: c.channel, userId: c.userId, name: c.name, history: c.history });
});

app.post('/admin/pause', auth, (req, res) => {
  const { channel, userId, hours = 12 } = req.body || {};
  const c = findConversation(channel, userId);
  if (!c) return res.status(404).json({ error: 'not found' });
  pause(c, Number(hours), 'paused from dashboard');
  res.json({ ok: true });
});

app.post('/admin/resume', auth, (req, res) => {
  const { channel, userId } = req.body || {};
  const c = findConversation(channel, userId);
  if (!c) return res.status(404).json({ error: 'not found' });
  resume(c);
  res.json({ ok: true });
});

// Send a message as the business, from the dashboard
app.post('/admin/send', auth, async (req, res) => {
  const { channel, userId, text } = req.body || {};
  if (!channel || !userId || !text) return res.status(400).json({ error: 'channel, userId and text required' });
  try {
    await send(channel, userId, text);
    const c = findConversation(channel, userId);
    if (c) {
      c.history.push({ role: 'assistant', content: text, at: Date.now() });
      pause(c, Number(process.env.HANDOFF_PAUSE_HOURS || 12), 'human replied from dashboard');
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Shine auto-reply listening on :${port}`);
  if (String(process.env.DRY_RUN).toLowerCase() === 'true') console.log('DRY_RUN is on, nothing will actually send');
});
