import type { SettingsStore } from '../app/settings';

/**
 * Procedural sound effects with the Web Audio API.
 *
 * Every sound is generated from oscillators and filtered noise at runtime,
 * so the game ships no audio files and has no copyright concerns.
 *
 * Browsers only allow audio after a user gesture, so the AudioContext is
 * created lazily on the first click / key press.
 */

interface ToneOpts {
  freq: number;
  /** Optional pitch glide target. */
  freqEnd?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

interface NoiseOpts {
  dur: number;
  gain?: number;
  /** Band-pass centre frequency. */
  filterFreq?: number;
  q?: number;
  delay?: number;
}

export class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  constructor(private readonly settings: SettingsStore) {
    const unlock = () => {
      this.ensure();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    settings.subscribe(() => this.applyVolume());
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  // ── Public sound palette ──────────────────────────────────────────────

  /** UI button press. */
  click(): void {
    this.tone({ freq: 880, freqEnd: 1320, dur: 0.06, type: 'square', gain: 0.12 });
  }

  /** Pointer hovering over a button (very quiet). */
  hover(): void {
    this.tone({ freq: 1760, dur: 0.03, type: 'sine', gain: 0.05 });
  }

  /** Positive confirmation (e.g. device paired). */
  confirm(): void {
    this.tone({ freq: 660, dur: 0.08, type: 'triangle', gain: 0.18 });
    this.tone({ freq: 990, dur: 0.12, type: 'triangle', gain: 0.18, delay: 0.07 });
  }

  /** Going back / closing. */
  back(): void {
    this.tone({ freq: 700, freqEnd: 420, dur: 0.09, type: 'triangle', gain: 0.14 });
  }

  /** A switch was flipped on or off. */
  toggle(on: boolean): void {
    this.tone({ freq: on ? 740 : 520, freqEnd: on ? 1100 : 380, dur: 0.07, type: 'square', gain: 0.1 });
  }

  /** A hop to RF channel k (0..78) — pitch follows frequency. */
  hop(channel: number): void {
    this.tone({ freq: 420 + channel * 9, dur: 0.035, type: 'sine', gain: 0.06 });
  }

  /** Packet collision / loss. */
  collision(): void {
    this.noise({ dur: 0.22, gain: 0.35, filterFreq: 900, q: 0.8 });
    this.tone({ freq: 180, freqEnd: 60, dur: 0.22, type: 'sawtooth', gain: 0.15 });
  }

  /** Lost SCO voice packet: short static crackle. */
  crackle(): void {
    this.noise({ dur: 0.08, gain: 0.25, filterFreq: 3200, q: 2 });
  }

  /** Level cleared / badge. */
  success(): void {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.16, delay: i * 0.09 }),
    );
  }

  // ── Internals ────────────────────────────────────────────────────────

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyVolume();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private applyVolume(): void {
    if (!this.master || !this.ctx) return;
    const s = this.settings.get();
    const v = s.sound ? s.volume : 0;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  private canPlay(): AudioContext | null {
    if (!this.settings.get().sound) return null;
    return this.ensure();
  }

  private tone({ freq, freqEnd, dur, type = 'sine', gain = 0.15, delay = 0 }: ToneOpts): void {
    const ctx = this.canPlay();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    // Short attack + exponential decay envelope avoids clicks.
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise({ dur, gain = 0.2, filterFreq = 1500, q = 1, delay = 0 }: NoiseOpts): void {
    const ctx = this.canPlay();
    if (!ctx || !this.master) return;
    if (!this.noiseBuffer) {
      const len = ctx.sampleRate; // 1 s of white noise, reused
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }
}
