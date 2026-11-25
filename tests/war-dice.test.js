import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/game-state.js';
import { conquerTerritory, continueBattle, getCountryOwner, revealMissionTurn, startMissionMatch } from '../src/core/mission_mode.js';

function battleState({ attackers = 3, defenders = 2, fortified = false } = {}) {
  const started = revealMissionTurn(startMissionMatch(createGameState('bra'), 2, ['Você', 'Rival'], () => 0.37));
  const contacts = started.geopolitics.contacts.map((country) => ({
    ...country,
    ownerId: country.id === 'arg' ? 'player-2' : 'player-1',
  }));
  return {
    ...started,
    country: { ...started.country, ownerId: 'player-1' },
    geopolitics: { ...started.geopolitics, contacts },
    world: contacts,
    missionMode: {
      ...started.missionMode,
      troopsByCountry: { bra: attackers + 1, arg: defenders },
      fortifiedCountries: fortified ? { arg: true } : {},
    },
  };
}

function scriptedDice(values) {
  let index = 0;
  return () => values[index++] ?? 0.5;
}

test('dice use the full 1–6 range, sort results, and resolve a winning attack', () => {
  const state = battleState({ attackers: 3, defenders: 2 });
  const next = conquerTerritory(state, 'arg', 'bra', 3, scriptedDice([0, 0, 0, 0.999, 0.999]));

  assert.deepEqual(next.missionMode.lastBattle.attackDice, [6, 6, 6]);
  assert.deepEqual(next.missionMode.lastBattle.defenseDice, [1, 1]);
  assert.equal(next.missionMode.lastBattle.won, true);
  assert.equal(next.missionMode.troopsByCountry.bra, 1, 'the origin keeps its last troop');
  assert.equal(next.missionMode.troopsByCountry.arg, 3);
  assert.equal(getCountryOwner(next, 'arg'), 'player-1');
});

test('a tie favors the defender and removes one attacking troop', () => {
  const state = battleState({ attackers: 2, defenders: 1 });
  const next = conquerTerritory(state, 'arg', 'bra', 2, scriptedDice([0.5, 0.5]));

  assert.deepEqual(next.missionMode.lastBattle.attackDice, [3, 3]);
  assert.deepEqual(next.missionMode.lastBattle.defenseDice, [3]);
  assert.equal(next.missionMode.lastBattle.attackerLosses, 1);
  assert.equal(next.missionMode.lastBattle.defenderLosses, 0);
  assert.equal(next.missionMode.activeBattle.attackingRemaining, 1);
  assert.equal(getCountryOwner(next, 'arg'), 'player-2');
});

test('an attacker loss is recorded and does not transfer the target', () => {
  const state = battleState({ attackers: 1, defenders: 1 });
  const next = conquerTerritory(state, 'arg', 'bra', 1, scriptedDice([0.999, 0]));

  assert.deepEqual(next.missionMode.lastBattle.attackDice, [1]);
  assert.deepEqual(next.missionMode.lastBattle.defenseDice, [6]);
  assert.equal(next.missionMode.lastBattle.defeated, true);
  assert.equal(next.missionMode.activeBattle, null);
  assert.equal(getCountryOwner(next, 'arg'), 'player-2');
});

test('fortification increases defense dice and continuing a battle rolls a fresh round', () => {
  const stateWithMoreAttackers = battleState({ attackers: 3, defenders: 1, fortified: true });
  const firstRound = conquerTerritory(stateWithMoreAttackers, 'arg', 'bra', 3, scriptedDice([0.999, 0.5, 0.5, 0]));
  assert.deepEqual(firstRound.missionMode.lastBattle.attackDice, [3, 3, 1]);
  assert.deepEqual(firstRound.missionMode.lastBattle.defenseDice, [6]);
  assert.ok(firstRound.missionMode.activeBattle, 'the first round leaves both forces alive');

  const secondRound = continueBattle(firstRound, scriptedDice([0, 0, 0.999]));
  assert.deepEqual(secondRound.missionMode.lastBattle.attackDice, [6, 6]);
  assert.deepEqual(secondRound.missionMode.lastBattle.defenseDice, [2]);
  assert.equal(secondRound.missionMode.lastBattle.won, true);
  assert.equal(getCountryOwner(secondRound, 'arg'), 'player-1');
});
