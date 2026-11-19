import type { SettingsStore } from '../app/settings';
import type { Synth } from './Synth';

/**
 * Procedural synthwave loop (original, generated in code — no audio files).
 *
 * 100 BPM, four bars: Am – F – C – G. Layers: kick on every beat, closed
 * hi-hat on off-beats, a saw bass through a low-pass filter, a 16th-note
 * square arpeggio, and a soft detuned pad. Notes are scheduled ~120 ms ahead
 * on the AudioContext clock (the standard "lookahead scheduler" pattern), so
 * timing stays tight even if the main thread is busy.
 *
 * Plays only when both "Sound effects" (the master mute) and "Music" are on.
 */

const BPM = 100;
const STEP_S = 60 / BPM / 4; // 16th note
const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;

/** Chord roots (MIDI) and chord tones for the 4-bar progression Am F C G. */
const CHORDS: { root: number; tones: number[] }[] = [
  { root: 45, tones: [57, 60, 64, 69] }, // A minor
  { root: 41, tones: [53, 57, 60, 65] }, // F major
  { root: 48, tones: [55, 60, 64, 67] }, // C major
  { root: 43, tones: [55, 59, 62, 67] }, // G major
];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 3, 1, 2];

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  private noise: AudioBuffer | null = null;

  constructor(
    synth: Synth,
    private readonly settings: SettingsStore,
  ) {
    settings.subscribe(() => this.sync());
    synth.whenUnlocked((ctx) => {
      this.ctx = ctx;
      this.out = ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(ctx.destination);
      this.sync();
    });
  }

  private wanted(): boolean {
    const s = this.settings.get();
    return s.sound && s.music && s.volume > 0;
  }

  private sync(): void {
    if (!this.ctx || !this.out) return;
    const s = this.settings.get();
    const level = this.wanted() ? s.volume * 0.32 : 0;
    this.out.gain.setTargetAtTime(level, this.ctx.currentTime, 0.15);
    if (this.wanted() && !this.timer) this.start();
    else if (!this.wanted() && this.timer) {
      // Let the fade finish, then stop scheduling.
      setTimeout(() => {
        if (!this.wanted()) this.stop();
      }, 600);
    }
  }

  private start(): void {
    if (!this.ctx) return;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const ctx = this.ctx!;
    // After a long pause (tab hidden), resync instead of catching up.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD_S) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP_S;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number): void {
    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    const chord = CHORDS[bar]!;
    if (s16 % 4 === 0) this.kick(t);
    if (s16 % 4 === 2) this.hat(t);
    if (s16 % 2 === 0) this.bass(midiHz(chord.root + (s16 % 8 === 6 ? 12 : 0)), t, STEP_S * 1.8);
    this.arp(midiHz(chord.tones[ARP[s16]!]! + 12), t);
    if (s16 === 0) this.pad(chord.tones.map(midiHz), t, STEP_S * 16);
  }

  // ── Voices ──────────────────────────────────────────────────────────

  private env(t: number, peak: number, attack: number, dur: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.out!);
    return g;
  }

  private kick(t: number): void {
    const o = this.ctx!.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    o.connect(this.env(t, 0.9, 0.004, 0.22));
    o.start(t);
    o.stop(t + 0.25);
  }

  private hat(t: number): void {
    const ctx = this.ctx!;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    src.connect(hp).connect(this.env(t, 0.18, 0.002, 0.05));
    src.start(t);
    src.stop(t + 0.06);
  }

  private bass(hz: number, t: number, dur: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + dur);
    lp.Q.value = 6;
    o.connect(lp).connect(this.env(t, 0.28, 0.01, dur));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private arp(hz: number, t: number): void {
    const o = this.ctx!.createOscillator();
    o.type = 'square';
    o.frequency.value = hz;
    const lp = this.ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    o.connect(lp).connect(this.env(t, 0.06, 0.005, STEP_S * 0.9));
    o.start(t);
    o.stop(t + STEP_S);
  }

  private pad(freqs: number[], t: number, dur: number): void {
    for (const f of freqs) {
      for (const detune of [-8, 8]) {
        const o = this.ctx!.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = detune;
        const lp = this.ctx!.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1100;
        o.connect(lp).connect(this.env(t, 0.018, dur * 0.3, dur));
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }
}
