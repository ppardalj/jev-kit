/**
 * Level 10, shared: the state ask_jev sends is assembled in code.
 * The agent's own state is the base. `paths` become `files`, keyed by repo-relative path. One call, one situation. Over the budget, the error names the parts and a split that fits, so the agent can make two calls instead of one truncated one.
 * Adapted here: no `command` part. A command run by an MCP tool would bypass Claude Code's permissions, so the agent runs it itself and passes what matters as state.
 */
import { LIMITS } from "../../core/types.ts";
import { FileStateError, readFileState } from "../level08/read-state.ts";
import { expandPatterns, pruneFiles, type Skipped } from "../level09/prune.ts";

/** Roughly four characters per token, the same estimate the file reader uses. */
export const tokensOf = (text: string) => Math.ceil(text.length / 4);
/** Leave room for the questions inside Jev's shared budget. */
export const STATE_TOKEN_BUDGET = LIMITS.TOTAL_TOKEN_BUDGET - 4000;
/** A single situation, not a corpus. Many files belong to ask_jev_files. */
export const MAX_FILES_PER_CALL = 20;
/** The agent's own state is for what only it can say, such as a report or a command's output; files go through paths. */
export const MAX_OWN_STATE_CHARS = 32_000;

export interface AssembleInput {
  state?: string | Record<string, unknown>;
  paths?: string[];
}

export interface Assembled {
  state: Record<string, unknown>;
  summary: {
    own_fields: string[];
    files: string[];
    skipped: Skipped[];
    tokens: number;
  };
}

interface Part {
  name: string;
  tokens: number;
  kind: "own" | "file";
}

export class AskStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AskStateError";
  }
}

const fmtK = (t: number) => (t >= 1000 ? `${(t / 1000).toFixed(1)}k` : String(t)) + " tokens";

/** A JSON string becomes structured state; anything else is sent as the string it is. */
export function parseState(raw: string | Record<string, unknown>): string | Record<string, unknown> | unknown[] {
  if (typeof raw !== "string") return raw;
  const t = raw.trim();
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try { return JSON.parse(t); } catch { /* not JSON after all, send the text */ }
  }
  return raw;
}

/**
 * Greedy first fit, largest first. Returns groups whose token sums fit the budget, so the error
 * can say "call 1: these, call 2: those" instead of "too big".
 */
export function suggestSplit(parts: Part[], budget: number): Part[][] {
  const bins: { total: number; items: Part[] }[] = [];
  for (const part of [...parts].sort((a, b) => b.tokens - a.tokens)) {
    const bin = bins.find((b) => b.total + part.tokens <= budget);
    if (bin) { bin.items.push(part); bin.total += part.tokens; }
    else bins.push({ total: part.tokens, items: [part] });
  }
  return bins.map((b) => b.items);
}

function describe(parts: Part[]): string {
  const files = parts.filter((p) => p.kind === "file").map((p) => p.name);
  const bits: string[] = [];
  if (parts.some((p) => p.kind === "own")) bits.push("your state");
  if (files.length) bits.push(`paths [${files.join(", ")}]`);
  const total = parts.reduce((n, p) => n + p.tokens, 0);
  return `${bits.join(" + ")} (${fmtK(total)})`;
}

/** The message the agent reads when one call cannot hold the situation. */
export function overflowMessage(parts: Part[], budget: number): string {
  const total = parts.reduce((n, p) => n + p.tokens, 0);
  const groups = suggestSplit(parts, budget);
  const oversize = parts.filter((p) => p.tokens > budget);
  const lines = [
    `ask_jev: the state is ${fmtK(total)}, the limit per call is ${fmtK(budget)}.`,
    `Parts: ${[...parts].sort((a, b) => b.tokens - a.tokens).map((p) => `${p.name} ${fmtK(p.tokens)}`).join(", ")}.`,
  ];
  if (oversize.length) {
    lines.push(`Too large for any single call: ${oversize.map((p) => p.name).join(", ")}. Narrow it or leave it out.`);
  }
  if (groups.length > 1 && !oversize.length) {
    lines.push(`Split into ${groups.length} calls with the same questions_json: ${groups.map((g, i) => `call ${i + 1}: ${describe(g)}`).join("; ")}.`);
  }
  return lines.join(" ");
}

/**
 * Build the state. Own state first, then files. Nothing is truncated:
 * over the file cap or the token budget, the call is refused with a message that says how to split.
 */
export async function assembleState(input: AssembleInput, cwd: string): Promise<Assembled> {
  const own = input.state === undefined || input.state === "" ? {} : parseState(input.state);
  const base: Record<string, unknown> = typeof own === "string" ? { text: own } : Array.isArray(own) ? { items: own } : { ...own };
  const ownText = JSON.stringify(base);
  if (ownText.length > MAX_OWN_STATE_CHARS) {
    throw new AskStateError(`ask_jev: your state is ${fmtK(tokensOf(ownText))}; the limit for your own state is ${fmtK(tokensOf("x".repeat(MAX_OWN_STATE_CHARS)))}. Do not paste file contents; pass paths instead and code reads them. Trim pasted output to the part that matters.`);
  }
  const parts: Part[] = [];
  if (Object.keys(base).length) parts.push({ name: "your state", tokens: tokensOf(ownText), kind: "own" });

  const skipped: Skipped[] = [];
  const files: Record<string, string> = {};
  if (input.paths?.length) {
    const expanded = await expandPatterns(input.paths, cwd, true);
    const pruned = await pruneFiles(expanded, cwd, MAX_FILES_PER_CALL + 1);
    skipped.push(...pruned.skipped);
    if (pruned.files.length > MAX_FILES_PER_CALL) {
      throw new AskStateError(`ask_jev: paths expanded to more than ${MAX_FILES_PER_CALL} files. This tool judges one situation in one call. For many files use ask_jev_files, one call per file in parallel, or narrow the paths.`);
    }
    for (const path of pruned.files) {
      try {
        const f = await readFileState(path, cwd);
        files[f.path] = f.content;
        parts.push({ name: f.path, tokens: tokensOf(f.content), kind: "file" });
      } catch (err) {
        skipped.push({ path, reason: err instanceof FileStateError ? err.message : String((err as Error)?.message ?? err) });
      }
    }
  }

  if (!parts.length) {
    const why = skipped.length ? ` Every path was skipped: ${skipped.map((s) => `${s.path} (${s.reason})`).join(", ")}.` : "";
    throw new AskStateError(`ask_jev: nothing to judge. Pass state, paths, or both.${why}`);
  }

  const total = parts.reduce((n, p) => n + p.tokens, 0);
  if (total > STATE_TOKEN_BUDGET) throw new AskStateError(overflowMessage(parts, STATE_TOKEN_BUDGET));

  const state: Record<string, unknown> = { ...base };
  if (Object.keys(files).length) state.files = files;

  return { state, summary: { own_fields: Object.keys(base), files: Object.keys(files), skipped, tokens: total } };
}
