/**
 * MCP server (stdio) exposing Levels 8, 9 and 10 of ten-levels-of-jev to Claude Code.
 * The code under ./src is a copy of ten-levels-of-jev (apps/ten-levels/src: core, level08, level09, level10), owned here.
 *
 *   ask_jev_file_bool / ask_jev_file_choice / ask_jev_file_score   one file, one question (L8)
 *   ask_jev_files / pick_first_file                                many files in parallel, then a pick (L9)
 *   ask_jev                                                        any state plus up to 20 files, any questions, one call (L10)
 *
 * Code reads the files and sends them to Jev; the agent only gets typed answers.
 * Zero dependencies: newline-delimited JSON-RPC over stdin/stdout, run with plain `node` (type stripping).
 * Files resolve against JEV_ROOT, then CLAUDE_PROJECT_DIR (Claude Code sets it for MCP servers), then the cwd. Absolute paths inside it work too.
 * Credentials: OPENROUTER_API_KEY / TYPESAFE_API_KEY from the environment. As the jev-kit plugin, the key comes from
 * its userConfig; in development, from ../.env. JEV_BACKEND=mock for offline runs.
 * Spend limits (./budget.ts): JEV_MAX_FILES, JEV_MAX_TOKENS_PER_CALL, JEV_MAX_USD_PER_SESSION, from userConfig in the plugin.
 */
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { jev } from "./src/core/client.ts";
import type { Questions, State } from "./src/core/types.ts";
import { askFileBool, askFileChoice, askFileScore, FileStateError } from "./src/levels/level08/index.ts";
import { askFiles, parseQuestions, pickFirstFile } from "./src/levels/level09/index.ts";
import { ASK_JEV_DESCRIPTION, AskStateError, askJev } from "./src/levels/level10/index.ts";
import { Budget, BudgetError, estimateTokens, readLimits } from "./budget.ts";
import { compactFiles } from "./format.ts";

// Development only: the installed plugin has no .env and passes the key through userConfig.
const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const ROOT = process.env.JEV_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const log = (...args: unknown[]) => process.stderr.write(`[jev-files] ${args.map(String).join(" ")}\n`);

/** Running ledger and spend limits for the session; every tool result carries what Jev has cost so far. */
const budget = new Budget(readLimits(process.env));

type Decide = (state: State, questions: Questions) => Promise<{ answers: any; usage: unknown }>;

async function decideAndCount(state: State, questions: Questions) {
  const result = await jev.systemOne(state, questions);
  budget.record(result.usage.input_tokens, result.meta.cost.amount);
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
// The agent's shell may have cd'd into a subfolder, so say where relative paths start.
const PATH = `relative to the repo root (${ROOT}), or absolute inside it`;
const TOOLS: Record<string, { description: string; inputSchema: object; alwaysLoad?: boolean; run: (p: any, decide: Decide) => Promise<unknown>; format?: (payload: any, session: object) => string }> = {
  ask_jev_file_bool: {
    description: `Yes or no about one file. Returns { path, answer, noul } where noul is the probability of yes, 0 to 1. ${WHEN}`,
    inputSchema: {
      type: "object",
      properties: {
        path: str(`File path, ${PATH}`),
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
        path: str(`File path, ${PATH}`),
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
        path: str(`File path, ${PATH}`),
        question: str("The question, for example: How risky is a refactor of `content`?"),
        levels: { type: "array", items: { type: "string" }, description: "Ordered low to high, each level a situation, for example: Isolated and well tested" },
      },
      required: ["path", "question", "levels"],
    },
    run: (p, decide) => askFileScore(p.path, p.question, p.levels, ROOT, decide),
  },
  ask_jev_files: {
    description:
      "Audit or triage many files by a judgment grep can't make, such as whether each one follows a rule, handles a concern, or belongs to a layer, without reading any of them. " +
      "Typical use: Grep or Glob for the candidates, pass that list here with every question you need, then Read only the files whose answers call for it. Code expands globs and directories, " +
      "drops node_modules, .git, binaries, and oversized files, then makes one Jev call per file in parallel. " +
      `Refused before any call when it matches over ${budget.limits.maxFiles} files or about ${budget.limits.maxTokensPerCall.toLocaleString("en")} tokens, so scope the pattern to where the answer can be. ` +
      'Returns { results: { path: { question_id: value } }, legends, skipped: [{ path, reason }], calls }. Values: noul is p(yes), choice is "key confidence", ' +
      "score is the position on its levels, listed once in legends. " + QUESTION_SCHEMA +
      " Use Read when you need a file's code; use Grep for exact strings.",
    inputSchema: {
      type: "object",
      properties: {
        paths_or_globs: { type: "array", items: { type: "string" }, description: `Files, directories, or globs, ${PATH}, for example ["src/**/*.ts"] or ["src/http"]. Start a pattern with ! to leave out what it matches, for example ["src/**/*.tsx", "!**/*.stories.tsx", "!**/*.test.tsx"]` },
        questions_json: str("The question block as a JSON string"),
        recursive: { type: "boolean", description: "For directories: include every file below them. Default false." },
      },
      required: ["paths_or_globs", "questions_json"],
    },
    run: async (p, decide) => {
      const questionsJson = typeof p.questions_json === "string" ? p.questions_json : JSON.stringify(p.questions_json);
      let release = () => {};
      const beforeCalls = (plan: { files: string[]; bytes: number; capped: number }) => {
        const files = plan.files.length + plan.capped;
        release = budget.admit({ files, tokens: estimateTokens(plan.bytes, files, questionsJson.length) });
      };
      try {
        const result = await askFiles(p.paths_or_globs, questionsJson, ROOT, { recursive: p.recursive ?? false, decide, beforeCalls });
        return { result, questions: parseQuestions(questionsJson) };
      } finally {
        release();
      }
    },
    format: ({ result, questions }, session) => compactFiles(result, questions, session),
    alwaysLoad: true,
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
  ask_jev: {
    description: ASK_JEV_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        questions_json: str("The question block, a JSON object keyed by question id, as a JSON string"),
        state: str("Your own state: plain text, or a JSON object as a string. For what only you can say; not for pasting files."),
        paths: { type: "array", items: { type: "string" }, description: `Files, directories, or globs for code to read into files["path"], ${PATH}. Up to 20 files. Start a pattern with ! to leave files out.` },
      },
      required: ["questions_json"],
    },
    run: async (p, decide) => {
      const questionsJson = typeof p.questions_json === "string" ? p.questions_json : JSON.stringify(p.questions_json);
      let release = () => {};
      const beforeCall = ({ summary }: { summary: { files: string[]; tokens: number } }) => {
        release = budget.admit({ files: summary.files.length, tokens: summary.tokens + estimateTokens(0, 1, questionsJson.length) });
      };
      try {
        return await askJev({ state: p.state, paths: p.paths }, questionsJson, ROOT, { decide, beforeCall });
      } finally {
        release();
      }
    },
    alwaysLoad: true,
  },
};

async function callTool(name: string, args: any) {
  const tool = TOOLS[name];
  if (!tool) return { content: [{ type: "text", text: `unknown tool: ${name}` }], isError: true };
  let calls = 0;
  const decide: Decide = (state, questions) => (calls++, decideAndCount(state, questions));
  try {
    budget.admit({ files: 0, tokens: 0 })(); // a spent session refuses every tool, not only ask_jev_files
    const payload = await tool.run(args ?? {}, decide);
    const session = budget.session();
    log(`${name}: ${calls} Jev calls, session total ${session.calls} calls $${session.cost_usd}`);
    const text = tool.format ? tool.format(payload, session) : JSON.stringify({ ...(payload as object), jev_session: session }, null, 2);
    return { content: [{ type: "text", text }] };
  } catch (err: any) {
    log(`${name} failed: ${err?.message ?? err}`);
    const verbatim = err instanceof FileStateError || err instanceof BudgetError || err instanceof AskStateError;
    return { content: [{ type: "text", text: verbatim ? err.message : `error: ${err?.message ?? err}` }], isError: true };
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
      // alwaysLoad: Claude Code loads the tool up front instead of behind a tool search, which saves the skills a turn.
      return {
        tools: Object.entries(TOOLS).map(([name, t]) => ({
          name, description: t.description, inputSchema: t.inputSchema, ...(t.alwaysLoad && { _meta: { "anthropic/alwaysLoad": true } }),
        })),
      };
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

log(`ready, root ${ROOT}, limits ${JSON.stringify(budget.limits)}`);
