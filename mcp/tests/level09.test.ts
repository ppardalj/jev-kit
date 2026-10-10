import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import * as l9 from "../src/levels/level09/index.ts";
import { fakeDecide, makeRepo, SAMPLE } from "./repo.ts";

const Q = JSON.stringify({ touches_auth: { type: "noul", instructions: "Does `content` handle authentication?" } });
const repo = await makeRepo(SAMPLE);
const expand = (patterns: string[], recursive = false, cwd = repo) => l9.expandPatterns(patterns, cwd, recursive);

test("L9: malformed question blocks fail before any file is read", () => {
  assert.throws(() => l9.parseQuestions("{not json"), /not valid JSON/);
  assert.throws(() => l9.parseQuestions("[]"), /object keyed by question id/);
  assert.throws(() => l9.parseQuestions(JSON.stringify({ q: { type: "choice", instructions: "x", criteria: {} } })), /no options/);
});

test("L9: parallel keeps order and never exceeds the cap in flight", async () => {
  let inFlight = 0, peak = 0;
  const out = await l9.parallel([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14]);
  assert.ok(peak <= 3 && peak >= 2, `peak ${peak}`);
});

test("L9 B: a directory means its files, or everything below it when recursive", async () => {
  assert.deepEqual(await expand(["src"]), []);
  assert.deepEqual(await expand(["src/auth"]), ["src/auth/session.ts"]);
  assert.deepEqual(await expand(["src"], true), ["src/auth/session.ts", "src/domain/billing.ts", "src/http/invoices.ts"]);
});

test("L9 B: `**` reaches dot folders, which Node's own glob skips", async () => {
  assert.deepEqual(await expand(["**/*.md"]), [".claude/skills/demo/SKILL.md", "docs/api.md"]);
  const all = await expand(["."], true);
  assert.ok(all.includes(".claude/skills/demo/SKILL.md"));
});

test("L9 B: the walk never enters dependency or VCS folders", async () => {
  const all = await expand(["**/*"]);
  assert.ok(!all.some((p) => p.startsWith("node_modules/") || p.startsWith(".git/")), all.join(", "));
  assert.deepEqual(await expand(["."], true), all);
});

test("L9 B: a leading ./ and a trailing slash are the same pattern", async () => {
  assert.deepEqual(await expand(["./src/**/*.ts"]), await expand(["src/**/*.ts"]));
  assert.deepEqual(await expand(["src/auth/"]), ["src/auth/session.ts"]);
});

test("L9 B: symlinked folders are followed, and a link cycle ends the walk", async () => {
  const outside = await makeRepo({ "notes/a.md": "a" });
  const dir = await makeRepo({ "own.md": "own" });
  await symlink(outside, join(dir, "linked"));
  await mkdir(join(dir, "loop"));
  await symlink(join(dir, "loop"), join(dir, "loop", "again"));
  assert.deepEqual(await expand(["**/*.md"], false, dir), ["linked/notes/a.md", "own.md"]);
  assert.deepEqual(await expand(["loop"], true, dir), []);
});

test("L9 B: prune drops junk with a reason, and the cap holds before any call", async () => {
  const expanded = await expand(["src/**/*.ts", "logo.png", "empty.ts", "node_modules/**/*.js", "missing.ts", "../outside.ts"]);
  const { files, skipped } = await l9.pruneFiles(expanded, repo, 2);
  assert.deepEqual(files, ["src/auth/session.ts", "src/domain/billing.ts"]);
  const reasons = Object.fromEntries(skipped.map((s) => [s.path, s.reason]));
  assert.match(reasons["logo.png"], /binary/);
  assert.match(reasons["empty.ts"], /empty/);
  assert.match(reasons["node_modules/dep/index.js"], /skipped directory/);
  assert.match(reasons["missing.ts"], /not found/);
  assert.match(reasons["../outside.ts"], /outside the repo/);
  assert.match(reasons["src/http/invoices.ts"], /over the 2 file cap/);
});

test("L9 A: one call per file with every question, results sorted by path", async () => {
  const { calls, decide } = fakeDecide({ touches_auth: { type: "noul", noul: 0.5 } });
  const r = await l9.askFiles(["src/http/invoices.ts", "src/auth/session.ts", "src/domain/billing.ts"], Q, repo, { decide });
  assert.equal(r.calls, 3);
  assert.equal(calls.length, 3);
  assert.deepEqual(r.results.map((x) => x.path), ["src/auth/session.ts", "src/domain/billing.ts", "src/http/invoices.ts"]);
  assert.ok(calls.every((c) => typeof (c.state as any).content === "string" && "touches_auth" in c.questions));
});

test("L9 A: a failed call becomes a skipped entry, the other files still answer", async () => {
  const decide = async (state: any) => {
    if (state.path === "src/domain/billing.ts") throw new Error("HTTP 503");
    return { answers: { touches_auth: { type: "noul", noul: 0.5 } } as any };
  };
  const r = await l9.askFiles(["src/**/*.ts"], Q, repo, { decide });
  assert.equal(r.calls, 2);
  assert.deepEqual(r.skipped, [{ path: "src/domain/billing.ts", reason: "call failed: HTTP 503" }]);
});

test("L9 A: a recursive directory answers every surviving file on the mock", async () => {
  const r = await l9.askFiles(["."], Q, repo, { recursive: true, concurrency: 4 });
  assert.deepEqual(r.results.map((x) => x.path), [".claude/skills/demo/SKILL.md", "docs/api.md", "src/auth/session.ts", "src/domain/billing.ts", "src/http/invoices.ts"]);
  assert.ok(r.results.every((x) => typeof (x.answers.touches_auth as any).noul === "number"));
});

test("L9 C: the first pick is keyed by path with an exit, and a weak or none pick returns null", async () => {
  const cands = [{ path: "src/domain/billing.ts", note: "proration" }, { path: "src/http/invoices.ts" }];
  const q = l9.pickQuestion("Which file first?", cands);
  assert.deepEqual(Object.keys(q.pick.criteria), ["src/domain/billing.ts", "src/http/invoices.ts", "none"]);
  const pick = (choice: string, confidence: number) => fakeDecide({ pick: { type: "choice", choice, confidence, probabilities: {} } }).decide;
  assert.equal((await l9.pickFirstFile("Which file first?", cands, pick("src/domain/billing.ts", 0.9))).path, "src/domain/billing.ts");
  assert.equal((await l9.pickFirstFile("Which file first?", cands, pick("src/http/invoices.ts", 0.2))).path, null);
  assert.equal((await l9.pickFirstFile("Which file first?", cands, pick("none", 0.95))).path, null);
  const empty = await l9.pickFirstFile("Which file first?", [], async () => { throw new Error("must not call"); });
  assert.equal(empty.path, null);
});
