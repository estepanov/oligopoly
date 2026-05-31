const INTERNAL_ORIGIN = "https://oligopoly.internal";

/**
 * Path used for internal worker→Durable-Object fan-out POSTs. Exported so the
 * senders here and the DO's request matcher share one constant and can't drift
 * on a magic string.
 */
export const NOTIFY_PATH = "/notify";

/** True when an incoming request URL targets the internal notify path. Exact
 * match (senders always use exactly `/notify`) so a future nested route can't
 * accidentally be treated as a notify. */
export function isNotifyRequest(url: URL): boolean {
  return url.pathname === NOTIFY_PATH;
}

export async function broadcastGameEvent(
  gameRoom: DurableObjectNamespace | undefined,
  gameId: string,
  event: Record<string, unknown>,
): Promise<void> {
  if (!gameRoom) return;
  const stub = gameRoom.get(gameRoom.idFromName(gameId));
  await stub.fetch(
    new Request(
      `${INTERNAL_ORIGIN}${NOTIFY_PATH}?gameId=${encodeURIComponent(gameId)}`,
      {
        method: "POST",
        body: JSON.stringify(event),
        headers: { "Content-Type": "application/json" },
      },
    ),
  );
}

export async function broadcastLobbyEvent(
  lobbyRoom: DurableObjectNamespace | undefined,
  lobbyId: string,
  event: Record<string, unknown>,
): Promise<void> {
  if (!lobbyRoom) return;
  const stub = lobbyRoom.get(lobbyRoom.idFromName(lobbyId));
  await stub.fetch(
    new Request(
      `${INTERNAL_ORIGIN}${NOTIFY_PATH}?lobbyId=${encodeURIComponent(lobbyId)}`,
      {
        method: "POST",
        body: JSON.stringify(event),
        headers: { "Content-Type": "application/json" },
      },
    ),
  );
}
