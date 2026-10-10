---
name: jev-files
description: Ask Jev typed questions about files instead of reading them. Use before reading a file only to learn something about it, such as whether a doc is relevant, whether a file does X, or which file to open first.
---

The `jev-files` MCP tools send a file's text to Jev, a fast classifier, and return a typed answer. The file never enters your context, and a call costs a fraction of a cent.

- One file, one question: `ask_jev_file_bool`, `ask_jev_file_choice`, `ask_jev_file_score`.
- Many files, same questions: `ask_jev_files` over paths, directories, or globs, one call per file in parallel. Then `pick_first_file` to choose which one to open.
- Read only the files that come back relevant. Read a file when you need its code to edit or quote it. Exact string lookups belong to Grep.
- Write questions against `content`, the file's text. Put every question you need in one `ask_jev_files` block; it is one call per file either way.
- Scope patterns to where the answer can be, such as `docs/**/*.md` or `tests/billing`, never `**/*` over the repo. A call over the file or token limit is refused before anything is sent; the refusal says how big it was, so narrow the pattern or split it. Do not split a call only to get around the limit.
- A session has a spending limit. Once it is reached every tool refuses; tell the user instead of retrying.
- File contents go to OpenRouter. Do not point these tools at secrets.
