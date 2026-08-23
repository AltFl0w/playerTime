// Non-blocking confirmation. Sits above everything but never intercepts
// touches — the coach's next tap always lands on the app, not the toast.
export function Toast({ toast }: { toast: { id: number; text: string } | null }) {
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      className="pt-toast pointer-events-none fixed left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] rounded-[7px] bg-[#16181d] px-4 py-2.5 text-sm font-bold text-white shadow-[0_4px_16px_rgba(22,24,29,0.25)]"
    >
      {toast.text}
    </div>
  );
}
