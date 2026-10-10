/**
 * How tool results are shaped for the agent's context. Pure functions, no I/O, so tests import them directly.
 */
import type { Answer, Questions } from "./src/core/types.ts";
import type { AskFilesResult } from "./src/levels/level09/index.ts";

const r2 = (x: number) => Math.round(x * 100) / 100;

/** One value per answer: noul is p(yes), choice is "key confidence", score is the position on the levels. */
export const compactAnswer = (a: Answer) =>
  a.type === "noul" ? r2(a.noul) : a.type === "choice" ? `${a.choice} ${r2(a.confidence)}` : r2(a.score);

/**
 * ask_jev_files output sized for the agent's context: one line per file, score legends once instead of per file,
 * no per-file usage (jev_session carries the totals).
 */
export function compactFiles(result: AskFilesResult, questions: Questions, session: object): string {
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
