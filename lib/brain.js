// Generates the reply with Claude, using knowledge.md as the only source of facts.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_PATH = path.join(__dirname, '..', 'knowledge.md');

let kbCache = { text: '', mtime: 0 };

function knowledge() {
  try {
    const stat = fs.statSync(KB_PATH);
    if (stat.mtimeMs !== kbCache.mtime) {
      kbCache = { text: fs.readFileSync(KB_PATH, 'utf8'), mtime: stat.mtimeMs };
    }
  } catch {
    kbCache = { text: '(knowledge file missing)', mtime: 0 };
  }
  return kbCache.text;
}

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const CHANNEL_NOTE = {
  whatsapp: 'This is WhatsApp. Plain text only. Short paragraphs, no markdown headings, no asterisks for bold.',
  instagram: 'This is an Instagram DM. Keep it under 500 characters, casual, no markdown, at most one emoji.',
};

function systemPrompt(channel) {
  const bookingUrl = process.env.BOOKING_URL?.trim();
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
${knowledge()}
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
      system: systemPrompt(convo.channel),
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
