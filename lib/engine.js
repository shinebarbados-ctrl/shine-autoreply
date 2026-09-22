// Core loop: bundle rapid messages, ask Claude, send the reply, hand off when needed.

import { getConversation, addMessage, isPaused, pause, resume, firstSeen } from './store.js';
import { generateReply } from './brain.js';
import { send, markRead } from './channels.js';
import { handoff } from './handoff.js';

const STOP_WORDS = ['stop', 'unsubscribe', 'opt out', 'optout'];
const HUMAN_WORDS = ['human', 'agent', 'real person', 'speak to someone', 'talk to someone', 'manager'];

// A normalised inbound message:
// { channel, userId, name, messageId, text, kind }
// kind: 'text' | 'media' | 'unsupported' | 'echo'
export async function handleIncoming(msg) {
  if (!firstSeen(msg.messageId)) return; // Meta retries webhooks

  const convo = getConversation(msg.channel, msg.userId);
  if (msg.name) convo.name = msg.name;

  // A message sent by the business from the Meta inbox means a human is in the chat
  if (msg.kind === 'echo') {
    pause(convo, Number(process.env.HANDOFF_PAUSE_HOURS || 12), 'human replied manually');
    addMessage(convo, 'assistant', msg.text || '(sent by team)');
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
    return;
  }

  const text = (msg.text || '').trim();
  if (!text) return;

  const lower = text.toLowerCase();

  if (STOP_WORDS.some((w) => lower === w || lower.startsWith(w + ' '))) {
    pause(convo, 24 * 365, 'customer opted out');
    await deliver(convo, 'No problem, we will not message you again. Reply START at any time if you change your mind.');
    return;
  }
  if (lower === 'start' && isPaused(convo) && convo.pauseReason === 'customer opted out') {
    resume(convo);
    await deliver(convo, 'Welcome back. How can Shine Automotive help you today?');
    return;
  }

  addMessage(convo, 'user', text);

  if (isPaused(convo)) {
    console.log(`[engine] paused (${convo.pauseReason}), staying quiet for ${msg.channel}:${msg.userId}`);
    return;
  }

  if (HUMAN_WORDS.some((w) => lower.includes(w))) {
    await deliver(convo, 'Of course. I am passing you to one of the Shine team now, they will be with you shortly.');
    await handoff(convo, 'customer asked for a human', text);
    return;
  }

  // Debounce: wait in case the customer is still typing
  convo.pending.push(text);
  if (convo.timer) clearTimeout(convo.timer);
  const waitMs = Number(process.env.REPLY_DEBOUNCE_SECONDS || 4) * 1000;

  await new Promise((resolve) => {
    convo.timer = setTimeout(async () => {
      convo.timer = null;
      const bundled = convo.pending.join('\n');
      convo.pending = [];
      try {
        await respond(convo, bundled);
      } catch (err) {
        console.error('[engine] respond failed:', err.message);
      }
      resolve();
    }, waitMs);
  });
}

async function respond(convo, text) {
  const { text: reply, handoff: reason } = await generateReply(convo, text);
  await deliver(convo, reply);
  if (reason) await handoff(convo, reason, text);
}

async function deliver(convo, text) {
  addMessage(convo, 'assistant', text);
  try {
    await send(convo.channel, convo.userId, text);
    console.log(`[engine] replied on ${convo.channel} to ${convo.userId}`);
  } catch (err) {
    console.error(`[engine] send failed on ${convo.channel}:`, err.message);
  }
}
