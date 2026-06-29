// Probe: feed the captured real matches through the engine and count edges.
// Validates that real TxLINE books actually trip the thresholds.
import { readFileSync } from "node:fs";
import path from "node:path";
import { EdgeEngine } from "../lib/edge/engine.mjs";

const REPLAYS = JSON.parse(readFileSync(path.resolve(process.cwd(), "lib/replays.json"), "utf8"));
const OPTS = {
  steamThreshold: 0.015, steamWindowMs: 90_000,
  overreactionThreshold: 0.03, overreactionWindowMs: 150_000,
  quoteThreshold: 0.005, quoteWindowMs: 60_000,
  historyMs: 300_000, edgeTtlMs: 8_000, edgeCooldownMs: 0, // 0 = count gross potential
};

for (const m of REPLAYS) {
  const engine = new EdgeEngine(OPTS);
  const counts = { steam: 0, overreaction: 0, quote: 0 };
  const events = [];
  engine.on("edge", (e) => { counts[e.kind] = (counts[e.kind] || 0) + 1; });
  engine.on("matchEvent", (e) => events.push(e.label));

  const firstOdds = Math.min(...m.odds.map((o) => o.Ts));
  const windowStart = firstOdds - 5 * 60_000;
  const merged = [
    ...m.odds.map((r) => ({ t: r.Ts, kind: "odds", r })),
    ...m.scores.filter((s) => s.Ts >= windowStart).map((r) => ({ t: r.Ts, kind: "scores", r })),
  ].sort((a, b) => a.t - b.t);

  for (const ev of merged) {
    if (ev.kind === "odds") engine.ingestOdds(ev.r);
    else engine.ingestScores(ev.r);
  }
  console.log(`${m.fid} ${m.p1} v ${m.p2}: odds=${m.odds.length} scores=${m.scores.length} | match-events=${events.length} [${[...new Set(events)].join(", ")}] | steam=${counts.steam} overreaction=${counts.overreaction} quote=${counts.quote}`);
}
