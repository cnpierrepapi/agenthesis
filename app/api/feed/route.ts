// /api/feed — Server-Sent Events: live autonomous activity + periodic snapshots.
// The browser only observes; it can't influence the runner.
import { getRunner, type RunnerActivity } from "@/lib/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const runner = getRunner();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("snapshot", runner.snapshot());

      const onActivity = (a: RunnerActivity) => send("activity", a);
      runner.on("activity", onActivity);

      const snap = setInterval(() => send("snapshot", runner.snapshot()), 3000);
      const beat = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 15000);

      const cleanup = () => {
        clearInterval(snap);
        clearInterval(beat);
        runner.off("activity", onActivity);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
