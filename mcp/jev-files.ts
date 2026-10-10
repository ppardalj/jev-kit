/**
 * MCP server (stdio) exposing Levels 8 and 9 of ten-levels-of-jev to Claude Code.
 * The code under ./src is a copy of ten-levels-of-jev (apps/ten-levels/src: core, level08, level09), owned here.
 *
 *   ask_jev_file_bool / ask_jev_file_choice / ask_jev_file_score   one file, one question (L8)
 *   ask_jev_files / pick_first_file                                many files in parallel, then a pick (L9)
 *
 * Code reads the files and sends them to Jev; the agent only gets typed answers.
 * Zero dependencies: newline-delimited JSON-RPC over stdin/stdout, run with plain `node` (type stripping).
 * Files resolve against JEV_ROOT, or the directory Claude Code launched the server from.
 * Credentials: OPENROUTER_API_KEY / TYPESAFE_API_KEY from the environment or ../.env; JEV_BACKEND=mock for offline runs.
 */
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { jev } from "./src/core/client.ts";
import type { Answer, Questions, State } from "./src/core/types.ts";
import { askFileBool, askFileChoice, askFileScore, FileStateError } from "./src/levels/level08/index.ts";
import { askFiles, parseQuestions, pickFirstFile, type AskFilesResult } from "./src/levels/level09/index.ts";

const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const ROOT = process.env.JEV_ROOT || process.cwd();
const log = (...args: unknown[]) => process.stderr.write(`[jev-files] ${args.map(String).join(" ")}\n`);

/** Running ledger for the session, so every tool result carries what Jev has cost so far. */
const ledger = { calls: 0, input_tokens: 0, cost_usd: 0 };

type Decide = (state: State, questions: Questions) => Promise<{ answers: any; usage: unknown }>;

async function decideAndCount(state: State, questions: Questions) {
  const result = await jev.systemOne(state, questions);
  ledger.calls++;
  ledger.input_tokens += result.usage.input_tokens;
  if (result.meta.cost.amount !== null) ledger.cost_usd += result.meta.cost.amount;
  return { answers: result.answers, usage: result.usage };
}

const WHEN =
  "Use this for a judgment about what a file does or contains, without reading it into your context. " +
  "Write the question against `content`, which is the file's text. Use the Read tool instead when you need the code itself, to edit or quote it. " +
  "Exact lookups, does this string appear, how many lines, belong to Grep, not here.";

const QUESTION_SCHEMA =
  "questions_json is a JSON object keyed by question id. Three types. " +
  'noul: {"type":"noul","instructions":"Does `content` ...?","criteria":{"true":"...","false":"..."}} returns a probability of yes. ' +
  'choice: {"type":"choice","instructions":"Which ... is `content`?","criteria":{"option_a":"when it applies","option_b":"...","other":"none of the above"}} returns one of your keys plus confidence, up to 255 options. ' +
  'score: {"type":"score","instructions":"How ... is `content`?","criteria":["lowest situation","...","highest situation"]} returns a position on your levels, two to ten of them. ' +
  "Write every question against `content`, the file's text; `path` is also in the state. Ask every question you might need in one block, it is one call per file either way.";

const str = (description: string) => ({ type: "string", description });
const r2 = (x: number) => Math.round(x * 100) / 100;

/** One value per answer: noul is p(yes), choice is "key confidence", score is the position on the levels. */
const compactAnswer = (a: Answer) =>
  a.type === "noul" ? r2(a.noul) : a.type === "choice" ? `${a.choice} ${r2(a.confidence)}` : r2(a.score);

/**
 * ask_jev_files output sized for the agent's context: one line per file, score legends once instead of per file,
 * no per-file usage (jev_session carries the totals).
 */
function compactFiles(result: AskFilesResult, questions: Questions, session: object): string {
  const legends = Object.fromEntries(
    Object.entries(questions).flatMap(([id, q]) => (q.type === "score" ? [[id, q.criteria]] : [])),
  );
  const rows = result.results.map((r) => {
    const answers = Object.fromEntries(Object.entries(r.answers).map(([id, a]) => [id, compactAnswer(a)]));
    return `  ${JSON.stringify(r.path)}: ${JSON.stringify(answers)}`;
  });
  const rest = { legends, skipped: result.skipped, calls: result.calls, jev_session: session };
  const tail = Object.entries(rest).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return `{\n"results": {\n${rows.join(",\n")}\n},\n${tail.join(",\n")}\n}`;
}

const TOOLS: Record<string, { description: string; inputSchema: object; run: (p: any, decide: Decide) => Promise<unknown>; format?: (payload: any, session: object) => string }> = {
  ask_jev_file_bool: {
    description: `Yes or no about one file. Returns { path, answer, noul } where noul is the probability of yes, 0 to 1. ${WHEN}`,
    inputSchema: {
      type: "object",
      properties: {
        path: str("File path, relative to the repo"),
        question: str("A yes or no question about `content`, for example: Does `content` validate authentication tokens?"),
        yes: str("What counts as yes"),
        no: str("What counts as no"),
      },
      required: ["path", "question"],
    },
    run: (p, decide) => askFileBool(p.path, p.question, ROOT, { yes: p.yes, no: p.no }, decide),
  },
  ask_jev_file_choice: {
    description: `Pick one option about one file. Returns { path, choice, confidence, probabilities }. The choice is always one of your options; an "other" option is added if you leave none. ${WHEN}`,
    inputSchema: {
      type: "object",
      properties: {
        path: str("File path, relative to the repo"),
        question: str("The question, for example: Which layer is `content`?"),
        options: { type: "object", additionalProperties: { type: "string" }, description: "Option name to a one line description of when it applies. Up to 255." },
      },
      required: ["path", "question", "options"],
    },
    run: (p, decide) => askFileChoice(p.path, p.question, p.options, ROOT, decide),
  },
  ask_jev_file_score: {
    description: `A position on a scale you define, about one file. Returns { path, score, top, nearest, confidence, legend }. Levels are ordered low to high, two to ten of them, each a described situation. ${WHEN}`,
    inputSchema: {
      type: "object",
      properties: {
        path: str("File path, relative to the repo"),
        question: str("The question, for example: How risky is a refactor of `content`?"),
        levels: { type: "array", items: { type: "string" }, description: "Ordered low to high, each level a situation, for example: Isolated and well tested" },
      },
      required: ["path", "question", "levels"],
    },
    run: (p, decide) => askFileScore(p.path, p.question, p.levels, ROOT, decide),
  },
  ask_jev_files: {
    description:
      "Ask the same typed questions of many files at once without reading any of them. Code expands globs and directories, " +
      "drops node_modules, .git, binaries, and files over the budget, caps the list at 255, then makes one Jev call per file in parallel. " +
      'Returns { results: { path: { question_id: value } }, legends, skipped: [{ path, reason }], calls }. Values: noul is p(yes), choice is "key confidence", ' +
      "score is the position on its levels, listed once in legends. " + QUESTION_SCHEMA +
      " Use Read when you need a file's code; use Grep for exact strings.",
    inputSchema: {
      type: "object",
      properties: {
        paths_or_globs: { type: "array", items: { type: "string" }, description: 'Files, directories, or globs, relative to the repo, for example ["src/**/*.ts"] or ["src/http"]' },
        questions_json: str("The question block as a JSON string"),
        recursive: { type: "boolean", description: "For directories: include every file below them. Default false." },
      },
      required: ["paths_or_globs", "questions_json"],
    },
    run: async (p, decide) => {
      const questionsJson = typeof p.questions_json === "string" ? p.questions_json : JSON.stringify(p.questions_json);
      const result = await askFiles(p.paths_or_globs, questionsJson, ROOT, { recursive: p.recursive ?? false, decide });
      return { result, questions: parseQuestions(questionsJson) };
    },
    format: ({ result, questions }, session) => compactFiles(result, questions, session),
  },
  pick_first_file: {
    description:
      "After ask_jev_files, choose which of a list of files to open first for a goal. One Choice keyed by path, so the pick is always a real file. " +
      "Returns { path | null, confidence, probabilities }. Pass a short note per path if you have one, for example the answers you already got.",
    inputSchema: {
      type: "object",
      properties: {
        question: str("The goal, for example: Which file should I open first to fix the proration bug?"),
        candidates: {
          type: "array",
          items: { type: "object", properties: { path: { type: "string" }, note: { type: "string" } }, required: ["path"] },
          description: "Paths, with an optional one line note each",
        },
      },
      required: ["question", "candidates"],
    },
    run: (p, decide) => pickFirstFile(p.question, p.candidates, decide),
  },
};

async function callTool(name: string, args: any) {
  const tool = TOOLS[name];
  if (!tool) return { content: [{ type: "text", text: `unknown tool: ${name}` }], isError: true };
  let calls = 0;
  const decide: Decide = (state, questions) => (calls++, decideAndCount(state, questions));
  try {
    const payload = await tool.run(args ?? {}, decide);
    log(`${name}: ${calls} Jev calls, session total ${ledger.calls} calls $${ledger.cost_usd.toFixed(6)}`);
    const session = { ...ledger, cost_usd: Number(ledger.cost_usd.toFixed(6)) };
    const text = tool.format ? tool.format(payload, session) : JSON.stringify({ ...(payload as object), jev_session: session }, null, 2);
    return { content: [{ type: "text", text }] };
  } catch (err: any) {
    log(`${name} failed: ${err?.message ?? err}`);
    return { content: [{ type: "text", text: err instanceof FileStateError ? err.message : `error: ${err?.message ?? err}` }], isError: true };
  }
}

async function handle(msg: any): Promise<unknown | undefined> {
  switch (msg.method) {
    case "initialize":
      return {
        protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "jev-files", version: "0.1.0" },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })) };
    case "tools/call":
      return callTool(msg.params?.name, msg.params?.arguments);
    default:
      throw Object.assign(new Error(`method not found: ${msg.method}`), { code: -32601 });
  }
}

const send = (obj: unknown) => process.stdout.write(JSON.stringify(obj) + "\n");

createInterface({ input: process.stdin }).on("line", async (line) => {
  if (!line.trim()) return;
  let msg: any;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
  }
  const isRequest = msg.id !== undefined && msg.id !== null;
  try {
    const result = await handle(msg);
    if (isRequest) send({ jsonrpc: "2.0", id: msg.id, result });
  } catch (err: any) {
    if (isRequest) send({ jsonrpc: "2.0", id: msg.id, error: { code: err.code ?? -32603, message: err.message } });
  }
});

log(`ready, root ${ROOT}`);
