# Results

## Run 20261010-100517-probe: adoption probe

Jev arm only, `JEV_SKILLS=relevant-docs` (the build check: `jev-kit:relevant-docs` was the only
jev-kit skill listed, the server connected), cut at 6 turns, one session per question.

| run | turns | Claude $ | tools | jev at turn | right doc |
|---|---|---|---|---|---|
| d1 | 7 | 0.25 | Grep 2, Read 2, Glob 1, Bash 1 | — | yes: testing.md, ADR 0001 |
| d2 | 5 | 0.11 | Skill 1 (el-baul's own `run`), Bash 1, Grep 1 | — | yes: api-lite.md, via the `run` skill |
| d3 | 7 | 0.22 | Grep 2, Bash 2, Read 2 | — | yes: ADR 0002, frontend.md |

0 of 3 picked the skill, and none needed it: each found the right doc within the six turns, two of
them answering before the cut. One case-insensitive Grep over `docs/` with a few synonyms, plus the
file names, was enough, because el-baul's 48 docs are few, well named, and use the words a question
would. d2 went to the repo's own `run` skill, which matches "run the app" far better than any docs
skill could.

So this target can't show the skill's value: its premise, more docs than are worth reading and
vocabulary that grep misses, doesn't hold here.

## Run 20261010-103257-forced: forced A/B

Full sessions, no turn cut. The jev arm's prompt ends with "Use the relevant-docs skill."; the base
arm has no jev-kit at all.

| run | turns | Claude in+cache | Claude $ | tools | Jev calls | Jev $ |
|---|---|---|---|---|---|---|
| d1-base | 12 | 171.2k | 0.29 | Read 6, Grep 3, Glob 2 | — | — |
| d1-jev | 14 | 208.1k | 0.32 | Read 6, Grep 2, Skill, Bash, ToolSearch, ask_jev_files | 28 | 0.0023 |
| d2-base | 12 | 129.5k | 0.20 | Grep 4, Read 3, Glob 2, Bash 2 | — | — |
| d2-jev | 14 | 160.3k | 0.26 | Read 3, Grep 3, Glob 2, Skill, ToolSearch, Bash, ask_jev_files | 21 | 0.0016 |
| d3-base | 6 | 75.2k | 0.18 | Bash 3, Grep 1, Read 1 | — | — |
| d3-jev | 10 | 119.5k | 0.28 | Read 2, Skill, Bash, ToolSearch, ask_jev_files, Grep, Glob | 30 | 0.0026 |
| **base** | 30 | 375.9k | **0.67** | | | |
| **jev** | 38 | 487.9k | **0.86** | | 79 | 0.0065 |

Forced Jev costs more on every question, 10 to 55% and 28% overall, for the same answers: both arms
cite the expected docs on all three. Jev ranked well (on d2, `api-lite.md` came out deepest), but
the ranking replaces no reading: the base arm already read only the one to three docs that matter,
and the jev arm read the same ones after paying for the skill, the tool search, and a 20 to 30 line
result in context, about three extra turns.

Claude's choice not to use the skill on this repo was right. Jev pays off where the alternative is
reading many files (q2's base sessions read 9 to 15), not where a grep and two reads settle it.
