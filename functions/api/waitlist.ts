/**
 * Cloudflare Pages Function: POST /api/waitlist
 * Writes to public.cohort_waitlist (same path as the SPA waitlist).
 * Progressive enhancement: works as a normal form POST (no JS required).
 *
 * Env:
 *   SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (preferred) or anon (insert policy allows)
 *   WAITLIST_COHORT (default cohort_2)
 *   META_PIXEL_ID + META_CAPI_ACCESS_TOKEN (optional Lead CAPI)
 *   WAITLIST KV (optional rate limit)
 */

interface Env {
  WAITLIST?: KVNamespace;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  WAITLIST_COHORT?: string;
  META_PIXEL_ID?: string;
  META_CAPI_ACCESS_TOKEN?: string;
  META_CAPI_TEST_EVENT_CODE?: string;
}

type WaitlistBody = {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  season?: string;
  /** Honeypot — reject when non-empty. */
  website_url?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  fbclid?: string;
  fbp?: string;
  fbc?: string;
  event_id?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 8;

function redirect(location: string, status = 303): Response {
  return new Response(null, { status, headers: { Location: location } });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pick(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

async function parseBody(request: Request): Promise<WaitlistBody> {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const body = (await request.json()) as WaitlistBody;
    return {
      email: String(body.email ?? "").trim(),
      first_name: String(body.first_name ?? "").trim(),
      last_name: String(body.last_name ?? "").trim(),
      phone: String(body.phone ?? "").trim(),
      season: body.season ? String(body.season).trim() : undefined,
      website_url: body.website_url ? String(body.website_url).trim() : undefined,
      utm_source: body.utm_source ? String(body.utm_source).trim() : undefined,
      utm_medium: body.utm_medium ? String(body.utm_medium).trim() : undefined,
      utm_campaign: body.utm_campaign ? String(body.utm_campaign).trim() : undefined,
      utm_content: body.utm_content ? String(body.utm_content).trim() : undefined,
      fbclid: body.fbclid ? String(body.fbclid).trim() : undefined,
      fbp: body.fbp ? String(body.fbp).trim() : undefined,
      fbc: body.fbc ? String(body.fbc).trim() : undefined,
      event_id: body.event_id ? String(body.event_id).trim() : undefined,
    };
  }
  const form = await request.formData();
  return {
    email: pick(form, "email"),
    first_name: pick(form, "first_name"),
    last_name: pick(form, "last_name"),
    phone: pick(form, "phone"),
    season: pick(form, "season") || undefined,
    website_url: pick(form, "website_url") || undefined,
    utm_source: pick(form, "utm_source") || undefined,
    utm_medium: pick(form, "utm_medium") || undefined,
    utm_campaign: pick(form, "utm_campaign") || undefined,
    utm_content: pick(form, "utm_content") || undefined,
    fbclid: pick(form, "fbclid") || undefined,
    fbp: pick(form, "fbp") || undefined,
    fbc: pick(form, "fbc") || undefined,
    event_id: pick(form, "event_id") || undefined,
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

async function sha256(value: string): Promise<string | null> {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendLeadCapi(env: Env, opts: {
  eventId: string;
  email: string;
  phone: string;
  fbp?: string;
  fbc?: string;
  ip: string;
  ua: string;
  sourceUrl: string;
}) {
  if (!env.META_PIXEL_ID || !env.META_CAPI_ACCESS_TOKEN) return;
  const em = await sha256(opts.email);
  const ph = await sha256(opts.phone.replace(/\D/g, ""));
  const user_data: Record<string, unknown> = {};
  if (em) user_data.em = [em];
  if (ph) user_data.ph = [ph];
  if (opts.fbp) user_data.fbp = opts.fbp.slice(0, 128);
  if (opts.fbc) user_data.fbc = opts.fbc.slice(0, 128);
  if (opts.ip) user_data.client_ip_address = opts.ip.slice(0, 64);
  if (opts.ua) user_data.client_user_agent = opts.ua.slice(0, 512);

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: "Lead",
        event_time: Math.floor(Date.now() / 1000),
        event_id: opts.eventId,
        action_source: "website",
        event_source_url: opts.sourceUrl.slice(0, 1000),
        user_data,
        custom_data: { content_name: "cohort_waitlist", currency: "USD", value: 249 },
      },
    ],
  };
  if (env.META_CAPI_TEST_EVENT_CODE) {
    payload.test_event_code = env.META_CAPI_TEST_EVENT_CODE;
  }

  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(env.META_PIXEL_ID)}/events?access_token=${encodeURIComponent(env.META_CAPI_ACCESS_TOKEN)}`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      console.error("[waitlist] Lead CAPI failed", resp.status, await resp.text());
    }
  } catch (e) {
    console.error("[waitlist] Lead CAPI error", e);
  }
}

async function insertCohortWaitlist(env: Env, row: Record<string, unknown>) {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const service = env.SUPABASE_SERVICE_ROLE_KEY || "";
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  const key = service || anon;
  if (!base || !key) {
    throw new Error("missing_supabase");
  }
  const resp = await fetch(`${base}/rest/v1/cohort_waitlist`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (resp.ok || resp.status === 201) return { ok: true as const, duplicate: false };
  const detail = await resp.text();
  if (/duplicate|unique|23505/i.test(detail)) {
    return { ok: true as const, duplicate: true };
  }
  throw new Error(`supabase_insert_${resp.status}: ${detail}`);
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const wantsJson =
    (request.headers.get("accept") || "").includes("application/json") ||
    (request.headers.get("content-type") || "").includes("application/json");

  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  try {
    if (await rateLimited(env, ip)) {
      if (wantsJson) return json({ ok: false, error: "rate_limited" }, 429);
      return redirect("/waitlist?err=rate_limited");
    }

    const body = await parseBody(request);

    if (body.website_url) {
      if (wantsJson) return json({ ok: true });
      return redirect("/thanks");
    }

    if (!body.email || !EMAIL_RE.test(body.email)) {
      if (wantsJson) return json({ ok: false, error: "invalid_email" }, 400);
      return redirect("/waitlist?err=invalid_email");
    }
    if (!body.first_name || body.first_name.length > 80) {
      if (wantsJson) return json({ ok: false, error: "invalid_name" }, 400);
      return redirect("/waitlist?err=invalid_name");
    }
    if (!body.last_name || body.last_name.length > 80) {
      if (wantsJson) return json({ ok: false, error: "invalid_last_name" }, 400);
      return redirect("/waitlist?err=invalid_last_name");
    }
    if (body.phone.replace(/\D/g, "").length < 7) {
      if (wantsJson) return json({ ok: false, error: "invalid_phone" }, 400);
      return redirect("/waitlist?err=invalid_phone");
    }

    const eventId =
      body.event_id ||
      `lead_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;

    const row: Record<string, unknown> = {
      email: body.email.toLowerCase().slice(0, 200),
      first_name: body.first_name.slice(0, 80),
      last_name: body.last_name.slice(0, 80),
      phone: body.phone.slice(0, 40),
      cohort: (env.WAITLIST_COHORT || "cohort_2").slice(0, 40),
      source: "astro_waitlist",
      event_id: eventId.slice(0, 120),
    };
    if (body.season) row.notes = `season: ${body.season}`.slice(0, 500);
    if (body.utm_source) row.utm_source = body.utm_source.slice(0, 120);
    if (body.utm_medium) row.utm_medium = body.utm_medium.slice(0, 120);
    if (body.utm_campaign) row.utm_campaign = body.utm_campaign.slice(0, 120);
    if (body.utm_content) row.utm_content = body.utm_content.slice(0, 120);
    if (body.fbclid) row.fbclid = body.fbclid.slice(0, 200);
    if (body.fbp) row.fbp = body.fbp.slice(0, 128);
    if (body.fbc) row.fbc = body.fbc.slice(0, 128);

    await insertCohortWaitlist(env, row);

    await sendLeadCapi(env, {
      eventId,
      email: String(row.email),
      phone: String(row.phone),
      fbp: body.fbp,
      fbc: body.fbc,
      ip,
      ua: request.headers.get("user-agent") || "",
      sourceUrl: request.headers.get("referer") || "https://www.macrosandmamas.com/waitlist",
    });

    if (wantsJson) return json({ ok: true, redirect: "/thanks", event_id: eventId });
    return redirect("/thanks");
  } catch (err) {
    console.error("[waitlist] error", err);
    if (wantsJson) return json({ ok: false, error: "server_error" }, 500);
    return redirect("/waitlist?err=error");
  }
};

export const onRequestGet: PagesFunction = async () => redirect("/waitlist");
