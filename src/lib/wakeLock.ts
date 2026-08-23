// Keeps the screen awake during a live game so the clock doesn't blow through
// a quarter boundary while the phone sleeps. Wake locks auto-release when the
// page is hidden, so we re-acquire on visibilitychange. Unsupported browsers
// (no navigator.wakeLock) are a silent no-op.
import { useEffect, useRef } from "react";

export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    async function acquire() {
      try {
        if (!("wakeLock" in navigator)) return;
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        lockRef.current = lock;
      } catch {
        // Denied, unsupported, or page not visible — nothing we can do.
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible" && !lockRef.current) void acquire();
    }

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      const lock = lockRef.current;
      lockRef.current = null;
      if (lock) void lock.release().catch(() => {});
    };
  }, [active]);
}
