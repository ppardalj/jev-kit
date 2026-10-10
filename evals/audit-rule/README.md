# Eval: the audit-rule skill on el-baul

Is auditing many files against a documented rule cheaper with Jev than with Grep and Read, and does
the `audit-rule` skill get picked for it? Target: `ne2-studio/el-baul`. The questions are new, not
the el-baul eval's q2, q3 or q6, and the skill's description names neither rule.

| id | Question | Files the rule governs |
|---|---|---|
| a1 | Our backend docs say controllers are thin HTTP adapters. Which API controllers don't live up to that, and how? | 24 controllers |
| a2 | Which pieces under `app/src/design-system` are really tied to one specific feature or domain workflow, and by our own taxonomy should live in a feature instead? | 52 design-system files |

Expected answers in [`expected.md`](expected.md). First the forced A/B (is Jev worth it at all),
then, only if it wins, the unprompted adoption probe:

```sh
RUN_TAG=forced JEV_SKILLS=audit-rule JEV_HINT='Use the audit-rule skill.' evals/run.sh evals/audit-rule ~/projects/el-baul/el-baul 4
RUN_TAG=probe ARMS=jev MAX_TURNS=6 JEV_SKILLS=audit-rule evals/run.sh evals/audit-rule ~/projects/el-baul/el-baul 2
```

Results go in [`results.md`](results.md).
