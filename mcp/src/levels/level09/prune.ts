/**
 * Level 9, option B: expand and prune.
 * Globs and directories become a file list in code. Dependencies, VCS folders, binaries, and files over the budget drop out with a reason. The 255 cap is enforced before any call is made.
 */
import { readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, matchesGlob, resolve, sep } from "node:path";
import { LIMITS } from "../../core/types.ts";
import { MAX_FILE_CHARS, repoPath } from "../level08/read-state.ts";

export const SKIP_DIRS = new Set(["node_modules", ".git", ".sessions", "dist", "build", "coverage", ".pi"]);
const GLOB_CHARS = /[*?[\]{}]/;

export interface Skipped {
  path: string;
  reason: string;
}

/**
 * Files under `dir`, as paths joined onto `dir`. Never descends into SKIP_DIRS, so dependencies cost nothing.
 * Dot folders like .claude or .github are walked: Node's glob skips them under `**` with no option to opt in.
 * Symlinks are followed; `seen` holds real directory paths so a link cycle ends the walk.
 */
async function* walk(dir: string, cwd: string, recursive: boolean, seen = new Set<string>()): AsyncGenerator<string> {
  const full = isAbsolute(dir) ? dir : resolve(cwd, dir);
  let entries;
  try {
    const real = await realpath(full);
    if (seen.has(real)) return;
    seen.add(real);
    entries = await readdir(full, { withFileTypes: true });
  } catch { return; }
  for (const e of entries) {
    const p = dir === "." ? e.name : join(dir, e.name);
    let isFile = e.isFile(), isDir = e.isDirectory();
    if (e.isSymbolicLink()) {
      try { const info = await stat(join(full, e.name)); isFile = info.isFile(); isDir = info.isDirectory(); } catch { continue; }
    }
    if (isFile) yield p;
    else if (isDir && recursive && !SKIP_DIRS.has(e.name)) yield* walk(p, cwd, true, seen);
  }
}

/** The leading segments without glob characters, where the walk starts. */
const staticPrefix = (pattern: string) => {
  const parts = pattern.split("/");
  const i = parts.findIndex((part) => GLOB_CHARS.test(part));
  return parts.slice(0, i).join("/") || (pattern.startsWith("/") ? "/" : ".");
};

/** matchesGlob, like glob, never lets `*` or `**` match a leading dot; retry with the dots neutralized so they can. */
const matches = (path: string, pattern: string) =>
  matchesGlob(path, pattern) || matchesGlob(path.replace(/(^|\/)\./g, "$1_"), pattern);

/**
 * Patterns are globs, files, or directories, relative to `cwd` or absolute inside it.
 * A directory means its files, or everything below it when recursive.
 */
export async function expandPatterns(patterns: string[], cwd: string, recursive: boolean): Promise<string[]> {
  const out = new Set<string>();
  for (const raw of patterns) {
    const trimmed = raw.trim().replace(/^\.\//, "").replace(/\/+$/, "");
    if (!trimmed) continue;
    const pattern = isAbsolute(trimmed) ? repoPath(trimmed, cwd) ?? trimmed : trimmed; // outside the repo: prune reports it
    if (GLOB_CHARS.test(pattern)) {
      for await (const p of walk(staticPrefix(pattern), cwd, true)) if (matches(p, pattern)) out.add(p);
      continue;
    }
    const full = isAbsolute(pattern) ? pattern : resolve(cwd, pattern);
    let info;
    try { info = await stat(full); } catch { out.add(pattern); continue; } // let prune report it
    if (info.isFile()) { out.add(pattern); continue; }
    for await (const p of walk(pattern, cwd, recursive)) out.add(p);
  }
  return [...out].sort();
}

export interface Pruned {
  files: string[];
  skipped: Skipped[];
  /** Total size of `files`, for a cost estimate before any call. */
  bytes: number;
  /** Files that passed every filter but fell over the cap. */
  capped: number;
}

/** What survives, and why each dropped file dropped. Nothing here calls Jev. */
export async function pruneFiles(paths: string[], cwd: string, cap = LIMITS.MAX_CHOICE_OPTIONS): Promise<Pruned> {
  const files: string[] = [];
  const skipped: Skipped[] = [];
  let bytes = 0, capped = 0;
  for (const path of paths) {
    const rel = repoPath(path, cwd);
    if (rel === null) { skipped.push({ path, reason: "outside the repo" }); continue; }
    const full = resolve(cwd, rel);
    if (rel.split(sep).some((part) => SKIP_DIRS.has(part))) { skipped.push({ path, reason: "skipped directory" }); continue; }
    let info;
    try { info = await stat(full); } catch { skipped.push({ path, reason: `not found, paths resolve from ${cwd}` }); continue; }
    if (!info.isFile()) continue;
    if (info.size === 0) { skipped.push({ path, reason: "empty" }); continue; }
    if (info.size > MAX_FILE_CHARS) { skipped.push({ path, reason: `too large, ${info.size} bytes` }); continue; }
    if (/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|woff2?|ttf|mp[34]|mov|lock)$/i.test(path)) { skipped.push({ path, reason: "binary or lock file" }); continue; }
    if (files.length >= cap) { skipped.push({ path, reason: `over the ${cap} file cap; narrow the pattern` }); capped++; continue; }
    files.push(path);
    bytes += info.size;
  }
  return { files, skipped, bytes, capped };
}
