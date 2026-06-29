// AGENT POLICY — the pure decision layer.
//
// An agent runs ONE paper. When the engine fires an edge, the agent's levers
// decide whether to take it, which way, and how much fake-USD to commit. No
// human is involved: the runner calls decide() and acts on the result.

import type { Edge, EdgeDirection, EdgeMarketMeta, EdgeKind } from "./edge/types";
import type { AgentLevers } from "./papers";

export type AgentStatus = "running" | "paused" | "stopped";
export type PositionStatus = "open" | "settled";

export interface Position {
  id: string;
  agentId: string;
  edgeId: string;
  paperId: string;
  kind: EdgeKind;
  market: EdgeMarketMeta;
  matchLabel: string; // human-readable fixture/market
  side: string;
  direction: EdgeDirection;
  entryProb: number;
  entryOdds: number;
  stake: number;
  openedAt: number;
  holdUntil: number;
  markProb: number;
  clvReturn: number; // signed, in the position's direction
  pnl: number; // fake-USD
  status: PositionStatus;
}

export interface Agent {
  id: string;
  name: string;
  paperId: string;
  paperTitle: string;
  edgeKind: EdgeKind;
  levers: AgentLevers;
  status: AgentStatus;
  startBankroll: number;
  bankroll: number; // realized only
  dayPnl: number;
  bets: number;
  wins: number;
  losses: number;
  positions: Position[];
  createdAt: number;
}

export interface Decision {
  take: boolean;
  reason: string;
  side?: string;
  direction?: EdgeDirection;
  stake?: number;
  entryProb?: number;
  entryOdds?: number;
}

export interface DecideContext {
  minute: number | null; // current match minute (in-play), null if pre-match
  openCount: number; // agent's currently-open positions
}

function flip(d: EdgeDirection): EdgeDirection {
  return d === "back" ? "lay" : "back";
}

// Fractional-Kelly-ish sizing off the measured mispricing: stake ∝ edge / (odds-1).
function kellyStake(bankroll: number, edgeMeasure: number, odds: number, frac: number): number {
  const b = Math.max(odds - 1, 0.05);
  const f = Math.min((frac * edgeMeasure) / b, 0.25); // cap at 25% of bankroll
  return bankroll * Math.max(f, 0);
}

export function decide(
  agent: Agent,
  edge: Edge,
  ctx: DecideContext,
): Decision {
  const L = agent.levers;

  if (agent.status !== "running") return { take: false, reason: "agent not running" };
  if (edge.kind !== agent.edgeKind) return { take: false, reason: "edge kind ≠ paper" };
  if (edge.edgeMeasure < L.minConviction)
    return { take: false, reason: `below conviction floor (${(edge.edgeMeasure * 100).toFixed(1)}pp)` };

  // phase gate
  const inPlay = !!edge.market.inRunning;
  if (L.phase === "pre" && inPlay) return { take: false, reason: "pre-match only" };
  if (L.phase === "inplay" && !inPlay) return { take: false, reason: "in-play only" };
  if (inPlay && ctx.minute != null) {
    if (ctx.minute < L.minMinute || ctx.minute > L.maxMinute)
      return { take: false, reason: `minute ${ctx.minute} outside [${L.minMinute},${L.maxMinute}]` };
  }

  // market filter
  if (L.marketFilter.length && !L.marketFilter.includes(edge.market.superOddsType))
    return { take: false, reason: `market ${edge.market.superOddsType} filtered out` };

  // odds band
  const odds = 1 / edge.fairProb;
  if (odds < L.oddsMin || odds > L.oddsMax)
    return { take: false, reason: `odds ${odds.toFixed(2)} outside band` };

  // concurrency
  if (ctx.openCount >= L.maxConcurrent)
    return { take: false, reason: `max concurrent (${L.maxConcurrent}) reached` };

  // direction + sizing
  const direction = L.direction === "follow" ? edge.direction : flip(edge.direction);
  const stake =
    L.stakeMode === "kelly"
      ? kellyStake(agent.bankroll, edge.edgeMeasure, odds, L.kellyFraction)
      : agent.bankroll * L.stakePct;

  if (stake < 1) return { take: false, reason: "stake below $1" };

  return {
    take: true,
    reason: `take ${direction} ${edge.market.side} @ ${odds.toFixed(2)}`,
    side: edge.market.side,
    direction,
    stake: Math.round(stake * 100) / 100,
    entryProb: edge.fairProb,
    entryOdds: Math.round(odds * 1000) / 1000,
  };
}

// Closing-line value of a position in fake-USD. Odds-only, deterministic.
//   back: profit when the side shortens (prob rises)
//   lay:  profit when the side drifts (prob falls)
export function markPosition(pos: Position, currentProb: number): { clvReturn: number; pnl: number } {
  const raw =
    pos.direction === "back"
      ? (currentProb - pos.entryProb) / pos.entryProb
      : (pos.entryProb - currentProb) / pos.entryProb;
  const clvReturn = Math.max(-1, Math.min(2, raw)); // clamp to ±sane band
  return { clvReturn, pnl: Math.round(pos.stake * clvReturn * 100) / 100 };
}
