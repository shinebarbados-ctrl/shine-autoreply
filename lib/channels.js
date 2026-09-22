// Outbound senders for WhatsApp Cloud API and Instagram Messaging API.

import { markSent } from './store.js';

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
    return { dryRun: true };
  }
  const json = await post(
    `${graph()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    body,
    process.env.WHATSAPP_TOKEN,
  );
  markSent(json?.messages?.[0]?.id);
  return json;
}

// Instagram: DM text is capped at 1000 chars
export async function sendInstagram(to, text) {
  const body = {
    recipient: { id: to },
    message: { text: text.slice(0, 950) },
  };
  if (dryRun()) {
    console.log(`[DRY_RUN] instagram -> ${to}: ${text}`);
    return { dryRun: true };
  }
  const json = await post(
    `${graph()}/${process.env.IG_ACCOUNT_ID}/messages`,
    body,
    process.env.IG_ACCESS_TOKEN,
  );
  markSent(json?.message_id);
  return json;
}

export function send(channel, to, text) {
  return channel === 'instagram' ? sendInstagram(to, text) : sendWhatsApp(to, text);
}

// Mark a WhatsApp message as read so the customer sees the blue ticks
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
