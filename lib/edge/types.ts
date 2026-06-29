// Shared types for the edge engine (the runtime lives in engine.mjs, which is
// imported untyped via allowJs; these interfaces describe the shapes it emits).

export type EdgeKind = "steam" | "overreaction";
export type EdgeDirection = "back" | "lay";
export type Conviction = "High" | "Medium" | "Low";
export type EdgeStatus = "open" | "expired" | "filled";

export interface EdgeMarketMeta {
  fixtureId: string | number;
  superOddsType: string;
  marketParameters: string;
  marketPeriod: string;
  side: string;
  sideIndex: number;
  inRunning?: boolean;
}

export interface Edge {
  id: string;
  kind: EdgeKind;
  market: EdgeMarketMeta;
  conviction: Conviction;
  openedAt: number;
  expiresAt: number;
  fillLimit: number;
  filled: number;
  status: EdgeStatus;
  edgeMeasure: number;
  fairProb: number;
  direction: EdgeDirection;
  note: string;
  trigger?: string;
}

export interface MatchEvent {
  fixtureId: string | number;
  label: string;
  stat: string;
  participant: string;
  clock?: unknown;
  ts: number;
}
