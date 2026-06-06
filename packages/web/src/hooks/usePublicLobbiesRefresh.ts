import { useCallback } from "react";
import { ApiError } from "../api/http";
import { listPublicLobbies } from "../api/lobbies";
import { useComponentMountedRef } from "./useComponentMountedRef";

export type PublicLobbyList = Awaited<
  ReturnType<typeof listPublicLobbies>
>["lobbies"];

type LobbyBannerMessage = { kind: "ok" | "error"; text: string } | null;

/**
 * Public lobby list fetch with mount guard — keeps async completion from touching
 * React state after unmount (Strict Mode / fast navigation).
 */
export function usePublicLobbiesRefresh(
  setLoadingPublicLobbies: (value: boolean) => void,
  setPublicLobbies: (lobbies: PublicLobbyList) => void,
  setMessage: (message: LobbyBannerMessage) => void,
) {
  const fetchAlive = useComponentMountedRef();

  const refreshPublicLobbies = useCallback(async () => {
    setLoadingPublicLobbies(true);
    try {
      const data = await listPublicLobbies();
      if (!fetchAlive.current) return;
      setPublicLobbies(data.lobbies);
    } catch (error) {
      if (!fetchAlive.current) return;
      setMessage({
        kind: "error",
        text:
          error instanceof ApiError
            ? `Failed to load public lobbies: ${error.message}`
            : "Failed to load public lobbies",
      });
    } finally {
      if (fetchAlive.current) {
        setLoadingPublicLobbies(false);
      }
    }
  }, [fetchAlive, setLoadingPublicLobbies, setPublicLobbies, setMessage]);

  return { refreshPublicLobbies };
}
