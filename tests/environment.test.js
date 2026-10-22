import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceEnvironmentCycle, countActiveGenerators, createEnvironmentState, getEnergyConsumptionForPhase, getNpcMovementDelta, getNighttimeRiskChance } from '../src/core/environment.js';
import { getBunkerEnergyConsumption } from '../src/core/bunker_economy.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { bunkerEnvironmentHudView } from '../src/ui/dashboard.js';

test('environment cycle switches to night after five minutes and returns to day at ten', () => {
  const day = advanceEnvironmentCycle(createEnvironmentState(), 299_999);
  const night = advanceEnvironmentCycle(day, 1);
  const nextDay = advanceEnvironmentCycle(night, 300_000);

  assert.equal(day.isNight, false);
  assert.equal(night.isNight, true);
  assert.equal(night.remainingMs, 300_000);
  assert.equal(nextDay.isNight, false);
  assert.equal(nextDay.elapsedMs, 0);
});

test('environment cycle handles multiple elapsed cycles without timer drift', () => {
  const result = advanceEnvironmentCycle(createEnvironmentState(), 1_350_000);

  assert.equal(result.isNight, false);
  assert.equal(result.elapsedMs, 150_000);
});

test('invalid timer values are normalized instead of leaking NaN into the HUD', () => {
  const result = advanceEnvironmentCycle(createEnvironmentState({ elapsedMs: Infinity }), Infinity);

  assert.equal(result.elapsedMs, 0);
  assert.equal(result.progress, 0);
  assert.equal(result.remainingMs, 300_000);
});

test('night saves thirty percent of energy and slows NPC movement by twenty percent', () => {
  assert.equal(getEnergyConsumptionForPhase(100, true), 70);
  assert.equal(getEnergyConsumptionForPhase(100, false), 100);
  assert.equal(getNpcMovementDelta(10, true), 8);
  assert.equal(getNpcMovementDelta(10, true, 2), 8);
  assert.equal(getNpcMovementDelta(10, true, 3), 10);
  assert.equal(getNpcMovementDelta(10, false), 10);
  assert.equal(countActiveGenerators([
    [{ type: 'generator', level: 1 }, { type: 'medical', level: 3 }],
    [{ type: 'generator', level: 2 }, { type: 'generator', level: 0 }],
    [{ type: 'generator', level: 1 }],
  ]), 3);
  assert.equal(countActiveGenerators([{ type: 'generator', level: 1 }, { type: 'vault', level: 1 }]), 1);
});

test('night doubles negative event odds and applies reduced consumption to the monthly bunker economy', () => {
  assert.equal(getNighttimeRiskChance(0.2, true), 0.4);
  assert.equal(getNighttimeRiskChance(0.2, true, 2), 0.4);
  assert.equal(getNighttimeRiskChance(0.2, true, 3), 0.2);
  assert.equal(getNighttimeRiskChance(0.2, false), 0.2);
  assert.equal(getBunkerEnergyConsumption({ isNight: true, country: { populacao_base: 50_000 } }), 70);
  assert.equal(getBunkerEnergyConsumption({ isNight: false, country: { populacao_base: 50_000 } }), 100);
});

test('environment phase survives save hydration and the HUD renders the phase and security overlay', () => {
  const state = createGameState('bra');
  const restored = hydrateGameState(JSON.stringify({ ...state, version: 18, environment: { elapsedMs: 330_000 }, isNight: false }));
  const hud = bunkerEnvironmentHudView(restored.environment, restored.isNight,
    [{ role: 'soldier' }, { role: 'engineer', isMilitary: true }], 1);

  assert.equal(restored.isNight, true);
  assert.equal(restored.version, 20);
  assert.match(hud, /data-environment-hud/);
  assert.match(hud, /NOITE/);
  assert.match(hud, /04:30/);
  assert.match(hud, /SEGURANÇA/);
  assert.match(hud, /30%/);
  assert.match(hud, /3 SOLDADOS/);
});
