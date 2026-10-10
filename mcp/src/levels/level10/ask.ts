/**
 * Level 10, option A: ask_jev on any content.
 * The general form. The agent passes its own state, paths for code to read, and its question block. Code assembles one state, validates, and makes one call. The agent never receives the files, only the answers.
 */
import { jev } from "../../core/client.ts";
import type { Answer, Questions, State } from "../../core/types.ts";
import { parseQuestions } from "../level09/ask-files.ts";
import { assembleState, type AssembleInput, type Assembled } from "./assemble.ts";

export type Decide = (state: State, questions: Questions) => Promise<{ answers: Record<string, Answer>; usage?: unknown }>;

export interface AskResult {
  answers: Record<string, Answer>;
  state_summary: Assembled["summary"];
}

/**
 * A: any state, any questions, one call. Malformed questions fail before any file is read.
 * `beforeCall` sees the assembled state and throws to refuse the call before anything is sent.
 */
export async function askJev(
  input: AssembleInput,
  questionsJson: string,
  cwd: string,
  opts: { decide?: Decide; beforeCall?: (assembled: Assembled) => void } = {},
): Promise<AskResult> {
  const questions = parseQuestions(questionsJson);
  const assembled = await assembleState(input, cwd);
  opts.beforeCall?.(assembled);
  const decide = opts.decide ?? ((s, q) => jev.systemOne(s, q));
  const { answers } = await decide(assembled.state, questions);
  return { answers, state_summary: assembled.summary };
}
