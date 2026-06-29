"use client";

import { useEffect, useState } from "react";

interface Activity {
  type: "trade" | "settle" | "matchEvent";
  ts: number;
  text: string;
  pnl?: number;
}

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}
function glyph(a: Activity): string {
  if (a.type === "trade") return "⚡";
  if (a.type === "matchEvent") return "⚽";
  return (a.pnl ?? 0) >= 0 ? "✓" : "✕";
}
function color(a: Activity): string {
  if (a.type === "trade") return "amber";
  if (a.type === "matchEvent") return "text-muted";
  return (a.pnl ?? 0) >= 0 ? "gain" : "loss";
}

export default function HeroTerminal() {
  const [feed, setFeed] = useState<Activity[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/feed");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("activity", (e) => {
      try {
        const a = JSON.parse((e as MessageEvent).data) as Activity;
        setFeed((prev) => [a, ...prev].slice(0, 7));
      } catch {
        /* ignore */
      }
    });
    return () => es.close();
  }, []);

  return (
    <div className="panel overflow-hidden">
      <header className="flex items-center justify-between border-b border-ink-600 px-4 py-2.5">
        <span className="label">desk.log</span>
        <span className="flex items-center gap-2 text-xs text-faint">
          <span className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-amber blink" : "bg-ink-500"}`} />
          {connected ? "LIVE" : "connecting"}
        </span>
      </header>
      <div className="min-h-[220px] px-4 py-3 font-mono text-xs">
        {feed.length === 0 && <p className="text-faint">booting autonomous runner…</p>}
        <ul className="space-y-1.5">
          {feed.map((a, i) => (
            <li key={`${a.ts}-${i}`} className="flex gap-2">
              <span className="shrink-0 text-faint tabular-nums">{clock(a.ts)}</span>
              <span className={`shrink-0 ${color(a)}`}>{glyph(a)}</span>
              <span className={a.type === "matchEvent" ? "text-muted" : "text-fg"}>{a.text}</span>
            </li>
          ))}
        </ul>
        <p className="prompt mt-2 text-faint">
          <span className="blink amber">_</span>
        </p>
      </div>
    </div>
  );
}
