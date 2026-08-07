/**
 * POST /api/lead — quiz lead capture.
 * Server recomputes ranges; upserts marketing_leads; CAPI Lead + Resend in waitUntil.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
 *      META_PIXEL_ID, META_CAPI_ACCESS_TOKEN (optional),
 *      LEAD_FROM_EMAIL (optional, default Callie address),
 *      WAITLIST KV (optional rate limit — same binding as /api/waitlist)
 */

import {
  computeRanges,
  feedingLine,
  segmentForAnswers,
} from '../_shared/rangesEngine.mjs';

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

async function rateLimited(env: Env, ip: string): Promise<boolean> {
  if (!env.WAITLIST) return false;
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
  if (!env.META_PIXEL_ID || !env.META_CAPI_ACCESS_TOKEN) return;
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
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(env.META_PIXEL_ID)}/events?access_token=${encodeURIComponent(env.META_CAPI_ACCESS_TOKEN)}`;
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
    ranges: ReturnType<typeof formatBands> | null;
  },
) {
  if (!env.RESEND_API_KEY) {
    console.error('[lead] missing RESEND_API_KEY');
    return;
  }
  const from =
    env.LEAD_FROM_EMAIL || 'Callie at Macros and Mamas <calista@nourishwithcalista.com>';
  const name = opts.firstName || 'Mama';

  let html = '';
  let subject = '';

  if (opts.segment === 'pregnancy_nurture') {
    subject = `${name}, a note for this season`;
    html = `<p>Hi ${name},</p>
<p>Congratulations. Pregnancy is an abundance season — not a cut. We're not sending macro ranges right now on purpose.</p>
<p>When you're ready postpartum, come back for your ranges. We'll keep a light note in your inbox with what to expect when the time is right.</p>
<p>With care,<br/>Callie</p>`;
  } else if (opts.segment === 'waitlist_plantbased') {
    subject = `${name}, an honest note about our playbook`;
    html = `<p>Hi ${name},</p>
<p>Thank you for taking the quiz. Our coaching playbook leans on animal protein (and pescatarian / vegetarian patterns). Fully vegan kitchens aren't a fit for this program, and we'd rather be honest than take your money.</p>
<p>You're on a holding list if our approach ever expands. No hard sell.</p>
<p>— Callie</p>`;
  } else if (opts.needsReview) {
    subject = `${name}, Callie wants to look at your ranges personally`;
    html = `<p>Hi ${name},</p>
<p>Your ranges need Callie's eyes on them. A couple of your answers mean an automated band isn't the right call. Callie will review this herself and send your ranges within 24 hours.</p>
<p>You still unlocked the early rate — pre-pay $249 to lock your cohort spot anytime: <a href="https://www.macrosandmamas.com/join?from=quiz">macrosandmamas.com/join</a> (use this same email).</p>
<p>— The Macros and Mamas team</p>`;
  } else if (opts.ranges) {
    subject = `Your ranges, ${name}`;
    const early = opts.earlyPp
      ? `<p><strong>Here's a preview based on your answers.</strong> Early postpartum is welcome — if you join, Callie builds your final ranges gently and supply-aware for this season.</p>`
      : '';
    const feed = feedingLine(opts.feeding as 'exclusive');
    html = `<p>Hi ${name},</p>
${early}
<p>Here are your bands — built the same way Callie builds them for the program:</p>
<ul>
<li><strong>Protein:</strong> ${opts.ranges.protein}</li>
<li><strong>Carbs:</strong> ${opts.ranges.carbs}</li>
<li><strong>Fat:</strong> ${opts.ranges.fat}</li>
<li><strong>Calories land around:</strong> ${opts.ranges.calories}</li>
</ul>
<p>${feed}</p>
<p>Why a range? Busy, active day → eat the top. Slow day → the bottom. Both count as a win. Start with protein; it's the anchor.</p>
<p><strong>You unlocked the early rate.</strong> Pre-pay $249 ($50 off full price) to lock your spot for the next cohort: <a href="https://www.macrosandmamas.com/join?from=quiz">macrosandmamas.com/join</a> — use this same email at checkout.</p>
<p>Ranges above are a preview. If you join, Callie builds and approves your final numbers before you start.</p>
<p>— Callie</p>`;
  } else {
    subject = `Thanks, ${name}`;
    html = `<p>Hi ${name},</p><p>Thanks for checking in. We'll be in touch.</p><p>— Callie</p>`;
  }

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
        subject,
        html,
      }),
    });
    if (!resp.ok) {
      console.error('[lead] Resend failed', resp.status, await resp.text());
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
  if (await rateLimited(env, ip)) {
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
  const firstName = String(body.first_name || '').trim();
  const lastName = String(body.last_name || '').trim();
  if (!EMAIL_RE.test(email) || !firstName || !lastName) {
    return json({ error: 'invalid_fields' }, 400);
  }
  const domain = email.split('@')[1] || '';
  if (DISPOSABLE.has(domain)) {
    return json({ error: 'invalid_email' }, 400);
  }

  const answers = normalizeAnswers(body.answers || {});
  const segment = segmentForAnswers(answers as Parameters<typeof segmentForAnswers>[0]);

  // Exit segments: still store, no computed bands for pregnant/vegan.
  let engine =
    segment === 'pregnancy_nurture' || segment === 'waitlist_plantbased'
      ? { needs_review: false, review_reason: null as string | null }
      : computeRanges(answers as Parameters<typeof computeRanges>[0]);

  // Early postpartum is welcome — always return a preview band when we can.
  // (0–3 months is not a block; Callie softens the plan if they join.)
  if (segment === 'early_pp_nurture' && engine.needs_review) {
    const reason = String(engine.review_reason || '');
    if (
      reason !== 'incomplete_inputs' &&
      reason !== 'goal_maintain' &&
      reason !== 'goal_gain'
    ) {
      const soft = computeRanges(
        answers as Parameters<typeof computeRanges>[0],
        { skipReview: true },
      );
      if (!soft.needs_review && 'protein_low_g' in soft) {
        engine = soft;
      }
    }
  }

  const eventId =
    String(body.event_id || '').trim() ||
    `lead_${crypto.randomUUID()}`;

  const rangesPayload =
    !engine.needs_review && 'protein_low_g' in engine
      ? {
          protein_low_g: engine.protein_low_g,
          protein_high_g: engine.protein_high_g,
          carbs_low_g: engine.carbs_low_g,
          carbs_high_g: engine.carbs_high_g,
          fat_low_g: engine.fat_low_g,
          fat_high_g: engine.fat_high_g,
          calories_low: engine.calories_low,
          calories_high: engine.calories_high,
        }
      : {};

  const row: Record<string, unknown> = {
    email,
    first_name: firstName,
    last_name: lastName,
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
    needs_review: Boolean(engine.needs_review),
    review_reason: engine.review_reason,
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

  const earlyPp = segment === 'early_pp_nurture';
  const formatted =
    rangesPayload.protein_low_g != null
      ? formatBands(rangesPayload as Parameters<typeof formatBands>[0])
      : null;

  context.waitUntil(
    Promise.all([
      sendLeadCapi(env, {
        eventId,
        email,
        firstName,
        lastName,
        fbp: body.fbp,
        fbc: body.fbc,
        ip,
        ua,
        sourceUrl,
      }),
      sendRangesEmail(env, {
        email,
        firstName,
        segment,
        needsReview: Boolean(engine.needs_review),
        earlyPp,
        feeding: answers.feeding,
        ranges: formatted,
      }),
    ]),
  );

  return json({
    ok: true,
    event_id: eventId,
    segment,
    needs_review: Boolean(engine.needs_review),
    review_reason: engine.review_reason,
    early_pp: earlyPp,
    ranges: rangesPayload.protein_low_g != null ? rangesPayload : null,
    feeding_line:
      rangesPayload.protein_low_g != null
        ? feedingLine(answers.feeding as 'exclusive')
        : null,
  });
};
