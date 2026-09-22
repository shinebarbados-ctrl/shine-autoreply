// Alerts a human when the bot steps back, and pauses the bot in that chat.

import { pause } from './store.js';
import { sendWhatsApp } from './channels.js';

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
