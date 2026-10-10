import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { makeRepo, SAMPLE } from "./repo.ts";

const SERVER = fileURLToPath(new URL("../jev-files.ts", import.meta.url));
const repo = await makeRepo(SAMPLE);

/** The server as Claude Code runs it: a child process speaking newline-delimited JSON-RPC, here on the mock. */
function startServer(env: Record<string, string> = {}) {
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", SERVER], {
    env: { ...process.env, JEV_BACKEND: "mock", JEV_ROOT: repo, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines: any[] = [];
  const waiting = new Map<number, { resolve: (msg: any) => void; reject: (err: Error) => void }>();
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  createInterface({ input: child.stdout }).on("line", (line) => {
    const msg = JSON.parse(line);
    lines.push(msg);
    waiting.get(msg.id)?.resolve(msg);
  });
  // A server that dies must fail the waiting test with its stderr, not leave it pending.
  child.on("exit", (code) => { for (const w of waiting.values()) w.reject(new Error(`server exited ${code}: ${stderr}`)); });
  after(() => child.kill());
  let nextId = 1;
  const request = (method: string, params?: unknown): Promise<any> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  };
  const call = async (name: string, args: unknown) => (await request("tools/call", { name, arguments: args })).result;
  return { child, lines, request, call };
}

const { child, lines, request, call } = startServer();

test("server: initialize echoes the protocol version and declares tools", async () => {
  const { result } = await request("initialize", { protocolVersion: "2025-06-18" });
  assert.equal(result.protocolVersion, "2025-06-18");
  assert.deepEqual(result.capabilities, { tools: {} });
  assert.equal(result.serverInfo.name, "jev-files");
});

test("server: lists the five tools, each with a description and an object schema", async () => {
  const { result } = await request("tools/list");
  assert.deepEqual(result.tools.map((t: any) => t.name).sort(), ["ask_jev_file_bool", "ask_jev_file_choice", "ask_jev_file_score", "ask_jev_files", "pick_first_file"]);
  for (const t of result.tools) {
    assert.ok(t.description.length > 50, t.name);
    assert.equal(t.inputSchema.type, "object");
    assert.ok(t.inputSchema.required.length > 0, t.name);
  }
});

test("server: only ask_jev_files asks Claude Code to load it up front", async () => {
  const { result } = await request("tools/list");
  const always = result.tools.filter((t: any) => t._meta?.["anthropic/alwaysLoad"] === true).map((t: any) => t.name);
  assert.deepEqual(always, ["ask_jev_files"]);
});

test("server: ask_jev_file_bool resolves paths against JEV_ROOT and reports the session ledger", async () => {
  const result = await call("ask_jev_file_bool", { path: "src/auth/session.ts", question: "Does `content` validate tokens?" });
  assert.equal(result.isError, undefined);
  const body = JSON.parse(result.content[0].text);
  assert.equal(body.path, "src/auth/session.ts");
  assert.equal(typeof body.answer, "boolean");
  assert.ok(body.jev_session.calls >= 1);
});

test("server: ask_jev_files returns the compact shape over a glob", async () => {
  const questions = { relevant: { type: "noul", instructions: "Does `content` document rate limits?" } };
  const result = await call("ask_jev_files", { paths_or_globs: ["**/*.md"], questions_json: JSON.stringify(questions) });
  const body = JSON.parse(result.content[0].text);
  assert.deepEqual(Object.keys(body.results), [".claude/skills/demo/SKILL.md", "docs/api.md"]);
  assert.equal(typeof body.results["docs/api.md"].relevant, "number");
  assert.equal(body.calls, 2);
});

test("server: ask_jev_files also takes the question block as an object", async () => {
  const result = await call("ask_jev_files", { paths_or_globs: ["docs/api.md"], questions_json: { q: { type: "noul", instructions: "Is `content` docs?" } } });
  assert.equal(JSON.parse(result.content[0].text).calls, 1);
});

test("server: an absolute path inside the repo works and comes back repo-relative", async () => {
  const one = await call("ask_jev_file_bool", { path: `${repo}/src/auth/session.ts`, question: "Does `content` validate tokens?" });
  assert.equal(JSON.parse(one.content[0].text).path, "src/auth/session.ts");
  const many = await call("ask_jev_files", { paths_or_globs: [`${repo}/docs/api.md`, `${repo}/src/**/*.ts`], questions_json: { q: { type: "noul", instructions: "Is `content` docs?" } } });
  assert.deepEqual(Object.keys(JSON.parse(many.content[0].text).results), ["docs/api.md", "src/auth/session.ts", "src/domain/billing.ts", "src/http/invoices.ts"]);
});

test("server: tool failures come back as isError with the reason, not as protocol errors", async () => {
  const missing = await call("ask_jev_file_bool", { path: "nope.ts", question: "x?" });
  assert.equal(missing.isError, true);
  assert.equal(missing.content[0].text, `not found: nope.ts, paths resolve from ${repo}`);
  const bad = await call("ask_jev_files", { paths_or_globs: ["src"], questions_json: "{not json" });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /not valid JSON/);
  const unknown = await call("no_such_tool", {});
  assert.equal(unknown.isError, true);
});

test("server: unknown methods are JSON-RPC errors, notifications get no reply", async () => {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const reply = await request("resources/list");
  assert.equal(reply.error.code, -32601);
  assert.ok(lines.every((m) => m.id !== undefined), "a notification got a reply");
});

test("server: a pattern over the file limit is refused before any Jev call", async () => {
  const strict = startServer({ JEV_MAX_FILES: "1" });
  const questions = { q: { type: "noul", instructions: "Is `content` docs?" } };
  const refused = await strict.call("ask_jev_files", { paths_or_globs: ["**/*.md"], questions_json: questions });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /^refused, nothing sent: 2 files, .*over the 1 file limit per call/);
  const ok = await strict.call("ask_jev_files", { paths_or_globs: ["docs/api.md"], questions_json: questions });
  assert.equal(JSON.parse(ok.content[0].text).jev_session.calls, 1, "only the admitted call reached Jev");
  const { result } = await strict.request("tools/list");
  assert.match(result.tools.find((t: any) => t.name === "ask_jev_files").description, /over 1 files/);
});

test("server: a call whose estimate would break the session budget is refused", async () => {
  const broke = startServer({ JEV_MAX_USD_PER_SESSION: "0.000000001" });
  const refused = await broke.call("ask_jev_files", { paths_or_globs: ["docs"], questions_json: { q: { type: "noul", instructions: "Is `content` docs?" } } });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /session budget is \$0\.0000/);
});

test("server: limits that were never set, or never substituted, fall back to the defaults", async () => {
  const unset = startServer({ JEV_MAX_FILES: "", JEV_MAX_TOKENS_PER_CALL: "${user_config.max_tokens_per_call}" });
  const { result } = await unset.request("tools/list");
  assert.match(result.tools.find((t: any) => t.name === "ask_jev_files").description, /over 50 files or about 500,000 tokens/);
});
