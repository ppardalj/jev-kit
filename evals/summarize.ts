/**
 * Summarizes the stream-json logs of one eval run: Claude's tokens, cost, turns and tool calls,
 * and Jev's calls, tokens and cost from the last `jev_session` a jev tool returned,
 * plus the turn Claude first reached for Jev: the jev-files skill, a ToolSearch for jev tools, or a jev tool.
 * Usage: node evals/summarize.ts <run-dir>   → markdown table on stdout, summary.json in the run dir.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node evals/summarize.ts <run-dir>");

const short = (name: string) => name.replace(/^mcp__plugin_jev-kit_jev-files__/, "jev:");

async function summarize(file: string) {
  const lines = (await readFile(join(dir, file), "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const tools: Record<string, number> = {};
  const jevIds = new Set<string>();
  let jev = { calls: 0, input_tokens: 0, cost_usd: 0 }, jevRefusals = 0, jevErrors = 0;
  let turn = 0, lastId: string | undefined, jevTurn: number | null = null;
  for (const msg of lines) {
    if (msg.type === "assistant" && msg.message.id !== lastId) { turn++; lastId = msg.message.id; } // one turn streams as several messages
    for (const part of msg.message?.content ?? []) {
      if (msg.type === "assistant" && part.type === "tool_use") {
        if (jevTurn === null && /jev/.test(part.name === "Skill" || part.name === "ToolSearch" ? JSON.stringify(part.input) : part.name)) jevTurn = turn;
        tools[short(part.name)] = (tools[short(part.name)] ?? 0) + 1;
        if (part.name.includes("jev-files")) jevIds.add(part.id);
      }
      if (msg.type === "user" && part.type === "tool_result" && jevIds.has(part.tool_use_id)) {
        const text = typeof part.content === "string" ? part.content : part.content?.map((c: any) => c.text ?? "").join("");
        if (part.is_error) (/^refused/.test(text) ? jevRefusals++ : jevErrors++);
        try {
          const s = JSON.parse(text).jev_session;
          if (s && s.calls >= jev.calls) jev = s;
        } catch {}
      }
    }
  }
  const result = lines.findLast((m) => m.type === "result") ?? {};
  const u = result.usage ?? {};
  return {
    file,
    ok: result.subtype === "success",
    turns: result.num_turns,
    duration_s: Math.round((result.duration_ms ?? 0) / 1000),
    claude: {
      input: u.input_tokens ?? 0,
      cache_read: u.cache_read_input_tokens ?? 0,
      cache_write: u.cache_creation_input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cost_usd: result.total_cost_usd ?? 0,
    },
    tools,
    tool_calls: Object.values(tools).reduce((a, b) => a + b, 0),
    jev: { ...jev, refusals: jevRefusals, errors: jevErrors, first_turn: jevTurn },
    answer: result.result ?? "",
  };
}

const files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl")).sort();
const rows = await Promise.all(files.map(summarize));
await writeFile(join(dir, "summary.json"), JSON.stringify(rows, null, 2));

const k = (n: number) => `${(n / 1000).toFixed(1)}k`;
console.log("| run | ok | turns | s | claude in+cache | out | claude $ | tool calls | tools | jev at turn | jev calls | jev tokens | jev $ |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  const c = r.claude;
  const tools = Object.entries(r.tools).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(", ");
  const jev = r.jev.refusals || r.jev.errors ? ` (${r.jev.refusals} refused, ${r.jev.errors} err)` : "";
  console.log(`| ${r.file.replace(".jsonl", "")} | ${r.ok ? "✔" : "✘"} | ${r.turns} | ${r.duration_s} | ${k(c.input + c.cache_read + c.cache_write)} | ${k(c.output)} | ${c.cost_usd.toFixed(2)} | ${r.tool_calls} | ${tools} | ${r.jev.first_turn ?? "—"} | ${r.jev.calls}${jev} | ${k(r.jev.input_tokens)} | ${r.jev.cost_usd.toFixed(4)} |`);
}
