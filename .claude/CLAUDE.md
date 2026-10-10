# jev-kit

This repo is the `jev-kit` Claude Code plugin and its own marketplace (`.claude-plugin/`).

- `mcp/jev-files.ts` is a zero-dependency stdio MCP server. `mcp/src` is code copied from `ten-levels-of-jev` (core client, Levels 8 and 9) and owned here; change it freely.
- The plugin declares the server inline in `plugin.json` (`mcpServers`), with the key from `userConfig`. There is no root `.mcp.json` on purpose: a plugin loads it automatically.
- Development: the server is registered in local scope (`claude mcp add --scope local jev-files ...`) and reads the key from `.env` (gitignored). Run `/mcp` → reconnect after changing the server. `JEV_BACKEND=mock` answers by word overlap, so use it to check wiring only.
- Use the `jev-files` tools before reading a file only to learn something about it; see `skills/jev-files/SKILL.md`.
- Bump `version` in `plugin.json` on every release; installs update by version.
- `npm test` runs every test on the offline mock, no install needed; CI (`.github/workflows/ci.yml`) runs it on Node 22.18 and 24 plus `claude plugin validate .`. Test the pure code through its `decide` parameter with `fakeDecide` (`mcp/tests/repo.ts`); keep I/O-free logic out of `jev-files.ts`, which starts serving on import.
- `claude plugin validate .` before committing manifest changes.
- Spend guardrails live in `mcp/budget.ts` (pure). `ask_jev_files` admits its pruned plan through `askFiles`' `beforeCalls` hook, so a refusal happens before any call; every tool also checks the session budget. Limits come from `JEV_MAX_FILES`, `JEV_MAX_TOKENS_PER_CALL`, `JEV_MAX_USD_PER_SESSION`, which `plugin.json` fills from `userConfig`. Unusable values fall back to the defaults. A new tool that calls Jev must go through `decide`, so its spend is recorded.
- `evals/` is a headless eval harness (`run.sh`, `summarize.ts`), not part of the plugin; see each eval's README and results. Skills under `evals/skills/` are eval-only; only `skills/` ships.
