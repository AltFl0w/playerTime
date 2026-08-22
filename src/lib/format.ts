export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtMinutes(totalSec: number): string {
  return (Math.max(0, totalSec) / 60).toFixed(1);
}
