import type {
  InternalGameState,
  InternalPlayerState,
} from "./gameStateTypes.js";

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export function getPlayer(
  state: InternalGameState,
  playerId: string,
): InternalPlayerState | undefined {
  return state.players.find((player) => player.playerId === playerId);
}

type TransferTileOwnershipOptions = {
  clearMortgage?: boolean;
};

export function transferTileOwnership(
  state: InternalGameState,
  fromPlayerId: string | null,
  toPlayerId: string,
  tilePosition: number | string,
  options: TransferTileOwnershipOptions = {},
): boolean {
  const recipient = getPlayer(state, toPlayerId);
  if (!recipient) {
    return false;
  }

  const donor = fromPlayerId ? getPlayer(state, fromPlayerId) : undefined;
  const tileState = state.tiles.find(
    (entry) => String(entry.position) === String(tilePosition),
  );
  if (!tileState) {
    return false;
  }

  if (donor) {
    donor.ownedTilePositions = donor.ownedTilePositions.filter(
      (pos) => String(pos) !== String(tilePosition),
    );
    donor.mortgagedTilePositions = donor.mortgagedTilePositions.filter(
      (pos) => String(pos) !== String(tilePosition),
    );
  }

  if (
    !recipient.ownedTilePositions.some(
      (pos) => String(pos) === String(tilePosition),
    )
  ) {
    recipient.ownedTilePositions.push(tilePosition);
  }

  tileState.ownerId = toPlayerId;
  if (options.clearMortgage) {
    tileState.mortgaged = false;
    tileState.mortgageRate = null;
  }

  if (tileState.mortgaged) {
    if (
      !recipient.mortgagedTilePositions.some(
        (pos) => String(pos) === String(tilePosition),
      )
    ) {
      recipient.mortgagedTilePositions.push(tilePosition);
    }
  } else {
    recipient.mortgagedTilePositions = recipient.mortgagedTilePositions.filter(
      (pos) => String(pos) !== String(tilePosition),
    );
  }

  return true;
}

export { getPlayer as getPlayerFromState };
