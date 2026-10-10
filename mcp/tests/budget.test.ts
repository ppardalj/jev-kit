import test from "node:test";
import assert from "node:assert/strict";
import { Budget, BudgetError, CALL_OVERHEAD_TOKENS, DEFAULT_LIMITS, FALLBACK_USD_PER_TOKEN, estimateTokens, readLimits } from "../budget.ts";

const budget = (limits = {}) => new Budget({ ...DEFAULT_LIMITS, ...limits });

test("budget: limits come from the environment, anything unusable falls back to the default", () => {
  assert.deepEqual(readLimits({}), DEFAULT_LIMITS);
  assert.deepEqual(readLimits({ JEV_MAX_FILES: "20", JEV_MAX_TOKENS_PER_CALL: "100000", JEV_MAX_USD_PER_SESSION: "1.5" }), { maxFiles: 20, maxTokensPerCall: 100_000, maxUsdPerSession: 1.5 });
  for (const raw of ["", "${user_config.max_files}", "abc", "-3", "0", "Infinity"]) assert.equal(readLimits({ JEV_MAX_FILES: raw }).maxFiles, DEFAULT_LIMITS.maxFiles, raw);
  assert.equal(readLimits({ JEV_MAX_FILES: "7.9" }).maxFiles, 7);
});

test("budget: the estimate is the file text plus a per call overhead with the questions", () => {
  assert.equal(estimateTokens(4000, 2, 400), 1000 + 2 * (CALL_OVERHEAD_TOKENS + 100));
  assert.equal(estimateTokens(0, 0, 400), 0);
});

test("budget: too many files or tokens per call is refused with the sizing, and nothing is held", () => {
  const b = budget({ maxFiles: 50, maxTokensPerCall: 500_000 });
  assert.throws(() => b.admit({ files: 51, tokens: 10_000 }), (e: any) => e instanceof BudgetError && /51 files, about 10,000 tokens.*over the 50 file limit/.test(e.message));
  assert.throws(() => b.admit({ files: 50, tokens: 500_001 }), /over the 500,000 token limit/);
  b.admit({ files: 50, tokens: 500_000 })();
  assert.throws(() => b.admit({ files: 255, tokens: 15_000_000 }), /255 files/);
});

test("budget: once the session has spent its limit, every call is refused", () => {
  const b = budget({ maxUsdPerSession: 0.01 });
  b.admit({ files: 0, tokens: 0 })();
  b.record(100_000, 0.006);
  b.record(100_000, 0.004);
  assert.throws(() => b.admit({ files: 0, tokens: 0 }), /session budget is \$0\.01, \$0\.01 is spent or in flight\. Restart/);
});

test("budget: a call whose estimate would cross the session limit is refused before it starts", () => {
  const b = budget({ maxUsdPerSession: 0.01 });
  b.record(100_000, 0.008); // rate is now $0.08 per million
  b.admit({ files: 1, tokens: 20_000 })(); // $0.0016, fits
  assert.throws(() => b.admit({ files: 10, tokens: 30_000 }), /this call is 10 files, about 30,000 tokens, about \$0\.0024/);
});

test("budget: calls in flight hold their estimate, so concurrent calls can't share the same headroom", () => {
  const b = budget({ maxUsdPerSession: 0.01 });
  const tokens = Math.floor(0.006 / FALLBACK_USD_PER_TOKEN);
  const release = b.admit({ files: 10, tokens });
  assert.throws(() => b.admit({ files: 10, tokens }), /spent or in flight/);
  release();
  release(); // twice is harmless
  b.admit({ files: 10, tokens })();
});

test("budget: the rate is learned from priced calls, and an unpriced call is charged at it", () => {
  const b = budget();
  assert.equal(b.rate(), FALLBACK_USD_PER_TOKEN);
  b.record(1_000_000, 0.1);
  assert.equal(b.rate(), 0.1 / 1_000_000);
  b.record(1_000_000, null);
  assert.equal(b.cost_usd, 0.2);
  assert.deepEqual(b.session(), { calls: 2, input_tokens: 2_000_000, cost_usd: 0.2, limit_usd: DEFAULT_LIMITS.maxUsdPerSession });
});
