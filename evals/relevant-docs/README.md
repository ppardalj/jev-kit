# Eval: the relevant-docs skill on el-baul

Does the `relevant-docs` skill get picked, unprompted, for questions whose answer lives in a repo's
docs, and does it then find them through Jev? Target: `ne2-studio/el-baul`, 48 markdown files,
about 5,000 lines, with architecture notes, two ADRs, operations guides and per-service READMEs.

The skill is evaluated alone: the jev arm runs this checkout's server with `relevant-docs` as the
only jev-kit skill (`JEV_SKILLS=relevant-docs`), so a pick can't come from `jev-files` or any
other nudge. The skill's description names no topic these questions ask about.

| id | Question | Expected doc |
|---|---|---|
| d1 | I'm about to add a new screen to the app. How much testing is expected for it, and with which tools? | ADR 0001, `docs/architecture/testing.md` |
| d2 | I need to show the app to someone this afternoon without real data and without bringing up the whole Docker stack. What's the lightest way to run it? | `docs/operations/api-lite.md` |
| d3 | Several features will need to show the same new kind of card. Where should it live, and what do we call that kind of piece here? | ADR 0002, `docs/DESIGN.md` |

Details in [`expected.md`](expected.md). The adoption probe runs the jev arm only, cut at 6 turns:

```sh
RUN_TAG=probe ARMS=jev MAX_TURNS=6 JEV_SKILLS=relevant-docs evals/run.sh evals/relevant-docs ~/projects/el-baul/el-baul 3
node evals/summarize.ts evals/relevant-docs/runs/<timestamp>-probe
```

Results go in [`results.md`](results.md).
