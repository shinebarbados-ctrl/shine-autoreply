// In-memory conversation store.
// Keeps recent messages per customer, handoff/pause state, and processed message IDs.
// Swap for Supabase later if history must survive restarts.

const MAX_HISTORY = 20;
const HISTORY_TTL_MS = 48 * 60 * 60 * 1000; // forget chats idle for 48h
const SEEN_TTL_MS = 60 * 60 * 1000;

const conversations = new Map(); // key: `${channel}:${userId}`
const seenIds = new Map(); // messageId -> timestamp
const sentIds = new Set(); // IDs of messages the bot itself sent (echo detection)

export const key = (channel, userId) => `${channel}:${userId}`;

export function getConversation(channel, userId) {
  const k = key(channel, userId);
  let c = conversations.get(k);
  if (!c) {
    c = {
      channel,
      userId,
      name: null,
      history: [],
      pausedUntil: 0,
      pauseReason: null,
      lastActivity: Date.now(),
      pending: [],
      timer: null,
    };
    conversations.set(k, c);
  }
  return c;
}

export function addMessage(convo, role, content) {
  convo.history.push({ role, content, at: Date.now() });
  if (convo.history.length > MAX_HISTORY) {
    convo.history.splice(0, convo.history.length - MAX_HISTORY);
  }
  convo.lastActivity = Date.now();
}

export function isPaused(convo) {
  return convo.pausedUntil > Date.now();
}

export function pause(convo, hours, reason) {
  convo.pausedUntil = Date.now() + hours * 60 * 60 * 1000;
  convo.pauseReason = reason;
}

export function resume(convo) {
  convo.pausedUntil = 0;
  convo.pauseReason = null;
}

// Returns true the first time an ID is seen (Meta retries webhooks, so dedupe)
export function firstSeen(id) {
  if (!id) return true;
  if (seenIds.has(id)) return false;
  seenIds.set(id, Date.now());
  return true;
}

export function markSent(id) {
  if (id) sentIds.add(id);
  if (sentIds.size > 5000) sentIds.clear();
}

export function wasSentByBot(id) {
  return sentIds.has(id);
}

export function listConversations() {
  return [...conversations.values()]
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .map((c) => ({
      channel: c.channel,
      userId: c.userId,
      name: c.name,
      paused: isPaused(c),
      pausedUntil: c.pausedUntil ? new Date(c.pausedUntil).toISOString() : null,
      pauseReason: c.pauseReason,
      lastActivity: new Date(c.lastActivity).toISOString(),
      messages: c.history.length,
      lastMessage: c.history.at(-1)?.content?.slice(0, 160) ?? null,
    }));
}

export function findConversation(channel, userId) {
  return conversations.get(key(channel, userId)) || null;
}

// Housekeeping
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, c] of conversations) {
    if (now - c.lastActivity > HISTORY_TTL_MS) conversations.delete(k);
  }
  for (const [id, t] of seenIds) {
    if (now - t > SEEN_TTL_MS) seenIds.delete(id);
  }
}, 10 * 60 * 1000);
if (typeof sweeper.unref === 'function') sweeper.unref();
