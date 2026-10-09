import { parseWhatsApp, verifySignatureRaw, handleIncoming } from '../../lib/bot.js';

export default async (req) => {
  const url = new URL(req.url);

  // Meta's verification handshake
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
      console.log('[webhook] whatsapp verified');
      return new Response(challenge, { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const raw = await req.text();
  const sig = req.headers.get('x-hub-signature-256');
  if (!verifySignatureRaw(raw, sig, process.env.META_APP_SECRET)) {
    console.warn('[webhook] whatsapp bad signature');
    return new Response('forbidden', { status: 403 });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const messages = parseWhatsApp(body);
  // Process sequentially: two messages from the same customer must not race
  // each other over the same stored conversation.
  for (const m of messages) {
    try {
      await handleIncoming(m);
    } catch (err) {
      console.error('[webhook] handler error:', err.message);
    }
  }

  return new Response('ok', { status: 200 });
};

export const config = { path: '/webhook/whatsapp' };
