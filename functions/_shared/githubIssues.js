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
          color: name === "support" ? "B4416B" : "6E5D66",
          description: name === "support"
            ? "Mama tech/support report from /support"
            : "Submitted from the Macros and Mamas app",
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

function ghHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "macros-and-mamas-support",
  };
}
