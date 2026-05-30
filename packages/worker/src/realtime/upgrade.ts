import type { Context } from "hono";

type UpgradeOptions = {
  room?: DurableObjectNamespace;
  roomId: string;
  roomParam: string;
  roomParamValue: string;
  fallbackEvent: Record<string, unknown>;
  extraSearchParams?: Record<string, string>;
};

export function upgradeWebSocket(
  c: Context,
  options: UpgradeOptions,
): Response | Promise<Response> {
  if (c.req.header("Upgrade") !== "websocket") {
    return c.json({ error: "Expected WebSocket upgrade" }, 426);
  }

  const {
    room,
    roomId,
    roomParam,
    roomParamValue,
    fallbackEvent,
    extraSearchParams,
  } = options;

  if (!room) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    server.send(
      JSON.stringify({
        sentAt: Date.now(),
        ...fallbackEvent,
      }),
    );
    return new Response(null, { status: 101, webSocket: client });
  }

  const objectId = room.idFromName(roomId);
  const stub = room.get(objectId);
  const url = new URL(c.req.url);
  url.searchParams.set(roomParam, roomParamValue);
  url.searchParams.delete("access_token");
  if (extraSearchParams) {
    for (const [key, value] of Object.entries(extraSearchParams)) {
      url.searchParams.set(key, value);
    }
  }
  return stub.fetch(url, c.req.raw);
}
