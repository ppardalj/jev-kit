/**
 * Level 10, option B: the tool description is the teaching.
 * The prompt says what to ask. The description says how: what Jev is, the three question types, when a typed answer beats reasoning, and when it does not.
 */
import { MAX_FILES_PER_CALL } from "./assemble.ts";

export const ASK_JEV_DESCRIPTION = [
  "Ask Jev, a fast decision model, typed questions about one situation: files, your own state, or both. It answers in about 300 ms for a fraction of a cent, and each answer is a number you can branch on, not prose. Use it whenever a judgment call would otherwise cost you a long think.",
  "",
  "Do not paste file contents; pass paths and code reads the files into files[\"path\"], keyed by repo-relative path. Use state for what only you can say: a customer report, your plan, the relevant part of a command's output you already ran. Plain text goes into `text`; a JSON object as a string keeps its field names. You never receive the files, only the answers.",
  "",
  `One call judges one situation: up to ${MAX_FILES_PER_CALL} files and about 60k tokens in total. Over that the call is refused with a message naming the parts and a split that fits; make two calls with the same questions_json. For many files judged separately use ask_jev_files instead.`,
  "",
  "questions_json: a JSON object keyed by question id. Three types:",
  '  noul   {"type":"noul","instructions":"Is `text` a real failure rather than a flaky one?","criteria":{"true":"...","false":"..."}}  -> { noul: 0..1 }',
  '  choice {"type":"choice","instructions":"What kind of failure is `text`?","criteria":{"bug_in_code":"...","wrong_test":"...","environment":"...","other":"..."}}  -> { choice, confidence, probabilities }',
  '  score  {"type":"score","instructions":"How risky is `diff`?","criteria":["Isolated, tested","Some callers","Security sensitive, no tests"]}  -> { score, confidence, legend, probabilities }',
  "",
  "Write questions against files[\"path\"], `text`, or your own field names. Good uses: classify a test failure before choosing a fix, score the risk of a diff before committing, pass the customer's words as state with the relevant paths and decide bug or expected, decide whether a request is clear enough to plan.",
  "Ask every question you might need in one call; they share the state. Always give a choice an `other` option. Describe situations, not degrees.",
  "Not for: exact lookups, counting, math, or anything a grep answers. Not a substitute for reading code you need to edit.",
].join("\n");
