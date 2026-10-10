# Eval: the verify-jev skill on el-baul

The skill is eval-only: [`../skills/verify-jev`](../skills/verify-jev/SKILL.md). It writes the diff
to `.run/verify-jev.diff` and makes one `ask_jev` call with that file and
`docs/architecture/testing.md`, one score question per `./scripts/verify` suite.

Does Jev pick the suites `testing.md` calls for? The cases are past el-baul commits of different
kinds ([`commits.json`](commits.json)); expected suites in [`expected.md`](expected.md), written
before any answer was seen. [`run.ts`](run.ts) makes the skill's exact call per commit, without
Claude, and prints every score:

```sh
node evals/verify-jev/run.ts ~/projects/el-baul/el-baul        # or name commit ids: c06 c09
```

Results in [`results.md`](results.md); raw answers in `runs/` (gitignored).
