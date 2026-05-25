const INTERNAL_ORIGIN = "https://oligopoly.internal";

export async function broadcastGameEvent(
  gameRoom: DurableObjectNamespace | undefined,
  gameId: string,
  event: Record<string, unknown>,
): Promise<void> {
  if (!gameRoom) return;
  const stub = gameRoom.get(gameRoom.idFromName(gameId));
  await stub.fetch(
    new Request(
      `${INTERNAL_ORIGIN}/notify?gameId=${encodeURIComponent(gameId)}`,
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
      `${INTERNAL_ORIGIN}/notify?lobbyId=${encodeURIComponent(lobbyId)}`,
      {
        method: "POST",
        body: JSON.stringify(event),
        headers: { "Content-Type": "application/json" },
      },
    ),
  );
}
