import type { AiPersonality } from "@oligopoly/validation";
import { kickPlayerToAiReplacement } from "./gameAi.js";

export async function kickInGamePlayerToAi(
  db: D1Database,
  lobbyId: string,
  humanId: string,
  gameRoom?: DurableObjectNamespace,
  personality: AiPersonality = "opportunist",
): Promise<boolean> {
  const activeGame = await db
    .prepare(
      "SELECT id FROM games WHERE lobby_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1",
    )
    .bind(lobbyId)
    .first<{ id: string }>();

  if (!activeGame) return false;

  await kickPlayerToAiReplacement(
    db,
    activeGame.id,
    humanId,
    gameRoom,
    personality,
  );
  return true;
}
