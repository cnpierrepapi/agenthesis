"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PAPERS, AGI_PER_PAPER, type Paper } from "@/lib/papers";
import { getAgi, getOwnedPapers, unlockPaper } from "@/lib/store";

export default function PaperLibrary() {
  const [agi, setAgi] = useState<number | null>(null);
  const [owned, setOwned] = useState<string[]>([]);
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    setAgi(getAgi());
    setOwned(getOwnedPapers());
  }, []);

  function unlock(p: Paper) {
    if (unlockPaper(p.id)) {
      setOwned(getOwnedPapers());
      setAgi(getAgi());
      window.dispatchEvent(new Event("agi:change"));
      setNote(null);
    } else {
      const short = AGI_PER_PAPER - (agi ?? 0);
      setNote({ id: p.id, text: `need ${short.toLocaleString()} more AGI` });
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">strategy menu</p>
          <h1 className="serif mt-1 text-3xl">Research Library</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Each paper is a runnable strategy. Two are free; the rest unlock with AGI
            ({AGI_PER_PAPER.toLocaleString()} AGI ≈ $3.50). AGI buys research — never bankroll, never prize odds.
          </p>
        </div>
        <div className="card flex items-center gap-2 px-3 py-2 text-sm">
          <span className="amber">◆</span>
          <span className="tabular-nums">{agi == null ? "—" : agi.toLocaleString()}</span>
          <span className="label">AGI</span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PAPERS.map((p) => {
          const isOwned = owned.includes(p.id);
          return (
            <article key={p.id} className="card flex flex-col p-5">
              <div className="flex items-center justify-between">
                <span className="label tabular-nums text-faint">{p.doi}</span>
                <span className="label rounded border border-ink-600 px-1.5 py-0.5">{p.edgeKind}</span>
              </div>

              <h2 className="serif mt-2 text-lg leading-snug text-paper">{p.title}</h2>
              <p className="mt-1 text-xs text-faint">
                {p.authors} · {p.year}
              </p>

              <p className="mt-3 flex-1 text-sm text-muted">{p.abstract}</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.tags.map((t) => (
                  <span key={t} className="text-xs text-faint">
                    #{t}
                  </span>
                ))}
              </div>

              <div className="mt-4 border-t border-ink-600 pt-3">
                {isOwned ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs gain">✓ Owned{p.free ? " · free" : ""}</span>
                    <Link href={`/build?paper=${p.id}`} className="prompt text-sm text-amber hover:text-fg">
                      Build agent
                    </Link>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    {note?.id === p.id && <span className="text-xs loss">{note.text}</span>}
                    <button
                      onClick={() => unlock(p)}
                      className="ml-auto rounded border border-amber-dim bg-amber/10 px-3 py-1.5 text-sm text-amber hover:bg-amber/20"
                    >
                      Unlock · {AGI_PER_PAPER.toLocaleString()} AGI
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
