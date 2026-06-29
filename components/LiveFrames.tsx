"use client";

// LIVE FRAMES — proves the DEPLOYED app sees real-time TxLINE data.
// Polls /api/live-frames (which snapshot-polls TxLINE server-side) every few
// seconds and shows the latest demargined book per live fixture, with each
// frame's age. Sub-10s ages ⇒ genuinely real-time, straight from TxLINE.

import { useEffect, useRef, useState } from "react";

interface Frame {
  market: string;
  line: string;
  period: string;
  priceNames: string[];
  prices: number[];
  fairProbs: number[];
  ts: number;
  ageSec: number;
}
interface Fixture {
  fid: number | string;
  label: string;
  latestAgeSec: number;
  frames: Frame[];
}
interface LiveData {
  configured: boolean;
  polledAt?: string;
  source?: string;
  liveCount?: number;
  totalFrames?: number;
  fixtures?: Fixture[];
  note?: string;
}

const POLL_MS = 4000;

export default function LiveFrames() {
  const [data, setData] = useState<LiveData | null>(null);
  const [polling, setPolling] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        setPolling(true);
        const res = await fetch("/api/live-frames", { cache: "no-store" });
        const j = (await res.json()) as LiveData;
        if (alive) setData(j);
      } catch {
        /* keep last */
      } finally {
        if (alive) setPolling(false);
      }
    };
    poll();
    timer.current = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const live = data?.fixtures ?? [];
  const hasLive = (data?.liveCount ?? 0) > 0;

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <p className="label">live TxLINE frames — real-time, polled by the deployed app</p>
        <span className="flex items-center gap-2 text-xs text-faint">
          <span className={`inline-block h-2 w-2 rounded-full ${hasLive ? "bg-amber blink" : polling ? "bg-amber/50" : "bg-ink-500"}`} />
          {hasLive ? "LIVE" : polling ? "polling" : "idle"}
        </span>
      </div>

      {data && !data.configured ? (
        <p className="card px-4 py-3 text-sm text-faint">Live frames unavailable — no TxLINE token configured in this environment.</p>
      ) : !hasLive ? (
        <p className="card px-4 py-3 text-sm text-faint">
          {data?.note ?? "Checking for live matches…"}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {live.map((f) => (
            <div key={f.fid} className="panel p-4">
              <div className="flex items-center justify-between">
                <p className="serif text-paper">{f.label}</p>
                <span className={`text-xs tabular-nums ${f.latestAgeSec < 10 ? "gain" : "text-faint"}`}>
                  {f.latestAgeSec < 10 ? "● " : ""}freshest {f.latestAgeSec}s ago
                </span>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-xs">
                  <thead className="text-faint">
                    <tr>
                      <th className="py-1 pr-2 font-normal">market</th>
                      <th className="py-1 pr-2 font-normal">prices (no-vig)</th>
                      <th className="py-1 pr-2 text-right font-normal">age</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {f.frames.map((fr, i) => (
                      <tr key={i} className="border-t border-ink-700">
                        <td className="py-1 pr-2 text-muted">
                          {fr.market}
                          {fr.line ? <span className="text-faint"> {fr.line}</span> : null}
                        </td>
                        <td className="py-1 pr-2 text-fg">
                          {fr.priceNames.map((n, j) => (
                            <span key={j} className="mr-2 whitespace-nowrap">
                              <span className="text-faint">{n}</span> {fr.fairProbs[j]?.toFixed(3)}
                            </span>
                          ))}
                        </td>
                        <td className={`py-1 pr-2 text-right tabular-nums ${fr.ageSec < 10 ? "gain" : "text-faint"}`}>
                          {fr.ageSec}s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-2 text-xs text-faint">
        Frames are fetched live from TxLINE by the deployed server (snapshot polling — Vercel buffers SSE, so we poll the
        odds snapshot instead). The token stays server-side. Ages near zero confirm this is real-time, not a replay.
        {data?.source ? <span className="text-ink-500"> · source {data.source}</span> : null}
      </p>
    </section>
  );
}
