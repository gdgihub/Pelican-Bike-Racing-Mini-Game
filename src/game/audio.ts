export type AudioHandle = {
  unlock: () => void;
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
  playCollect: () => void;
  playBoost: () => void;
  playHit: () => void;
  playLap: () => void;
  playFinish: () => void;
  playStart: () => void;
  pedal: (phase: number, speed: number) => void;
  ambience: (dt: number) => void;
};

export function createAudio(): AudioHandle {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  let pedalStep = -1;
  let melodyAt = 0;
  let melodyStep = 0;
  const melody = [196, 247, 294, 330, 294, 247, 220, 262];

  function ensure(): AudioContext | null {
    if (muted) return null;
    if (!ctx || !master) return null;
    return ctx;
  }

  function tone(freq: number, dur: number, gain: number, type: OscillatorType, slide = 0) {
    const ac = ensure();
    if (!ac || !master) return;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    if (slide !== 0) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ac.currentTime + dur);
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(ac.currentTime + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  function noise(dur: number, gain: number, freq: number) {
    const ac = ensure();
    if (!ac || !master) return;
    const frames = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buffer = ac.createBuffer(1, frames, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  function startSea() {
    const ac = ctx;
    if (!ac || !master) return;
    const frames = ac.sampleRate * 2;
    const buffer = ac.createBuffer(1, frames, ac.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < frames; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.94 + white * 0.06;
      data[i] = last * 2.2;
    }
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const g = ac.createGain();
    g.gain.value = 0.18;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
  }

  return {
    unlock() {
      if (!ctx) {
        ctx = new AudioContext();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.42;
        master.connect(ctx.destination);
        startSea();
      }
      if (ctx.state === "suspended") void ctx.resume();
    },
    setMuted(next) {
      muted = next;
      if (master && ctx) master.gain.setTargetAtTime(next ? 0 : 0.42, ctx.currentTime, 0.03);
    },
    isMuted: () => muted,
    playCollect() {
      tone(660, 0.12, 0.12, "triangle");
      tone(880, 0.16, 0.08, "sine");
    },
    playBoost() {
      noise(0.28, 0.12, 900);
      tone(220, 0.3, 0.1, "sawtooth", 180);
    },
    playHit() {
      noise(0.18, 0.16, 240);
      tone(110, 0.2, 0.12, "square", -40);
    },
    playLap() {
      tone(523, 0.12, 0.1, "triangle");
      tone(659, 0.14, 0.08, "triangle");
    },
    playFinish() {
      [523, 659, 784, 1046].forEach((f, i) => {
        const ac = ctx;
        if (!ac) return;
        window.setTimeout(() => tone(f, 0.22, 0.1, "triangle"), i * 90);
      });
    },
    playStart() {
      tone(392, 0.1, 0.08, "sine");
      tone(523, 0.16, 0.09, "triangle");
    },
    pedal(phase, speed) {
      if (Math.abs(speed) < 1.4) {
        pedalStep = Math.floor(phase / Math.PI);
        return;
      }
      const step = Math.floor(phase / Math.PI);
      if (step !== pedalStep) {
        pedalStep = step;
        noise(0.045, 0.05, 500);
        tone(180 + Math.random() * 30, 0.04, 0.03, "square");
      }
    },
    ambience(dt) {
      melodyAt += dt;
      if (melodyAt < 0.78) return;
      melodyAt = 0;
      const f = melody[melodyStep % melody.length] ?? 220;
      melodyStep += 1;
      tone(f, 0.55, 0.028, "sine");
    },
  };
}
