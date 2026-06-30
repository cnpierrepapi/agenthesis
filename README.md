# Agenthesis

**Strategies from research. Agents that trade them.**

Agenthesis lets you spawn **autonomous betting agents whose strategy _is_ a
research paper**. Each agent ingests the live TxLINE World Cup data feed,
detects market inefficiencies from the academic literature, and trades fake-USD
**with no human in the loop**. Every agent starts from the same float; the only
thing you buy is _more research_.

Built for the TxLINE / TxODDS World Cup hackathon (Solana) — Track C,
Autonomous Agents.

## How it works

1. **The feed** (`lib/feed.ts`) holds one upstream connection to the TxLINE
   odds + scores SSE streams and pushes every record into the edge engine. A
   deterministic `synth` source stands in when no match is live (so the desk is
   always demoable).
2. **The edge engine** (`lib/edge/engine.mjs`) turns the demargined fair-price
   book into **edges** — short-lived, scarce signals grounded in the literature:
   - `steam` — a sharp move in the no-vig fair probability (sharp money). Back it.
   - `overreaction` — the line overshoots right after a goal / red card. Fade it.
3. **Papers** (`lib/papers.ts`) are the strategy menu. A paper maps one edge
   kind to a calibrated set of levers. Two papers are free; the rest unlock with
   **AGI** (1000 AGI ≈ $3.50), a non-redeemable in-app token that buys
   information only — never bankroll or prize odds.
4. **Agents** (`lib/agent.ts`) run an always-on base tuning **plus any number of
   attached papers**. When an edge fires, the first strategy that greenlights it
   decides whether to take it, which side, and how much to stake.
5. **The runner** (`lib/runner.ts`) is the autonomous loop: it acts on every
   edge, opens positions, and settles them on **closing-line value** — an
   odds-only, deterministic P&L that needs no match outcome.

Daily, USDC + AGI is distributed to every agent that competed, weighted by P&L.

## Highlights

- **CLV settlement is the moat.** Skill is graded on every decision from odds
  alone (no match outcome), so the signal isn't buried under win/loss variance.
- **Verifiable provenance.** Every trade and every published edge carries a
  `proofHash` tying it to the exact real TxLINE frame, reconcilable via
  `/api/verify-csv` against the provider's own data. On-chain proof of access is
  a real Solana subscribe transaction (surfaced on `/proof`).
- **Two integration surfaces on one pure core.** A trading desk embeds the
  **SDK** (`agenthesis/sdk` — `EdgeEngine` + decision core + CLV scoring, pure &
  deterministic, 26 unit tests); a market operator consumes the **Operator API**
  (`GET /api/v1/edges`, authed, + a documented webhook contract). See `/sdk`.
- **Self-contained & reproducible.** Real captured matches are bundled, so the
  desk, the proof ledger, and the operator API all run with no live dependency.

## Settlement

P&L is **CLV (beat-the-close)**: an agent enters at the edge's fair probability
and is marked against the market's later fair probability. A `back` wins when its
side shortens; a `lay` wins when it drifts. This is reproducible from a recorded
feed — the basis of a deterministic demo.

## Our endpoints

- `GET /api/agents` — runner + agent state, and the paper catalog.
- `POST /api/agents` — `{action:"create",name,paperIds?,baseLevers?}` or
  `{action:"control",id,op:"pause|resume|stop"}`.
- `GET /api/feed` — SSE: live autonomous activity (trades, settlements, match
  events) + periodic state snapshots.
- `GET /api/v1/edges` — **Operator API** (authed): typed, scored edges per
  fixture, each with a `proofHash`. Filters: `fixtureId`, `kind`, `conviction`,
  `limit`. Demo key `ag_demo_2026`.
- `GET /api/live-frames` — real-time TxLINE frames (polled snapshot) for the
  production app.
- `GET /api/verify-csv` — per-frame verification CSV: every ingested TxLINE
  frame + the agent executions on it, for reconciliation against the provider.

## TxLINE endpoints used

Access uses a server-held token (guest JWT + an on-chain Solana **subscribe**
transaction → `apiToken`), sent as `Authorization: Bearer <jwt>` +
`X-Api-Token: <token>`. The subscribe tx is our on-chain proof of access (`/proof`).

- `GET /api/fixtures/snapshot` — live fixtures, team names, kickoff times
  (live-match discovery).
- `GET /api/odds/stream` — live **de-margined (no-vig)** odds (SSE) — the core
  signal input.
- `GET /api/scores/stream` — live scores + match events (goals / red cards, SSE).
- `GET /api/odds/snapshot/{fixtureId}` — current de-margined book, **polled** for
  the real-time frames panel (serverless can't hold an SSE open).
- `GET /api/scores/updates/{fixtureId}` — full kickoff-to-FT score sequence, used
  to capture matches for the bundled replays.

> Odds history is gated (`/api/odds/updates` is empty on the free tier), so the
> de-margined book is captured live off `/api/odds/stream`.

## Configuration

| Env | Purpose |
| --- | --- |
| `FEED_MODE` | `replay` (bundled real captures, default), `live` (TxLINE streams), or `synth` (deterministic stand-in). |
| `TXLINE_API_BASE` / `TXLINE_JWT` / `TXLINE_API_TOKEN` | Server-held TxLINE token (guest JWT + on-chain subscribe). |
| `TXLINE_SIGNUP_TX` / `TXLINE_CLUSTER` | Solana subscribe tx + cluster — the on-chain proof of access shown on `/proof`. |
| `OPERATOR_API_KEYS` | Comma-separated keys for the Operator API (`/api/v1/edges`); the demo key always works. |
| `REPLAY_SPEED` | Match-seconds per wall-second for replay mode (default 30). |

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

## License

AGPL-3.0.
