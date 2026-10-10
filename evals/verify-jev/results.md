# Results: verify-jev on el-baul

Run 2026-10-10, `node evals/verify-jev/run.ts ~/projects/el-baul/el-baul`, the skill's own diff file,
paths and question block. One `ask_jev` call per commit. Scores 0 (not affected) to 3 (required);
**bold** is at or above the 1.5 run threshold. Expected answers in [`expected.md`](expected.md).

| id | commit | backend | persistence | backend-acc | frontend | admin | frontend-acc | admin-acc | e2e | tokens |
|---|---|---|---|---|---|---|---|---|---|---|
| c01 | 87c459c1 | 0.02 | 0.01 | 0.03 | **2.14** | 0.09 | 0.21 | 0.05 | 0.11 | 4436 |
| c02 | 71396d7a | 0.03 | 0.02 | 0.04 | **2.46** | 0.11 | **1.50** | 0.05 | 0.70 | 5168 |
| c03 | 5584707d | **2.63** | 0.03 | 0.52 | 0.06 | 0.13 | 0.62 | 0.18 | 0.36 | 7420 |
| c04 | 8785f169 | **2.45** | 0.12 | **1.84** | 0.21 | 0.15 | 0.93 | 0.66 | **1.69** | 9047 |
| c05 | 0259eaa1 | **2.49** | **2.97** | 1.26 | 0.09 | 0.04 | 0.77 | 0.51 | 0.78 | 26609 |
| c06 | 139d2911 (stat) | **2.52** | **2.55** | **2.76** | 0.10 | 0.07 | **2.06** | 0.77 | **1.60** | 5194 |
| c07 | 0890001f | **2.41** | 0.08 | **2.36** | **2.65** | **1.90** | **1.78** | 1.08 | **1.63** | 11659 |
| c08 | 0ee932bb | 0.15 | 0.31 | **2.05** | 0.11 | 0.12 | 0.30 | 0.32 | **2.25** | 5088 |
| c09 | 71e652e3 | 0.47 | 0.46 | 1.28 | 1.05 | 0.47 | **1.57** | **1.56** | 1.40 | 5044 |
| c10 | 97b16206 | 0.10 | 0.05 | 0.12 | 1.44 | 0.23 | 0.80 | 0.88 | 0.92 | 4618 |
| c11 | 86f977d2 | 0.02 | 0.01 | 0.05 | 0.27 | 0.06 | **2.29** | 0.13 | **2.06** | 4743 |

## Against expected

| id | Jev runs | vs expected |
|---|---|---|
| c01 | frontend | exact |
| c02 | frontend, frontend-acc | + frontend-acc (1.50, on the line; 1.42 in a previous run) |
| c03 | backend | exact |
| c04 | backend, backend-acc, e2e | + e2e |
| c05 | backend, persistence | exact (backend-acc was S, 1.26) |
| c06 | backend, persistence, backend-acc, frontend-acc, e2e | + e2e; from the `--stat` alone |
| c07 | backend, backend-acc, frontend, admin, frontend-acc, e2e | + e2e |
| c08 | backend-acc, e2e | exact |
| c09 | frontend-acc, admin-acc | **misses backend-acc (1.28) and e2e (1.40)** |
| c10 | nothing | exact (control), frontend at 1.44 |
| c11 | frontend-acc, e2e | exact |

- Required suites caught: 18 of 20. Both misses are c09, a Dockerfile-only change.
- Extra suites: 4, three of them `e2e`, the slowest suite, whenever backend runtime wiring changes.
- 6 of 11 commits exact. A second run gave the same picks except c02's frontend-acc crossing the line.
- Jev: $0.0037 for the 11 calls, 300 to 800 ms each.
- c06's full diff (142 KB) fails Jev with `max_tokens_exceeded` though `ask_jev` admitted it: its
  estimate is 4 bytes per token, and a code diff sent as JSON state runs about 3. The skill cuts at
  80 KB to the name-status list plus `--stat`, and the picks from that were still right.
- End to end, `claude -p "/verify-jev 0ee932bb"`: 3 turns, Claude $0.23, same scores and command.
