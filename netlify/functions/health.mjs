export default async () =>
  Response.json({
    ok: true,
    dryRun: String(process.env.DRY_RUN).toLowerCase() === 'true',
    whatsapp: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TOKEN),
    instagram: Boolean(process.env.IG_ACCOUNT_ID && process.env.IG_ACCESS_TOKEN),
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    signatureChecking: Boolean(process.env.META_APP_SECRET),
    at: new Date().toISOString(),
  });

export const config = { path: '/health' };
