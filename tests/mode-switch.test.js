import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, trocarDeModo } from '../src/core/game-state.js';
import { getGameMode } from '../src/core/levels.js';
import { canSwitchMode, getOtherModes, isModeCompleted, markModeDone, normalizeModesDone } from '../src/core/mode_switch.js';
import { modeSwitchRow } from '../src/ui/mode_switch_ui.js';

const base = () => ({ ...createGameState('bra', { name: 'P', language: 'pt-BR' }), monthCounter: 10 });

test('zerar cada modo: Vault com final, Cidade com epilogo, Presidencia com fim, missao ou 10 anos', () => {
  const s = base();
  assert.equal(isModeCompleted(s), false);
  assert.equal(isModeCompleted({ ...s, regime: { ...s.regime, gameOver: true } }), true);
  assert.equal(isModeCompleted({ ...s, missions: { active: null, completed: { ussr: { months: 1 } }, pendingEpilogue: null } }), true);
  assert.equal(isModeCompleted({ ...s, monthCounter: 120 }), true);
  const vault = trocarDeModo(s, 'vault');
  assert.equal(getGameMode(vault), 'vault');
  assert.equal(isModeCompleted(vault), false);
  assert.equal(isModeCompleted({ ...vault, ending: { id: 'republic', month: 5 } }), true);
});

test('trocar de modo comeca uma partida nova no mesmo pais e perfil', () => {
  const s = { ...base(), playerProfile: { name: 'Ana', language: 'pt-BR', difficulty: 'hard' } };
  const pres = trocarDeModo(s, 'presidency');
  assert.equal(getGameMode(pres), 'presidency');
  assert.equal(pres.country.id, 'bra');
  assert.equal(pres.playerProfile.name, 'Ana');
  assert.equal(pres.monthCounter, 0);
  const vault = trocarDeModo(s, 'vault');
  assert.equal(vault.is_wasteland, true);
  assert.equal(vault.playerProfile.difficulty, 'hard');
  const city = trocarDeModo(vault, 'city', 'empire');
  assert.equal(getGameMode(city), 'city');
  assert.ok(city.city);
  assert.equal(getGameMode(trocarDeModo(city, 'presidency')), 'presidency');
  assert.equal(getGameMode(trocarDeModo(s, 'city', 'inexistente')), 'city', 'origem invalida cai na padrao');
});

test('liberacao da troca: fica aberta depois que a conta zera um modo', () => {
  const s = base();
  assert.equal(canSwitchMode(s, {}), false);
  const done = markModeDone({}, { ...s, monthCounter: 130 });
  assert.equal(done.presidency, true);
  assert.equal(canSwitchMode(s, done), true, 'conta ja zerou um modo');
  assert.deepEqual(normalizeModesDone(null), { presidency: false, vault: false, city: false });
  assert.deepEqual(markModeDone({ vault: true }, s), { presidency: false, vault: true, city: false });
});

test('botoes mostram os outros dois modos', () => {
  const s = base();
  assert.deepEqual(getOtherModes(s).map((m) => m.id), ['vault', 'city']);
  const html = modeSwitchRow(s);
  assert.match(html, /data-mode="vault"/);
  assert.match(html, /data-mode="city"/);
  assert.doesNotMatch(html, /data-mode="presidency"/);
});
