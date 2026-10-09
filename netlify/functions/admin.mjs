// Admin API behind the dashboard. Everything here requires ADMIN_TOKEN.

import { load, save, listConversations, pause, resume, addMessage, markSent, send } from '../../lib/bot.js';

function authed(req) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false;
  const url = new URL(req.url);
  const given = req.headers.get('x-admin-token') || url.searchParams.get('token');
  return given === token;
}

export default async (req) => {
  if (!process.env.ADMIN_TOKEN) {
    return Response.json({ error: 'ADMIN_TOKEN not set' }, { status: 500 });
  }
  if (!authed(req)) return Response.json({ error: 'unauthorised' }, { status: 401 });

  const url = new URL(req.url);
  const action = url.pathname.replace(/^.*\/admin\/?/, '').replace(/\/$/, '');

  try {
    if (action === 'conversations' && req.method === 'GET') {
      return Response.json(await listConversations());
    }

    if (action === 'conversation' && req.method === 'GET') {
      const channel = url.searchParams.get('channel');
      const userId = url.searchParams.get('userId');
      const c = await load(channel, userId);
      if (!c.history.length && !c.name) return Response.json({ error: 'not found' }, { status: 404 });
      return Response.json({ channel: c.channel, userId: c.userId, name: c.name, history: c.history });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    if (action === 'pause' && req.method === 'POST') {
      const c = await load(body.channel, body.userId);
      pause(c, Number(body.hours || 12), 'paused from dashboard');
      await save(c);
      return Response.json({ ok: true });
    }

    if (action === 'resume' && req.method === 'POST') {
      const c = await load(body.channel, body.userId);
      resume(c);
      await save(c);
      return Response.json({ ok: true });
    }

    if (action === 'send' && req.method === 'POST') {
      const { channel, userId, text } = body;
      if (!channel || !userId || !text) {
        return Response.json({ error: 'channel, userId and text required' }, { status: 400 });
      }
      const c = await load(channel, userId);
      const id = await send(channel, userId, text);
      if (id) markSent(c, id);
      addMessage(c, 'assistant', text);
      pause(c, Number(process.env.HANDOFF_PAUSE_HOURS || 12), 'human replied from dashboard');
      await save(c);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'unknown action' }, { status: 404 });
  } catch (err) {
    console.error('[admin]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: '/admin/*' };
