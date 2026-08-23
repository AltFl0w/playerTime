// Sideline alarm: a double-beep WAV played through an <audio> element on a
// loop until dismissed, vibration attempt (guarded — iOS Safari has no
// navigator.vibrate), and a visual class hook (.pt-alarm on <html>) that
// index.css turns into a screen flash. <audio> element playback (unlike
// WebAudio) still sounds on iOS when the ringer switch is set to silent.

let loop: ReturnType<typeof setInterval> | null = null;
let audioEl: HTMLAudioElement | null = null;

// Builds a short double-beep (square-ish 880Hz, ~0.5s total) as a 16-bit PCM
// WAV data URI, with quick attack/decay envelopes to avoid clicks.
function buildBeepDataUri(): string {
  const sampleRate = 8000;
  const beepSec = 0.18;
  const gapSec = 0.08;
  const totalSec = beepSec * 2 + gapSec;
  const totalSamples = Math.round(sampleRate * totalSec);
  const freq = 880;
  const attackSamples = Math.round(sampleRate * 0.01);
  const releaseSamples = Math.round(sampleRate * 0.03);
  const beepSamples = Math.round(sampleRate * beepSec);
  const gapSamples = Math.round(sampleRate * gapSec);

  const samples = new Int16Array(totalSamples);
  for (let beep = 0; beep < 2; beep++) {
    const start = beep * (beepSamples + gapSamples);
    for (let i = 0; i < beepSamples; i++) {
      const t = i / sampleRate;
      const square = Math.sign(Math.sin(2 * Math.PI * freq * t));
      let env = 1;
      if (i < attackSamples) env = i / attackSamples;
      else if (i > beepSamples - releaseSamples) env = (beepSamples - i) / releaseSamples;
      samples[start + i] = Math.round(square * env * 0.3 * 32767);
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
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
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

function getAudioEl(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio(buildBeepDataUri());
    audioEl.preload = "auto";
  }
  return audioEl;
}

// iOS requires a gesture-initiated play before <audio> will sound later —
// prime it muted on the first tap so the alarm can actually play unattended.
export function unlockAudio(): void {
  try {
    const el = getAudioEl();
    el.muted = true;
    const playPromise = el.play();
    if (playPromise) {
      playPromise
        .then(() => {
          el.pause();
          el.currentTime = 0;
          el.muted = false;
        })
        .catch(() => {
          el.muted = false;
        });
    } else {
      el.pause();
      el.currentTime = 0;
      el.muted = false;
    }
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
    const el = getAudioEl();
    el.currentTime = 0;
    void el.play();
  } catch {
    // playback can throw/reject if not yet unlocked; alarm still flashes
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
