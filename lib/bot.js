// Shine Automotive auto-reply — single module.
//
// Consolidated from separate files so the whole bot can be reviewed and
// deployed as one unit. Sections below, in order:
//   1. Knowledge base (generated from knowledge.md)
//   2. Store        — conversation state on Netlify Blobs
//   3. Channels     — sending to WhatsApp and Instagram
//   4. Brain        — the Claude call and its guardrails
//   5. Handoff      — alerting a human and pausing the bot
//   6. Engine       — the decision loop
//   7. Webhooks     — parsing Meta payloads, verifying signatures

import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { getStore } from '@netlify/blobs';

// ============ 1. KNOWLEDGE BASE ============

// GENERATED from knowledge.md. Edit the .md and regenerate, or override at
// runtime by writing a "current" entry into the shine-knowledge blob store.
const bundledKnowledge = "# Shine Automotive knowledge base\n\n> This is the only thing the bot may state as fact. Anything marked FILL IN is unknown: the bot does not guess it, it hands the chat to a human instead.\n\n## Business\n- Name: Shine Automotive Inc.\n- What we are: vehicle protection and lifecycle company in Barbados\n- Address: Black Rock Main Road, St. Michael, Barbados\n- Phone and WhatsApp: 1-246-252-9099\n- Email: shinebarbados@gmail.com\n- Opening hours: Monday to Saturday, 8am to 5pm. Closed Sunday.\n- Payment methods: card, cash, bank transfer\n- Deposit policy: no deposit required to book\n- Service location: drop-off at Black Rock Main Road only. We do not offer mobile or on-site detailing at the moment.\n- Cancellation policy: cancel or reschedule free of charge more than 24 hours ahead. Inside 24 hours a small fee may apply. If a customer asks what that fee is, hand off.\n\nAll prices are in BBD and are listed as Car / SUV / Pick-up.\n\n## Express services, about 2 hours\n| Service | Car | SUV | Pick-up | What it is |\n|---|---|---|---|---|\n| Quick Shine | $40 | $50 | $60 | Exterior foam wash and towel dry. Routine upkeep, no interior |\n| Wax Pack | $75 | $85 | $95 | Full wash plus spray wax. Up to 4 weeks of protection |\n| Shine and Seal | $75 | $75 | $95 | Exterior wash plus sealant. Gloss, water beading, up to 8 weeks of protection |\n| Gloss Boss | $90 | $100 | $115 | Premium wash and interior clean, high gloss spray, trim restoration |\n| Headlight Restoration with sealant | $60 | $60 | $60 | Restores clarity, seals against oxidisation |\n| Pick 3 combo | $99 | $99 | $99 | Choose any 3 on arrival: Super Shine, Foam Up, Wax Pack, headlight restoration, vent cleanse, engine wipe down, interior steam. About 1.5 hours |\n\n## Interior detailing\nSignature packages run about 7 hours and start at the 8am slot only, so the vehicle is with us most of the working day.\n\n| Package | Car | SUV | Pick-up | What it is |\n|---|---|---|---|---|\n| Sparkle | $275 | $275 | $275 | Seats, roof panels, interior vacuum, foam wash, wax, headlight restoration |\n| Glow | $325 | $325 | $325 | Sparkle plus hybrid wax paint enhancement and engine wipe down |\n| Radiant | $375 | $375 | $375 | Glow plus carpet extraction and odour neutralisation |\n| Lavish Leather | $300 | $350 | $379 | Leather clean and condition, exterior foam wash, headlight restoration, spray wax |\n| Sensitive Clean | $439 | $439 | $439 | Non toxic products, safe for electric vehicles, luxury interiors and sensitive electronics |\n| Carpet Extraction | $135 | $135 | $135 | Hot water extraction for stains, dirt and allergens. About 5 hours |\n| Odour Eliminator | $125 | $125 | $125 | Enzyme treatment. About 5 hours |\n\n## Exterior detailing and paint correction\n| Service | Car | SUV | Pick-up | Time | What it is |\n|---|---|---|---|---|---|\n| Windshield Polish | $50 | $50 | $50 | 20 min | Removes traffic film and haze |\n| Polymer Coating | $199 | $249 | $299 | 6 hrs | Synthetic coating, 6 months of durability, decontamination and clay bar |\n| Polish Plus | $250 | $300 | $350 | 7 hrs | Two stage polish for minor scratches, plus a basic interior clean |\n| Paint Correction | $349 | $399 | $449 | 8 hrs | Multi stage polishing, corrects swirls and scratches |\n| Show Room Shine | $499 | $599 | $699 | 12 hrs | Multi stage correction plus a professional polymer coating |\n\n## Combos\n| Service | Car | SUV | Pick-up | What it is |\n|---|---|---|---|---|\n| Total Shine | $425 | $475 | $525 | Full interior detail plus one stage exterior polish. About 8 hours, 8am start |\n| Clean and Cover | $615 | $615 | $615 | Interior detail plus seat covers and installation. About 8 hours, 8am start |\n\n## Shine Shield, ceramic coating and protection\n| Package | Car | SUV | Truck | What it is |\n|---|---|---|---|---|\n| Total Shield | $1,899 | $1,999 | $2,099 | Interior and exterior ceramic. Exterior ceramic coating, leather and fabric coating, glass coating, 3 maintenance cleans, DIY maintenance kit, 18 month guarantee |\n| ShieldEX | $1,299 | $1,399 | $1,499 | Exterior paint perfection and ceramic. Full paint perfection, windshield coating, interior clean, 2 maintenance cleans, 18 month warranty |\n| INShield | $689 | $749 | $829 | Interior fabric and leather coating. Full interior detail, exterior clean, leather and fabric coating |\n| Glass Shield | $359 | $459 | $559 | Glass perfection and coating. Water spot removal, glass coating, quick shine |\n\nHow long a coating lasts:\n- Total Shield and ShieldEX carry an 18 month guarantee.\n- Polymer Coating is a 6 month synthetic coating, not a ceramic.\n- A free assessment is available if the customer is not sure which package suits their vehicle.\n\nCoating aftercare the bot may state:\n- Do not wash the vehicle for the first 7 days while the coating cures.\n- No automatic car washes at any point. They void the warranty.\n- Use the complimentary maintenance cleans included in the package.\n- Any warranty issue must be reported within 7 days and needs an inspection.\n- For anything else about a warranty claim, hand off.\n\n## Shine Smart membership\nTiered Auto Care membership. 12 month commitment, billed monthly, 10% annual store credit on every tier.\n\n| Tier | Monthly |\n|---|---|\n| Essential | $99 |\n| Plus, most popular | $179 |\n| Elite | $349 |\n\n- Add on menu items are $10 each.\n- Founding Member offer: the first 25 members lock in 10% off their rate for life.\n- Auto Parts Direct is the exclusive parts partner and gives members a discount.\n- Enrol at form.jotform.com/261453523128049\n- For what is included in a specific tier, hand off. Do not list tier benefits.\n\n## Services we do NOT currently offer\nState these plainly rather than handing off, and do not suggest they may be available soon.\n- Mobile or on-site detailing. Drop-off only.\n- Alloy wheel restoration, the Wheelie service. Not available at the moment.\n- Vehicle inspections for private customers. Our vehicle inspection service is for banks and lenders only, arranged directly with the institution. If a private customer asks for an inspection, say we do not offer this to individuals.\n\n## Booking\n- Online booking: shineautomotive.setmore.com\n- Or reply with: name, vehicle make and model, service wanted, preferred date and time\n- Never promise a specific slot. Say the team will confirm the time.\n\n## FAQs\n- Do you come to me? No. We do not offer mobile detailing at the moment, so vehicles are dropped off at Black Rock Main Road.\n- How long will my car be with you? A full interior detail is most of the working day, roughly 7 to 8 hours from an 8am drop off. An express wash is about 2 hours.\n- Do I need to pay a deposit? No deposit is required to book.\n- Can I cancel? Yes, free more than 24 hours ahead. Inside 24 hours a small fee may apply.\n- How long does a ceramic coating last? Total Shield and ShieldEX carry an 18 month guarantee.\n- Do you do fleet or corporate accounts? Yes, a team member will follow up with a quote.\n";


// ============ 2. STORE ============
// Conversation state, backed by Netlify Blobs.
//
// Serverless functions keep nothing in memory between invocations, so every
// piece of state the bot relies on lives here: message history, the IDs we
// have already processed (Meta retries webhooks), the IDs we sent ourselves
// (so a human reply is distinguishable from the bot's own echo), and the
// pause window that keeps the bot quiet once a human steps in.
//
// Falls back to an in-process Map when Blobs is unavailable, which is what
// makes local testing possible. That fallback is NOT durable and is only
// used outside the Netlify runtime.


const MAX_HISTORY = 20;
const MAX_IDS = 60;
const HISTORY_TTL_MS = 48 * 60 * 60 * 1000;

const memory = new Map();
let blobs = null;
let blobsTried = false;

function store() {
  if (blobsTried) return blobs;
  blobsTried = true;
  try {
    blobs = getStore({ name: 'shine-conversations', consistency: 'strong' });
  } catch (err) {
    console.warn('[store] Netlify Blobs unavailable, using in-memory fallback:', err.message);
    blobs = null;
  }
  return blobs;
}

export const key = (channel, userId) => `${channel}__${String(userId).replace(/[^\w-]/g, '')}`;

function blank(channel, userId) {
  return {
    channel,
    userId,
    name: null,
    history: [],
    seen: [],
    sent: [],
    pausedUntil: 0,
    pauseReason: null,
    lastActivity: Date.now(),
    lastInboundAt: 0,
  };
}

export async function load(channel, userId) {
  const k = key(channel, userId);
  const s = store();
  if (!s) return memory.get(k) ? structuredClone(memory.get(k)) : blank(channel, userId);
  try {
    const got = await s.get(k, { type: 'json' });
    if (!got) return blank(channel, userId);
    // Expire conversations that have been idle a long time
    if (Date.now() - (got.lastActivity || 0) > HISTORY_TTL_MS) return blank(channel, userId);
    return got;
  } catch (err) {
    console.error('[store] load failed:', err.message);
    return blank(channel, userId);
  }
}

export async function save(convo) {
  convo.lastActivity = Date.now();
  if (convo.history.length > MAX_HISTORY) {
    convo.history = convo.history.slice(-MAX_HISTORY);
  }
  if (convo.seen.length > MAX_IDS) convo.seen = convo.seen.slice(-MAX_IDS);
  if (convo.sent.length > MAX_IDS) convo.sent = convo.sent.slice(-MAX_IDS);

  const k = key(convo.channel, convo.userId);
  const s = store();
  if (!s) {
    memory.set(k, structuredClone(convo));
    return;
  }
  try {
    await s.setJSON(k, convo);
  } catch (err) {
    console.error('[store] save failed:', err.message);
  }
}

// ---------- helpers that operate on a loaded conversation ----------

export function addMessage(convo, role, content) {
  convo.history.push({ role, content, at: Date.now() });
}

export function isPaused(convo) {
  return (convo.pausedUntil || 0) > Date.now();
}

export function pause(convo, hours, reason) {
  convo.pausedUntil = Date.now() + hours * 60 * 60 * 1000;
  convo.pauseReason = reason;
}

export function resume(convo) {
  convo.pausedUntil = 0;
  convo.pauseReason = null;
}

// True the first time this message ID is seen for this conversation.
export function firstSeen(convo, id) {
  if (!id) return true;
  if (convo.seen.includes(id)) return false;
  convo.seen.push(id);
  return true;
}

export function markSent(convo, id) {
  if (id && !convo.sent.includes(id)) convo.sent.push(id);
}

export function wasSentByBot(convo, id) {
  return Boolean(id) && convo.sent.includes(id);
}

// ---------- listing, for the dashboard ----------

export async function listConversations() {
  const s = store();
  if (!s) {
    return [...memory.values()].sort((a, b) => b.lastActivity - a.lastActivity).map(summary);
  }
  try {
    const { blobs: entries } = await s.list();
    const out = [];
    for (const entry of entries) {
      const c = await s.get(entry.key, { type: 'json' });
      if (c) out.push(summary(c));
    }
    return out.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
  } catch (err) {
    console.error('[store] list failed:', err.message);
    return [];
  }
}

function summary(c) {
  return {
    channel: c.channel,
    userId: c.userId,
    name: c.name,
    paused: isPaused(c),
    pausedUntil: c.pausedUntil ? new Date(c.pausedUntil).toISOString() : null,
    pauseReason: c.pauseReason,
    lastActivity: new Date(c.lastActivity).toISOString(),
    messages: c.history.length,
    lastMessage: c.history.at(-1)?.content?.slice(0, 160) ?? null,
  };
}


// ============ 3. CHANNELS ============
// Outbound senders for WhatsApp Cloud API and Instagram Messaging API.
// Each sender returns the provider's message ID so the caller can record it
// against the conversation; that is how we later tell our own echo apart from
// a human on the team replying from the Meta inbox.

const graph = () => `https://graph.facebook.com/${process.env.GRAPH_VERSION || 'v23.0'}`;
const dryRun = () => String(process.env.DRY_RUN).toLowerCase() === 'true';

async function post(url, body, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.error?.message || JSON.stringify(json);
    throw new Error(`${res.status} ${detail}`);
  }
  return json;
}

// WhatsApp: text is capped at 4096 chars
export async function sendWhatsApp(to, text) {
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: true, body: text.slice(0, 4000) },
  };
  if (dryRun()) {
    console.log(`[DRY_RUN] whatsapp -> ${to}: ${text}`);
    return null;
  }
  const json = await post(
    `${graph()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    body,
    process.env.WHATSAPP_TOKEN,
  );
  return json?.messages?.[0]?.id ?? null;
}

// Instagram: DM text is capped at 1000 chars
export async function sendInstagram(to, text) {
  const body = {
    recipient: { id: to },
    message: { text: text.slice(0, 950) },
  };
  if (dryRun()) {
    console.log(`[DRY_RUN] instagram -> ${to}: ${text}`);
    return null;
  }
  const json = await post(
    `${graph()}/${process.env.IG_ACCOUNT_ID}/messages`,
    body,
    process.env.IG_ACCESS_TOKEN,
  );
  return json?.message_id ?? null;
}

export function send(channel, to, text) {
  return channel === 'instagram' ? sendInstagram(to, text) : sendWhatsApp(to, text);
}

// Mark a WhatsApp message read so the customer sees the blue ticks
export async function markRead(messageId) {
  if (!messageId || dryRun()) return;
  try {
    await post(
      `${graph()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      process.env.WHATSAPP_TOKEN,
    );
  } catch (err) {
    console.warn('[channels] markRead failed:', err.message);
  }
}


// ============ 4. BRAIN ============
// Generates the reply with Claude, using the knowledge base as the only
// source of facts.
//
// The knowledge base is bundled at build time, but can be overridden at
// runtime by writing a "current" entry into the shine-knowledge blob store.
// That means the bot's answers can be corrected without a redeploy.


let cached = null;
let cachedAt = 0;
const CACHE_MS = 60 * 1000;

async function knowledge() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  let text = bundledKnowledge;
  try {
    const store = getStore({ name: 'shine-knowledge', consistency: 'strong' });
    const override = await store.get('current', { type: 'text' });
    if (override && override.trim().length > 50) text = override;
  } catch {
    // No blob store available (local run, or not configured). Bundled copy stands.
  }
  cached = text;
  cachedAt = Date.now();
  return text;
}

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const CHANNEL_NOTE = {
  whatsapp: 'This is WhatsApp. Plain text only. Short paragraphs, no markdown headings, no asterisks for bold.',
  instagram: 'This is an Instagram DM. Keep it under 500 characters, casual, no markdown, at most one emoji.',
};

async function systemPrompt(channel) {
  const bookingUrl = process.env.BOOKING_URL?.trim();
  const kb = await knowledge();
  return `You are the front-desk assistant for Shine Automotive Inc., a vehicle protection and detailing company in Barbados. You are answering a customer message.

${CHANNEL_NOTE[channel] || CHANNEL_NOTE.whatsapp}

HOW TO WRITE
- Warm, brief, Bajan-friendly business tone. Two to four sentences most of the time.
- British spelling. All prices in BBD.
- Never say you are an AI unless asked directly; if asked, say you are Shine's automated assistant and a team member can jump in.
- One question at a time. Move the customer towards booking.
${bookingUrl ? `- When they are ready to book, share this link: ${bookingUrl}` : '- To book, collect: name, vehicle make/model, service wanted, preferred date and time.'}

HARD RULES
- Use ONLY the facts in the knowledge base below. Never invent a price, a duration, an opening time, or a policy.
- If the answer is not in the knowledge base, or is marked [FILL IN], do not guess. Say a team member will confirm shortly, and hand off.
- Never promise a specific appointment slot. Say the team will confirm the time.
- Never discuss refunds, complaints, damage claims, legal matters, or anything about another customer. Hand off.

HANDOFF
When a human should take over, end your entire reply with this exact tag on its own final line:
[[HANDOFF: short reason]]
Write a natural holding message before the tag (for example: "Let me get one of the team to confirm that for you, they will come back to you shortly."). The tag is stripped before sending, the customer never sees it.
Hand off when: the customer asks for something not in the knowledge base, asks for a discount or custom quote, complains, sounds upset, asks for the owner, wants to change or cancel a confirmed booking, is a supplier/press/recruiter, or explicitly asks for a human.

KNOWLEDGE BASE
---
${kb}
---`;
}

export function stripHandoff(text) {
  const match = text.match(/\[\[HANDOFF:\s*([^\]]*)\]\]/i);
  const clean = text.replace(/\[\[HANDOFF:[^\]]*\]\]/gi, '').trim();
  return { text: clean, handoff: match ? match[1].trim() || 'unspecified' : null };
}

const FALLBACK =
  'Thanks for reaching out to Shine Automotive. One of the team will get back to you shortly.';

export async function generateReply(convo, incomingText) {
  if (!client) {
    return { text: FALLBACK, handoff: 'ANTHROPIC_API_KEY not configured' };
  }

  const messages = convo.history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));

  if (!messages.length || messages.at(-1).content !== incomingText) {
    messages.push({ role: 'user', content: incomingText });
  }

  // Claude requires the first message to be from the user
  while (messages.length && messages[0].role !== 'user') messages.shift();

  try {
    const res = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      max_tokens: 500,
      system: await systemPrompt(convo.channel),
      messages,
    });
    const raw = res.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!raw) return { text: FALLBACK, handoff: 'empty model response' };
    return stripHandoff(raw);
  } catch (err) {
    console.error('[brain] Claude call failed:', err.message);
    return { text: FALLBACK, handoff: `AI error: ${err.message}` };
  }
}


// ============ 5. HANDOFF ============
// Alerts a human when the bot steps back, and pauses the bot in that chat.
// Pausing mutates the conversation; the caller is responsible for saving it.


export async function handoff(convo, reason, lastCustomerMessage) {
  const hours = Number(process.env.HANDOFF_PAUSE_HOURS || 12);
  pause(convo, hours, reason);

  const payload = {
    event: 'handoff',
    channel: convo.channel,
    customerId: convo.userId,
    customerName: convo.name,
    reason,
    lastCustomerMessage,
    pausedForHours: hours,
    at: new Date().toISOString(),
  };

  console.log('[handoff]', JSON.stringify(payload));

  const tasks = [];

  const hook = process.env.HANDOFF_WEBHOOK_URL?.trim();
  if (hook) {
    tasks.push(
      fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((err) => console.warn('[handoff] webhook failed:', err.message)),
    );
  }

  const owner = process.env.OWNER_WHATSAPP?.trim();
  if (owner) {
    const alert = [
      'Shine bot needs you',
      `Channel: ${convo.channel}`,
      `Customer: ${convo.name || convo.userId}`,
      `Reason: ${reason}`,
      `They said: ${String(lastCustomerMessage).slice(0, 300)}`,
      `Bot is silent in this chat for ${hours}h.`,
    ].join('\n');
    tasks.push(
      sendWhatsApp(owner, alert).catch((err) =>
        console.warn('[handoff] owner alert failed (24h window may be closed):', err.message),
      ),
    );
  }

  await Promise.allSettled(tasks);
}


// ============ 6. ENGINE ============
// Core loop, adapted for serverless.
//
// The important difference from a long-running server: nothing is held in
// memory between messages. Every invocation loads the conversation, decides,
// and saves it back. The typing debounce works by timestamp rather than by a
// timer held open across requests.


const STOP_WORDS = ['stop', 'unsubscribe', 'opt out', 'optout'];
const HUMAN_WORDS = ['human', 'agent', 'real person', 'speak to someone', 'talk to someone', 'manager'];

export async function handleIncoming(msg) {
  if (!msg.userId) return;

  const convo = await load(msg.channel, msg.userId);
  if (msg.name) convo.name = msg.name;

  // Meta retries webhooks, so each message ID is handled once only.
  if (!firstSeen(convo, msg.messageId)) {
    await save(convo);
    return;
  }

  // A message the business sent that we did not send means a human is in the
  // chat. Step back and let them run it.
  if (msg.kind === 'echo') {
    const rawId = String(msg.messageId).replace(/^echo:/, '');
    if (wasSentByBot(convo, rawId)) {
      await save(convo);
      return;
    }
    pause(convo, Number(process.env.HANDOFF_PAUSE_HOURS || 12), 'human replied manually');
    addMessage(convo, 'assistant', msg.text || '(sent by team)');
    await save(convo);
    console.log(`[engine] human replied in ${msg.channel}:${msg.userId}, bot paused`);
    return;
  }

  if (msg.channel === 'whatsapp') markRead(msg.messageId);

  if (msg.kind === 'media' || msg.kind === 'unsupported') {
    addMessage(convo, 'user', '(customer sent an attachment)');
    if (!isPaused(convo)) {
      await deliver(convo, 'Thanks, we have received that. One of the team will take a look and come back to you shortly.');
      await handoff(convo, 'customer sent an attachment', '(attachment)');
    }
    await save(convo);
    return;
  }

  const text = (msg.text || '').trim();
  if (!text) {
    await save(convo);
    return;
  }

  const lower = text.toLowerCase();

  if (STOP_WORDS.some((w) => lower === w || lower.startsWith(w + ' '))) {
    pause(convo, 24 * 365, 'customer opted out');
    await deliver(convo, 'No problem, we will not message you again. Reply START at any time if you change your mind.');
    await save(convo);
    return;
  }

  if (lower === 'start' && isPaused(convo) && convo.pauseReason === 'customer opted out') {
    resume(convo);
    await deliver(convo, 'Welcome back. How can Shine Automotive help you today?');
    await save(convo);
    return;
  }

  addMessage(convo, 'user', text);
  convo.lastInboundAt = Date.now();
  const myStamp = convo.lastInboundAt;
  await save(convo);

  if (isPaused(convo)) {
    console.log(`[engine] paused (${convo.pauseReason}), staying quiet for ${msg.channel}:${msg.userId}`);
    return;
  }

  if (HUMAN_WORDS.some((w) => lower.includes(w))) {
    await deliver(convo, 'Of course. I am passing you to one of the Shine team now, they will be with you shortly.');
    await handoff(convo, 'customer asked for a human', text);
    await save(convo);
    return;
  }

  // Typing debounce. Wait briefly, then reload. If another message arrived in
  // the meantime, that later invocation owns the reply and this one bows out,
  // so a customer typing three lines gets one answer rather than three.
  const waitMs = Number(process.env.REPLY_DEBOUNCE_SECONDS || 3) * 1000;
  if (waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
    const fresh = await load(msg.channel, msg.userId);
    if ((fresh.lastInboundAt || 0) > myStamp) {
      console.log('[engine] superseded by a newer message, standing down');
      return;
    }
    // Carry on with the freshest view of the conversation
    Object.assign(convo, fresh);
  }

  const bundled = convo.history
    .filter((m) => m.role === 'user')
    .slice(-5)
    .map((m) => m.content)
    .join('\n');

  try {
    const { text: reply, handoff: reason } = await generateReply(convo, bundled || text);
    await deliver(convo, reply);
    if (reason) await handoff(convo, reason, text);
  } catch (err) {
    console.error('[engine] reply failed:', err.message);
    await deliver(convo, 'Thanks for reaching out to Shine Automotive. One of the team will get back to you shortly.');
    await handoff(convo, `error: ${err.message}`, text);
  }
  await save(convo);
}

async function deliver(convo, text) {
  addMessage(convo, 'assistant', text);
  try {
    const id = await send(convo.channel, convo.userId, text);
    if (id) markSent(convo, id);
    console.log(`[engine] replied on ${convo.channel} to ${convo.userId}`);
  } catch (err) {
    console.error(`[engine] send failed on ${convo.channel}:`, err.message);
  }
}


// ============ 7. WEBHOOKS ============
// Parse Meta webhook payloads (WhatsApp Cloud API + Instagram Messaging) into
// a single normalised message shape, and verify request signatures.


export function verifySignatureRaw(rawBody, headerValue, secret) {
  if (!secret) return true; // not configured; set META_APP_SECRET in production
  if (!headerValue || typeof rawBody !== 'string') return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- WhatsApp ----------
export function parseWhatsApp(body) {
  const out = [];
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const contacts = value.contacts || [];
      for (const m of value.messages || []) {
        const contact = contacts.find((c) => c.wa_id === m.from) || contacts[0];
        out.push({
          channel: 'whatsapp',
          userId: m.from,
          name: contact?.profile?.name || null,
          messageId: m.id,
          text:
            m.type === 'text'
              ? m.text?.body
              : m.type === 'button'
                ? m.button?.text
                : m.type === 'interactive'
                  ? m.interactive?.button_reply?.title || m.interactive?.list_reply?.title
                  : null,
          kind:
            m.type === 'text' || m.type === 'button' || m.type === 'interactive'
              ? 'text'
              : ['image', 'video', 'audio', 'document', 'sticker', 'voice'].includes(m.type)
                ? 'media'
                : 'unsupported',
        });
      }
      // Outbound messages sent from the Meta/WhatsApp Manager inbox by a human
      for (const s of value.statuses || []) {
        if (s.status === 'sent') {
          out.push({
            channel: 'whatsapp',
            userId: s.recipient_id,
            messageId: `echo:${s.id}`,
            kind: 'echo',
            text: null,
          });
        }
      }
    }
  }
  return out;
}

// ---------- Instagram ----------
export function parseInstagram(body) {
  const out = [];
  for (const entry of body.entry || []) {
    const events = entry.messaging || entry.standby || [];
    for (const ev of events) {
      const m = ev.message;
      if (!m) continue;
      if (m.is_deleted) continue;

      // is_echo = sent by the business account (bot itself or a human in the IG inbox)
      if (m.is_echo) {
        out.push({
          channel: 'instagram',
          userId: ev.recipient?.id,
          messageId: `echo:${m.mid}`,
          kind: 'echo',
          text: m.text || null,
        });
        continue;
      }

      const hasAttachment = Array.isArray(m.attachments) && m.attachments.length > 0;
      out.push({
        channel: 'instagram',
        userId: ev.sender?.id,
        name: null,
        messageId: m.mid,
        text: m.text || null,
        kind: m.text ? 'text' : hasAttachment ? 'media' : 'unsupported',
      });
    }
  }
  return out;
}

export function parse(body) {
  if (body?.object === 'whatsapp_business_account') return parseWhatsApp(body);
  if (body?.object === 'instagram' || body?.object === 'page') return parseInstagram(body);
  return [];
}
