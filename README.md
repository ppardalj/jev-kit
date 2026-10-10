# jev-kit

Claude Code plugin with tools and skills built on [Jev](https://typesafe.ai), TypeSafe's System One classifier: typed answers with probabilities, in about 300 ms, for a fraction of a cent. Ideas come from [10 Levels of Jev](https://github.com/disler/ten-levels-of-jev) and beyond.

## What's inside

| Component | What it does |
|---|---|
| `jev-files` MCP server | `ask_jev_file_bool`, `ask_jev_file_choice`, `ask_jev_file_score`: one judgment about one file. `ask_jev_files`: the same questions over many files in parallel. `pick_first_file`: which of them to open first. File contents go to Jev, never into Claude's context. |
| `jev-files` skill | Tells Claude when to ask Jev about a file instead of reading it. |

## Install

Requires Node 22.18 or newer (the server runs TypeScript with Node's built-in type stripping, no build, no dependencies) and an [OpenRouter key](https://openrouter.ai/keys).

```
/plugin marketplace add ppardalj/jev-kit
/plugin install jev-kit@jev-kit
```

Claude Code asks for the OpenRouter key when the plugin is enabled and keeps it in secure storage. Change it later from `/plugin` → Installed → jev-kit → Configure options.

## Privacy

The tools send the text of the files you point them at to OpenRouter and TypeSafe. Don't use them on files you can't share with a third party.

## Development

See `.claude/CLAUDE.md`. `mcp/src` holds code adapted from ten-levels-of-jev, MIT licensed; its notice is in `mcp/src/LICENSE`.
