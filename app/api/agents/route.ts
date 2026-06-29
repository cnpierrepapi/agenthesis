// /api/agents — read agent/runner state; create or control agents.
import { NextResponse } from "next/server";
import { getRunner } from "@/lib/runner";
import { PAPERS, DEFAULT_BASE_LEVERS, type AgentLevers } from "@/lib/papers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const runner = getRunner();
  return NextResponse.json({
    ...runner.snapshot(),
    papers: PAPERS.map((p) => ({ id: p.id, title: p.title, free: p.free, edgeKind: p.edgeKind })),
  });
}

export async function POST(req: Request) {
  const runner = getRunner();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (body.action === "create") {
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    // Accept the new multi-paper shape, and stay back-compatible with a single paperId.
    const rawPapers = Array.isArray(body.paperIds)
      ? (body.paperIds as unknown[]).map(String)
      : body.paperId
        ? [String(body.paperId)]
        : [];
    const baseLevers = (body.baseLevers as AgentLevers) || (body.levers as AgentLevers) || DEFAULT_BASE_LEVERS;
    const agent = runner.createAgent(name, { paperIds: rawPapers, baseLevers });
    if (!agent) return NextResponse.json({ error: "agent must trade at least one signal" }, { status: 400 });
    return NextResponse.json({ ok: true, agent });
  }

  if (body.action === "control") {
    const id = String(body.id || "");
    const op = String(body.op || "");
    if (!["pause", "resume", "stop"].includes(op))
      return NextResponse.json({ error: "op must be pause|resume|stop" }, { status: 400 });
    const ok = runner.control(id, op as "pause" | "resume" | "stop");
    return NextResponse.json({ ok });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
