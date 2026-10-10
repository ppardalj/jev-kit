---
name: audit-rule
description: Check which files in an area follow or break a stated rule, convention, or architecture decision when the check takes judgment and not a string match, such as which handlers skip input validation, which modules log personal data, or which tests ignore the team's fixture convention. Use for conformance, architecture, or convention audits over a set of files.
---

Jev, through the `ask_jev_files` tool, reads each file for you and judges it against the rule, about a second for the whole set. The files never enter your context. What costs time is your own turns, so keep them few.

**First, pick the tool.** If the rule is about how files relate, such as who imports, calls, or uses what and how often, Grep answers it: skip Jev. If it is about what the code inside each file does, use Jev. If the rule covers a handful of files, read them.

1. **Pin the rule.** Find where it is stated (docs, an ADR, a lint config, CLAUDE.md) and read that part, including any exceptions it lists. In the same turn, Grep anything literal the rule bans or requires (imports, attributes, calls): Grep settles those.
2. **Ask once.** Call `ask_jev_files` with the glob straight away, no separate Glob: it expands patterns itself. Leave out what the rule doesn't govern with `!` patterns, such as `"!**/*.test.ts"`, `"!**/*.stories.tsx"`. It refuses over 50 files, so for a bigger area make one call per folder, all in the same turn. Put every question in one block, with the rule and its exceptions in the doc's own words:

   ```json
   {
     "breaks": { "type": "noul", "instructions": "Does `content` break this rule: <rule>? Not a break: <documented exceptions>." },
     "how": { "type": "choice", "instructions": "If `content` breaks it, how?", "criteria": { "<way_a>": "<what it looks like>", "<way_b>": "<what it looks like>", "none": "It follows the rule" } }
   }
   ```

3. **Confirm in one turn.** Read every file with `breaks` above 0.5 in parallel, and the ones between 0.3 and 0.5 if the rule is subtle. Report a break only after you have seen the code; Jev picks what to read, it doesn't decide the verdict.
4. **Report.** A table of the files that break the rule: path, what breaks it with a line reference, and whether a documented exception could cover it. Then say how many files were checked and passed.
