#!/usr/bin/env node
/**
 * Live coach eval. NOT in CI. Hits a preview URL with a real model
 * and writes coach-eval-<sha>.json for Data and Lifecycle to score.
 *
 *   node scripts/coach-eval.mjs --url https://xxx.pages.dev --token $MAMA_JWT
 *
 * Optional: --sha <gitsha> --setup A --start 1 --limit 52
 * The coach endpoint caps model calls (~30/day). Use --limit.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

import {
  bankContextFor,
  COACH_QUESTION_BANK,
  COACH_QUESTION_BANK_SETUPS,
} from "../functions/_shared/coachQuestionBank.js";

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
const sha = arg("sha") || gitSha();
const setupId = (arg("setup") || "A").toUpperCase();
const start = Math.max(1, Number(arg("start") || 1));
const limit = Math.max(1, Number(arg("limit") || 52));
const allSetups = hasFlag("all-setups");

if (!url || !token) {
  console.error("Usage: node scripts/coach-eval.mjs --url https://preview.pages.dev --token $MAMA_JWT [--sha abc] [--setup A]");
  process.exit(1);
}

const setups = allSetups
  ? COACH_QUESTION_BANK_SETUPS
  : [COACH_QUESTION_BANK_SETUPS.find((row) => row.id === setupId) || COACH_QUESTION_BANK_SETUPS[0]];
const questions = COACH_QUESTION_BANK.filter((row) => row.id >= start).slice(0, limit);

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
    results.push({
      id: question.id,
      kind: question.kind,
      setup: setup.id,
      text: question.text,
      status,
      scope: data.scope || null,
      deflect: data.deflect || null,
      reply: data.reply || data.message || "",
      meals: Array.isArray(data.meals) ? data.meals.map((meal) => meal?.name).filter(Boolean) : [],
      request_id: requestId,
      ms: Date.now() - started,
    });
    const names = results.at(-1).meals.join(", ") || "(none)";
    console.log(`q${question.id} × ${setup.id}  ${status}  ${names}`);
  }
}

const out = {
  sha,
  url,
  generatedAt: new Date().toISOString(),
  setups: setups.map((row) => row.id),
  count: results.length,
  results,
};
const file = `coach-eval-${sha}.json`;
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${file}`);
