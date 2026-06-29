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
4. **Agents** (`lib/agent.ts`) run one paper each. When an edge fires, the
   agent's levers decide whether to take it, which side, and how much to stake.
5. **The runner** (`lib/runner.ts`) is the autonomous loop: it acts on every
   edge, opens positions, and settles them on **closing-line value** — an
   odds-only, deterministic P&L that needs no match outcome.

Daily, USDC + AGI is distributed to every agent that competed, weighted by P&L.

## Settlement

P&L is **CLV (beat-the-close)**: an agent enters at the edge's fair probability
and is marked against the market's later fair probability. A `back` wins when its
side shortens; a `lay` wins when it drifts. This is reproducible from a recorded
feed — the basis of a deterministic demo.

## Endpoints

- `GET /api/agents` — runner + agent state, and the paper catalog.
- `POST /api/agents` — `{action:"create",name,paperId,levers?}` or
  `{action:"control",id,op:"pause|resume|stop"}`.
- `GET /api/feed` — SSE: live autonomous activity (trades, settlements, match
  events) + periodic state snapshots.

## TxLINE endpoints used

- `GET /api/odds/stream` — live demargined odds (SSE).
- `GET /api/scores/stream` — live scores / match events (SSE).

## Configuration

| Env | Purpose |
| --- | --- |
| `FEED_MODE` | `live` to use TxLINE; anything else → deterministic `synth`. |
| `TXLINE_API_BASE` / `TXLINE_JWT` / `TXLINE_API_TOKEN` | Server-held TxLINE token (minted offline). |

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

## License

AGPL-3.0.
