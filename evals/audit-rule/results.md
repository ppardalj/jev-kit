# Results

## Run 20261010-105028-forced: forced A/B

Full sessions. The jev arm runs this checkout with `audit-rule` as the only jev-kit skill, and its
prompt ends with "Use the audit-rule skill."; the base arm has no jev-kit.

| run | turns | Claude in+cache | Claude $ | tools | Jev calls | Jev $ | key points |
|---|---|---|---|---|---|---|---|
| a1-base | 37 | 873.9k | 0.92 | Read 26, Grep 5, Bash 3, Glob 2 | — | — | all three tracking controllers |
| a1-jev | 23 | 354.6k | **0.54** | Read 10, Grep 6, Skill, Glob, ToolSearch, ask_jev_files, Bash | 24 | 0.0019 | all three, plus `MarkUploaderSeenAsync` |
| a2-base | 12 | 191.5k | **0.36** | Bash 7, Grep 2, Read 2 | — | — | `RoleBadge`, `AccessDeniedScreen` |
| a2-jev | 20 | 278.3k | 0.49 | Read 7, Grep 4, Bash 2, ask_jev_files 2, Skill, Glob, ToolSearch | 49, 1 refused | 0.0032 | `RoleBadge`, `AccessDeniedScreen` |
| **base** | 49 | 1,065k | **1.28** | | | | |
| **jev** | 43 | 633k | **1.03** | | 73 | 0.0051 | |

Both arms hit the key points on both questions. Overall the jev arm cost 20% less, but the two
questions split:

- **a1, −41%.** Without Jev, Claude read 26 files to judge 24 controllers. With it, one call judged
  them all and it read 10. This is the case Jev is for: a judgment per file, and no cheap proxy.
- **a2, +36%.** Without Jev, Claude found a structural proxy: it grepped how many features import
  each design-system piece, so a piece used by one feature only stood out, and it read two files.
  The jev arm paid for the skill, the tool search, a refusal (52 files over the 50 limit; the skill
  says to split by folder, and it split only after the refusal) and a second call, then read 7.

Jev wins where the alternative is reading most of the files, and loses where Grep can compute a
proxy for the judgment. Still one session per cell.

## Run 20261010-105624-probe: unprompted adoption probe

Same build, no hint, jev arm only, cut at 6 turns, one session per question.

| run | turns | Claude $ | tools | jev at turn | Jev calls |
|---|---|---|---|---|---|
| a1 | 7 | 0.16 | Read 6, Grep 3, Skill, Glob, ToolSearch, ask_jev_files | 1 | 24 |
| a2 | 7 | 0.25 | Bash 4, Skill, Grep, Glob, Read, ToolSearch | 1 | 0 |

2 of 2 picked the skill unprompted, both on the first turn, against 1 of 16 sessions for the
tool-level `jev-files` skill. a1 then ran one `ask_jev_files` over the 24 controllers and was reading
the flagged ones at the cut. a2 loaded the tool but spent the remaining turns on the import-count
proxy it also found without Jev, so it may finish without calling Jev at all.

A skill named and described by the task, "audit against a rule", gets picked where a description
of the tool, "ask Jev instead of reading", never did.

## Run 20261010-110749-forced-fast: forced A/B, shorter jev path

Wall time is now the main measure (on a subscription Claude's cost isn't real); tokens and dollars
stay as the API proxy. Changes to the jev arm: `ask_jev_files` carries
`_meta: {"anthropic/alwaysLoad": true}`, so Claude Code loads it up front instead of behind a tool
search; it takes `!` patterns to leave files out, so no separate Glob is needed; the skill says to
pick Grep for rules about how files relate, and to read the flagged files in one turn.

| run | s | api s | jev s | turns | Claude in+cache | Claude $ | tools | Jev calls | Jev $ |
|---|---|---|---|---|---|---|---|---|---|
| a1-base | 72 | 70 | 0 | 25 | 564.6k | 0.79 | Read 17, Bash 5, Grep 1, Glob 1 | — | — |
| a1-jev | **63** | 62 | 0.9 | 36 | 311.5k | 0.75 | Read 24, Grep 6, Skill, Glob, ask_jev_files, Bash | 24 | 0.0019 |
| a2-base | 77 | 76 | 0 | 21 | 490.7k | 0.57 | Bash 9, Grep 8, Glob 2, Read 1 | — | — |
| a2-jev | **65** | 64 | 1.9 | 19 | 231.5k | 0.53 | Read 8, Grep 3, ask_jev_files 3 (1 refused), Bash 2, Skill | 52 | 0.0035 |

- `alwaysLoad` works: neither jev session made a ToolSearch call.
- Jev itself took 0.9 and 1.9 s of 63 and 65; the rest is Claude's turns, so the API time is about
  the whole wall time in every session.
- The jev arm was faster on both, −12% and −16%, but the base arm ran 18 s slower on a2 than in the
  first forced run (77 s against 54 s): one session per cell is inside the noise.
- a1-jev read all 24 controllers anyway. Its `breaks` question restated the whole multi-clause rule,
  and Jev answered 0.42 to 0.59 for every file: a compound rule gives no signal. The `how` choice
  did separate them ("none 0.9" against "infra_dependency"). Reads also went one per turn, not in
  parallel as the skill asks.
- a2-jev still hit the 50-file refusal before splitting by folder.
