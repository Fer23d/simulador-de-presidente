// Latido sintetico de Layd: dois "au" curtos, grave e rouco, sem depender de arquivos de audio.
export function playBark(times = 2) {
  const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioContextClass) return false;
  try {
    const context = new AudioContextClass();
    const now = context.currentTime;
    for (let bark = 0; bark < times; bark++) {
      const start = now + bark * .26;
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(420, start);
      oscillator.frequency.exponentialRampToValueAtTime(190, start + .16);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(900, start);
      filter.Q.value = 1.3;
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(.07, start + .02);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .18);
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + .2);
    }
    window.setTimeout(() => { void context.close(); }, 1000);
    return true;
  } catch {
    return false;
  }
}
