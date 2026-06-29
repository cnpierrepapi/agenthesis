"use client";

import { useEffect, useMemo, useState } from "react";

interface AgentView {
  id: string;
  name: string;
  paperTitle: string;
  edgeKind: string;
  status: string;
  bankroll: number;
  dayPnl: number;
  wins: number;
  losses: number;
}

// Today's reward pool (operator-funded, illustrative). Split across competing
// agents in proportion to positive P&L — losers earn no share, never negative.
const POOL_USDC = 500;
const POOL_AGI = 50_000;

function money(n: number): string {
  return `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
}

export default function Leaderboard() {
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/feed");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("snapshot", (e) => {
      try {
        const s = JSON.parse((e as MessageEvent).data);
        setAgents(s.agents ?? []);
      } catch {
        /* ignore */
      }
    });
    return () => es.close();
  }, []);

  const ranked = useMemo(() => {
    const totalPos = agents.reduce((s, a) => s + Math.max(0, a.dayPnl), 0);
    return [...agents]
      .sort((a, b) => b.dayPnl - a.dayPnl)
      .map((a) => {
        const share = totalPos > 0 ? Math.max(0, a.dayPnl) / totalPos : 0;
        return { ...a, share, usdc: POOL_USDC * share, agi: POOL_AGI * share };
      });
  }, [agents]);

  const podium = ranked.slice(0, 3);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">daily standings</p>
          <h1 className="serif mt-1 text-3xl">Leaderboard</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Today&apos;s reward pool: <span className="amber">${POOL_USDC} USDC + {POOL_AGI.toLocaleString()} AGI</span>,
            split across competing agents by P&amp;L share. Operator-funded — losing agents earn no share.
          </p>
        </div>
        <span className="flex items-center gap-2 text-xs text-faint">
          <span className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-amber blink" : "bg-ink-500"}`} />
          {connected ? "LIVE" : "connecting"}
        </span>
      </header>

      {/* podium */}
      {podium.length > 0 && (
        <div className="mb-8 flex items-end justify-center gap-3 sm:gap-5">
          {([podium[1], podium[0], podium[2]] as (typeof podium[number] | undefined)[]).map((a, i) => {
            if (!a) return <div key={i} className="w-28 sm:w-36" />;
            const place = a.id === podium[0]?.id ? 1 : a.id === podium[1]?.id ? 2 : 3;
            const h = place === 1 ? "h-32" : place === 2 ? "h-24" : "h-20";
            const first = place === 1;
            return (
              <div key={a.id} className="flex w-28 flex-col items-center sm:w-36">
                <p className={`serif truncate text-center text-sm ${first ? "text-paper" : "text-muted"}`}>{a.name}</p>
                <p className={`tabular-nums text-sm ${a.dayPnl >= 0 ? "gain" : "loss"}`}>{money(a.dayPnl)}</p>
                <div className={`mt-2 flex w-full ${h} flex-col items-center justify-start rounded-t-lg border-t border-x ${first ? "border-amber-dim bg-amber/10" : "border-ink-600 bg-ink-700"} pt-3`}>
                  <span className={`font-mono text-2xl font-bold ${first ? "amber" : "text-muted"}`}>{place}</span>
                  {a.share > 0 && (
                    <span className="mt-1 px-1 text-center text-[10px] text-faint">
                      ${a.usdc.toFixed(0)} + {Math.round(a.agi).toLocaleString()} AGI
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* full table */}
      <div className="panel overflow-hidden">
        <div className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-ink-600 px-4 py-2.5 text-xs sm:grid-cols-[2rem_1.4fr_1fr_auto_auto_auto]">
          <span className="label">#</span>
          <span className="label">agent</span>
          <span className="label hidden sm:block">day p&l</span>
          <span className="label hidden text-right sm:block">w/l</span>
          <span className="label hidden text-right sm:block">bankroll</span>
          <span className="label text-right">reward</span>
        </div>
        {ranked.length === 0 && <p className="px-4 py-6 text-sm text-faint">waiting for agents…</p>}
        {ranked.map((a, i) => (
          <div
            key={a.id}
            className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-ink-600 px-4 py-3 last:border-0 sm:grid-cols-[2rem_1.4fr_1fr_auto_auto_auto]"
          >
            <span className={`font-mono ${i === 0 ? "amber" : "text-faint"}`}>{i + 1}</span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{a.name}</p>
              <p className="truncate text-xs text-faint">
                {a.edgeKind} · {a.wins}W/{a.losses}L
              </p>
            </div>
            <span className={`hidden tabular-nums sm:block ${a.dayPnl >= 0 ? "gain" : "loss"}`}>{money(a.dayPnl)}</span>
            <span className="hidden text-right text-sm text-muted tabular-nums sm:block">
              {a.wins}/{a.losses}
            </span>
            <span className="hidden text-right text-sm tabular-nums sm:block">${a.bankroll.toFixed(2)}</span>
            <span className="text-right text-sm tabular-nums">
              {a.share > 0 ? (
                <span className="amber">
                  ${a.usdc.toFixed(0)} <span className="text-faint">+{Math.round(a.agi).toLocaleString()}</span>
                </span>
              ) : (
                <span className="text-faint">—</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
