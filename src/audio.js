// Web Audio API Procedural Sound Engine
// Generates ambient cosmic pads and responsive interface feedback without external audio files

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = true;
    this.ambientGain = null;
    this.uiGain = null;
    this.ambientOsc1 = null;
    this.ambientOsc2 = null;
    this.ambientLfo = null;
    this.listeners = [];
    this.started = false;
    this.pageHidden = false;
    // The user's stored preference: honoured on the first interaction, since
    // browsers block audio that starts without a gesture.
    this.preferredOn = this.readPreference();
  }

  readPreference() {
    try {
      return localStorage.getItem('aether:sound') === 'on';
    } catch (_) {
      return false;
    }
  }

  writePreference() {
    try {
      localStorage.setItem('aether:sound', this.isMuted ? 'off' : 'on');
    } catch (_) {
      /* storage unavailable — preference simply is not persisted */
    }
  }

  // Called once the user interacts: start the ambient if they had it on.
  startIfPreferred() {
    if (this.started) return;
    this.started = true;
    if (this.preferredOn && this.isMuted) this.toggle();
  }

  // Background tabs should not keep synthesising a drone.
  setPageHidden(hidden) {
    this.pageHidden = hidden;
    if (!this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    const level = hidden || this.isMuted ? 0 : 0.08;
    this.ambientGain.gain.cancelScheduledValues(now);
    this.ambientGain.gain.setTargetAtTime(level, now, 0.4);
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      // UI Master Gain
      this.uiGain = this.ctx.createGain();
      this.uiGain.gain.value = 0.25;
      this.uiGain.connect(this.ctx.destination);

      // Ambient Master Gain
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.0;
      this.ambientGain.connect(this.ctx.destination);

      // Setup ambient background drone
      this.setupAmbientDrone();
    } catch (e) {
      console.warn("Web Audio not supported or blocked", e);
    }
  }

  setupAmbientDrone() {
    if (!this.ctx) return;

    // Filter for warm dark cosmic atmosphere
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    filter.Q.value = 3.5;
    filter.connect(this.ambientGain);

    // Osc 1 - Deep Sub C (65.41 Hz)
    this.ambientOsc1 = this.ctx.createOscillator();
    this.ambientOsc1.type = 'sawtooth';
    this.ambientOsc1.frequency.value = 65.41;

    // Osc 2 - Fifth G (98.00 Hz)
    this.ambientOsc2 = this.ctx.createOscillator();
    this.ambientOsc2.type = 'sine';
    this.ambientOsc2.frequency.value = 98.00;

    // LFO for breathing filter sweep
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.12; // 8-second slow breath

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 140;

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    this.ambientOsc1.connect(filter);
    this.ambientOsc2.connect(filter);

    this.ambientOsc1.start();
    this.ambientOsc2.start();
    lfo.start();
  }

  toggle() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.isMuted = !this.isMuted;

    if (this.ambientGain && this.ctx) {
      const now = this.ctx.currentTime;
      if (!this.isMuted) {
        this.ambientGain.gain.cancelScheduledValues(now);
        this.ambientGain.gain.setTargetAtTime(this.pageHidden ? 0 : 0.08, now, 0.8);
        this.playChord(220, 'sine');
      } else {
        this.ambientGain.gain.cancelScheduledValues(now);
        this.ambientGain.gain.setTargetAtTime(0.0, now, 0.4);
      }
    }

    this.notify();
    this.writePreference();
    return !this.isMuted;
  }

  onStateChange(cb) {
    this.listeners.push(cb);
  }

  notify() {
    this.listeners.forEach(cb => cb(!this.isMuted));
  }

  playTick(frequency = 1200) {
    if (this.isMuted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, now);
      osc.frequency.exponentialRampToValueAtTime(frequency * 0.4, now + 0.04);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.uiGain);

      osc.start(now);
      osc.stop(now + 0.045);
    } catch (_) {}
  }

  playClick() {
    if (this.isMuted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(this.uiGain);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch (_) {}
  }

  playChord(rootFreq = 130.81, wave = 'sine') {
    if (this.isMuted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const intervals = [1, 1.25, 1.5]; // Major triad harmonic ratios

      intervals.forEach((ratio, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = wave;
        osc.frequency.setValueAtTime(rootFreq * ratio, now);

        gain.gain.setValueAtTime(0.04 / (i + 1), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

        osc.connect(gain);
        gain.connect(this.uiGain);

        osc.start(now);
        osc.stop(now + 0.85);
      });
    } catch (_) {}
  }

  playWarp() {
    if (this.isMuted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(90, now);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.7);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

      osc.connect(gain);
      gain.connect(this.uiGain);

      osc.start(now);
      osc.stop(now + 0.85);
    } catch (_) {}
  }
}

export const sound = new SoundEngine();
