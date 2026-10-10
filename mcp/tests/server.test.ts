import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { makeRepo, SAMPLE } from "./repo.ts";

const SERVER = fileURLToPath(new URL("../jev-files.ts", import.meta.url));
const repo = await makeRepo(SAMPLE);

/** The server as Claude Code runs it: a child process speaking newline-delimited JSON-RPC, here on the mock. */
const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", SERVER], {
  env: { ...process.env, JEV_BACKEND: "mock", JEV_ROOT: repo },
  stdio: ["pipe", "pipe", "pipe"],
});
const lines: any[] = [];
const waiting = new Map<number, (msg: any) => void>();
createInterface({ input: child.stdout }).on("line", (line) => {
  const msg = JSON.parse(line);
  lines.push(msg);
  waiting.get(msg.id)?.(msg);
});
after(() => child.kill());

let nextId = 1;
function request(method: string, params?: unknown): Promise<any> {
  const id = nextId++;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}
const call = async (name: string, args: unknown) => (await request("tools/call", { name, arguments: args })).result;

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

test("server: tool failures come back as isError with the reason, not as protocol errors", async () => {
  const missing = await call("ask_jev_file_bool", { path: "nope.ts", question: "x?" });
  assert.equal(missing.isError, true);
  assert.equal(missing.content[0].text, "not found: nope.ts");
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
