/**
 * Create a private GitHub issue for mama support reports.
 * Requires GITHUB_TOKEN (fine-grained PAT: Issues read/write on this repo only).
 * Never auto-@mentions agents — caller must fence user text before calling.
 */

const DEFAULT_REPO = "pgc49/macros-and-mamas";

export function githubToken(env) {
  return String(
    env.GITHUB_TOKEN || env.SUPPORT_GITHUB_TOKEN || env.GH_TOKEN || "",
  ).trim();
}

export function githubRepo(env) {
  const raw = String(env.GITHUB_REPO || DEFAULT_REPO).trim();
  const [owner, repo] = raw.split("/");
  if (!owner || !repo) return null;
  return { owner, repo, full: `${owner}/${repo}` };
}

/** Escape user content so it cannot close a fenced block or look like markdown directives. */
export function fenceUserText(raw, { max = 4000 } = {}) {
  const text = String(raw || "")
    .replace(/\r\n/g, "\n")
    .slice(0, max)
    // Break any triple-backtick sequences so they can't terminate our fence.
    .replace(/```/g, "``\u200b`");
  return `\`\`\`text\n${text}\n\`\`\``;
}

export async function ensureLabels(env, names) {
  const repo = githubRepo(env);
  const token = githubToken(env);
  if (!repo || !token) return { ok: false, error: "missing github config" };

  for (const name of names) {
    const resp = await fetch(
      `https://api.github.com/repos/${repo.full}/labels`,
      {
        method: "POST",
        headers: ghHeaders(token),
        body: JSON.stringify({
          name,
          color: labelColor(name),
          description: labelDescription(name),
        }),
      },
    );
    // 201 created, 422 already exists — both fine
    if (!resp.ok && resp.status !== 422) {
      const detail = await resp.text();
      console.warn("ensureLabels failed", name, resp.status, detail.slice(0, 200));
    }
  }
  return { ok: true };
}

/**
 * @returns {{ ok: true, url: string, number: number } | { ok: false, error: string, status?: number }}
 */
export async function createSupportIssue(env, {
  title,
  body,
  labels = ["support", "from-app"],
}) {
  const repo = githubRepo(env);
  const token = githubToken(env);
  if (!repo || !token) {
    return { ok: false, error: "missing GITHUB_TOKEN (add Preview+Production secret, then redeploy)" };
  }

  await ensureLabels(env, labels);

  // Fine-grained PATs with Issues write can still fail on unknown labels
  // (label create needs Administration). Retry without labels if needed.
  let resp = await postIssue(repo, token, title, body, labels);
  let data = await resp.json().catch(() => ({}));
  if (!resp.ok && labels?.length) {
    console.warn("github issue with labels failed — retrying bare", resp.status, data?.message);
    resp = await postIssue(repo, token, title, body, []);
    data = await resp.json().catch(() => ({}));
  }

  if (!resp.ok) {
    console.error("github issue create failed", resp.status, data);
    return {
      ok: false,
      error: data?.message || `github ${resp.status}`,
      status: resp.status,
      detail: Array.isArray(data?.errors) ? JSON.stringify(data.errors).slice(0, 300) : undefined,
    };
  }

  return {
    ok: true,
    url: data.html_url,
    number: data.number,
  };
}

export const TRIAGE_NO_CHANGE = "triaged-no-change";
export const TRIAGE_NEEDS_APPROVAL = "needs-approval";
export const TRIAGE_MARKER = "<!-- mam-support-triage -->";

/**
 * List open from-app support issues (newest first).
 * @param {{ lookbackHours?: number|null, untriagedOnly?: boolean }} [opts]
 *   lookbackHours null/omit with untriagedOnly → all open untriaged
 */
export async function listOpenSupportIssues(env, {
  lookbackHours = 26,
  untriagedOnly = false,
} = {}) {
  const repo = githubRepo(env);
  const token = githubToken(env);
  if (!repo || !token) {
    return { ok: false, error: "missing GITHUB_TOKEN" };
  }
  const resp = await fetch(
    `https://api.github.com/repos/${repo.full}/issues`
      + "?state=open&labels=from-app&per_page=50&sort=created&direction=desc",
    { headers: ghHeaders(token) },
  );
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    return { ok: false, error: `github ${resp.status}: ${detail.slice(0, 200)}` };
  }
  const rows = await resp.json().catch(() => []);
  const list = Array.isArray(rows) ? rows : [];
  // Exclude PRs (Issues API can include them).
  let issues = list.filter((row) => row && !row.pull_request);
  if (untriagedOnly) {
    issues = issues.filter((row) => !hasIssueLabel(row, TRIAGE_NO_CHANGE)
      && !hasIssueLabel(row, TRIAGE_NEEDS_APPROVAL));
  } else if (lookbackHours != null) {
    const cutoffMs = Date.now() - Math.max(1, lookbackHours) * 3600 * 1000;
    issues = issues.filter((row) => {
      const created = Date.parse(row.created_at || "");
      return Number.isFinite(created) && created >= cutoffMs;
    });
  }
  return {
    ok: true,
    issues,
    openTotal: list.filter((row) => row && !row.pull_request).length,
    lookbackHours,
    repo: repo.full,
  };
}

export function hasIssueLabel(issue, name) {
  const want = String(name || "").toLowerCase();
  return (issue?.labels || []).some((l) => String(l?.name || l || "").toLowerCase() === want);
}

export async function addIssueLabels(env, issueNumber, labels) {
  const repo = githubRepo(env);
  const token = githubToken(env);
  if (!repo || !token || !issueNumber) return { ok: false, error: "missing config" };
  await ensureLabels(env, labels);
  const resp = await fetch(
    `https://api.github.com/repos/${repo.full}/issues/${encodeURIComponent(issueNumber)}/labels`,
    {
      method: "POST",
      headers: ghHeaders(token),
      body: JSON.stringify({ labels }),
    },
  );
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    return { ok: false, error: `label ${resp.status}: ${detail.slice(0, 200)}` };
  }
  return { ok: true };
}

export async function commentOnIssue(env, issueNumber, body) {
  const repo = githubRepo(env);
  const token = githubToken(env);
  if (!repo || !token || !issueNumber) return { ok: false, error: "missing config" };
  const resp = await fetch(
    `https://api.github.com/repos/${repo.full}/issues/${encodeURIComponent(issueNumber)}/comments`,
    {
      method: "POST",
      headers: ghHeaders(token),
      body: JSON.stringify({ body: String(body || "").slice(0, 60000) }),
    },
  );
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    return { ok: false, error: `comment ${resp.status}: ${detail.slice(0, 200)}` };
  }
  const data = await resp.json().catch(() => ({}));
  return { ok: true, url: data.html_url || null };
}

function postIssue(repo, token, title, body, labels) {
  const payload = {
    title: String(title || "Support report").slice(0, 200),
    body: String(body || ""),
  };
  if (Array.isArray(labels) && labels.length) payload.labels = labels;
  return fetch(`https://api.github.com/repos/${repo.full}/issues`, {
    method: "POST",
    headers: ghHeaders(token),
    body: JSON.stringify(payload),
  });
}

function labelColor(name) {
  if (name === "bug") return "d73a4a";
  if (name === "feedback") return "0E8A16";
  if (name === "support") return "B4416B";
  if (name === "from-callie") return "5319E7";
  if (name === TRIAGE_NEEDS_APPROVAL) return "E4A11B";
  if (name === TRIAGE_NO_CHANGE) return "CFD3D7";
  return "6E5D66";
}

function labelDescription(name) {
  if (name === "bug") return "Something broken or wrong in the app";
  if (name === "feedback") return "Product idea / suggestion (not a break)";
  if (name === "support") return "Mama report from /support";
  if (name === "from-app") return "Submitted from the Macros and Mamas app";
  if (name === "from-callie") return "Submitted by Callie / admin (recipes, content, product)";
  if (name === TRIAGE_NEEDS_APPROVAL) return "Triage recommends code/content changes — awaiting Patrick approval";
  if (name === TRIAGE_NO_CHANGE) return "Triage: no code changes recommended";
  return name;
}

function ghHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "macros-and-mamas-support",
  };
}
