// Tiny WebAudio sound: a handful of oscillator bleeps and filtered noise,
// no audio files. Everything is behind a master gain and wrapped so a
// browser without WebAudio (or one that refuses) just plays silent.
// The context is created lazily on the first key or click, as browsers ask.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenFlip = 0;
  let muted = false;

  function ensure() {
    if (context !== null) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return true;
    }
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return false;
      context = new AudioCtor();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.14;
      master.connect(context.destination);
      return true;
    } catch (error) {
      context = null;
      return false;
    }
  }

  function tone(freqFrom, freqTo, seconds, type, gain) {
    if (!ensure()) return;
    try {
      const osc = context.createOscillator();
      const amp = context.createGain();
      const now = context.currentTime;
      osc.type = type;
      osc.frequency.setValueAtTime(freqFrom, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqTo), now + seconds);
      amp.gain.setValueAtTime(gain, now);
      amp.gain.exponentialRampToValueAtTime(0.001, now + seconds);
      osc.connect(amp).connect(master);
      osc.start(now);
      osc.stop(now + seconds + 0.02);
    } catch (error) { /* silence is fine */ }
  }

  function noise(seconds, gain, filterFreq) {
    if (!ensure()) return;
    try {
      const length = Math.max(1, Math.floor(context.sampleRate * seconds));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const amp = context.createGain();
      amp.gain.value = gain;
      source.connect(filter).connect(amp).connect(master);
      source.start();
    } catch (error) { /* silence is fine */ }
  }

  function startEngine() {
    if (!ensure() || engineOsc !== null) return;
    try {
      engineOsc = context.createOscillator();
      engineGain = context.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain.gain.value = 0;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineOsc.connect(filter).connect(engineGain).connect(master);
      engineOsc.start();
    } catch (error) {
      engineOsc = null;
    }
  }

  function startSiren() {
    if (!ensure() || sirenOsc !== null) return;
    try {
      sirenOsc = context.createOscillator();
      sirenGain = context.createGain();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
    } catch (error) {
      sirenOsc = null;
    }
  }

  return {
    unlock: ensure,
    setMuted(value) {
      muted = value;
      if (master !== null && context !== null) {
        master.gain.setTargetAtTime(muted ? 0 : 0.14, context.currentTime, 0.03);
      }
    },
    isMuted() {
      return muted;
    },
    blip() {
      tone(660, 990, 0.09, 'square', 0.25);
    },
    cash() {
      tone(880, 880, 0.07, 'square', 0.22);
      setTimeout(() => tone(1318, 1318, 0.12, 'square', 0.22), 70);
    },
    pickup() {
      tone(520, 780, 0.12, 'sine', 0.3);
    },
    door() {
      tone(220, 160, 0.08, 'sine', 0.25);
    },
    crash(hard) {
      noise(hard ? 0.28 : 0.14, hard ? 0.5 : 0.28, hard ? 900 : 1400);
    },
    shot() {
      noise(0.09, 0.4, 2600);
      tone(190, 60, 0.08, 'square', 0.18);
    },
    busted() {
      tone(392, 392, 0.16, 'square', 0.2);
      setTimeout(() => tone(311, 311, 0.16, 'square', 0.2), 170);
      setTimeout(() => tone(233, 180, 0.3, 'square', 0.2), 340);
    },
    wasted() {
      tone(330, 55, 0.7, 'sawtooth', 0.16);
    },
    /** Per-frame: engine pitch from speed, siren loudness from the nearest cop. */
    update(dt, engineSpeed, sirenNear) {
      if (context === null) return;
      try {
        if (engineSpeed !== null) {
          startEngine();
          if (engineOsc !== null) {
            const target = 50 + Math.abs(engineSpeed) * 0.42;
            engineOsc.frequency.setTargetAtTime(target, context.currentTime, 0.06);
            engineGain.gain.setTargetAtTime(0.05 + Math.min(0.05, Math.abs(engineSpeed) / 6000), context.currentTime, 0.09);
          }
        } else if (engineGain !== null) {
          engineGain.gain.setTargetAtTime(0, context.currentTime, 0.08);
        }
        if (sirenNear !== null) {
          startSiren();
          if (sirenOsc !== null) {
            sirenFlip += dt;
            if (sirenFlip > 0.36) {
              sirenFlip = 0;
              sirenOsc.frequency.value = sirenOsc.frequency.value > 800 ? 660 : 940;
            }
            const closeness = Math.max(0, 1 - sirenNear / 620);
            sirenGain.gain.setTargetAtTime(closeness * 0.06, context.currentTime, 0.1);
          }
        } else if (sirenGain !== null) {
          sirenGain.gain.setTargetAtTime(0, context.currentTime, 0.08);
        }
      } catch (error) { /* silence is fine */ }
    },
  };
}
