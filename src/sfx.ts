// Синтезированные звуки через WebAudio — без файлов. Позже заменим на сэмплы.
let ctx: AudioContext | null = null, gain = 1;
export const setVolume = (v: number) => { gain = v; }; // общая × эффекты из настроек

function beep(freq: number, dur = 0.08, type: OscillatorType = 'square', vol = 0.04, delay = 0) {
  ctx ??= new AudioContext();
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  if (gain <= 0) return;
  g.gain.setValueAtTime(vol * gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + dur);
}

export const SFX = {
  move: () => beep(660, 0.05, 'triangle', 0.05),
  attack: () => beep(220, 0.09, 'sawtooth', 0.04),
  train: () => { beep(523, 0.08, 'triangle', 0.05); beep(784, 0.1, 'triangle', 0.05, 0.08); },
  built: () => { beep(392, 0.1, 'triangle', 0.05); beep(523, 0.1, 'triangle', 0.05, 0.1); beep(659, 0.15, 'triangle', 0.05, 0.2); },
  age: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.25, 'triangle', 0.06, i * 0.15)),
  hit: () => beep(110 + Math.random() * 80, 0.04, 'square', 0.02),
  die: () => beep(80, 0.18, 'sawtooth', 0.03),
  alert: () => { beep(440, 0.15, 'square', 0.05); beep(440, 0.15, 'square', 0.05, 0.25); },
};
