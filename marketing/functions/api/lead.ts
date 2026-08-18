/**
 * POST /api/lead — quiz lead capture.
 * Server recomputes ranges; upserts marketing_leads; CAPI Lead + Resend in waitUntil.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
 *      META_PIXEL_ID, META_CAPI_ACCESS_TOKEN (optional),
 *      LEAD_FROM_EMAIL (optional, default Callie address),
 *      WAITLIST KV (required — rate limit fails closed if unbound; same binding as /api/waitlist)
 */

import { buildQuizPayoff, feedingLine } from '../_shared/rangesEngine.mjs';
import {
  FROM_CALLIE,
  escapeHtml,
  renderEmail,
} from '../_shared/emailLayout.mjs';
import {
  RANGES_EMAIL_BOTTOM_CTA,
  buildEligibleRangesEmailBody,
  quizJoinUrl,
} from '../_shared/rangesEmail.mjs';
import { resolveMetaPixelId } from '../_shared/metaPixelId.js';
import { hasEmailEventByEmail, logEmailEvent } from '../_shared/emailEvents.mjs';
import {
  buildUnsubscribeUrl,
  isUnsubscribed,
  listUnsubscribeHeaders,
} from '../_shared/emailUnsubscribe.mjs';

interface Env {
  WAITLIST?: KVNamespace;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RESEND_API_KEY?: string;
  LEAD_FROM_EMAIL?: string;
  META_PIXEL_ID?: string;
  META_CAPI_ACCESS_TOKEN?: string;
  META_CAPI_TEST_EVENT_CODE?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 8;
const DISPOSABLE = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  '10minutemail.com',
  'yopmail.com',
  'trashmail.com',
]);

type LeadBody = {
  email?: string;
  first_name?: string;
  last_name?: string;
  /** Optional quiz attribution — code or name; manual recon only. */
  referred_by?: string;
  source?: string;
  answers?: Record<string, unknown>;
  fbp?: string;
  fbc?: string;
  event_id?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  landing_path?: string;
  website_url?: string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** @returns {"ok"|"limited"|"unavailable"} */
async function rateLimitStatus(env: Env, ip: string): Promise<"ok" | "limited" | "unavailable"> {
  // Fail closed: unbound KV must not leave lead capture / Resend uncapped.
  if (!env.WAITLIST) return "unavailable";
  const key = `lead-rl:${ip}`;
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
  if (hits.length >= RATE_LIMIT_MAX) return "limited";
  hits.push(now);
  await env.WAITLIST.put(key, JSON.stringify(hits), {
    expirationTtl: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
  });
  return "ok";
}

/** Strip header-injection chars; cap length. HTML escaping happens at render. */
function safeDisplayName(raw: string): string {
  const cleaned = String(raw || '')
    .replace(/[\r\n\0\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'Mama';
}

async function sha256(value: string): Promise<string | null> {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizeAnswers(raw: Record<string, unknown>) {
  const flags = Array.isArray(raw.flags)
    ? raw.flags.map((f) => String(f))
    : [];
  return {
    months_postpartum: String(raw.months_postpartum || ''),
    feeding: String(raw.feeding || ''),
    height_in: Number(raw.height_in),
    current_weight_lbs: Number(raw.current_weight_lbs),
    goal_weight_lbs: Number(raw.goal_weight_lbs),
    goal: String(raw.goal || ''),
    activity_level: String(raw.activity_level || 'moderate'),
    flags,
  };
}

async function upsertLead(
  env: Env,
  row: Record<string, unknown>,
): Promise<void> {
  const base = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base || !key) throw new Error('missing_supabase');

  const email = String(row.email || '').toLowerCase();
  const find = await fetch(
    `${base}/rest/v1/marketing_leads?email=eq.${encodeURIComponent(email)}&select=id,segment`,
    {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
      },
    },
  );
  if (!find.ok) {
    throw new Error(`supabase_find_${find.status}: ${await find.text()}`);
  }
  const existing = (await find.json()) as { id: string; segment?: string }[];
  if (existing[0]?.id) {
    // Sticky exit segments — do not let a re-submit unlock $249 after nurture/vegan.
    const prevSeg = String(existing[0].segment || '');
    if (
      prevSeg === 'pregnancy_nurture' ||
      prevSeg === 'waitlist_plantbased'
    ) {
      row.segment = prevSeg;
    }
    const patch = await fetch(
      `${base}/rest/v1/marketing_leads?id=eq.${encodeURIComponent(existing[0].id)}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          apikey: key,
          authorization: `Bearer ${key}`,
          prefer: 'return=minimal',
        },
        body: JSON.stringify(row),
      },
    );
    if (!patch.ok) {
      throw new Error(`supabase_patch_${patch.status}: ${await patch.text()}`);
    }
    return;
  }

  const ins = await fetch(`${base}/rest/v1/marketing_leads`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!ins.ok && ins.status !== 201) {
    const detail = await ins.text();
    if (/duplicate|unique|23505/i.test(detail)) return;
    throw new Error(`supabase_insert_${ins.status}: ${detail}`);
  }
}

async function sendLeadCapi(
  env: Env,
  opts: {
    eventId: string;
    email: string;
    firstName: string;
    lastName: string;
    fbp?: string;
    fbc?: string;
    ip: string;
    ua: string;
    sourceUrl: string;
  },
) {
  const pixelId = resolveMetaPixelId(env);
  if (!pixelId || !env.META_CAPI_ACCESS_TOKEN) return;
  const em = await sha256(opts.email);
  const fn = await sha256(opts.firstName);
  const ln = await sha256(opts.lastName);
  const user_data: Record<string, unknown> = {};
  if (em) user_data.em = [em];
  if (fn) user_data.fn = [fn];
  if (ln) user_data.ln = [ln];
  if (opts.fbp) user_data.fbp = opts.fbp.slice(0, 128);
  if (opts.fbc) user_data.fbc = opts.fbc.slice(0, 128);
  if (opts.ip) user_data.client_ip_address = opts.ip.slice(0, 64);
  if (opts.ua) user_data.client_user_agent = opts.ua.slice(0, 512);

  // Non-negotiable: no feeding / postpartum / flags in custom_data.
  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        event_id: opts.eventId,
        action_source: 'website',
        event_source_url: opts.sourceUrl.slice(0, 1000),
        user_data,
        custom_data: { content_name: 'ranges_quiz' },
      },
    ],
  };
  if (env.META_CAPI_TEST_EVENT_CODE) {
    payload.test_event_code = env.META_CAPI_TEST_EVENT_CODE;
  }
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(env.META_CAPI_ACCESS_TOKEN)}`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      console.error('[lead] CAPI failed', resp.status, await resp.text());
    }
  } catch (e) {
    console.error('[lead] CAPI error', e);
  }
}

function formatBands(r: {
  protein_low_g: number;
  protein_high_g: number;
  carbs_low_g: number;
  carbs_high_g: number;
  fat_low_g: number;
  fat_high_g: number;
  calories_low: number;
  calories_high: number;
}) {
  const fmt = (n: number) => n.toLocaleString('en-US');
  return {
    protein: `${r.protein_low_g}–${r.protein_high_g} g`,
    carbs: `${r.carbs_low_g}–${r.carbs_high_g} g`,
    fat: `${r.fat_low_g}–${r.fat_high_g} g`,
    calories: `${fmt(r.calories_low)}–${fmt(r.calories_high)}`,
  };
}

async function sendRangesEmail(
  env: Env,
  opts: {
    email: string;
    firstName: string;
    segment: string;
    needsReview: boolean;
    earlyPp: boolean;
    feeding: string;
    /** When not_postpartum, skip the postpartum “still rebuilding” feeding callout. */
    monthsPostpartum: string;
    ranges: ReturnType<typeof formatBands> | null;
  },
) {
  if (!env.RESEND_API_KEY) {
    console.error('[lead] missing RESEND_API_KEY');
    return;
  }
  if (await isUnsubscribed(env, opts.email)) {
    console.info('[lead] skip ranges email, unsubscribed');
    return;
  }
  const from = env.LEAD_FROM_EMAIL || FROM_CALLIE;
  const name = safeDisplayName(opts.firstName);
  const joinUrl = quizJoinUrl(opts.email);
  const signupCta = {
    cta_text: RANGES_EMAIL_BOTTOM_CTA,
    cta_url: joinUrl,
  };

  let subject = '';
  // renderEmail() HTML-escapes header; keep name free of CR/LF for subject safety.
  let header = `Hi ${name},`;
  let body = '';
  let cta: { cta_text?: string; cta_url?: string } = {};

  if (opts.segment === 'pregnancy_nurture') {
    subject = `${name}, a note for this season`;
    body = `
<p>Congratulations. Pregnancy is an abundance season, not a cut. We're not sending macro ranges right now on purpose.</p>
<p>When you're ready postpartum, come back for your ranges. We'll keep a light note in your inbox with what to expect when the time is right.</p>
<p>With care,<br/>Callie</p>`;
  } else if (opts.segment === 'waitlist_plantbased') {
    subject = opts.ranges ? `Your ranges, ${name}` : `${name}, an honest note about our playbook`;
    const veganBands = opts.ranges
      ? `<p>Here are your bands, built the same way Callie builds them for the program:</p>
<ul>
<li><strong>Protein:</strong> ${escapeHtml(opts.ranges.protein)}</li>
<li><strong>Carbs:</strong> ${escapeHtml(opts.ranges.carbs)}</li>
<li><strong>Fat:</strong> ${escapeHtml(opts.ranges.fat)}</li>
<li><strong>Calories land around:</strong> ${escapeHtml(opts.ranges.calories)}</li>
</ul>`
      : '';
    body = `
<p><strong>A note on protein.</strong> Callie's program emphasizes animal protein: meat, dairy, and eggs. Hitting these protein targets on a fully vegan diet can be challenging. We'd rather be honest up front.</p>
${veganBands}
<p>If you still want to talk through whether the program is a fit, reply to this email. No hard sell.</p>
<p>Callie</p>`;
  } else if (opts.ranges) {
    subject = `Your ranges, ${name}`;
    const feed =
      opts.monthsPostpartum === 'not_postpartum'
        ? ''
        : feedingLine(opts.feeding as 'exclusive');
    const feedHtml = feed ? `<p>${escapeHtml(feed)}</p>` : '';
    body = buildEligibleRangesEmailBody({
      earlyPp: opts.earlyPp,
      needsReview: opts.needsReview,
      feedHtml,
      bands: opts.ranges,
      joinUrl,
    });
    cta = signupCta;
  } else if (opts.needsReview) {
    subject = `${name}, Callie wants to look at your ranges personally`;
    body = `
<p>Your ranges need Callie's eyes on them. A couple of your answers mean an automated band isn't the right call. Callie will review this herself and send your ranges within 24 hours.</p>
<p><strong>In the meantime:</strong> create your account and finish checkout to lock in your spot. Use this same email so everything stays attached.</p>
<p>Callie</p>
<p style="font-size:12px;color:#6E5D66;margin-top:24px">You're getting this because you took the ranges quiz. Reply anytime.</p>`;
    cta = signupCta;
  } else {
    subject = `Thanks, ${name}`;
    body = `<p>Thanks for checking in. We'll be in touch.</p><p>Callie</p>`;
  }

  const unsubscribeUrl = await buildUnsubscribeUrl(env, opts.email);
  const html = renderEmail({
    header,
    body,
    ...cta,
    unsubscribe_url: unsubscribeUrl || undefined,
  });

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [opts.email],
        reply_to: 'calista@nourishwithcalista.com',
        subject,
        html,
        ...(unsubscribeUrl ? { headers: listUnsubscribeHeaders(unsubscribeUrl) } : {}),
      }),
    });
    if (!resp.ok) {
      console.error('[lead] Resend failed', resp.status, await resp.text());
      return;
    }
    const data = (await resp.json().catch(() => ({}))) as { id?: string };
    // Log once so the drip can see #1. Re-quiz still sends; it does not insert again.
    if (!(await hasEmailEventByEmail(env, opts.email, 'quiz_ranges'))) {
      await logEmailEvent(env, {
        emailType: 'quiz_ranges',
        toEmail: opts.email,
        subject,
        resendId: data?.id || null,
        status: 'sent',
        meta: { source: 'lead', segment: opts.segment },
      });
    }
  } catch (e) {
    console.error('[lead] Resend error', e);
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  const rl = await rateLimitStatus(env, ip);
  if (rl === 'unavailable') {
    console.error('[lead] rate limit unavailable (WAITLIST KV unbound)');
    return json({ error: 'unavailable' }, 503);
  }
  if (rl === 'limited') {
    return json({ error: 'rate_limited' }, 429);
  }

  let body: LeadBody;
  try {
    body = (await request.json()) as LeadBody;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  if (body.website_url) {
    return json({ ok: true }); // honeypot
  }

  const email = String(body.email || '').trim().toLowerCase();
  const rawFirst = String(body.first_name || '').trim();
  const firstName = safeDisplayName(rawFirst);
  // Last name optional at quiz gate — collected later at account/checkout.
  const lastName = String(body.last_name || '')
    .replace(/[\r\n\0\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  if (!EMAIL_RE.test(email) || !rawFirst) {
    return json({ error: 'invalid_fields' }, 400);
  }
  const domain = email.split('@')[1] || '';
  if (DISPOSABLE.has(domain)) {
    return json({ error: 'invalid_email' }, 400);
  }

  const answers = normalizeAnswers(body.answers || {});
  const payoff = buildQuizPayoff(answers);
  const segment = payoff.segment;
  const needsReview = payoff.needs_review;
  const reviewReason = payoff.review_reason;
  const qualifiedLead = payoff.qualified_lead;
  const earlyPp = payoff.early_pp;

  const eventId =
    String(body.event_id || '').trim() ||
    `lead_${crypto.randomUUID()}`;

  const rangesPayload = payoff.ranges || {};

  const referredBy = String(body.referred_by || '')
    .trim()
    .slice(0, 120);

  const row: Record<string, unknown> = {
    email,
    first_name: firstName,
    last_name: lastName,
    referred_by: referredBy || null,
    source: String(body.source || 'quiz_page').slice(0, 40),
    quiz_version: 1,
    months_postpartum: answers.months_postpartum || null,
    feeding_status: answers.feeding || null,
    height_in: Number.isFinite(answers.height_in) ? answers.height_in : null,
    current_weight_lbs: Number.isFinite(answers.current_weight_lbs)
      ? answers.current_weight_lbs
      : null,
    goal_weight_lbs: Number.isFinite(answers.goal_weight_lbs)
      ? answers.goal_weight_lbs
      : null,
    goal: answers.goal || null,
    activity_level: answers.activity_level || null,
    flags: answers.flags,
    baby_birthday: null,
    needs_review: needsReview,
    review_reason: reviewReason,
    segment,
    fbp: body.fbp ? String(body.fbp).slice(0, 128) : null,
    fbc: body.fbc ? String(body.fbc).slice(0, 128) : null,
    event_id: eventId,
    utm_source: body.utm_source ? String(body.utm_source).slice(0, 120) : null,
    utm_medium: body.utm_medium ? String(body.utm_medium).slice(0, 120) : null,
    utm_campaign: body.utm_campaign
      ? String(body.utm_campaign).slice(0, 120)
      : null,
    utm_content: body.utm_content ? String(body.utm_content).slice(0, 120) : null,
    landing_path: body.landing_path
      ? String(body.landing_path).slice(0, 200)
      : null,
    ...rangesPayload,
  };

  try {
    await upsertLead(env, row);
  } catch (e) {
    console.error('[lead] upsert failed', e);
    return json({ error: 'save_failed' }, 502);
  }

  const ua = request.headers.get('user-agent') || '';
  const sourceUrl = 'https://www.macrosandmamas.com/quiz';

  const formatted =
    rangesPayload.protein_low_g != null
      ? formatBands(rangesPayload as Parameters<typeof formatBands>[0])
      : null;

  context.waitUntil(
    Promise.all([
      qualifiedLead
        ? sendLeadCapi(env, {
            eventId,
            email,
            firstName,
            lastName,
            fbp: body.fbp,
            fbc: body.fbc,
            ip,
            ua,
            sourceUrl,
          })
        : Promise.resolve(),
      sendRangesEmail(env, {
        email,
        firstName,
        segment,
        needsReview,
        earlyPp,
        feeding: answers.feeding,
        monthsPostpartum: answers.months_postpartum,
        ranges: formatted,
      }),
    ]),
  );

  return json({
    ok: true,
    event_id: eventId,
    segment,
    qualified_lead: qualifiedLead,
    needs_review: needsReview,
    review_reason: reviewReason,
    early_pp: earlyPp,
    ranges: payoff.ranges,
    feeding_line: payoff.feeding_line,
  });
};
