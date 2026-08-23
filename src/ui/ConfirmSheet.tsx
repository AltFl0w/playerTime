interface Props {
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Bottom-sheet replacement for window.confirm — a coach on the move needs a
// big thumb target, not a native dialog with tiny OK/Cancel buttons.
export function ConfirmSheet({ title, confirmLabel, cancelLabel = "Cancel", danger, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1a1a1e]/40 p-4 pb-6">
      <div className="w-full max-w-md rounded-[7px] bg-white p-4 shadow-2xl">
        <div className="px-1 pb-3 text-center text-lg font-extrabold">{title}</div>
        <button
          type="button"
          onClick={onConfirm}
          className={`w-full rounded-[7px] px-4 py-4 text-lg font-extrabold text-white shadow-[0_2px_10px_rgba(37,99,235,0.35)] transition active:scale-[0.98] ${
            danger ? "bg-red-600" : "bg-[#2563eb]"
          }`}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 w-full py-3 text-sm font-bold text-neutral-400"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
