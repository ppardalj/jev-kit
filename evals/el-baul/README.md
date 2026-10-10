# Eval: el-baul

Does jev-kit make Claude Code cheaper or better at answering questions about a real repo?
Target: `ne2-studio/el-baul`, a monorepo with an ASP.NET Core API (~630 `.cs`), a React app
(~630 `.ts`/`.tsx`), an admin app and architecture docs with checkable rules.

## Questions

The set mixes cases where Jev should help (classifying many files by something grep can't see)
with controls where grep is enough or the answer needs close reading, so the result isn't
rigged either way. The prompts are in [`questions.json`](questions.json).

| id | Question | Kind | Expectation for Jev |
|---|---|---|---|
| q1 | Which API controllers expose anonymous endpoints, and which of those have rate limiting? | control: grep is enough | no gain, or worse |
| q2 | Which managers under `Application/` in `api/ElBaul.Core` operate on baúl-scoped resources without going through `BaulAccessService` or `IBaulAuthorizer`? Is any of them a real authorization hole? | semantic classification, backend | clear gain |
| q3 | Which `*Route.tsx` files under `app/src/features` break the frontend layering rule, by calling `api.*` or a store's `setState` directly instead of a use case? | conformance, frontend | gain: many files, fuzzy criterion |
| q4 | What triggers the welcome email, where is it scheduled, and where is it rendered? | localization with noise | some gain (`pick_first_file`) |
| q5 | Trace end to end what happens when a custodian requests to delete a baúl: app, API, Core, and admin. | cross-service flow | no gain, or worse |

The expected answers are in [`expected.md`](expected.md), written from the code before any
session's answer was read.

## Method

[`../run.sh`](../run.sh) runs each question twice as a headless `claude -p` session in the target
repo, same model and same prompt:

- **jev**: the user's installed `jev-kit` plugin, so the MCP tools and the `jev-files` skill.
- **base**: the same, with `jev-kit` disabled through `--settings` (`enabledPlugins`).

Both arms are read-only (no edits, no web) and have no subagents, so every tool call shows in the
session's own log. The prompt adds only "read-only investigation, answer concisely, cite file
paths"; it never mentions Jev, so the jev arm measures whether the skill gets used on its own.

[`../summarize.ts`](../summarize.ts) reads each session's stream-json log:

- **Claude**: input, cache and output tokens, cost, turns, and tool calls by tool.
- **Jev**: calls, input tokens and cost from the last `jev_session` a jev tool returned, plus refusals.
- **Accuracy**: scored by hand against `expected.md` (right, partial, wrong).

Raw logs stay in `runs/` (gitignored: they hold el-baul code). Results go in [`results.md`](results.md).

```sh
evals/run.sh evals/el-baul ~/projects/el-baul/el-baul
node evals/summarize.ts evals/el-baul/runs/<timestamp>
```
