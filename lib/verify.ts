// VERIFICATION CSV — the audit artifact TxLINE's team can reconcile against
// their own database.
//
// Every row is ONE real TxLINE demargined-odds frame that the engine ingested
// (from the bundled captures in replays.json), carrying the ORIGINAL upstream
// timestamp and prices — so their dev can look up (fixture_id, frame_ts_ms) in
// their DB and confirm our prices match theirs exactly. Frames that an agent
// actually traded on are tallied inline with the execution (agent, side, stake,
// CLV, P&L) and the trade's proof hash — so the same file proves BOTH "we
// ingested your real data" and "here is what the autonomous agents did with it."

import replaysData from "./replays.json";

interface ReplayRecord {
  FixtureId: string | number;
  Ts: number;
  Bookmaker?: string;
  SuperOddsType?: string;
  MarketParameters?: string | null;
  MarketPeriod?: string | null;
  InRunning?: boolean;
  PriceNames?: string[];
  Prices?: number[];
  [k: string]: unknown;
}
interface ReplayMatch {
  fid: string | number;
  p1: string;
  p2: string;
  odds: ReplayRecord[];
  scores: ReplayRecord[];
}
const REPLAYS = replaysData as unknown as ReplayMatch[];

// The enriched trade shape the runner snapshot emits (see runner.ts snapshot()).
export interface VerifyTrade {
  agent: string;
  source: string;
  kind: string;
  fixtureId: string | number;
  superOddsType: string;
  marketParameters: string;
  sideIndex: number;
  entryProb: number;
  side: string;
  direction: string;
  odds: number;
  stake: number;
  proofHash: string;
  status: string;
  clvReturn: number;
  pnl: number;
}

// Deterministic per-frame fingerprint (FNV-1a, 8 hex) — uniquely + reproducibly
// identifies a single captured frame.
function frameHash(fid: string | number, market: string, line: string, ts: number, prices: number[]): string {
  const s = `${fid}|${market}|${line}|${ts}|${prices.join(",")}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// Implied (no-vig) probability from a demargined integer price (= decimal×1000).
function impliedProb(price: number): number {
  return price > 0 ? 1000 / price : 0;
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLUMNS = [
  "fixture_id", "match", "frame_ts_ms", "frame_ts_utc", "bookmaker", "market", "line", "period",
  "in_running", "price_names", "prices", "fair_probs", "frame_hash",
  "traded", "agents_on_frame", "agent", "paper_source", "edge_kind", "bet_side", "bet_direction",
  "stake_usd", "entry_odds", "entry_fair_prob", "clv_return_pct", "pnl_usd", "status", "trade_proof_hash",
];

export interface CsvResult {
  csv: string;
  frameCount: number;
  tradedFrameCount: number;
  matchCount: number;
}

export function buildVerificationCsv(trades: VerifyTrade[]): CsvResult {
  // Index frames by market so each trade can be tied to the exact frame it fired
  // on (same fixture+market+line, with the side's fair prob closest to entry).
  interface FrameRow {
    fid: string | number;
    label: string;
    ts: number;
    bookmaker: string;
    market: string;
    line: string;
    period: string;
    inRunning: boolean;
    priceNames: string[];
    prices: number[];
    hash: string;
  }
  const frames: FrameRow[] = [];
  const byMarket = new Map<string, number[]>(); // key -> frame indices

  for (const m of REPLAYS) {
    const label = `${m.p1} v ${m.p2}`;
    for (const o of m.odds || []) {
      if (!Array.isArray(o.Prices) || !o.Prices.some((p) => Number(p) > 0)) continue;
      const market = o.SuperOddsType ?? "";
      const line = o.MarketParameters ?? "";
      const row: FrameRow = {
        fid: o.FixtureId,
        label,
        ts: Number(o.Ts),
        bookmaker: o.Bookmaker ?? "TXLineStablePriceDemargined",
        market,
        line: String(line),
        period: String(o.MarketPeriod ?? ""),
        inRunning: o.InRunning ?? true,
        priceNames: o.PriceNames ?? [],
        prices: o.Prices,
        hash: frameHash(o.FixtureId, market, String(line), Number(o.Ts), o.Prices),
      };
      const idx = frames.push(row) - 1;
      const key = `${row.fid}|${market}|${row.line}`;
      const arr = byMarket.get(key);
      if (arr) arr.push(idx);
      else byMarket.set(key, [idx]);
    }
  }

  // Attach each trade to its single best-matching frame.
  const tradesByFrame = new Map<number, VerifyTrade[]>();
  for (const t of trades) {
    const key = `${t.fixtureId}|${t.superOddsType}|${t.marketParameters}`;
    const candidates = byMarket.get(key);
    if (!candidates?.length) continue;
    let bestIdx = -1;
    let bestDiff = Infinity;
    for (const idx of candidates) {
      const f = frames[idx];
      const price = f.prices[t.sideIndex];
      if (price == null) continue;
      const diff = Math.abs(impliedProb(price) - t.entryProb);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = idx;
      }
    }
    if (bestIdx === -1) continue;
    const list = tradesByFrame.get(bestIdx);
    if (list) list.push(t);
    else tradesByFrame.set(bestIdx, [t]);
  }

  const lines: string[] = [COLUMNS.join(",")];
  let tradedFrameCount = 0;
  const matches = new Set<string>();

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    matches.add(String(f.fid));
    const fairProbs = f.prices.map((p) => impliedProb(p).toFixed(4)).join("|");
    const base = [
      f.fid,
      f.label,
      f.ts,
      new Date(f.ts).toISOString(),
      f.bookmaker,
      f.market,
      f.line,
      f.period,
      f.inRunning ? "true" : "false",
      f.priceNames.join("|"),
      f.prices.join("|"),
      fairProbs,
      f.hash,
    ];
    const onFrame = tradesByFrame.get(i);
    if (onFrame && onFrame.length) {
      tradedFrameCount++;
      const t = onFrame[0]; // first execution shown inline; count flags the rest
      lines.push(
        [
          ...base,
          "1",
          onFrame.length,
          t.agent,
          t.source,
          t.kind,
          t.side,
          t.direction,
          t.stake.toFixed(2),
          t.odds.toFixed(3),
          t.entryProb.toFixed(4),
          (t.clvReturn * 100).toFixed(2),
          t.pnl.toFixed(2),
          t.status,
          t.proofHash,
        ].map(csvCell).join(","),
      );
    } else {
      lines.push([...base, "0", "0", "", "", "", "", "", "", "", "", "", "", "", ""].map(csvCell).join(","));
    }
  }

  return {
    csv: lines.join("\n"),
    frameCount: frames.length,
    tradedFrameCount,
    matchCount: matches.size,
  };
}
