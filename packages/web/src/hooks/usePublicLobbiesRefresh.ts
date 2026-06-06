import { type SetStateAction, useCallback, useEffect, useRef } from "react";
import { ApiError } from "../api/http";
import { listPublicLobbies } from "../api/lobbies";

export type PublicLobbyList = Awaited<
  ReturnType<typeof listPublicLobbies>
>["lobbies"];

type LobbyBannerMessage = { kind: "ok" | "error"; text: string } | null;

function clearPublicLobbiesLoadError(
  prev: LobbyBannerMessage,
): LobbyBannerMessage {
  if (
    prev?.kind === "error" &&
    prev.text.startsWith("Failed to load public lobbies")
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
      setPublicLobbies([]);
      setMessage({
        kind: "error",
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
