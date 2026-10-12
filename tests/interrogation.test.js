import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/game-state.js';
import { reivindicarInterrogatorio, resolverInterrogatorio, sortearCapturaAgente } from '../src/core/interrogation.js';

test('opens an interrogation from a deterministic five-percent capture roll', () => {
  const result = sortearCapturaAgente({ ...createGameState('bra'), randomSeed: 1_972 });

  assert.equal(result.pendingInterrogation.phase, 'choice');
  assert.equal(result.pendingInterrogation.prisonerId, 847);
});

test('extracting secrets grants two thousand research points after a successful interrogation', () => {
  const state = {
    ...createGameState('bra'),
    randomSeed: 1,
    pendingInterrogation: { phase: 'choice', prisonerId: 847 },
  };

  const questioned = resolverInterrogatorio(state, 'truth-serum');
  const result = reivindicarInterrogatorio(questioned, 'extract-secrets');

  assert.equal(result.technology.points, state.technology.points + 2_000);
  assert.equal(result.pendingInterrogation, null);
});

test('rejects a bribe when the treasury cannot pay and grants a double agent reward', () => {
  const state = {
    ...createGameState('bra'),
    economy: { ...createGameState('bra').economy, cash: 1 },
    pendingInterrogation: { phase: 'choice', prisonerId: 847 },
  };

  const rejected = resolverInterrogatorio(state, 'bribe');
  const reward = reivindicarInterrogatorio({ ...state, pendingInterrogation: { phase: 'reward', prisonerId: 847 } }, 'turn-double-agent');

  assert.equal(rejected.pendingInterrogation.phase, 'choice');
  assert.equal(reward.double_agent_active, true);
});
