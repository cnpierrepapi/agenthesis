// AGENT DECISION CORE — pure, deterministic, documented.
//
// This module is intentionally plain JS with no I/O and no clock reads: every
// function is a pure mapping from (agent, edge, context) to a decision. That is
// what makes the agents' behaviour deterministic and unit-testable
// (see scripts/agent_test.mjs). The runner is the only place side effects live.
//
// ───────────────────────────────────────────────────────────────────────────
// THE MODEL (why these numbers are defensible)
// ───────────────────────────────────────────────────────────────────────────
// TxLINE publishes a de-margined ("no-vig") price book. For side S we read its
// fair probability directly:
//
//        p = 1 / (price / 1000)              (the two sides sum to ~1)
//        O = 1 / p                            (decimal odds), b = O - 1 (net odds)
//
// An *edge* is a measured dislocation of magnitude m (in probability units):
//   • steam        — p moved by m within a short window (sharp money). Continue.
//   • overreaction — p swung by m right after a goal/red card. Revert.
// The engine already encodes the correct side+direction, so a "follow" agent
// trades the engine's call and a "fade" agent inverts it.
//
// SETTLEMENT = CLOSING-LINE VALUE (CLV). We do not wait for the match result;
// we value the position at the market's later fair probability p_close:
//
//        back:  r = (p_close - p_entry) / p_entry      (= p_close·O_entry - 1)
//        lay:   r = (p_entry - p_close) / p_entry
//
// The back identity r = p_close·O_entry − 1 IS the expected value of the bet
// priced at the closing line — a standard, citable result. CLV is therefore
// both our P&L and our skill metric, and it resolves from odds alone
// (deterministic, replayable, no outcome dependency).
//
// SIZING. Expected captured move ê = κ·m, where κ is the fraction of the
// observed dislocation we expect to realise as CLV (κ = CONTINUATION_COEFF,
// a single stated assumption). Converting to an expected return per unit stake:
//
//        e = ê / p_entry            (since r = Δp / p_entry)
//        f* = e / b                 (Kelly for a bet with edge e at net odds b)
//
// Agents use fractional Kelly k·f* capped at KELLY_CAP, or a flat fraction of
// bankroll. Both are bounded, monotonic in the edge, and fully specified below.

export const CONTINUATION_COEFF = 0.5; // κ — expect to capture half the move
export const KELLY_CAP = 0.25; // never stake more than 25% of bankroll on one bet
export const CLV_FLOOR = -1; // a position cannot lose more than its stake
export const CLV_CEIL = 2; // and we clamp upside for sane variance

function flip(d) {
  return d === "back" ? "lay" : "back";
}

// Expected CLV return per unit stake implied by an edge of magnitude m.
export function expectedReturn(edgeMeasure, pEntry) {
  const expectedMove = CONTINUATION_COEFF * edgeMeasure; // ê
  return expectedMove / pEntry; // e = ê / p_entry
}

// Fractional-Kelly stake (fake-USD). f* = e / b, scaled by `frac`, capped.
export function kellyStake(bankroll, edgeMeasure, odds, pEntry, frac) {
  const b = Math.max(odds - 1, 0.05); // net odds, guarded
  const e = expectedReturn(edgeMeasure, pEntry);
  const f = Math.min(Math.max((frac * e) / b, 0), KELLY_CAP);
  return bankroll * f;
}

// The pure decision. Returns { take, reason, ... }. No mutation, no clock.
export function decide(agent, edge, ctx) {
  const L = agent.levers;

  if (agent.status !== "running") return { take: false, reason: "agent not running" };
  if (edge.kind !== agent.edgeKind) return { take: false, reason: "edge kind ≠ paper" };
  if (edge.edgeMeasure < L.minConviction)
    return { take: false, reason: `below conviction floor (${(edge.edgeMeasure * 100).toFixed(1)}pp)` };

  // phase / minute gate
  const inPlay = !!edge.market.inRunning;
  if (L.phase === "pre" && inPlay) return { take: false, reason: "pre-match only" };
  if (L.phase === "inplay" && !inPlay) return { take: false, reason: "in-play only" };
  if (inPlay && ctx.minute != null && (ctx.minute < L.minMinute || ctx.minute > L.maxMinute))
    return { take: false, reason: `minute ${ctx.minute} outside [${L.minMinute},${L.maxMinute}]` };

  // market filter
  if (L.marketFilter.length && !L.marketFilter.includes(edge.market.superOddsType))
    return { take: false, reason: `market ${edge.market.superOddsType} filtered out` };

  // odds band
  const pEntry = edge.fairProb;
  const odds = 1 / pEntry;
  if (odds < L.oddsMin || odds > L.oddsMax)
    return { take: false, reason: `odds ${odds.toFixed(2)} outside band` };

  // concurrency
  if (ctx.openCount >= L.maxConcurrent)
    return { take: false, reason: `max concurrent (${L.maxConcurrent}) reached` };

  // direction + sizing
  const direction = L.direction === "follow" ? edge.direction : flip(edge.direction);
  const stake =
    L.stakeMode === "kelly"
      ? kellyStake(agent.bankroll, edge.edgeMeasure, odds, pEntry, L.kellyFraction)
      : agent.bankroll * L.stakePct;

  if (stake < 1) return { take: false, reason: "stake below $1" };

  return {
    take: true,
    reason: `take ${direction} ${edge.market.side} @ ${odds.toFixed(2)}`,
    side: edge.market.side,
    direction,
    stake: Math.round(stake * 100) / 100,
    entryProb: pEntry,
    entryOdds: Math.round(odds * 1000) / 1000,
  };
}

// Mark/settle a position to closing-line value. Pure.
export function markPosition(pos, currentProb) {
  const raw =
    pos.direction === "back"
      ? (currentProb - pos.entryProb) / pos.entryProb
      : (pos.entryProb - currentProb) / pos.entryProb;
  const clvReturn = Math.max(CLV_FLOOR, Math.min(CLV_CEIL, raw));
  return { clvReturn, pnl: Math.round(pos.stake * clvReturn * 100) / 100 };
}
