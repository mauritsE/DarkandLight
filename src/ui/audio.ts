// Small procedural soundscape: generative ambience for each world plus a handful of UI/battle effects.

const LIGHT_SCALE = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];
const DARK_SCALE = [73.4, 87.3, 110.0, 116.5, 146.8, 174.6, 220.0];

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private padL!: GainNode;
  private padD!: GainNode;
  private echo!: DelayNode;
  private dark = false;
  private lastHit = 0;
  private timer = 0;
  muted = localStorage.getItem('dal-mute') === '1';

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.5; this.master.connect(c.destination);
    this.echo = c.createDelay(1); this.echo.delayTime.value = 0.38;
    const fb = c.createGain(); fb.gain.value = 0.35;
    this.echo.connect(fb); fb.connect(this.echo); this.echo.connect(this.master);
    this.padL = this.pad([130.8, 196.0, 261.6, 329.6], 'triangle', 900, 0.05);
    this.padD = this.pad([55, 82.4, 110.5, 164.8], 'sawtooth', 260, 0.06);
    this.padD.gain.value = 0;
    this.timer = window.setInterval(() => this.melody(), 2600);
  }

  private pad(freqs: number[], type: OscillatorType, cutoff: number, vol: number) {
    const c = this.ctx!, out = c.createGain(), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff; out.gain.value = 1;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = cutoff * 0.4; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    freqs.forEach((fr, i) => {
      for (const det of [-4, 5]) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.value = fr; o.detune.value = det + i;
        g.gain.value = vol / (1 + i * 0.4); o.connect(g); g.connect(f); o.start();
      }
    });
    f.connect(out); out.connect(this.master);
    return out;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, echo = false, slide = 0) {
    const c = this.ctx;
    if (!c || this.muted) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); if (echo) g.connect(this.echo);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, from: number, to: number, type: BiquadFilterType = 'bandpass') {
    const c = this.ctx;
    if (!c || this.muted) return;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime;
    s.buffer = buf; f.type = type; f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  }

  private melody() {
    if (!this.ctx || this.muted || document.hidden || Math.random() < 0.35) return;
    if (this.dark) this.tone(DARK_SCALE[Math.floor(Math.random() * DARK_SCALE.length)] * 2, 3.2, 'sine', 0.1, true);
    else {
      const i = Math.floor(Math.random() * LIGHT_SCALE.length);
      this.tone(LIGHT_SCALE[i], 1.6, 'triangle', 0.07, true);
      if (Math.random() < 0.5) setTimeout(() => this.tone(LIGHT_SCALE[(i + 2) % LIGHT_SCALE.length], 1.4, 'triangle', 0.05, true), 320);
    }
  }

  setDark(dark: boolean) {
    this.dark = dark;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.padL.gain.linearRampToValueAtTime(dark ? 0 : 1, t + 1.2);
    this.padD.gain.linearRampToValueAtTime(dark ? 1 : 0, t + 1.2);
    this.noise(0.9, 0.25, dark ? 2400 : 300, dark ? 200 : 3000);
    this.tone(dark ? 220 : 440, 1.2, 'sine', 0.12, true, dark ? 0.5 : 2);
  }
  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('dal-mute', this.muted ? '1' : '0');
    if (this.ctx) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  place() { this.noise(0.12, 0.3, 500, 120, 'lowpass'); this.tone(150, 0.14, 'sine', 0.2, false, 0.6); }
  road() { this.noise(0.05, 0.12, 900, 400, 'lowpass'); }
  demolish() { this.noise(0.3, 0.3, 400, 80, 'lowpass'); }
  click() { this.tone(660, 0.05, 'triangle', 0.06); }
  error() { this.tone(140, 0.16, 'square', 0.05, false, 0.8); }
  coin() { this.tone(1320, 0.09, 'triangle', 0.09); setTimeout(() => this.tone(1760, 0.16, 'triangle', 0.09, true), 70); }
  quest() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, 'triangle', 0.1, true), i * 110)); }
  upgrade() { [392, 523, 659].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, 'sine', 0.09, true), i * 90)); }
  hit() {
    const now = performance.now();
    if (now - this.lastHit < 70) return;
    this.lastHit = now;
    this.noise(0.08, 0.14, 2500 + Math.random() * 1500, 800);
  }
  shot() { const now = performance.now(); if (now - this.lastHit < 50) return; this.lastHit = now; this.noise(0.1, 0.06, 1200, 3000); }
  die() { this.tone(180, 0.3, 'sawtooth', 0.05, false, 0.4); }
  horn() { this.tone(98, 1.4, 'sawtooth', 0.12, true, 1.02); setTimeout(() => this.tone(130.8, 1.2, 'sawtooth', 0.1, true), 500); }
  order() { this.tone(520, 0.06, 'square', 0.03); }
  boom() { this.noise(1.2, 0.5, 600, 40, 'lowpass'); this.tone(60, 1.0, 'sine', 0.3, false, 0.5); }
  victory() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => setTimeout(() => this.tone(f, 1.2, 'triangle', 0.12, true), i * 160)); }
}
