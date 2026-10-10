import test from "node:test";
import assert from "node:assert/strict";
import * as l8 from "../src/levels/level08/index.ts";
import { fakeDecide, makeRepo, SAMPLE } from "./repo.ts";

const repo = await makeRepo(SAMPLE);

test("L8: readFileState hands back the path and the text", async () => {
  const s = await l8.readFileState("src/auth/session.ts", repo);
  assert.equal(s.path, "src/auth/session.ts");
  assert.match(s.content, /export function validate/);
});

test("L8: an absolute path inside the repo reads as repo-relative; one outside is refused, never read", async () => {
  assert.equal((await l8.readFileState(`${repo}/src/auth/session.ts`, repo)).path, "src/auth/session.ts");
  const outside = await makeRepo({ "secret.txt": "token" });
  await assert.rejects(l8.readFileState(`${outside}/secret.txt`, repo), /outside the repo/);
  await assert.rejects(l8.readFileState("../x.txt", repo), /outside the repo/);
  assert.equal(l8.repoPath("..notes.md", repo), "..notes.md", "a name starting with .. is still inside");
});

test("L8: missing, directory, binary, and oversized files are refused with the path", async () => {
  const dir = await makeRepo({
    "blob.bin": Buffer.from([0x89, 0x50, 0x00, 0x47, 0x0d, 0x0a]),
    "big.txt": "x".repeat(l8.MAX_FILE_CHARS + 1),
    "sub/a.txt": "a",
  });
  await assert.rejects(l8.readFileState("nope.ts", dir), new RegExp(`not found: nope\\.ts, paths resolve from ${dir}`));
  await assert.rejects(l8.readFileState("sub", dir), /not a file: sub/);
  await assert.rejects(l8.readFileState("blob.bin", dir), /binary: blob\.bin/);
  await assert.rejects(l8.readFileState("big.txt", dir), /too large/);
});

test("L8 A: the bool tool sends the file as content and returns a boolean plus the noul", async () => {
  const { calls, decide } = fakeDecide({ answer: { type: "noul", noul: 0.91 } });
  const r = await l8.askFileBool("src/auth/session.ts", "Does `content` validate tokens?", repo, { yes: "It checks a token", no: "No token handling" }, decide);
  assert.equal(r.answer, true);
  assert.equal(r.noul, 0.91);
  assert.equal((calls[0].state as any).path, "src/auth/session.ts");
  assert.match((calls[0].state as any).content, /validate/);
  assert.equal((calls[0].questions.answer as any).criteria.true, "It checks a token");
});

test("L8 A: without yes or no the question carries no criteria, and 0.5 is a no", async () => {
  const { calls, decide } = fakeDecide({ answer: { type: "noul", noul: 0.5 } });
  const r = await l8.askFileBool("src/auth/session.ts", "Does `content` validate tokens?", repo, {}, decide);
  assert.equal(r.answer, false);
  assert.equal((calls[0].questions.answer as any).criteria, undefined);
});

test("L8 B: the choice tool adds an exit option when the agent leaves none", async () => {
  const { calls, decide } = fakeDecide({ answer: { type: "choice", choice: "http_handler", confidence: 0.8, probabilities: { http_handler: 0.8, other: 0.2 } } });
  const r = await l8.askFileChoice("src/http/invoices.ts", "Which layer is `content`?", { http_handler: "Routes", data_access: "Storage" }, repo, decide);
  assert.equal(r.choice, "http_handler");
  assert.deepEqual(Object.keys((calls[0].questions.answer as any).criteria), ["http_handler", "data_access", "other"]);
});

test("L8 B: an exit the agent already wrote is kept as is", async () => {
  for (const exit of ["other", "none", "none_of_the_above"]) {
    const { calls, decide } = fakeDecide({ answer: { type: "choice", choice: exit, confidence: 0.9, probabilities: {} } });
    await l8.askFileChoice("src/http/invoices.ts", "Which layer?", { http_handler: "Routes", [exit]: "Neither" }, repo, decide);
    assert.deepEqual(Object.keys((calls[0].questions.answer as any).criteria), ["http_handler", exit]);
  }
});

test("L8 C: the score tool returns the nearest level in words", async () => {
  const levels = ["Isolated", "Some callers", "Security sensitive"];
  const { decide } = fakeDecide({ answer: { type: "score", score: 1.8, confidence: 0.7, legend: { "0": levels[0], "1": levels[1], "2": levels[2] }, probabilities: { "0": 0.1, "1": 0.2, "2": 0.7 } } });
  const r = await l8.askFileScore("src/domain/billing.ts", "How risky is a refactor of `content`?", levels, repo, decide);
  assert.equal(r.top, 2);
  assert.equal(r.nearest, "Security sensitive");
});

test("L8: on the mock, all three tools return their declared shapes", async () => {
  const b = await l8.askFileBool("src/auth/session.ts", "Does `content` validate tokens?", repo);
  assert.equal(typeof b.answer, "boolean");
  const c = await l8.askFileChoice("src/http/invoices.ts", "Which layer is `content`?", { http_handler: "Routes", domain_logic: "Rules", data_access: "Storage" }, repo);
  assert.ok(["http_handler", "domain_logic", "data_access", "other"].includes(c.choice));
  const s = await l8.askFileScore("src/domain/billing.ts", "How risky is a refactor of `content`?", ["Low", "Medium", "High"], repo);
  assert.ok(s.score >= 0 && s.score <= 2);
});
