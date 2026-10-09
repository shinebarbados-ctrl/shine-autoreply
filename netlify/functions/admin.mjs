import { load, save, listConversations, pause, resume, addMessage, markSent, send } from '../../lib/bot.js';
import { getStore } from '@netlify/blobs';
// Admin API behind the dashboard. Everything here requires ADMIN_TOKEN.

const knowledgeStore = () => getStore({ name: 'shine-knowledge', consistency: 'strong' });


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

    // What the bot currently treats as fact. Returns the live override if one
    // has been saved, otherwise null, meaning the copy bundled at build time.
    if (action === 'knowledge' && req.method === 'GET') {
      const current = await knowledgeStore().get('current', { type: 'text' });
      return Response.json({
        source: current ? 'override' : 'bundled',
        bytes: current ? current.length : 0,
        text: current || null,
      });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    // Replace the knowledge base live. Takes effect within a minute, no redeploy.
    if (action === 'knowledge' && req.method === 'POST') {
      const text = typeof body.text === 'string' ? body.text : '';
      if (text.trim().length < 50) {
        return Response.json({ error: 'text too short, refusing to blank the knowledge base' }, { status: 400 });
      }
      await knowledgeStore().set('current', text);
      return Response.json({ ok: true, bytes: text.length });
    }

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
