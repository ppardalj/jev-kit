/**
 * Runs the verify-jev skill's Jev call over past el-baul commits, without Claude: same diff file, same paths,
 * same question block (read from the skill), so the scores are exactly what the skill would get.
 *
 *   node evals/verify-jev/run.ts ~/projects/el-baul/el-baul [c01 c06 ...]
 *
 * Prints one table per commit and writes runs/<timestamp>/results.json.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { jev } from "../../mcp/src/core/client.ts";
import { askJev } from "../../mcp/src/levels/level10/index.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
process.loadEnvFile(join(here, "../../.env"));

const [repo, ...only] = process.argv.slice(2);
if (!repo) throw new Error("usage: node evals/verify-jev/run.ts <el-baul repo> [commit ids]");

const skill = readFileSync(join(here, "../skills/verify-jev/SKILL.md"), "utf8");
const questionsJson = skill.match(/```json\n([\s\S]*?)\n```/)![1];
const commits: { id: string; sha: string; kind: string }[] = JSON.parse(readFileSync(join(here, "commits.json"), "utf8"));
const DIFF = ".run/verify-jev.diff";
const PATHS = [DIFF, "docs/architecture/testing.md"];
const THRESHOLD = 1.5;
/** The skill's cut: over this the diff file is the name-status list plus --stat. */
const MAX_DIFF_BYTES = 80_000;

const sh = (cmd: string) => execSync(cmd, { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const results: unknown[] = [];
let totalUsd = 0;

for (const c of commits.filter((c) => !only.length || only.includes(c.id))) {
  mkdirSync(join(repo, ".run"), { recursive: true });
  const names = sh(`git show --format= --name-status ${c.sha}`);
  let diff = `${names}\n${sh(`git show --format= ${c.sha}`)}`;
  const statOnly = Buffer.byteLength(diff) > MAX_DIFF_BYTES;
  if (statOnly) diff = `${names}\n${sh(`git show --format= --stat ${c.sha}`)}`;
  writeFileSync(join(repo, DIFF), diff);
  let cost = 0, inputTokens = 0;
  const started = Date.now();
  const r = await askJev({ paths: PATHS }, questionsJson, repo, {
    decide: async (s, q) => {
      const out = await jev.systemOne(s, q);
      cost = out.meta.cost.amount ?? 0;
      inputTokens = out.usage.input_tokens;
      return out;
    },
  });
  const ms = Date.now() - started;
  totalUsd += cost;
  const scores = Object.fromEntries(Object.entries(r.answers).map(([suite, a]: [string, any]) => [suite, { score: a.score, confidence: a.confidence, probabilities: a.probabilities }]));
  const run = Object.entries(scores).filter(([, s]) => s.score >= THRESHOLD).map(([suite]) => suite);
  results.push({ ...c, stat_only: statOnly, subject: sh(`git log -1 --format=%s ${c.sha}`).trim(), input_tokens: inputTokens, cost_usd: cost, ms, scores, run });

  console.log(`\n${c.id} ${c.sha} ${c.kind}${statOnly ? " [stat only]" : ""}  (${inputTokens} tokens, $${cost.toFixed(5)}, ${ms} ms)`);
  for (const [suite, s] of Object.entries(scores)) {
    const p = Object.values(s.probabilities as Record<string, number>).map((x) => x.toFixed(2)).join(" ");
    console.log(`  ${suite.padEnd(20)} ${s.score.toFixed(2)}  ${s.score >= THRESHOLD ? "RUN " : "skip"}  conf ${s.confidence.toFixed(2)}  p[0..3] ${p}`);
  }
  console.log(`  -> ${run.length ? run.map((s) => `./scripts/verify ${s}`).join(" && ") : "nothing to run"}`);
}

rmSync(join(repo, DIFF), { force: true });
const out = join(here, "runs", new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
console.log(`\ntotal $${totalUsd.toFixed(5)}, written ${out}/results.json`);
