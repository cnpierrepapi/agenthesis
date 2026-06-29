// CHECK LIVE — one-command confirmation that we receive real-time TxLINE frames.
//
// Opens the live odds SSE stream with the app's env token, samples a few
// seconds, and reports each frame's age (wall-now − frame.Ts). Frame ages near
// zero ⇒ genuinely real-time (not a replay/cache). Prints a clear verdict.
//
//   node --env-file=.env.local scripts/check_live.mjs           # ~8s sample
//   node --env-file=.env.local scripts/check_live.mjs 15        # 15s sample
//
// Env: TXLINE_API_BASE, TXLINE_JWT, TXLINE_API_TOKEN.

const base = process.env.TXLINE_API_BASE;
const jwt = process.env.TXLINE_JWT;
const tok = process.env.TXLINE_API_TOKEN;
if (!base || !jwt || !tok) {
  console.error("✗ Missing TXLINE_API_BASE / TXLINE_JWT / TXLINE_API_TOKEN (use --env-file=.env.local).");
  process.exit(2);
}

const DEMARGINED = "TXLineStablePriceDemargined";
const seconds = Number(process.argv[2]) || 8;

console.log(`Sampling ${base}/api/odds/stream for ~${seconds}s …\n`);

const ctrl = new AbortController();
setTimeout(() => ctrl.abort(), seconds * 1000);

let res;
try {
  res = await fetch(`${base}/api/odds/stream`, {
    headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": tok, Accept: "text/event-stream" },
    signal: ctrl.signal,
  });
} catch (e) {
  console.error(`✗ could not open stream: ${e.message}`);
  process.exit(1);
}
if (!res.ok || !res.body) {
  console.error(`✗ odds stream HTTP ${res.status}`);
  process.exit(1);
}
console.log(`odds stream HTTP ${res.status} OK`);

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = "";
let frames = 0;
let lagSum = 0;
let lagN = 0;
let worst = 0;
const fixtures = new Set();

try {
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const blk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of blk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        let o;
        try {
          o = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        if (o.FixtureId == null || o.Bookmaker !== DEMARGINED) continue;
        frames++;
        fixtures.add(o.FixtureId);
        if (o.Ts) {
          const lag = (Date.now() - Number(o.Ts)) / 1000;
          lagSum += lag;
          lagN += 1;
          worst = Math.max(worst, Math.abs(lag));
        }
      }
    }
  }
} catch (e) {
  if (e.name !== "AbortError") throw e;
}

const avg = lagN ? lagSum / lagN : NaN;
console.log("");
console.log(`  frames received   : ${frames}`);
console.log(`  live fixtures      : ${fixtures.size}${fixtures.size ? "  (" + [...fixtures].join(", ") + ")" : ""}`);
console.log(`  avg frame age      : ${lagN ? avg.toFixed(2) + "s" : "n/a"} (worst ${worst.toFixed(1)}s)`);

if (frames === 0) {
  console.log(`\n○ NO LIVE MATCH right now — stream is up but no fixtures are in-play (odds are live-only).`);
  process.exit(0);
}
if (avg < 60) {
  console.log(`\n✓ REAL-TIME — frames are timestamped ~now (${avg.toFixed(1)}s old). The feed is live.`);
  process.exit(0);
}
console.log(`\n⚠ DELAYED — frames are ${avg.toFixed(0)}s old; data is flowing but not real-time.`);
process.exit(0);
