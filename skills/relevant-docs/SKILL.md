---
name: relevant-docs
description: Find which of a repo's docs (architecture notes, ADRs, READMEs, guides, runbooks, planning notes) actually address a topic, before answering how or why the project does something, or before a change a documented decision may govern. Use when the repo has more docs than are worth reading in full, and the one that matters may not use the words you would search for.
---

Jev, through the `jev-files` MCP tools, reads each doc for you and says whether it addresses the topic. The docs never enter your context; a call costs a fraction of a cent per file. Load `ask_jev_files` through tool search if it isn't loaded yet.

1. **List the docs.** Glob the markdown and text docs: `**/*.md`, plus `docs/`, `adr/`, and runbook folders if the repo has them. Leave out changelogs, vendored or generated docs, and license files. If there are over 50, scope to the folders the topic can live in.
2. **Ask once.** One `ask_jev_files` call over the list, with every question in one block. State the topic in your own words, broader than the user's phrasing, so a doc that uses other terms still matches:

   ```json
   {
     "addresses": { "type": "noul", "instructions": "Does `content` address <topic>: a rule, decision, procedure, or explanation about it?" },
     "depth": { "type": "score", "instructions": "How much of `content` is about <topic>?", "criteria": ["Not at all", "A passing mention", "A section", "The whole doc"] },
     "kind": { "type": "choice", "instructions": "What is `content`'s stance on <topic>?", "criteria": { "decision": "A decision or rule to follow", "how_to": "Steps or commands", "background": "Explanation or context", "other": "None of these" } }
   }
   ```

3. **Read the few that matter.** Read the docs with `addresses` above 0.5, highest `depth` first, usually two or three. Read only the relevant sections of long ones. A `decision` outranks a `background` doc on the same topic.
4. **Answer from them.** Cite each doc by path and section. Say so when no doc addresses the topic, rather than filling the gap from code; then go to the code if the question needs it.

Skip this when the user names the doc, when the repo has only a handful of docs, or when the question is an exact string or symbol lookup: Grep it.
