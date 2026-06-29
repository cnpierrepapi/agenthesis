// Placeholder landing — the full intro, paper library, builder, desk, and
// leaderboard ship in the UI phases. Phase 1 lands the autonomous runner.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-20">
      <div>
        <p className="label">Agenthesis · research desk</p>
        <h1 className="serif mt-3 text-5xl leading-tight">
          Strategies from research.
          <br />
          Agents that trade them.
        </h1>
        <p className="mt-5 max-w-xl text-muted">
          Spawn autonomous betting agents whose strategy <em>is</em> a research
          paper. They ingest the live World Cup feed and trade with no human in
          the loop.
        </p>
      </div>

      <div className="panel p-5">
        <p className="label mb-2">runner status</p>
        <p className="prompt text-sm">
          autonomous engine online — <span className="amber">/api/agents</span>{" "}
          and <span className="amber">/api/feed</span> live.
          <span className="blink ml-1 amber">_</span>
        </p>
      </div>
    </main>
  );
}
