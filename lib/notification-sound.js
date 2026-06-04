let audioCtx = null;
let unlocked = false;

function getContext() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

function tone(ctx, frequency, start, duration, volume = 0.12) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function unlockNotificationSound() {
  const ctx = getContext();
  if (!ctx || unlocked) return;
  if (ctx.state === "suspended") {
    ctx.resume().then(() => {
      unlocked = true;
    });
  } else {
    unlocked = true;
  }
}

export function playNotificationBeep(kind = "message") {
  const ctx = getContext();
  if (!ctx) return;

  const run = () => {
    const t = ctx.currentTime;
    if (kind === "mention") {
      tone(ctx, 880, t, 0.12);
      tone(ctx, 1175, t + 0.14, 0.1);
    } else {
      tone(ctx, 660, t, 0.1);
      tone(ctx, 880, t + 0.12, 0.1);
    }
  };

  if (ctx.state === "suspended") {
    ctx.resume().then(run).catch(() => {});
  } else {
    run();
  }
}

if (typeof window !== "undefined") {
  const unlock = () => unlockNotificationSound();
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}
