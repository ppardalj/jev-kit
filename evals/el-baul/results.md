# Results

## Run 20261010-091615

Model `claude-opus-5-5`, el-baul at `1a4ddca3`, one session per question and arm.

| run | accuracy | turns | s | Claude in+cache | out | Claude $ | tool calls | tools | Jev calls | Jev $ |
|---|---|---|---|---|---|---|---|---|---|---|
| q1-base | right | 7 | 24 | 91.8k | 2.5k | 0.26 | 6 | Grep 2, Read 2, Bash 2 | 0 | 0 |
| q1-jev | right | 7 | 22 | 90.8k | 2.5k | 0.25 | 6 | Grep 3, Read 3 | 0 | 0 |
| q2-base | right | 28 | 77 | 396.0k | 6.0k | 0.64 | 27 | Read 14, Grep 6, Bash 5, Glob 2 | 0 | 0 |
| q2-jev | right | 23 | 65 | 360.2k | 5.3k | 0.59 | 22 | Read 12, Bash 6, Grep 3, Glob 1 | 0 | 0 |
| q3-base | right | 10 | 23 | 89.6k | 2.3k | 0.14 | 9 | Grep 6, Read 2, Glob 1 | 0 | 0 |
| q3-jev | right | 11 | 51 | 154.7k | 3.8k | 0.31 | 10 | Grep 4, Bash 4, Read 2 | 0 | 0 |
| q4-base | right | 8 | 19 | 94.1k | 2.2k | 0.17 | 7 | Grep 3, Read 3, Glob 1 | 0 | 0 |
| q4-jev | right | 12 | 33 | 126.3k | 3.1k | 0.22 | 11 | Read 6, Grep 4, Glob 1 | 0 | 0 |
| q5-base | right | 23 | 43 | 226.0k | 5.1k | 0.38 | 22 | Read 12, Grep 10 | 0 | 0 |
| q5-jev | right | 26 | 47 | 248.7k | 5.5k | 0.44 | 25 | Read 19, Grep 6 | 0 | 0 |
| **base total** | 5/5 | 76 | | 897.5k | 18.1k | **1.59** | 71 | | | |
| **jev total** | 5/5 | 79 | | 980.7k | 20.2k | **1.81** | 74 | | 0 | 0 |

**The jev arm never used Jev.** All five sessions had the `jev-files` server connected, its five
tools and the `jev-kit:jev-files` skill listed, yet made no Skill, ToolSearch or jev tool call.
So both arms ran what amounts to the same setup, and the gaps between them are run-to-run noise:
q3 cost twice as much in the jev arm without touching Jev. One session per arm can't separate an
effect smaller than that.

Likely cause: the sessions have `ToolSearch`, so MCP tools are deferred (only their names show
until searched for), and the skill is loaded only on demand. Grep and Read are always at hand, and
every question here can be answered with them, so Claude never reaches for the rest.

All ten answers hit the key points of `expected.md`. q3-jev also flagged the two
`personaInvites.getPreview` callers as breaking the doc's "second call site" clause, a fair reading.

## Run 20261010-092552-hint: q2 only, jev arm told to use the skill

Same setup, only q2. The jev arm's prompt ends with "Use the jev-files skill."; the base arm's
prompt is unchanged.

| run | accuracy | turns | s | Claude in+cache | out | Claude $ | tool calls | tools | Jev calls | Jev $ |
|---|---|---|---|---|---|---|---|---|---|---|
| q2-base | right | 24 | 93 | 736.1k | 9.2k | 0.86 | 23 | Bash 9, Read 9, Grep 5 | 0 | 0 |
| q2-jev | right | 18 | 65 | 288.5k | 6.3k | 0.36 | 16 | Bash 4, Grep 4, ask_jev_files 3, Read 2, Skill 1, ToolSearch 1, Glob 1 | 11 | 0.0011 |

With the hint, Claude loaded the skill, fetched the tools through ToolSearch, listed the managers
with grep, and classified the nine candidates with one `ask_jev_files` block (`baul_scoped`,
`caller`, `own_check`), then read only the two files that needed it (2 Reads, against 9 to 14 in
the base sessions). Jev cost $0.001 for 11 calls.

Across the three q2 sessions without Jev use so far, Claude cost $0.59 to $0.86 and 360k to 736k
tokens; this one is $0.36 and 289k, below that whole range. Still one session.

Friction: the first `ask_jev_files` call sent paths relative to the shell's `cd` into
`api/ElBaul.Core`, and the server resolves them against the repo root, so all nine came back
`not found` and the call was repeated with root-relative paths.

## Run 20261010-093252-desc: q2 only, new skill and tool descriptions, no hint

The skill description now leads with "Audit or triage many files by a judgment grep can't make",
the skill and `ask_jev_files` describe the flow (Grep or Glob for candidates, one `ask_jev_files`,
Read only what the answers call for), and paths may be absolute. The jev arm ran this working copy,
synced over the installed 0.2.0 cache for the run and restored after. No hint in either prompt.

| run | accuracy | turns | s | Claude in+cache | out | Claude $ | tool calls | tools | Jev calls | Jev $ |
|---|---|---|---|---|---|---|---|---|---|---|
| q2-base | right | 15 | 56 | 319.5k | 5.4k | 0.48 | 14 | Bash 14 | 0 | 0 |
| q2-jev | right | 23 | 57 | 303.7k | 4.9k | 0.52 | 22 | Read 15, Grep 4, Glob 2, Bash 1 | 0 | 0 |

The descriptions alone don't get Jev picked: no Skill, ToolSearch or jev call, and 15 Reads, the
very pattern the skill is meant to replace. The skill's description is the only part Claude sees
before choosing, and it lost to Grep and Read again.

## Run 20261010-094321-instr: adoption probe, MCP server instructions

On top of the new descriptions, the server now returns `instructions` at initialize, which Claude
Code shows up front even while the tools are deferred (a one-turn session quoted them verbatim).
Probe: jev arm only, q2, cut at 6 turns, three repeats.

| run | turns | Claude $ | tools | jev at turn |
|---|---|---|---|---|
| q2-jev-1 | 7 | 0.13 | Bash 5, Grep 2 | — |
| q2-jev-2 | 7 | 0.12 | Bash 7 | — |
| q2-jev-3 | 7 | 0.24 | Bash 8 | — |

0 of 3 reached for Jev. All three listed the managers and then `cat` them in batches. The
instructions are in context and lose anyway: with nine short files, reading them outright is what
Claude judges simplest, and an authorization question invites reading the code rather than
trusting a classifier.

## Run 20261010-094757-q6: adoption probe, a question over 67 files

New question q6 (presentational components holding logic that belongs elsewhere): 67 component
files, about 6,900 lines, so reading them all is expensive. Same build as the instructions probe;
jev arm only, cut at 6 turns, two repeats.

| run | turns | Claude $ | tools | jev at turn |
|---|---|---|---|---|
| q6-jev-1 | 7 | 0.21 | Bash 7, Glob 1, Grep 1 | — |
| q6-jev-2 | 7 | 0.22 | Read 5, Bash 3, Grep 2, Glob 1 | — |

0 of 2. Size isn't what holds it back: both read the layering rule and the ESLint boundary, then
grepped the components for signals (`useEffect`, `await`, `@/api` and `@/utils` imports, storage,
timers) and read only the hits. Grep heuristics stand in for the semantic judgment, so Jev never
looks necessary.

## Run 20261010-095139-claudemd: adoption probe, one line in the project's memory

Same build. el-baul got a temporary, uncommitted `CLAUDE.local.md` with one line: "To check or
classify several files by a judgment grep cannot make (which ones follow a rule, skip a check,
handle a concern, belong to a layer), use the jev-files skill instead of reading each file."
Removed after the run. q2, jev arm only, cut at 6 turns, two repeats.

| run | turns | Claude $ | tools | jev at turn |
|---|---|---|---|---|
| q2-jev-1 | 7 | 0.16 | Read 7, Bash 6 | — |
| q2-jev-2 | 7 | 0.15 | Glob 2, Grep 2, Read 2, Bash 2, ToolSearch 1 | 6 |

1 of 2, the first unprompted pick. Run 2 listed the nine managers without the authorizer, wrote
"Clasificándolos con jev-files antes de leer", and fetched `ask_jev_files` through ToolSearch at
turn 6, where the probe cut it. Run 1 read the files.
