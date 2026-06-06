import { type MutableRefObject, useEffect, useRef } from "react";

/**
 * Ref stays `true` while the component is mounted (React 18 Strict Mode safe).
 * Use after `await` to avoid `setState` on unmounted components (e.g. Vitest teardown).
 */
export function useComponentMountedRef(): MutableRefObject<boolean> {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}
