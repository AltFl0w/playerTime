// Add-to-Home-Screen nudge for iOS Safari. Dismissal lives in its own
// localStorage key — never inside playertime:v1 — so a store reset doesn't
// resurrect the banner, and dismissing doesn't rewrite the game log.

const DISMISS_KEY = "playertime:a2hs-dismissed";

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  if (/iPhone|iPod/.test(ua)) return true;
  if (ua.includes("Macintosh") && navigator.maxTouchPoints > 1) return true;
  return false;
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  } catch {
    // matchMedia can throw in non-browser environments
  }
  return (navigator as { standalone?: boolean }).standalone === true;
}

export function isA2hsDismissed(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(DISMISS_KEY) !== null;
  } catch {
    return false;
  }
}

export function dismissA2hs(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // private mode / quota exceeded — nudge may reappear next visit
  }
}

export function shouldShowA2hsNudgeFrom(flags: {
  ios: boolean;
  standalone: boolean;
  dismissed: boolean;
}): boolean {
  return flags.ios && !flags.standalone && !flags.dismissed;
}

export function shouldShowA2hsNudge(): boolean {
  return shouldShowA2hsNudgeFrom({
    ios: isIosDevice(),
    standalone: isStandaloneDisplay(),
    dismissed: isA2hsDismissed(),
  });
}
