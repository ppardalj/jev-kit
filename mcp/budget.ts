/**
 * Spend guardrails. Every tool call is admitted against three limits before Jev is called:
 * files per call and estimated tokens per call (ask_jev_files), and USD per session (every tool).
 * A session is one server process, which is one Claude Code session.
 * Pure: no I/O, so the server and the tests share it.
 */

export interface Limits {
  maxFiles: number;
  maxTokensPerCall: number;
  maxUsdPerSession: number;
}

export const DEFAULT_LIMITS: Limits = { maxFiles: 50, maxTokensPerCall: 500_000, maxUsdPerSession: 0.5 };

/** USD per input token before the session has a priced call to learn from. Observed rate is about $0.042 per million. */
export const FALLBACK_USD_PER_TOKEN = 0.05 / 1_000_000;

/** Tokens a call adds on top of the file text: the state framing, the question block, the answer. Measured at about 450. */
export const CALL_OVERHEAD_TOKENS = 500;

/** A positive number from the environment, or the default. Empty, unsubstituted, or malformed values fall back. */
const positive = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? n : fallback;
};

export function readLimits(env: Record<string, string | undefined>): Limits {
  return {
    maxFiles: Math.floor(positive(env.JEV_MAX_FILES, DEFAULT_LIMITS.maxFiles)),
    maxTokensPerCall: Math.floor(positive(env.JEV_MAX_TOKENS_PER_CALL, DEFAULT_LIMITS.maxTokensPerCall)),
    maxUsdPerSession: positive(env.JEV_MAX_USD_PER_SESSION, DEFAULT_LIMITS.maxUsdPerSession),
  };
}

/** Text bytes are roughly four per token, as MAX_FILE_CHARS assumes. */
export const estimateTokens = (fileBytes: number, files: number, questionsChars: number) =>
  Math.ceil(fileBytes / 4) + files * (CALL_OVERHEAD_TOKENS + Math.ceil(questionsChars / 4));

export class BudgetError extends Error {}

const usd = (x: number) => `$${x < 0.01 ? x.toFixed(4) : x.toFixed(2)}`;

export class Budget {
  calls = 0;
  input_tokens = 0;
  cost_usd = 0;
  /** Estimates of calls in flight, so concurrent tool calls can't each pass on the same remaining budget. */
  private reserved = 0;

  readonly limits: Limits;

  constructor(limits: Limits) {
    this.limits = limits;
  }

  /** What this session has paid per input token so far, or the fallback before its first priced call. */
  rate() {
    return this.input_tokens > 0 && this.cost_usd > 0 ? this.cost_usd / this.input_tokens : FALLBACK_USD_PER_TOKEN;
  }

  /** A call without a reported cost is charged at the current rate, so the session limit still holds. */
  record(inputTokens: number, costUsd: number | null) {
    const cost = costUsd ?? inputTokens * this.rate();
    this.calls++;
    this.input_tokens += inputTokens;
    this.cost_usd += cost;
  }

  /**
   * Admit a call of `files` files and about `tokens` tokens, or throw a BudgetError saying what to narrow.
   * Holds the call's estimate until the returned release runs.
   */
  admit(plan: { files: number; tokens: number }): () => void {
    const { maxFiles, maxTokensPerCall, maxUsdPerSession } = this.limits;
    const estimate = plan.tokens * this.rate();
    const sizing = `${plan.files} files, about ${plan.tokens.toLocaleString("en")} tokens, about ${usd(estimate)}`;
    if (plan.files > maxFiles) throw new BudgetError(`refused, nothing sent: ${sizing}, over the ${maxFiles} file limit per call. Narrow the pattern or split the call.`);
    if (plan.tokens > maxTokensPerCall) throw new BudgetError(`refused, nothing sent: ${sizing}, over the ${maxTokensPerCall.toLocaleString("en")} token limit per call. Narrow the pattern or split the call.`);
    const committed = this.cost_usd + this.reserved;
    if (committed >= maxUsdPerSession || committed + estimate > maxUsdPerSession)
      throw new BudgetError(`refused, nothing sent: session budget is ${usd(maxUsdPerSession)}, ${usd(committed)} is spent or in flight${plan.files ? `, this call is ${sizing}` : ""}. Restart Claude Code for a new session, or raise the limit in /plugin configure.`);
    this.reserved += estimate;
    let released = false;
    return () => {
      if (!released) this.reserved -= estimate;
      released = true;
    };
  }

  session() {
    return { calls: this.calls, input_tokens: this.input_tokens, cost_usd: Number(this.cost_usd.toFixed(6)), limit_usd: this.limits.maxUsdPerSession };
  }
}
