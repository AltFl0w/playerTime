"use client";

import { useEffect, useState } from "react";
import { dismissA2hs, shouldShowA2hsNudge } from "../lib/a2hs";

export function A2HSNudge() {
  const [hidden, setHidden] = useState(false);
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    setEligible(shouldShowA2hsNudge());
  }, []);

  if (hidden || !eligible) return null;

  return (
    <div className="rounded-[7px] bg-white p-4 shadow-[0_1px_3px_rgba(26,26,30,0.06)]">
      <div className="text-lg font-extrabold text-[#1a1a1e]">Add to Home Screen</div>
      <ol className="mt-2 space-y-1 text-sm font-bold text-[#1a1a1e]">
        <li>
          <span className="text-neutral-400">1.</span> Share
        </li>
        <li>
          <span className="text-neutral-400">2.</span> Add to Home Screen
        </li>
      </ol>
      <p className="mt-2 text-sm text-neutral-400">
        Alarms and screen-awake work as an app, not in a Safari tab.
      </p>
      <button
        type="button"
        className="mt-3 min-h-[44px] w-full text-sm font-bold text-neutral-400"
        onClick={() => {
          dismissA2hs();
          setHidden(true);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
