// /api/v1/signals — the headline MARKET-OPERATOR endpoint (scored mispricing
// signals per fixture). This is the same authenticated, versioned poll contract
// as /api/v1/edges, which is retained as a back-compat alias so any consumer
// already pointing at /edges keeps working unchanged. New integrations should
// target /signals; both return the identical payload.
import { GET as edgesGET } from "../edges/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return edgesGET(req);
}
