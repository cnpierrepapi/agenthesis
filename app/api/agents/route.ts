// /api/agents — read agent/runner state; create or control agents.
import { NextResponse } from "next/server";
import { getRunner } from "@/lib/runner";
import { PAPERS } from "@/lib/papers";

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
    const paperId = String(body.paperId || "");
    if (!name || !paperId) return NextResponse.json({ error: "name and paperId required" }, { status: 400 });
    const agent = runner.createAgent(name, paperId, (body.levers as Record<string, never>) || {});
    if (!agent) return NextResponse.json({ error: "unknown paper" }, { status: 400 });
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
