#!/usr/bin/env bash
# Runs every question of an eval twice in headless Claude Code, with and without jev-kit,
# and keeps each session's stream-json log for summarize.ts.
# Usage: evals/run.sh <eval-dir> <target-repo> [parallel]
# Env: RUN_TAG names the run dir; QUESTIONS="q2 q3" runs only those ids; JEV_HINT is appended to the jev arm's prompt only.
# Cheap adoption probe: ARMS=jev MAX_TURNS=6 REPEAT=3 runs only the jev arm, three times, cut after six turns;
# summarize.ts reports the turn Jev was first reached for.
# JEV_SKILLS="relevant-docs" evaluates this working copy instead of the installed release, with only those skills:
# the installed plugin's cache gets this checkout's server and the listed skills for the run, and is restored on exit.
set -euo pipefail

eval_dir=$(realpath "$1")
target=$(realpath "$2")
parallel=${3:-4}
out="$eval_dir/runs/$(date +%Y%m%d-%H%M%S)${RUN_TAG:+-$RUN_TAG}"
mkdir -p "$out"

if [ -n "${JEV_SKILLS:-}" ]; then
  checkout=$(cd "$(dirname "$0")/.." && pwd)
  cache=$(jq -r '.plugins["jev-kit@jev-kit"][0].installPath' ~/.claude/plugins/installed_plugins.json)
  backup=$(mktemp -d)
  cp -a "$cache" "$backup/plugin"
  trap 'rm -rf "$cache" && cp -a "$backup/plugin" "$cache" && rm -rf "$backup"' EXIT
  rm -rf "$cache/mcp" "$cache/skills" && mkdir "$cache/skills"
  rsync -a --exclude tests "$checkout/mcp" "$cache/"
  for skill in $JEV_SKILLS; do cp -a "$checkout/skills/$skill" "$cache/skills/"; done
  echo "jev arm: $checkout with skills: $JEV_SKILLS" > "$out/build.txt"
fi

# Read-only by construction: no edits, no web, no subagents (their tool calls would hide in a child session).
allowed='Read,Grep,Glob,Bash(git ls-files *),Bash(git grep *),Bash(head *),Bash(tail *),Bash(sed -n *),Bash(wc *),Bash(ls *),Bash(cat *),Bash(grep *),Bash(rg *),Bash(find *),mcp__plugin_jev-kit_jev-files'
disallowed='Task,Agent,Edit,Write,NotebookEdit,WebFetch,WebSearch'

run_one() {
  local id=$1 arm=$2 rep=$3 question=$4 settings='{}' hint='' name="$1-$2"
  [ "${REPEAT:-1}" -gt 1 ] && name="$name-$rep"
  [ "$arm" = base ] && settings='{"enabledPlugins":{"jev-kit@jev-kit":false}}'
  [ "$arm" = jev ] && [ -n "${JEV_HINT:-}" ] && hint=" $JEV_HINT"
  printf '%s\n\nThis is a read-only investigation: do not modify any file. Answer concisely and cite file paths.%s\n' "$question" "$hint" |
    (cd "$target" && claude -p --no-session-persistence --verbose --output-format stream-json \
      --settings "$settings" --allowedTools="$allowed" --disallowedTools="$disallowed" --max-turns "${MAX_TURNS:-80}") \
    > "$out/$name.jsonl" 2> "$out/$name.err" || echo "$name exited $?" >&2
  echo "done $name" >&2
}
export -f run_one
export target out allowed disallowed JEV_HINT MAX_TURNS REPEAT

jq -r --arg only "${QUESTIONS:-}" '.[] | select($only == "" or (.id | IN($only | split(" ")[]))) | [.id, .question] | @tsv' "$eval_dir/questions.json" |
  while IFS=$'\t' read -r id question; do
    for rep in $(seq "${REPEAT:-1}"); do
      for arm in ${ARMS:-jev base}; do printf '%s\t%s\t%s\t%s\n' "$id" "$arm" "$rep" "$question"; done
    done
  done |
  xargs -P "$parallel" -d '\n' -I{} bash -c 'IFS=$'"'"'\t'"'"' read -r id arm rep q <<< "$1"; run_one "$id" "$arm" "$rep" "$q"' _ {}

echo "$out"
