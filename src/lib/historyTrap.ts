// Traps the browser back-swipe while a live game is on screen so an accidental
// iOS edge-swipe doesn't dump the coach out of the clock. We push a dummy
// history entry and re-push on popstate. App state is never touched — this is
// a navigation fence, not a router. Cleanup removes the listener only; we
// never history.back() (that would leave the live screen).
import { useEffect } from "react";

export function useLiveHistoryTrap(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined" || typeof history === "undefined") return;

    history.pushState({ ptLive: true }, "", location.href);

    function onPopState() {
      history.pushState({ ptLive: true }, "", location.href);
    }

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [active]);
}
