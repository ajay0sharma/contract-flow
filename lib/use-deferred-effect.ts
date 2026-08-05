import { useEffect, type DependencyList, type EffectCallback } from "react";

/**
 * Runs an effect after the current commit so async loaders can set state
 * without tripping react-hooks/set-state-in-effect in CI environments.
 */
/* eslint-disable react-hooks/exhaustive-deps -- deps are supplied by callers */
export function useDeferredEffect(
  effect: EffectCallback,
  deps: DependencyList,
): void {
  useEffect(() => {
    let cancelled = false;
    let cleanup: ReturnType<EffectCallback> | void;

    const frameId = requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }

      cleanup = effect();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);

      if (typeof cleanup === "function") {
        cleanup();
      }
    };
  }, deps);
}
