import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';
import { resolveWastelandEvent } from '../src/core/game_mechanics.js';
import { buildShelterRoom, repairShelterGenerator } from '../src/core/shelter_engine.js';
import { bunkerEventView, bunkerView } from '../src/ui/dashboard.js';

function makeWastelandState() {
  const state = transicionarParaWasteland(createGameState('bra'));
  return {
    ...state,
    randomSeed: 1,
    country: { ...state.country, populacao: 1000, populacao_base: 1000 },
    shelter_supplies: { ...state.shelter_supplies, food: 100, energy: 100 },
  };
}

function addProductionRooms(state) {
  state = { ...state, scrap: 1000 };
  state = buildShelterRoom(state, 'greenhouse', 0, 2);
  state = buildShelterRoom(state, 'generator', 0, 3);
  return repairShelterGenerator(state, 0, 3);
}

test('low morale halves assigned greenhouse and generator output while inhabitants keep working', () => {
  let state = addProductionRooms(makeWastelandState());
  state = {
    ...state,
    inhabitants: state.inhabitants.map((npc) => ['worker-0-2', 'worker-0-3'].includes(npc.id)
      ? { ...npc, loyalty: 30 }
      : npc),
  };

  const next = advanceWastelandMonth(state);
  assert.equal(next.shelter_supplies.food, 103);
  assert.equal(next.shelter_supplies.energy, 103);
  assert.equal(next.inhabitants.find((npc) => npc.id === 'worker-0-2').currentState, 'idle');
  assert.equal(next.inhabitants.find((npc) => npc.id === 'worker-0-2').loyalty, 30);
});

test('resource shortages reduce loyalty by ten and reaching zero only rebels after a one-time 20 percent roll', () => {
  const state = {
    ...makeWastelandState(),
    shelter_supplies: { food: 0, energy: 0 },
    inhabitants: makeWastelandState().inhabitants.map((npc, index) => ({ ...npc, loyalty: index ? 30 : 20 })),
  };

  const result = advanceWastelandMonth(state);
  assert.equal(result.inhabitants[0].loyalty, 10);
  assert.equal(result.inhabitants[0].currentState, 'idle');
  assert.equal(result.inhabitants[1].loyalty, 20);

  const atZero = advanceWastelandMonth({
    ...state,
    randomSeed: 1,
    inhabitants: state.inhabitants.map((npc, index) => ({ ...npc, loyalty: index ? 30 : 10 })),
  });
  assert.equal(atZero.inhabitants[0].loyalty, 0);
  assert.notEqual(atZero.inhabitants[0].currentState, 'rebel');
  assert.equal(atZero.inhabitants[0].rebellionCheckDone, true);
});

test('the single rebellion roll is 20 percent and a rebel only damages five scrap per month', () => {
  const prepared = makeWastelandState();
  const target = { ...prepared.inhabitants[0], loyalty: 10 };
  const others = prepared.inhabitants.slice(1).map((npc) => ({ ...npc, loyalty: 80 }));
  const rebel = advanceWastelandMonth({ ...prepared, randomSeed: 1972,
    shelter_supplies: { food: 0, energy: 0 }, inhabitants: [target, ...others] });
  assert.equal(rebel.inhabitants[0].currentState, 'rebel');
  assert.equal(rebel.scrap, prepared.scrap + 25 - 5);

  const next = advanceWastelandMonth({
    ...rebel,
    pendingExpeditionReports: [],
    shelter_supplies: { food: 100, energy: 100 },
  });
  assert.equal(next.scrap, rebel.scrap + 25 - 5);
});

test('every third Wasteland month blocks further advancement until the dilemma is resolved', () => {
  let state = makeWastelandState();
  state = advanceWastelandMonth(state);
  state = advanceWastelandMonth(state);
  state = advanceWastelandMonth(state);

  assert.equal(state.wastelandMonthCounter, 3);
  assert.equal(state.pendingBunkerEvent?.id, 'ration-emergency');
  assert.equal(advanceWastelandMonth(state).monthCounter, state.monthCounter);
  assert.match(bunkerView(state), /data-action="advance" disabled/);
  assert.match(bunkerEventView(state), /A Ração de Emergência/);
});

test('dilemma choices apply their effects, clear the pause, and survive save hydration while pending', () => {
  const base = makeWastelandState();
  const waiting = {
    ...base,
    wastelandMonthCounter: 6,
    pendingBunkerEvent: { id: 'ration-emergency' },
    shelter_supplies: { ...base.shelter_supplies, food: 10 },
  };
  const supported = resolveWastelandEvent(waiting, 'support-scientists');
  assert.equal(supported.shelter_supplies.food, 210);
  assert.ok(supported.inhabitants.every((npc) => npc.loyalty === 80));
  assert.equal(supported.pendingBunkerEvent, null);

  const refused = resolveWastelandEvent(waiting, 'refuse-ration-cuts');
  assert.equal(refused.shelter_supplies.food, 10);
  assert.ok(refused.inhabitants.every((npc) => npc.loyalty === 100));
  assert.equal(refused.pendingBunkerEvent, null);

  const restored = hydrateGameState(JSON.stringify({ ...waiting, version: 18 }));
  assert.deepEqual(restored.pendingBunkerEvent, { id: 'ration-emergency' });
  assert.equal(restored.wastelandMonthCounter, 6);
});
