#!/usr/bin/env node
/**
 * Live coach eval. NOT in CI. Hits a preview URL with a real model
 * and writes coach-eval-<sha>.json for Data and Lifecycle to score.
 *
 *   node scripts/coach-eval.mjs --url https://xxx.pages.dev --token $MAMA_JWT --account pgchammas+qa-active@gmail.com
 *
 * Required: --account must match pgchammas+qa-*
 * Optional: --sha <gitsha> --setup A --start 1 --limit 52 --include-careful --all-setups
 *
 * WARNING: this writes to the live Supabase project shared by Cloudflare
 * previews. Setups B–E need their own QA accounts — they are not simulated
 * from setup A. Questions 41 and 51 append to Callie's card unless you pass
 * --include-careful.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

import {
  bankContextFor,
  COACH_QUESTION_BANK,
  COACH_QUESTION_BANK_SETUPS,
  platesNamedInReply,
} from "../functions/_shared/coachQuestionBank.js";
import { evalTokenEmailAllowed, verifyCoachEvalToken } from "./coachEvalGuard.js";

function arg(name, fallback = "") {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function gitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const url = String(arg("url")).replace(/\/$/, "");
const token = arg("token") || process.env.COACH_EVAL_TOKEN || "";
const account = String(arg("account") || "").trim();
const sha = arg("sha") || gitSha();
const setupId = (arg("setup") || "A").toUpperCase();
const start = Math.max(1, Number(arg("start") || 1));
const limit = Math.max(1, Number(arg("limit") || 52));
const allSetups = hasFlag("all-setups");
const includeCareful = hasFlag("include-careful");

if (!url || !token || !account) {
  console.error("Usage: node scripts/coach-eval.mjs --url https://preview.pages.dev --token $MAMA_JWT --account pgchammas+qa-active@gmail.com [--sha abc] [--setup A]");
  process.exit(1);
}

if (!evalTokenEmailAllowed(account)) {
  console.error("Refusing: --account must match ^pgchammas+qa-[a-z0-9-]+@gmail.com$");
  process.exit(1);
}

const verified = await verifyCoachEvalToken({
  token,
  supabaseUrl: process.env.SUPABASE_URL,
});
if (!verified.ok || !evalTokenEmailAllowed(verified.email)) {
  console.error("Refusing: token email must match ^pgchammas+qa-[a-z0-9-]+@gmail.com$ (checked via /auth/v1/user).");
  process.exit(1);
}
if (verified.email !== account.toLowerCase()) {
  console.error("Refusing: --account does not match the token email.");
  process.exit(1);
}

console.warn("WARNING: this script writes coach replies and refusals to the live Supabase project shared by Cloudflare previews.");
console.warn("Setups B–E need separate QA accounts. This flag only labels the run; it does not simulate those setups.");

const setups = allSetups
  ? COACH_QUESTION_BANK_SETUPS
  : [COACH_QUESTION_BANK_SETUPS.find((row) => row.id === setupId) || COACH_QUESTION_BANK_SETUPS[0]];
const questions = COACH_QUESTION_BANK.filter((row) => row.id >= start).slice(0, limit)
  .filter((row) => includeCareful || (row.id !== 41 && row.id !== 51));

if (!includeCareful) {
  console.warn("Skipping questions 41 and 51 (they write to Callie's card). Pass --include-careful to run them.");
}

const results = [];
for (const setup of setups) {
  for (const question of questions) {
    const requestId = `eval-q${String(question.id).padStart(2, "0")}-${setup.id}-${sha}`.slice(0, 64);
    const body = {
      mode: "ask",
      text: question.text,
      slot: setup.slot || "dinner",
      requestId,
      context: bankContextFor(question, setup),
    };
    const started = Date.now();
    let status = 0;
    let data = {};
    try {
      const resp = await fetch(`${url}/api/coach`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      status = resp.status;
      data = await resp.json().catch(() => ({}));
    } catch (error) {
      data = { error: String(error?.message || error) };
    }
    const names = Array.isArray(data.meals) ? data.meals.map((meal) => meal?.name).filter(Boolean) : [];
    const distinct = [...new Set(names.map((name) => String(name).replace(/\s·\s.*$/, "").trim().toLowerCase()))];
    const mentioned = platesNamedInReply(data.reply || data.message || "", names);
    const namedMissing = mentioned.filter((name) => {
      const base = String(name).replace(/\s·\s.*$/, "").trim().toLowerCase();
      return !distinct.includes(base);
    });
    const fail = question.kind === "meal" && (distinct.length < 2 || namedMissing.length > 0);
    results.push({
      id: question.id,
      kind: question.kind,
      setup: setup.id,
      account,
      text: question.text,
      status,
      scope: data.scope || null,
      deflect: data.deflect || null,
      reply: data.reply || data.message || "",
      meals: names,
      request_id: requestId,
      ms: Date.now() - started,
      pass: !fail,
      reason: fail
        ? (distinct.length < 2
          ? `wanted 2–3 distinct plates, got ${distinct.length}`
          : `named ${namedMissing.join(", ")} not in cards`)
        : undefined,
    });
    console.log(`q${question.id} × ${setup.id}  ${status}  ${names.join(", ") || "(none)"}${fail ? "  FAIL" : ""}`);
  }
}

const out = {
  sha,
  url,
  account,
  generatedAt: new Date().toISOString(),
  setups: setups.map((row) => row.id),
  count: results.length,
  results,
};
const file = `coach-eval-${sha}.json`;
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${file}`);
const failed = results.filter((row) => row.kind === "meal" && row.pass === false);
if (failed.length) {
  console.error(`${failed.length} food question(s) failed the 2–3 distinct / named-in-cards check`);
  process.exit(1);
}
