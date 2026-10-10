import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as l10 from "../src/levels/level10/index.ts";
import { fakeDecide, makeRepo, SAMPLE } from "./repo.ts";

const Q = JSON.stringify({
  kind: { type: "choice", instructions: "What kind of failure is `text`?", criteria: { bug_in_code: "The code is wrong", wrong_test: "The test is wrong", other: "None" } },
  flaky: { type: "noul", instructions: "Is `text` intermittent?" },
});
const repo = await makeRepo(SAMPLE);
const ANSWERS = { kind: { type: "choice", choice: "bug_in_code", confidence: 0.9, probabilities: {} }, flaky: { type: "noul", noul: 0.1 } };

test("L10: JSON text becomes structured state, other text stays text", () => {
  assert.deepEqual(l10.parseState('{"diff": "+x"}'), { diff: "+x" });
  assert.equal(l10.parseState("not ok 3 - proration"), "not ok 3 - proration");
  assert.equal(l10.parseState("{broken"), "{broken");
  assert.deepEqual(l10.parseState({ already: "an object" }), { already: "an object" });
});

test("L10: own state, files, and both assemble into one state keyed by repo-relative path", async () => {
  const text = await l10.assembleState({ state: "customer says export fails" }, repo);
  assert.deepEqual(text.state, { text: "customer says export fails" });
  const both = await l10.assembleState({ state: '{"report": "export is broken"}', paths: ["src/domain/billing.ts", `${repo}/docs/api.md`] }, repo);
  assert.equal(both.state.report, "export is broken");
  assert.deepEqual(Object.keys(both.state.files as object), ["docs/api.md", "src/domain/billing.ts"]);
  assert.match((both.state.files as any)["src/domain/billing.ts"], /prorate/);
  assert.deepEqual(both.summary.own_fields, ["report"]);
  assert.ok(both.summary.tokens > 0);
});

test("L10: paths drop junk and honor ! patterns, like ask_jev_files", async () => {
  const a = await l10.assembleState({ paths: ["src", "!src/http"] }, repo);
  assert.deepEqual(a.summary.files, ["src/auth/session.ts", "src/domain/billing.ts"]);
  const junk = await l10.assembleState({ paths: ["docs/api.md", "logo.png", "nope.ts"] }, repo);
  assert.deepEqual(junk.summary.files, ["docs/api.md"]);
  assert.equal(junk.summary.skipped.length, 2);
});

test("L10: nothing to judge is refused, and says why when every path was skipped", async () => {
  await assert.rejects(l10.assembleState({}, repo), /nothing to judge/);
  await assert.rejects(l10.assembleState({ state: "{}" }, repo), /nothing to judge/);
  await assert.rejects(l10.assembleState({ paths: ["nope.ts"] }, repo), /Every path was skipped: nope\.ts \(not found/);
});

test("L10: pasted content over the own-state limit is refused", async () => {
  await assert.rejects(l10.assembleState({ state: "x".repeat(l10.MAX_OWN_STATE_CHARS + 1) }, repo), /Do not paste file contents/);
});

test("L10: too many files points at ask_jev_files, too many tokens names the parts and a split", async () => {
  const many = await makeRepo(Object.fromEntries(Array.from({ length: 22 }, (_, i) => [`f${i}.ts`, `export const v${i} = ${i};`])));
  await assert.rejects(l10.assembleState({ paths: ["*.ts"] }, many), /more than 20 files.*ask_jev_files/);
  await writeFile(join(many, "big1.txt"), "a".repeat(150_000));
  await writeFile(join(many, "big2.txt"), "b".repeat(150_000));
  await assert.rejects(l10.assembleState({ paths: ["big1.txt", "big2.txt"] }, many), /Split into 2 calls with the same questions_json: call 1: paths \[big[12]\.txt\]/);
});

test("L10: suggestSplit packs largest first under the budget", () => {
  const groups = l10.suggestSplit([{ name: "a", tokens: 30, kind: "file" }, { name: "b", tokens: 25, kind: "file" }, { name: "c", tokens: 20, kind: "file" }, { name: "d", tokens: 5, kind: "own" }], 50);
  assert.deepEqual(groups.map((g) => g.map((p) => p.name)), [["a", "c"], ["b", "d"]]);
});

test("L10: askJev makes one call with the assembled state and every question", async () => {
  const { calls, decide } = fakeDecide(ANSWERS);
  const r = await l10.askJev({ state: "not ok 3 - proration", paths: ["src/domain/billing.ts"] }, Q, repo, { decide });
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0].questions), ["kind", "flaky"]);
  assert.equal((calls[0].state as any).text, "not ok 3 - proration");
  assert.deepEqual(r.answers, ANSWERS);
  assert.deepEqual(r.state_summary.files, ["src/domain/billing.ts"]);
});

test("L10: bad questions fail before any file is read; beforeCall can refuse before any call", async () => {
  const { calls, decide } = fakeDecide(ANSWERS);
  await assert.rejects(l10.askJev({ paths: ["nope.ts"] }, "nope", repo, { decide }), /not valid JSON/);
  await assert.rejects(l10.askJev({ state: "x" }, JSON.stringify({ q: { type: "score", instructions: "x", criteria: ["one"] } }), repo, { decide }), /between 2 and 10 levels/);
  const seen: number[] = [];
  const beforeCall = (a: l10.Assembled) => { seen.push(a.summary.tokens); throw new Error("refused"); };
  await assert.rejects(l10.askJev({ state: "x" }, Q, repo, { decide, beforeCall }), /refused/);
  assert.equal(seen.length, 1);
  assert.equal(calls.length, 0);
});

test("L10: the description teaches the three types and the boundaries", () => {
  for (const word of [/noul/, /choice/, /score/, /Not for: exact lookups/, /`other` option/, /ask_jev_files/]) assert.match(l10.ASK_JEV_DESCRIPTION, word);
  assert.doesNotMatch(l10.ASK_JEV_DESCRIPTION, /command and code runs/);
});
