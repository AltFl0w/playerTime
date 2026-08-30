// Sideline alarm: a two-tone double-beep WAV played through an <audio>
// element on a loop until muted. Vibration attempt is guarded — iOS Safari
// has no navigator.vibrate. No screen flash. <audio> still sounds on iOS
// when the ringer switch is silent (WebAudio does not). Changing `src` on a
// primed element drops the iOS unlock, so sun vs default are two elements
// created once and never recreated / load()'d.

let loop: ReturnType<typeof setInterval> | null = null;
let defaultEl: HTMLAudioElement | null = null;
let sunEl: HTMLAudioElement | null = null;

const SAMPLE_RATE = 8000;
const BEEP_SEC = 0.22;
const GAP_SEC = 0.1;
const ATTACK_SEC = 0.01;
const RELEASE_SEC = 0.04;
const TONE_1_HZ = 880;
const TONE_2_HZ = 1320;
const DEFAULT_AMP = 0.55;
const SUN_AMP = 0.72;
const LOOP_MS = 1200;

// Builds a short double-beep (square-ish 880Hz then 1320Hz) as a 16-bit PCM
// WAV data URI, with quick attack/release envelopes to avoid clicks.
function buildBeepDataUri(amplitude: number): string {
  const totalSec = BEEP_SEC * 2 + GAP_SEC;
  const totalSamples = Math.round(SAMPLE_RATE * totalSec);
  const freqs = [TONE_1_HZ, TONE_2_HZ];
  const attackSamples = Math.round(SAMPLE_RATE * ATTACK_SEC);
  const releaseSamples = Math.round(SAMPLE_RATE * RELEASE_SEC);
  const beepSamples = Math.round(SAMPLE_RATE * BEEP_SEC);
  const gapSamples = Math.round(SAMPLE_RATE * GAP_SEC);

  const samples = new Int16Array(totalSamples);
  for (let beep = 0; beep < 2; beep++) {
    const start = beep * (beepSamples + gapSamples);
    const freq = freqs[beep];
    for (let i = 0; i < beepSamples; i++) {
      const t = i / SAMPLE_RATE;
      const square = Math.sign(Math.sin(2 * Math.PI * freq * t));
      let env = 1;
      if (i < attackSamples) env = i / attackSamples;
      else if (i > beepSamples - releaseSamples) env = (beepSamples - i) / releaseSamples;
      samples[start + i] = Math.round(square * env * amplitude * 32767);
    }
  }
  // Trailing gapSamples remain silent (Int16Array defaults to 0).

  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * bytesPerSample, samples[i], true);
  }

  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function makeEl(src: string): HTMLAudioElement {
  const el = new Audio(src);
  el.preload = "auto";
  return el;
}

// Created once, never nulled, never load()'d — iOS unlock lives on the element.
function ensureDefaultEl(): HTMLAudioElement {
  if (!defaultEl) defaultEl = makeEl(buildBeepDataUri(DEFAULT_AMP));
  return defaultEl;
}

function ensureSunEl(): HTMLAudioElement {
  if (!sunEl) sunEl = makeEl(buildBeepDataUri(SUN_AMP));
  return sunEl;
}

function chosenEl(): HTMLAudioElement {
  const sun =
    typeof document !== "undefined" && document.documentElement.classList.contains("pt-sun");
  return sun ? ensureSunEl() : ensureDefaultEl();
}

function hush(el: HTMLAudioElement | null): void {
  if (!el) return;
  try {
    el.pause();
    el.currentTime = 0;
  } catch {
    // pause/seek can throw if the element isn't ready; ignore
  }
}

function prime(el: HTMLAudioElement): void {
  el.muted = true;
  const playPromise = el.play();
  if (playPromise) {
    playPromise
      .then(() => {
        el.muted = false;
        // Alarm started while we were priming — don't pause the live beep.
        if (loop !== null) return;
        el.pause();
        el.currentTime = 0;
      })
      .catch(() => {
        el.muted = false;
      });
  } else {
    el.muted = false;
    if (loop !== null) return;
    el.pause();
    el.currentTime = 0;
  }
}

// iOS requires a gesture-initiated play before <audio> will sound later —
// prime BOTH clips muted on the first tap so the alarm can play unattended.
export function unlockAudio(): void {
  // Don't mute an in-progress alarm beep.
  if (loop !== null) return;
  try {
    prime(ensureDefaultEl());
    prime(ensureSunEl());
  } catch {
    // no <audio> support; flash/vibrate still work
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
  try {
    const el = chosenEl();
    el.currentTime = 0;
    void el.play();
  } catch {
    // playback can throw/reject if not yet unlocked; banner still shows
  }
}

export function startAlarm(): void {
  stopAlarm();
  beepTwice();
  loop = setInterval(beepTwice, LOOP_MS);
}

export function stopAlarm(): void {
  if (loop !== null) {
    clearInterval(loop);
    loop = null;
  }
  hush(defaultEl);
  hush(sunEl);
}
