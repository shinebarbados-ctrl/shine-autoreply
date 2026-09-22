// Local end-to-end test: fires fake Meta webhooks at the running server.
// Usage:  DRY_RUN=true npm start   (in one terminal)
//         npm test                 (in another)

const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.status;
}

const waMessage = (text, id) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          value: {
            contacts: [{ wa_id: '12465551234', profile: { name: 'Test Customer' } }],
            messages: [{ from: '12465551234', id, type: 'text', text: { body: text } }],
          },
        },
      ],
    },
  ],
});

const igMessage = (text, mid) => ({
  object: 'instagram',
  entry: [
    {
      messaging: [
        {
          sender: { id: 'ig-user-987' },
          recipient: { id: 'ig-shine' },
          message: { mid, text },
        },
      ],
    },
  ],
});

const cases = [
  ['whatsapp', 'Good morning, how much to detail the inside of my SUV?'],
  ['whatsapp', 'What time do you open on a Saturday?'], // not in KB -> should hand off
  ['whatsapp', 'Can I speak to someone please'], // -> handoff
  ['instagram', 'hey do you all do ceramic coating'],
];

let n = 0;
for (const [channel, text] of cases) {
  n += 1;
  const id = `test-${Date.now()}-${n}`;
  const status =
    channel === 'whatsapp'
      ? await post('/webhook/whatsapp', waMessage(text, id))
      : await post('/webhook/instagram', igMessage(text, id));
  console.log(`sent [${channel}] "${text}" -> HTTP ${status}`);
  await new Promise((r) => setTimeout(r, 9000)); // allow debounce + Claude call
}

console.log('\nDone. Check the server terminal for the [DRY_RUN] replies and [handoff] lines.');
