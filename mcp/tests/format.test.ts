import test from "node:test";
import assert from "node:assert/strict";
import { compactAnswer, compactFiles } from "../format.ts";
import type { Questions } from "../src/core/types.ts";

const questions: Questions = {
  relevant: { type: "noul", instructions: "Is `content` relevant?" },
  layer: { type: "choice", instructions: "Which layer?", criteria: { http: "Routes", domain: "Rules", other: "None" } },
  depth: { type: "score", instructions: "How deep?", criteria: ["None", "Passing", "Section"] },
};

const answers = {
  relevant: { type: "noul" as const, noul: 0.9312 },
  layer: { type: "choice" as const, choice: "domain", confidence: 0.876, probabilities: { http: 0.1, domain: 0.876, other: 0.024 } },
  depth: { type: "score" as const, score: 1.886, confidence: 0.88, legend: { "0": "None", "1": "Passing", "2": "Section" }, probabilities: { "0": 0, "1": 0.12, "2": 0.88 } },
};

test("format: each answer type collapses to one rounded value", () => {
  assert.equal(compactAnswer(answers.relevant), 0.93);
  assert.equal(compactAnswer(answers.layer), "domain 0.88");
  assert.equal(compactAnswer(answers.depth), 1.89);
});

test("format: ask_jev_files output is valid JSON, one line per file, legends once", () => {
  const result = {
    results: [
      { path: "a.md", answers, usage: { input_tokens: 100, output_tokens: 10 } },
      { path: "b.md", answers, usage: { input_tokens: 100, output_tokens: 10 } },
    ],
    skipped: [{ path: "logo.png", reason: "binary or lock file" }],
    calls: 2,
  };
  const text = compactFiles(result, questions, { calls: 2, input_tokens: 200, cost_usd: 0.0001 });
  const parsed = JSON.parse(text);
  assert.deepEqual(parsed.results, {
    "a.md": { relevant: 0.93, layer: "domain 0.88", depth: 1.89 },
    "b.md": { relevant: 0.93, layer: "domain 0.88", depth: 1.89 },
  });
  assert.deepEqual(parsed.legends, { depth: ["None", "Passing", "Section"] });
  assert.deepEqual(parsed.skipped, result.skipped);
  assert.equal(parsed.calls, 2);
  assert.deepEqual(parsed.jev_session, { calls: 2, input_tokens: 200, cost_usd: 0.0001 });
  assert.ok(!text.includes("usage") && !text.includes("probabilities"));
  assert.equal(text.split("\n").filter((l) => l.includes('"a.md"')).length, 1);
});

test("format: no results is still valid JSON", () => {
  const parsed = JSON.parse(compactFiles({ results: [], skipped: [], calls: 0 }, questions, {}));
  assert.deepEqual(parsed.results, {});
});
