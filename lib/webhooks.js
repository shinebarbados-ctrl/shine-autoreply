// Parse Meta webhook payloads (WhatsApp Cloud API + Instagram Messaging) into
// a single normalised message shape, and verify request signatures.

import crypto from 'node:crypto';
import { wasSentByBot } from './store.js';

export function verifySignature(req, secret) {
  if (!secret) return true; // not configured, skip (set META_APP_SECRET in production)
  const header = req.get('x-hub-signature-256');
  if (!header || !req.rawBody) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  const a = Buffer.from(header);
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
        if (s.status === 'sent' && !wasSentByBot(s.id)) {
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
        if (wasSentByBot(m.mid)) continue;
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
