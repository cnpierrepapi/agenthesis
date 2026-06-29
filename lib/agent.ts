// AGENT — typed surface over the pure decision core (agent-core.mjs).
//
// The math lives in agent-core.mjs (plain JS, deterministic, unit-tested). This
// file holds the TypeScript shapes and thin typed wrappers so the runner and UI
// stay fully typed while the logic stays testable in isolation.

import type { Edge, EdgeDirection, EdgeMarketMeta, EdgeKind } from "./edge/types";
import type { AgentLevers } from "./papers";
import { decide as decideCore, markPosition as markCore } from "./agent-core.mjs";

export type AgentStatus = "running" | "paused" | "stopped";
export type PositionStatus = "open" | "settled";

export interface Position {
  id: string;
  agentId: string;
  edgeId: string;
  paperId: string;
  kind: EdgeKind;
  market: EdgeMarketMeta;
  matchLabel: string;
  side: string;
  direction: EdgeDirection;
  entryProb: number;
  entryOdds: number;
  stake: number;
  openedAt: number;
  holdUntil: number;
  markProb: number;
  clvReturn: number;
  pnl: number;
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
  bankroll: number;
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
  minute: number | null;
  openCount: number;
}

export function decide(agent: Agent, edge: Edge, ctx: DecideContext): Decision {
  return decideCore(agent, edge, ctx) as Decision;
}

export function markPosition(pos: Position, currentProb: number): { clvReturn: number; pnl: number } {
  return markCore(pos, currentProb) as { clvReturn: number; pnl: number };
}
