// /api/verify-csv — download the verification CSV.
//
// One row per real ingested TxLINE frame (original timestamp + prices) with the
// agent execution tallied inline where a bet fired. TxLINE's team can reconcile
// (fixture_id, frame_ts_ms, prices) against their own database, and see exactly
// what the autonomous agents did on each frame.
import { getRunner } from "@/lib/runner";
import { buildVerificationCsv, type VerifyTrade } from "@/lib/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snap = getRunner().snapshot();
  const trades = (snap.trades as unknown as VerifyTrade[]) ?? [];
  const { csv, frameCount, tradedFrameCount, matchCount } = buildVerificationCsv(trades);

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agenthesis-txline-verification-${stamp}.csv"`,
      "Cache-Control": "no-store",
      "X-Frame-Count": String(frameCount),
      "X-Traded-Frames": String(tradedFrameCount),
      "X-Match-Count": String(matchCount),
    },
  });
}
