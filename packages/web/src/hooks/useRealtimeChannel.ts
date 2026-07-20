import { useEffect, useRef, useState } from "react";
import type { ZodType } from "zod";

type UseRealtimeChannelOptions<TEvent> = {
  url: string | undefined;
  schema: ZodType<TEvent>;
  onMessage: (message: TEvent) => void;
  onDisconnect?: () => void;
};

export function useRealtimeChannel<TEvent>({
  url,
  schema,
  onMessage,
  onDisconnect,
}: UseRealtimeChannelOptions<TEvent>) {
  const [wsStatus, setWsStatus] = useState("disconnected");
  const onMessageRef = useRef(onMessage);
  const onDisconnectRef = useRef(onDisconnect);
  onMessageRef.current = onMessage;
  onDisconnectRef.current = onDisconnect;

  useEffect(() => {
    if (!url) {
      setWsStatus("disconnected");
      onDisconnectRef.current?.();
      return;
    }

    setWsStatus("connecting");
    const socket = new WebSocket(url);
    socket.onopen = () => setWsStatus("connected");
    socket.onclose = () => {
      setWsStatus("disconnected");
      onDisconnectRef.current?.();
    };
    socket.onerror = () => setWsStatus("error");
    socket.onmessage = (event) => {
      try {
        const parsed = schema.safeParse(JSON.parse(String(event.data)));
        if (parsed.success) {
          onMessageRef.current(parsed.data);
          return;
        }
        // Silent drops made "Realtime connected" look healthy while the board
        // froze until Refresh — surface schema mismatches in local/dev.
        if (import.meta.env.DEV) {
          console.warn(
            "[realtime] dropped websocket event (schema mismatch)",
            parsed.error.issues.slice(0, 5),
          );
        }
      } catch {
        // Ignore malformed websocket payloads.
      }
    };

    return () => socket.close();
  }, [schema, url]);

  return { wsStatus };
}
