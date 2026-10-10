# jev-kit

This repo is the `jev-kit` Claude Code plugin and its own marketplace (`.claude-plugin/`).

- `mcp/jev-files.ts` is a zero-dependency stdio MCP server. `mcp/src` is code copied from `ten-levels-of-jev` (core client, Levels 8 and 9) and owned here; change it freely.
- The plugin declares the server inline in `plugin.json` (`mcpServers`), with the key from `userConfig`. There is no root `.mcp.json` on purpose: a plugin loads it automatically.
- Development: the server is registered in local scope (`claude mcp add --scope local jev-files ...`) and reads the key from `.env` (gitignored). Run `/mcp` → reconnect after changing the server. `JEV_BACKEND=mock` answers by word overlap, so use it to check wiring only.
- Use the `jev-files` tools before reading a file only to learn something about it; see `skills/jev-files/SKILL.md`.
- Bump `version` in `plugin.json` on every release; installs update by version.
- `claude plugin validate .` before committing manifest changes.
