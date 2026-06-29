// Lightweight TxLINE SSE reader (no Anchor / no keypair in the app).
// The apiToken is minted offline and supplied via env, exactly like the
// production token-cache flow. Follows the real SSE spec + docs.yaml shape:
// data messages carry id="ts:index" + JSON; heartbeats carry event:"heartbeat".

export interface SseEvent {
  event: string;
  id: string | null;
  data: string;
  json?: unknown;
}

export interface StreamCreds {
  apiBase: string;
  jwt: string;
  apiToken: string;
}

export function txlineCreds(): StreamCreds | null {
  const apiBase = process.env.TXLINE_API_BASE;
  const jwt = process.env.TXLINE_JWT;
  const apiToken = process.env.TXLINE_API_TOKEN;
  if (!apiBase || !jwt || !apiToken) return null;
  return { apiBase, jwt, apiToken };
}

function parseSseEvent(raw: string): SseEvent | null {
  const out: SseEvent = { event: "message", id: null, data: "" };
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const i = line.indexOf(":");
    const field = i === -1 ? line : line.slice(0, i);
    let val = i === -1 ? "" : line.slice(i + 1);
    if (val.startsWith(" ")) val = val.slice(1);
    if (field === "data") out.data += (out.data ? "\n" : "") + val;
    else if (field === "event") out.event = val;
    else if (field === "id") out.id = val;
  }
  if (!out.data) return null;
  try {
    out.json = JSON.parse(out.data);
  } catch {
    /* leave as raw string */
  }
  return out;
}

export async function openStream(
  path: string,
  creds: StreamCreds,
  onEvent: (ev: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${creds.apiBase}${path}`, {
    headers: {
      Authorization: `Bearer ${creds.jwt}`,
      "X-Api-Token": creds.apiToken,
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`stream ${path} ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const rawEvent = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const ev = parseSseEvent(rawEvent);
        if (ev) onEvent(ev);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
