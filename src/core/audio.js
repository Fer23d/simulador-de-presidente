// Trilha e efeitos gerados em tempo real com Web Audio (sem arquivos de audio, 100% originais).
// Sem AudioContext (testes, navegador antigo) tudo vira operacao vazia.
export const AUDIO_DEFAULTS = Object.freeze({ muted: false, volume: .6 });

// Cada clima musical: nota base do drone grave, timbre e brilho do filtro.
export const MUSIC_MOODS = Object.freeze({
  presidency: Object.freeze({ root: 55, brightness: 1400, pad: 'sawtooth' }),
  vault: Object.freeze({ root: 49, brightness: 900, pad: 'triangle' }),
  vault_night: Object.freeze({ root: 41.2, brightness: 520, pad: 'triangle' }),
  ending: Object.freeze({ root: 65.4, brightness: 1100, pad: 'sine' }),
});

export function getMusicMood(state) {
  if (!state?.is_wasteland) return 'presidency';
  if (state.ending) return 'ending';
  return state.isNight ? 'vault_night' : 'vault';
}

export function isStormWeather(state) {
  return Boolean(state?.is_wasteland) && Boolean(state.weather?.type) && state.weather.type !== 'clear';
}

export function normalizeAudioSettings(value = {}) {
  const volume = Number(value?.volume);
  return { muted: value?.muted === true, volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : AUDIO_DEFAULTS.volume };
}

export function createAudioEngine({ AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext, settings = AUDIO_DEFAULTS } = {}) {
  let current = normalizeAudioSettings(settings);
  let context = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let mood = null;
  let voice = null;
  let wind = null;
  let windWanted = false;

  function applyVolume() {
    if (!master) return;
    master.gain.setTargetAtTime(current.muted ? 0 : current.volume, context.currentTime, .08);
  }

  function ensureContext() {
    if (context || !AudioContextClass) return Boolean(context);
    try {
      context = new AudioContextClass();
      const compressor = context.createDynamicsCompressor();
      master = context.createGain();
      musicBus = context.createGain();
      sfxBus = context.createGain();
      musicBus.gain.value = .55;
      sfxBus.gain.value = .9;
      musicBus.connect(master);
      sfxBus.connect(master);
      master.connect(compressor);
      compressor.connect(context.destination);
      applyVolume();
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  function noiseBuffer(seconds = 2) {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
    return buffer;
  }

  // Drone grave continuo: osciladores desafinados num filtro que respira lentamente.
  function startMood(name) {
    const spec = MUSIC_MOODS[name];
    if (!spec || !context) return;
    const now = context.currentTime;
    if (voice) {
      const old = voice;
      old.gain.gain.setTargetAtTime(0, now, .8);
      setTimeout(() => old.nodes.forEach((node) => { try { node.stop(); } catch { /* ja parado */ } }), 4_000).unref?.();
    }
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(.22, now, 1.2);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = spec.brightness;
    filter.Q.value = 4;
    const lfo = context.createOscillator();
    const lfoDepth = context.createGain();
    lfo.frequency.value = .07;
    lfoDepth.gain.value = spec.brightness * .4;
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);
    const nodes = [lfo];
    for (const [ratio, detune] of [[1, -7], [1.5, 6], [2, 0]]) {
      const oscillator = context.createOscillator();
      oscillator.type = spec.pad;
      oscillator.frequency.value = spec.root * ratio;
      oscillator.detune.value = detune;
      const level = context.createGain();
      level.gain.value = ratio === 2 ? .25 : .5;
      oscillator.connect(level);
      level.connect(filter);
      nodes.push(oscillator);
    }
    filter.connect(gain);
    gain.connect(musicBus);
    nodes.forEach((node) => node.start(now));
    voice = { gain, nodes, spec };
  }

  // Vento das tempestades: ruido em filtro passa-banda com rajadas lentas.
  function setWind(enabled) {
    windWanted = enabled;
    if (!context) return;
    const now = context.currentTime;
    if (enabled && !wind) {
      const source = context.createBufferSource();
      source.buffer = noiseBuffer(3);
      source.loop = true;
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 420;
      band.Q.value = .7;
      const gust = context.createOscillator();
      const gustDepth = context.createGain();
      gust.frequency.value = .13;
      gustDepth.gain.value = 260;
      gust.connect(gustDepth);
      gustDepth.connect(band.frequency);
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(.12, now, 1.5);
      source.connect(band);
      band.connect(gain);
      gain.connect(musicBus);
      source.start(now);
      gust.start(now);
      wind = { gain, nodes: [source, gust] };
    } else if (!enabled && wind) {
      const old = wind;
      wind = null;
      old.gain.gain.setTargetAtTime(0, now, .9);
      setTimeout(() => old.nodes.forEach((node) => { try { node.stop(); } catch { /* ja parado */ } }), 4_000).unref?.();
    }
  }

  function tone(frequency, { at = 0, duration = .15, type = 'square', level = .12, slideTo = null } = {}) {
    const start = context.currentTime + at;
    const oscillator = context.createOscillator();
    const env = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    env.gain.setValueAtTime(.0001, start);
    env.gain.exponentialRampToValueAtTime(level, start + .01);
    env.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(env);
    env.connect(sfxBus);
    oscillator.start(start);
    oscillator.stop(start + duration + .05);
  }

  function noiseBurst({ at = 0, duration = .6, level = .4, from = 1200, to = 80 } = {}) {
    const start = context.currentTime + at;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(duration + .1);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    const env = context.createGain();
    env.gain.setValueAtTime(level, start);
    env.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter);
    filter.connect(env);
    env.connect(sfxBus);
    source.start(start);
    source.stop(start + duration + .05);
  }

  const SFX = {
    click: () => tone(880, { duration: .05, level: .05, type: 'square' }),
    build: () => { noiseBurst({ duration: .18, level: .25, from: 2400, to: 400 }); tone(196, { at: .05, duration: .2, type: 'triangle', level: .14 }); },
    alarm: () => [0, .32, .64].forEach((at) => tone(740, { at, duration: .22, type: 'square', level: .07, slideTo: 520 })),
    reward: () => [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => tone(frequency, { at: index * .08, duration: .25, type: 'triangle', level: .09 })),
    chime: () => [987.77, 1318.51].forEach((frequency, index) => tone(frequency, { at: index * .12, duration: .5, type: 'sine', level: .08 })),
    talk: () => tone(320 + Math.random() * 80, { duration: .04, type: 'square', level: .03 }),
    door: () => { tone(55, { duration: 2.2, type: 'sawtooth', level: .18, slideTo: 38 }); noiseBurst({ duration: 1.6, level: .2, from: 600, to: 60 }); },
    boom: () => { noiseBurst({ duration: 3.5, level: .9, from: 2000, to: 30 }); tone(42, { duration: 3, type: 'sine', level: .5, slideTo: 25 }); },
    thunder: () => noiseBurst({ duration: 2.4, level: .45, from: 900, to: 40 }),
    oil: () => [196, 147, 110].forEach((frequency, index) => tone(frequency, { at: index * .08, duration: .16, type: 'sine', level: .16, slideTo: frequency * .55 })),
    error: () => tone(140, { duration: .2, type: 'square', level: .08, slideTo: 90 }),
  };

  return {
    get settings() { return { ...current }; },
    // Navegadores so liberam audio depois de um gesto do jogador.
    unlock() {
      if (!ensureContext()) return false;
      if (context.state === 'suspended') void context.resume();
      if (mood && !voice) startMood(mood);
      if (windWanted && !wind) setWind(true);
      return true;
    },
    setMood(name) {
      if (!MUSIC_MOODS[name] || name === mood) return;
      mood = name;
      if (context) startMood(name);
    },
    setStorm(enabled) { if (Boolean(enabled) !== windWanted || (enabled && !wind)) setWind(Boolean(enabled)); },
    play(name) {
      if (!context || current.muted || !SFX[name]) return false;
      try { SFX[name](); return true; } catch { return false; }
    },
    setSettings(next) {
      current = normalizeAudioSettings({ ...current, ...next });
      applyVolume();
      return { ...current };
    },
  };
}
