/// <reference types="@cloudflare/workers-types" />
/**
 * Cloudflare Pages Function: POST /api/waitlist
 * Progressive enhancement: works as a normal form POST (no JS required).
 *
 * Payload shape ready for ESP wiring:
 *   { email, first_name, season?, source, user_agent, ip }
 */

interface Env {
  WAITLIST?: KVNamespace;
  // Optional: WAITLIST_WEBHOOK_URL for a future ESP / Zapier seam
  WAITLIST_WEBHOOK_URL?: string;
}

type WaitlistBody = {
  email: string;
  first_name: string;
  season?: string;
  company?: string; // honeypot
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 8;

function redirect(location: string, status = 303): Response {
  return new Response(null, {
    status,
    headers: { Location: location },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function parseBody(request: Request): Promise<WaitlistBody> {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const body = (await request.json()) as WaitlistBody;
    return {
      email: String(body.email ?? '').trim(),
      first_name: String(body.first_name ?? '').trim(),
      season: body.season ? String(body.season).trim() : undefined,
      company: body.company ? String(body.company).trim() : undefined,
    };
  }
  const form = await request.formData();
  return {
    email: String(form.get('email') ?? '').trim(),
    first_name: String(form.get('first_name') ?? '').trim(),
    season: String(form.get('season') ?? '').trim() || undefined,
    company: String(form.get('company') ?? '').trim() || undefined,
  };
}

async function rateLimited(env: Env, ip: string): Promise<boolean> {
  if (!env.WAITLIST) return false;
  const key = `rl:${ip}`;
  const raw = await env.WAITLIST.get(key);
  const now = Date.now();
  let hits: number[] = [];
  if (raw) {
    try {
      hits = (JSON.parse(raw) as number[]).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    } catch {
      hits = [];
    }
  }
  if (hits.length >= RATE_LIMIT_MAX) return true;
  hits.push(now);
  await env.WAITLIST.put(key, JSON.stringify(hits), {
    expirationTtl: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
  });
  return false;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const wantsJson =
    (request.headers.get('accept') || '').includes('application/json') ||
    (request.headers.get('content-type') || '').includes('application/json');

  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';

  try {
    if (await rateLimited(env, ip)) {
      if (wantsJson) return json({ ok: false, error: 'rate_limited' }, 429);
      return redirect('/?waitlist=rate_limited');
    }

    const body = await parseBody(request);

    // Honeypot filled => pretend success
    if (body.company) {
      if (wantsJson) return json({ ok: true });
      return redirect('/thanks');
    }

    if (!body.email || !EMAIL_RE.test(body.email)) {
      if (wantsJson) return json({ ok: false, error: 'invalid_email' }, 400);
      return redirect('/?waitlist=invalid_email');
    }

    if (!body.first_name || body.first_name.length > 80) {
      if (wantsJson) return json({ ok: false, error: 'invalid_name' }, 400);
      return redirect('/?waitlist=invalid_name');
    }

    const payload = {
      email: body.email.toLowerCase(),
      first_name: body.first_name,
      season: body.season || null,
      source: 'homepage',
      user_agent: request.headers.get('user-agent') || '',
      ip,
      created_at: new Date().toISOString(),
    };

    // Persist to KV when bound (idempotent-ish by email key).
    if (env.WAITLIST) {
      const key = `signup:${payload.email}`;
      const existing = await env.WAITLIST.get(key);
      if (!existing) {
        await env.WAITLIST.put(key, JSON.stringify(payload));
      }
    }

    // TODO: wire to ESP
    // Expected seam: POST payload to WAITLIST_WEBHOOK_URL or ESP SDK.
    // Payload shape: { email, first_name, season, source, user_agent, ip, created_at }
    if (env.WAITLIST_WEBHOOK_URL) {
      try {
        await fetch(env.WAITLIST_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {
        // Do not fail the user-facing signup if the ESP seam errors.
      }
    } else {
      console.log('[waitlist] signup (ESP not wired)', JSON.stringify(payload));
    }

    if (wantsJson) return json({ ok: true, redirect: '/thanks' });
    return redirect('/thanks');
  } catch (err) {
    console.error('[waitlist] error', err);
    if (wantsJson) return json({ ok: false, error: 'server_error' }, 500);
    return redirect('/?waitlist=error');
  }
};

export const onRequestGet: PagesFunction = async () => {
  return redirect('/');
};
