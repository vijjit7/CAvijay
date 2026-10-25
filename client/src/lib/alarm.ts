// In-app "new work" alarm: a looping alert tone + continuous vibration that rings
// until the associate silences it.
//
// This exists because a Web Push service worker cannot play audio — the loudest a
// *backgrounded* PWA can be is a persistent notification + a vibration burst. But once
// a window is in the foreground (the app is open, or was just opened by tapping the
// notification) we CAN ring a real alarm from here, which is what this module does.
//
// The tone is synthesised with the Web Audio API so there's no sound file to ship and
// it loops cleanly for as long as needed.

let ctx: AudioContext | null = null;
let beepTimer: ReturnType<typeof setInterval> | null = null;
let vibrateTimer: ReturnType<typeof setInterval> | null = null;
let running = false;

export function isAlarmRunning(): boolean {
  return running;
}

// One short two-tone "ring". Scheduled on the given context's clock so it's crisp.
function ring(context: AudioContext) {
  const play = (freq: number, start: number, duration: number) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(context.destination);
    const t = context.currentTime + start;
    // Quick fade in/out to avoid clicks.
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  };
  play(880, 0, 0.25);
  play(1175, 0.3, 0.25);
}

// Start ringing. Idempotent — calling it while already ringing does nothing.
export async function startAlarm(): Promise<void> {
  if (running) return;
  running = true;

  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (AC) {
      ctx = new AC();
      // Autoplay policy may start the context suspended; try to resume. If the browser
      // blocks it (no user gesture yet), resumeAlarmAudio() picks it up on first tap.
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      ring(ctx);
      beepTimer = setInterval(() => ctx && ring(ctx), 1000);
    }
  } catch {
    // Audio unavailable — vibration + the visual overlay still alert the associate.
  }

  if (typeof navigator !== "undefined" && navigator.vibrate) {
    const pulse = () => navigator.vibrate([600, 400]);
    pulse();
    vibrateTimer = setInterval(pulse, 1000);
  }
}

// Stop ringing and release everything.
export function stopAlarm(): void {
  running = false;
  if (beepTimer) {
    clearInterval(beepTimer);
    beepTimer = null;
  }
  if (vibrateTimer) {
    clearInterval(vibrateTimer);
    vibrateTimer = null;
  }
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(0);
  if (ctx) {
    ctx.close().catch(() => {});
    ctx = null;
  }
}

// If the audio context was blocked by autoplay policy, a later user gesture can resume
// it. Wire this to a one-time gesture listener so the tone kicks in as soon as the
// associate touches the screen, even if it couldn't start on its own.
export function resumeAlarmAudio(): void {
  if (running && ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}
