import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioEngine, getMusicMood, isStormWeather, MUSIC_MOODS, normalizeAudioSettings } from '../src/core/audio.js';
import { soundControlView } from '../src/ui/dashboard.js';

function fakeContextClass(log) {
  const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime(value) { log.push(['target', value]); },
    exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  const node = (kind) => ({ kind, connect() {}, start() { log.push(['start', kind]); }, stop() {}, gain: param(), frequency: param(),
    detune: param(), Q: param(), type: '', buffer: null, loop: false });
  return class {
    constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = {}; }
    createGain() { return node('gain'); }
    createOscillator() { return node('osc'); }
    createBiquadFilter() { return node('filter'); }
    createDynamicsCompressor() { return node('compressor'); }
    createBufferSource() { return node('noise'); }
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    resume() {}
  };
}

test('music mood follows the phase of the game and storms add wind', () => {
  assert.equal(getMusicMood({}), 'presidency');
  assert.equal(getMusicMood({ is_wasteland: true }), 'vault');
  assert.equal(getMusicMood({ is_wasteland: true, isNight: true }), 'vault_night');
  assert.equal(getMusicMood({ is_wasteland: true, ending: { id: 'republic' } }), 'ending');
  assert.ok(Object.keys(MUSIC_MOODS).length >= 4);
  assert.equal(isStormWeather({ is_wasteland: true, weather: { type: 'dust' } }), true);
  assert.equal(isStormWeather({ is_wasteland: true, weather: { type: 'clear' } }), false);
});

test('without Web Audio the engine is silent and never throws', () => {
  const engine = createAudioEngine({ AudioContextClass: undefined });
  assert.equal(engine.unlock(), false);
  assert.equal(engine.play('click'), false);
  engine.setMood('vault');
  engine.setStorm(true);
});

test('after unlocking, music starts, effects play and muting silences them', () => {
  const log = [];
  const engine = createAudioEngine({ AudioContextClass: fakeContextClass(log) });
  engine.setMood('vault');
  assert.equal(engine.unlock(), true);
  assert.ok(log.some(([kind, value]) => kind === 'start' && value === 'osc'));
  for (const name of ['click', 'build', 'alarm', 'reward', 'chime', 'talk', 'door', 'boom', 'thunder', 'error']) {
    assert.equal(engine.play(name), true, name);
  }
  assert.equal(engine.play('unknown'), false);
  engine.setStorm(true);
  assert.ok(log.some(([kind, value]) => kind === 'start' && value === 'noise'));
  engine.setSettings({ muted: true });
  assert.equal(engine.play('click'), false);
});

test('settings are clamped and the sound control reflects them', () => {
  assert.deepEqual(normalizeAudioSettings({ volume: 7, muted: 'yes' }), { muted: false, volume: 1 });
  assert.deepEqual(normalizeAudioSettings({}), { muted: false, volume: .6 });
  assert.match(soundControlView({ muted: true, volume: .3 }), /🔇[\s\S]*value="30"/);
  assert.match(soundControlView({ muted: false, volume: .6 }), /🔊/);
});
