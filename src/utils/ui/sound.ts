export function playTone(freq: number, type: OscillatorType, dur: number, vol: number) {
  try {
    const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch (e) {
    console.error("Audio error", e);
  }
}

export function playSuccessSound() { playTone(880, "sine", 0.3, 0.2); playTone(1100, "sine", 0.4, 0.1); }
export function playErrorSound() { playTone(220, "sawtooth", 0.4, 0.3); }
export function playClickSound() { playTone(1200, "triangle", 0.05, 0.05); }
