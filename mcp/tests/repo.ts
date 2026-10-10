/**
 * Test fixtures: a throwaway repo on disk, and a decide that records what it was sent.
 */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Questions, State } from "../src/core/types.ts";

/** Write `files` (path to text or bytes) under a fresh temp dir and return its path. */
export async function makeRepo(files: Record<string, string | Buffer>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "jev-kit-"));
  for (const [path, body] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), body);
  }
  return root;
}

/** A small repo shaped like the ten-levels sandbox: code, docs, a dot folder, dependencies, junk. */
export const SAMPLE = {
  "src/auth/session.ts": "export function validate(token: string) { return verify(token); }\n",
  "src/domain/billing.ts": "export const prorate = (cents: number, days: number) => Math.round((cents * days) / 30);\n",
  "src/http/invoices.ts": "router.get('/invoices', listInvoices);\n",
  "docs/api.md": "# API\n\nRate limits: 100 requests per minute.\n",
  ".claude/skills/demo/SKILL.md": "---\nname: demo\n---\nA skill.\n",
  "node_modules/dep/index.js": "module.exports = 1;\n",
  ".git/HEAD": "ref: refs/heads/main\n",
  "logo.png": "png",
  "empty.ts": "",
};

/** A decide that records every call and answers with `answers`, or with what `answers` returns for the state. */
export function fakeDecide(answers: Record<string, unknown> | ((state: State) => Record<string, unknown>)) {
  const calls: { state: State; questions: Questions }[] = [];
  const decide = async (state: State, questions: Questions) => {
    calls.push({ state, questions });
    const a = typeof answers === "function" ? answers(state) : answers;
    return { answers: a as any, usage: { input_tokens: 10, output_tokens: 2 } };
  };
  return { calls, decide };
}
