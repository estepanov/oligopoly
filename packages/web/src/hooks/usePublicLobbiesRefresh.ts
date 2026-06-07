import { type SetStateAction, useCallback, useEffect, useRef } from "react";
import { ApiError } from "../api/http";
import { listPublicLobbies } from "../api/lobbies";

export type PublicLobbyList = Awaited<
  ReturnType<typeof listPublicLobbies>
>["lobbies"];

/** Stable `errorCode` for banner messages — avoids coupling clear logic to copy. */
export const LOBBY_BANNER_ERROR_CODES = {
  PUBLIC_LOBBIES_FETCH_FAILED: "public_lobbies_fetch_failed",
} as const;

export type LobbyBannerMessage =
  | { kind: "ok"; text: string }
  | {
      kind: "error";
      text: string;
      errorCode?: (typeof LOBBY_BANNER_ERROR_CODES)[keyof typeof LOBBY_BANNER_ERROR_CODES];
    }
  | null;

function clearPublicLobbiesLoadError(
  prev: LobbyBannerMessage,
): LobbyBannerMessage {
  if (
    prev?.kind === "error" &&
    prev.errorCode === LOBBY_BANNER_ERROR_CODES.PUBLIC_LOBBIES_FETCH_FAILED
  ) {
    return null;
  }
  return prev;
}

/**
 * Public lobby list fetch with generation guard so in-flight responses are
 * ignored after unmount or React 18 Strict Mode remount (unlike a plain
 * mounted boolean that flips true again before the first fetch settles).
 */
export function usePublicLobbiesRefresh(
  setLoadingPublicLobbies: (value: boolean) => void,
  setPublicLobbies: (lobbies: PublicLobbyList) => void,
  setMessage: (value: SetStateAction<LobbyBannerMessage>) => void,
) {
  const fetchGeneration = useRef(0);

  useEffect(() => {
    return () => {
      fetchGeneration.current += 1;
    };
  }, []);

  const refreshPublicLobbies = useCallback(async () => {
    const startedAt = fetchGeneration.current;
    setLoadingPublicLobbies(true);
    try {
      const data = await listPublicLobbies();
      if (startedAt !== fetchGeneration.current) return;
      setPublicLobbies(data.lobbies);
      setMessage((prev) => clearPublicLobbiesLoadError(prev));
    } catch (error) {
      if (startedAt !== fetchGeneration.current) return;
      setMessage({
        kind: "error",
        errorCode: LOBBY_BANNER_ERROR_CODES.PUBLIC_LOBBIES_FETCH_FAILED,
        text:
          error instanceof ApiError
            ? `Failed to load public lobbies: ${error.message}`
            : "Failed to load public lobbies",
      });
    } finally {
      if (startedAt === fetchGeneration.current) {
        setLoadingPublicLobbies(false);
      }
    }
  }, [setLoadingPublicLobbies, setPublicLobbies, setMessage]);

  return { refreshPublicLobbies };
}
