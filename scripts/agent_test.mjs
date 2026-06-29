// Deterministic unit tests for the agent decision core.
// Run: node scripts/agent_test.mjs
// Every assertion is a fixed input → fixed output; no clock, no randomness.

import { decide, markPosition, kellyStake, expectedReturn, evalStrategy } from "../lib/agent-core.mjs";

let passed = 0;
let failed = 0;
function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const LEVERS = {
  edgeKinds: ["steam"],
  minConviction: 0.04,
  stakeMode: "flat",
  stakePct: 0.05,
  kellyFraction: 0.5,
  phase: "both",
  minMinute: 0,
  maxMinute: 90,
  marketFilter: [],
  oddsMin: 1.3,
  oddsMax: 6.0,
  maxConcurrent: 3,
  direction: "follow",
};

// An agent with a single strategy (base tuning) over the given edge kinds.
function agent(over = {}, levers = {}, edgeKinds = ["steam"]) {
  return {
    status: "running",
    bankroll: 350,
    strategies: [{ label: "base tuning", source: "base", edgeKinds, levers: { ...LEVERS, ...levers } }],
    ...over,
  };
}
function edge(over = {}) {
  return {
    kind: "steam",
    market: { superOddsType: "OVERUNDER", inRunning: true, side: "Over" },
    edgeMeasure: 0.06,
    fairProb: 0.5, // → odds 2.0
    direction: "back",
    ...over,
  };
}
const ctx = (over = {}) => ({ minute: 30, openCount: 0, ...over });

console.log("agent-core deterministic tests");

// --- gating --------------------------------------------------------------
check("rejects below conviction floor", decide(agent(), edge({ edgeMeasure: 0.03 }), ctx()).take === false);
check("rejects edge kind no strategy trades", decide(agent({}, {}, ["overreaction"]), edge(), ctx()).take === false);
check("rejects when not running", decide(agent({ status: "paused" }), edge(), ctx()).take === false);
check("rejects odds outside band", decide(agent({}, { oddsMax: 1.8 }), edge({ fairProb: 0.5 }), ctx()).take === false);
check("rejects in-play edge for pre-match strategy", decide(agent({}, { phase: "pre" }), edge(), ctx()).take === false);
check("rejects minute outside window", decide(agent({}, { minMinute: 60 }), edge(), ctx({ minute: 30 })).take === false);
check("rejects at max concurrency", decide(agent({}, { maxConcurrent: 2 }), edge(), ctx({ openCount: 2 })).take === false);
check("rejects filtered market", decide(agent({}, { marketFilter: ["MATCHODDS"] }), edge(), ctx()).take === false);

// --- flat sizing ---------------------------------------------------------
const flat = decide(agent(), edge(), ctx());
check("flat take is accepted", flat.take === true);
check("flat stake = bankroll × pct = 350×0.05 = 17.5", flat.stake === 17.5, `got ${flat.stake}`);
check("follow keeps engine direction (back)", flat.direction === "back");
check("entry odds = 2.0", near(flat.entryOdds, 2.0));

// --- fade ----------------------------------------------------------------
const faded = decide(agent({}, { direction: "fade" }), edge({ direction: "back" }), ctx());
check("fade inverts direction (back→lay)", faded.direction === "lay");

// --- Kelly sizing (derivation pinned) ------------------------------------
// p=0.5 → O=2, b=1; m=0.08; κ=0.5 → ê=0.04; e=ê/p=0.08; f*=e/b=0.08; frac 0.5 → 0.04
check("expectedReturn(0.08,0.5) = 0.08", near(expectedReturn(0.08, 0.5), 0.08));
check("kellyStake = 350×0.04 = 14", near(kellyStake(350, 0.08, 2.0, 0.5, 0.5), 14));
const kel = decide(agent({}, { stakeMode: "kelly", kellyFraction: 0.5 }), edge({ edgeMeasure: 0.08, fairProb: 0.5 }), ctx());
check("kelly decision stake = 14.00", kel.stake === 14, `got ${kel.stake}`);
const capped = decide(agent({}, { stakeMode: "kelly", kellyFraction: 1, minConviction: 0.01 }), edge({ edgeMeasure: 0.9, fairProb: 0.5 }), ctx());
check("kelly clamps at 25% cap = 87.5", capped.stake === 87.5, `got ${capped.stake}`);

// --- multi-strategy: base tuning + an attached paper ---------------------
// Papers are tried first (priority), then the always-on base tuning.
const multi = {
  status: "running",
  bankroll: 350,
  strategies: [
    { label: "Steam paper", source: "paper", paperId: "steam-base", edgeKinds: ["steam"], levers: { ...LEVERS } },
    { label: "base tuning", source: "base", edgeKinds: ["quote"], levers: { ...LEVERS, minConviction: 0.003 } },
  ],
};
const onSteam = decide(multi, edge({ kind: "steam" }), ctx());
check("multi trades paper edge (steam)", onSteam.take === true);
check("paper take tagged with paper source", onSteam.source === "Steam paper" && onSteam.paperId === "steam-base");
const onQuote = decide(multi, edge({ kind: "quote", edgeMeasure: 0.006 }), ctx());
check("multi trades base quote edge alongside paper", onQuote.take === true);
check("base take tagged base, no paperId", onQuote.source === "base tuning" && onQuote.paperId === null);
check("multi ignores kind no strategy trades", decide(multi, edge({ kind: "overreaction" }), ctx()).take === false);

// evalStrategy is the single-strategy primitive decide() iterates.
check(
  "evalStrategy rejects kind it doesn't trade",
  evalStrategy({ edgeKinds: ["quote"], levers: LEVERS }, edge({ kind: "steam" }), ctx(), 350).take === false,
);

// --- CLV settlement ------------------------------------------------------
const back = markPosition({ direction: "back", entryProb: 0.5, stake: 100 }, 0.55);
check("back CLV +10% on 0.50→0.55 → +$10", back.pnl === 10 && near(back.clvReturn, 0.1));
const lay = markPosition({ direction: "lay", entryProb: 0.5, stake: 100 }, 0.55);
check("lay CLV −10% on 0.50→0.55 → −$10", lay.pnl === -10 && near(lay.clvReturn, -0.1));

// --- determinism ---------------------------------------------------------
const a = JSON.stringify(decide(agent(), edge(), ctx()));
const b = JSON.stringify(decide(agent(), edge(), ctx()));
check("decide is deterministic (identical output)", a === b);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
