# jev-kit

Claude Code plugin with tools and skills built on [Jev](https://typesafe.ai), TypeSafe's System One classifier: typed answers with probabilities, in about 300 ms, for a fraction of a cent. Ideas come from [10 Levels of Jev](https://github.com/disler/ten-levels-of-jev) and beyond.

## What's inside

| Component | What it does |
|---|---|
| `jev-files` MCP server | `ask_jev_file_bool`, `ask_jev_file_choice`, `ask_jev_file_score`: one judgment about one file. `ask_jev_files`: the same questions over many files in parallel, over paths or globs relative to the repo root or absolute, with `!` patterns to leave files out; Claude Code loads it up front. `pick_first_file`: which of them to open first. `ask_jev`: the generic primitive, any question block about Claude's own state plus up to 20 files, in one call; for building skills on Jev, also loaded up front. File contents go to Jev, never into Claude's context. |
| `jev-files` skill | Tells Claude when to ask Jev about a file instead of reading it. |

## Install

Requires Node 22.18 or newer (the server runs TypeScript with Node's built-in type stripping, no build, no dependencies) and an [OpenRouter key](https://openrouter.ai/keys).

```
/plugin marketplace add ppardalj/jev-kit
/plugin install jev-kit@jev-kit
```

Then set the OpenRouter key. Installing does not ask for it, and every tool call fails until it is set:

```
/plugin configure jev-kit@jev-kit
```

Or from a shell: pipe a JSON object such as `{"openrouter_api_key": "sk-or-..."}` into `claude plugin configure jev-kit@jev-kit --values-stdin`. Restart Claude Code to apply it. Change the key later the same way, or from `/plugin` → Installed → jev-kit → Configure options.

The key is stored as a plugin secret: in the system credential store, which on Linux is `~/.claude/.credentials.json` (plain text, mode 600; checked on WSL). Uninstalling the plugin deletes it.

## Spend limits

Every tool call is checked against three limits before anything goes to Jev. A refused call costs nothing, and its error tells Claude how big the call was.

| Option | Default | Refuses |
|---|---|---|
| `max_files_per_call` | 50 | an `ask_jev_files` or `ask_jev` call whose paths match more files |
| `max_tokens_per_call` | 500,000 | an `ask_jev_files` or `ask_jev` call whose state adds up to more estimated tokens (text bytes / 4, plus about 500 per call) |
| `max_usd_per_session` | $0.50 | every tool, once the session has spent this much; calls in flight count toward it |

A session is one Claude Code session; restarting starts a new budget. The cost is OpenRouter's reported cost, estimated from the session's rate when it is missing. Change the limits with `/plugin configure jev-kit@jev-kit`; Claude Code stores them per user, not per project. They protect against a broad pattern or a looping agent within one session. For a hard monthly cap across sessions and machines, set a credit limit on the OpenRouter key.

## Privacy

The tools send the text of the files you point them at to OpenRouter and TypeSafe. Don't use them on files you can't share with a third party.

## Development

`npm test` runs the suite on Jev's offline mock, no install, no key. See `.claude/CLAUDE.md`. `mcp/src` holds code adapted from ten-levels-of-jev, MIT licensed; its notice is in `mcp/src/LICENSE`.
