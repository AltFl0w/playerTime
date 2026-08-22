// Sideline alarm: WebAudio beep loop until dismissed, vibration attempt
// (guarded — iOS Safari has no navigator.vibrate), and a visual class hook
// (.pt-alarm on <html>) that index.css turns into a screen flash.

let ctx: AudioContext | null = null;
let loop: ReturnType<typeof setInterval> | null = null;

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

export function unlockAudio(): void {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    // no WebAudio available; flash/vibrate still work
  }
}

function buzz(): void {
  try {
    if ("vibrate" in navigator) navigator.vibrate([80, 60, 80]);
  } catch {
    // vibrate can throw on some engines even when present
  }
}

function beepTwice(): void {
  buzz();
  if (!ctx || ctx.state !== "running") return;
  const t0 = ctx.currentTime;
  for (const off of [0, 0.26]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t0 + off);
    gain.gain.exponentialRampToValueAtTime(0.28, t0 + off + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0 + off);
    osc.stop(t0 + off + 0.22);
  }
}

export function startAlarm(): void {
  stopAlarm();
  document.documentElement.classList.add("pt-alarm");
  beepTwice();
  loop = setInterval(beepTwice, 1100);
}

export function stopAlarm(): void {
  if (loop !== null) {
    clearInterval(loop);
    loop = null;
  }
  document.documentElement.classList.remove("pt-alarm");
}
