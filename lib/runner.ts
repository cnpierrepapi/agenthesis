// AGENT RUNNER — the autonomous loop (Track C's "no human in the loop").
//
// On every engine edge, each running agent's policy decides independently and,
// if it takes the edge, the runner stakes fake-USD and opens a position. A mark
// loop revalues open positions on closing-line value and settles them after a
// hold horizon. Nothing here waits on a human; the UI only observes.

import { EventEmitter } from "node:events";
import { getFeed, type FeedHandle } from "./feed";
import { decide, markPosition, type Agent, type Position } from "./agent";
import { getPaper, type AgentLevers } from "./papers";
import type { Edge } from "./edge/types";

const START_BANKROLL = 350; // universal — every agent starts equal
const HOLD_MS_SYNTH = 12_000;
const HOLD_MS_LIVE = 90_000;
const MARK_MS = 2_500;

export interface RunnerActivity {
  type: "trade" | "settle" | "matchEvent";
  ts: number;
  agentId?: string;
  agentName?: string;
  text: string;
  pnl?: number;
}

class AgentRunner extends EventEmitter {
  agents = new Map<string, Agent>();
  private feed: FeedHandle;
  private holdMs: number;
  private seq = 0;

  constructor() {
    super();
    this.feed = getFeed();
    this.holdMs = this.feed.mode === "synth" ? HOLD_MS_SYNTH : HOLD_MS_LIVE;

    this.feed.engine.on("edge", (e) => this.onEdge(e));
    this.feed.engine.on("matchEvent", (m) =>
      this.push({ type: "matchEvent", ts: Date.now(), text: `${this.label(m.fixtureId)} — ${m.label}` }),
    );

    const t = setInterval(() => this.markAll(), MARK_MS);
    t.unref?.();

    this.seedDemoAgents();
  }

  private label(fixtureId: string | number): string {
    return this.feed.labels.get(String(fixtureId)) || `#${fixtureId}`;
  }

  private push(a: RunnerActivity) {
    this.emit("activity", a);
  }

  // ---- agent lifecycle --------------------------------------------------
  createAgent(name: string, paperId: string, leverOverrides: Partial<AgentLevers> = {}): Agent | null {
    const paper = getPaper(paperId);
    if (!paper) return null;
    const id = `agent_${++this.seq}`;
    const agent: Agent = {
      id,
      name,
      paperId,
      paperTitle: paper.title,
      edgeKind: paper.edgeKind,
      levers: { ...paper.levers, ...leverOverrides },
      status: "running",
      startBankroll: START_BANKROLL,
      bankroll: START_BANKROLL,
      dayPnl: 0,
      bets: 0,
      wins: 0,
      losses: 0,
      positions: [],
      createdAt: Date.now(),
    };
    this.agents.set(id, agent);
    return agent;
  }

  control(id: string, action: "pause" | "resume" | "stop"): boolean {
    const a = this.agents.get(id);
    if (!a) return false;
    a.status = action === "pause" ? "paused" : action === "resume" ? "running" : "stopped";
    return true;
  }

  // ---- the autonomous decision on each edge -----------------------------
  private onEdge(edge: Edge) {
    for (const agent of this.agents.values()) {
      if (agent.status !== "running") continue;
      const openCount = agent.positions.filter((p) => p.status === "open").length;
      const minute = this.feed.engine.matchMinute(edge.market.fixtureId);
      const d = decide(agent, edge, { minute, openCount });
      if (!d.take || d.stake == null) continue;

      const res = this.feed.engine.stake(edge.id, d.stake);
      if (!res.ok || !res.accepted) continue;

      const now = Date.now();
      const pos: Position = {
        id: `pos_${++this.seq}`,
        agentId: agent.id,
        edgeId: edge.id,
        paperId: agent.paperId,
        kind: edge.kind,
        market: edge.market,
        matchLabel: `${this.label(edge.market.fixtureId)} · ${edge.market.superOddsType} ${edge.market.marketParameters}`,
        side: d.side!,
        direction: d.direction!,
        entryProb: d.entryProb!,
        entryOdds: d.entryOdds!,
        stake: res.accepted,
        openedAt: now,
        holdUntil: now + this.holdMs,
        markProb: d.entryProb!,
        clvReturn: 0,
        pnl: 0,
        status: "open",
      };
      agent.positions.push(pos);
      agent.bets += 1;
      this.push({
        type: "trade",
        ts: now,
        agentId: agent.id,
        agentName: agent.name,
        text: `${agent.name} → ${pos.direction.toUpperCase()} ${pos.side} @ ${pos.entryOdds.toFixed(2)} on ${pos.matchLabel} ($${pos.stake.toFixed(0)}, ${edge.conviction})`,
      });
    }
  }

  // ---- mark + settle ----------------------------------------------------
  private markAll() {
    const now = Date.now();
    for (const agent of this.agents.values()) {
      for (const pos of agent.positions) {
        if (pos.status !== "open") continue;
        const cur = this.feed.engine.fairProbForMarket(pos.market) ?? pos.markProb;
        const { clvReturn, pnl } = markPosition(pos, cur);
        pos.markProb = cur;
        pos.clvReturn = clvReturn;
        pos.pnl = pnl;
        if (now >= pos.holdUntil) {
          pos.status = "settled";
          agent.bankroll = Math.round((agent.bankroll + pnl) * 100) / 100;
          agent.dayPnl = Math.round((agent.dayPnl + pnl) * 100) / 100;
          if (pnl >= 0) agent.wins += 1;
          else agent.losses += 1;
          this.push({
            type: "settle",
            ts: now,
            agentId: agent.id,
            agentName: agent.name,
            pnl,
            text: `${agent.name} settled ${pos.side} ${pos.direction} — CLV ${(clvReturn * 100).toFixed(1)}% → ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`,
          });
        }
      }
    }
  }

  // ---- demo agents so the desk shows autonomous trading immediately -----
  private seedDemoAgents() {
    if (this.agents.size) return;
    this.createAgent("The Closer", "steam-base");
    this.createAgent("Mean Reverter", "overreaction-base");
    this.createAgent("The Cynic", "overreaction-redcard");
  }

  // ---- serializable state for the API -----------------------------------
  snapshot() {
    return {
      mode: this.feed.mode,
      status: this.feed.status,
      agents: [...this.agents.values()].map((a) => ({
        ...a,
        openPositions: a.positions.filter((p) => p.status === "open").length,
        unrealized:
          Math.round(
            a.positions.filter((p) => p.status === "open").reduce((s, p) => s + p.pnl, 0) * 100,
          ) / 100,
      })),
    };
  }
}

const KEY = "__agenthesis_runner__";

export function getRunner(): AgentRunner {
  const g = globalThis as unknown as Record<string, AgentRunner | undefined>;
  if (!g[KEY]) g[KEY] = new AgentRunner();
  return g[KEY]!;
}

export type { AgentRunner };
