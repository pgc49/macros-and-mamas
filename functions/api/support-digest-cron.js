/* ==================================================================
   /functions/api/support-digest-cron.js
   Daily: if new from-app / from-callie GitHub issues exist, email OWNER
   (Patrick) a digest. No auto-fix / no agent run — surface only.
   Auth: Bearer CRON_SECRET
   ================================================================== */

import { listOpenSupportIssues } from "../_shared/githubIssues.js";

const DEFAULT_OWNER = "pgchammas@gmail.com";

export async function onRequestPost({ request, env }) {
  try {
    if (!authorizeCron(request, env)) return json({ error: "unauthorized" }, 401);

    const lookbackHours = Number(env.SUPPORT_DIGEST_LOOKBACK_HOURS || 26);
    const listed = await listOpenSupportIssues(env, {
      lookbackHours: Number.isFinite(lookbackHours) ? lookbackHours : 26,
    });
    if (!listed.ok) {
      console.error("support digest github list failed", listed.error);
      return json({ error: "github list failed", detail: listed.error }, 502);
    }

    const issues = listed.issues || [];
    if (!issues.length) {
      return json({
        ok: true,
        skipped: "none_new",
        openTotal: listed.openTotal || 0,
        lookbackHours: listed.lookbackHours,
      }, 200);
    }

    const mailed = await sendOwnerDigest(env, {
      issues,
      openTotal: listed.openTotal,
      repo: listed.repo,
      lookbackHours: listed.lookbackHours,
    });
    if (!mailed.ok) {
      return json({ error: "email failed", detail: mailed.error }, 502);
    }

    return json({
      ok: true,
      emailed: true,
      count: issues.length,
      openTotal: listed.openTotal,
      to: mailed.to,
    }, 200);
  } catch (e) {
    console.error("support-digest-cron failed", e);
    return json({ error: "cron failed" }, 500);
  }
}

function authorizeCron(request, env) {
  const secret = String(env.CRON_SECRET || "");
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token.length !== secret.length) return false;
  let out = 0;
  for (let i = 0; i < token.length; i += 1) out |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return out === 0;
}

async function sendOwnerDigest(env, { issues, openTotal, repo, lookbackHours }) {
  const key = String(env.RESEND_API_KEY || "").trim();
  const to = ownerEmails(env);
  if (!key) return { ok: false, error: "missing RESEND_API_KEY" };
  if (!to.length) return { ok: false, error: "missing OWNER_NOTIFY_EMAIL" };

  const callieCount = issues.filter((i) => hasLabel(i, "from-callie")).length;
  const feedbackCount = issues.filter((i) => hasLabel(i, "feedback")).length;
  const bugCount = issues.filter((i) => hasLabel(i, "bug")).length;

  const subject = issues.length === 1
    ? `App feedback digest: 1 new report to review`
    : `App feedback digest: ${issues.length} new reports to review`;

  const lines = [
    "New App help / feedback landed in GitHub.",
    "No action was taken automatically — review first, then decide.",
    "",
    `New in last ~${lookbackHours}h: ${issues.length}`
      + (callieCount ? ` (${callieCount} from Callie)` : "")
      + (feedbackCount || bugCount ? ` · ${feedbackCount} feedback / ${bugCount} bug` : ""),
    `Open from-app total: ${openTotal}`,
    `Repo: https://github.com/${repo}/issues?q=is%3Aissue+is%3Aopen+label%3Afrom-app`,
    "",
    ...issues.map((issue, idx) => formatIssueLine(issue, idx + 1)),
    "",
    "When you’re ready, open the issue and kick off a cloud agent yourself — this cron only surfaces.",
  ];

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: "Macros and Mamas <calista@nourishwithcalista.com>",
      to,
      subject,
      text: lines.join("\n"),
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    console.error("support digest email failed", resp.status, detail);
    return { ok: false, error: `resend ${resp.status}` };
  }
  return { ok: true, to };
}

function ownerEmails(env) {
  const raw = String(env.OWNER_NOTIFY_EMAIL || DEFAULT_OWNER);
  return [...new Set(
    raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  )];
}

function hasLabel(issue, name) {
  return (issue.labels || []).some((l) => String(l?.name || l || "").toLowerCase() === name);
}

function formatIssueLine(issue, n) {
  const labels = (issue.labels || [])
    .map((l) => String(l?.name || l || ""))
    .filter(Boolean)
    .join(", ");
  const when = issue.created_at
    ? new Date(issue.created_at).toISOString().replace("T", " ").slice(0, 16) + " UTC"
    : "";
  return [
    `${n}. #${issue.number} — ${String(issue.title || "").slice(0, 120)}`,
    `   ${issue.html_url}`,
    labels ? `   Labels: ${labels}` : null,
    when ? `   Created: ${when}` : null,
  ].filter(Boolean).join("\n");
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
