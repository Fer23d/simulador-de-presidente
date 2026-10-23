import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/game-state.js';
import { advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';
import { buildShelterRoom } from '../src/core/shelter_engine.js';
import { advanceMonthlyGameMechanics, arrestNPC, calculateSuppression, calculateSuppressedChance, detainRebel, dismissExpeditionReport, getWastelandEvent, releaseNPC, resolveWastelandEvent, startExpedition } from '../src/core/game_mechanics.js';
import { hydrateGameState } from '../src/core/game-state.js';
import { bunkerView, expeditionLogisticsView, expeditionReportView } from '../src/ui/dashboard.js';
import { advanceLootboxClick, collectExpeditionLoot, openExpeditionLootbox } from '../src/core/expeditions.js';

function wastelandState() {
  const base = createGameState('bra');
  const wasteland = transicionarParaWasteland(base);
  const shelterGrid = wasteland.shelter_grid.map((row) => [...row]);
  shelterGrid[0][4] = { id: 'life-support-0-4', type: 'life_support', floor: 0, column: 4, level: 1 };
  return {
    ...wasteland,
    randomSeed: 1,
    shelter_grid: shelterGrid,
    country: { ...wasteland.country, populacao: 1000, populacao_base: 1000 },
    shelter_supplies: { ...wasteland.shelter_supplies, food: 100, energy: 100 },
  };
}

test('starting an expedition marks one eligible inhabitant for three months', () => {
  const state = wastelandState();
  const npcId = state.inhabitants[0].id;
  const result = startExpedition(state, npcId);

  assert.equal(result.inhabitants[0].is_on_expedition, true);
  assert.equal(result.inhabitants[0].expedition_timer, 3);
  assert.equal(state.inhabitants[0].is_on_expedition, false);
});

test('a successful expedition returns after three turns and pauses for loot collection', () => {
  let state = startExpedition(wastelandState(), 'vault-resident-1');
  state = advanceWastelandMonth(state);
  state = advanceWastelandMonth(state);
  assert.equal(state.inhabitants[0].expedition_timer, 1);
  state = advanceWastelandMonth(state);

  assert.equal(state.inhabitants[0].is_on_expedition, false);
  assert.equal(state.inhabitants[0].expedition_timer, 0);
  assert.equal(state.scrap, 325);
  assert.equal(state.technology.points, 0);
  assert.equal(state.pendingLoot, true);
  assert.equal(state.currentLoot.length, 3);
  assert.equal(state.pendingExpeditionReports[0].success, true);
  assert.equal(advanceWastelandMonth(state).monthCounter, state.monthCounter);
  const eventResolved = resolveWastelandEvent(state, 'refuse-ration-cuts');
  let opened = openExpeditionLootbox(eventResolved);
  opened = advanceLootboxClick(opened, 1);
  opened = advanceLootboxClick(opened, 2);
  opened = advanceLootboxClick(opened, 3);
  opened = { ...opened, lootbox_cards_visible: true };
  const collected = collectExpeditionLoot(opened);
  assert.equal(collected.pendingLoot, false);
  assert.equal(collected.pendingExpeditionReports.length, 0);
  assert.equal(advanceWastelandMonth(collected).monthCounter, state.monthCounter + 1);
});

test('a failed expedition removes the explorer and records the lost signal notice', () => {
  let state = { ...startExpedition(wastelandState(), 'vault-resident-1'), randomSeed: 1198 };
  state = advanceWastelandMonth(advanceWastelandMonth(advanceWastelandMonth(state)));

  assert.equal(state.inhabitants.some((npc) => npc.id === 'vault-resident-1'), false);
  assert.match(state.notice, /SINAL DO EXPLORADOR FOI PERDIDO/);
  assert.equal(state.pendingExpeditionReports[0].success, false);
  assert.equal(state.pendingBunkerEvent?.id, 'ration-emergency');
});

test('event cadence skips greenhouse dilemmas until eligible and continues in catalog round-robin order', () => {
  let state = wastelandState();
  const nextDilemma = () => {
    for (let month = 0; month < 3; month++) state = advanceWastelandMonth(state);
    const eventId = state.pendingBunkerEvent?.id;
    assert.ok(eventId);
    const optionId = getWastelandEvent(eventId).options[1].id;
    state = resolveWastelandEvent(state, optionId);
    return eventId;
  };

  assert.deepEqual(Array.from({ length: 5 }, nextDilemma), [
    'ration-emergency', 'generator-bearings', 'air-filter-crisis', 'radio-signal-unknown', 'ration-emergency',
  ]);
  assert.equal(state.wastelandEventCursor, 1);

  assert.deepEqual(Array.from({ length: 3 }, nextDilemma), [
    'generator-bearings', 'air-filter-crisis', 'radio-signal-unknown',
  ]);
  state = buildShelterRoom({ ...state, scrap: 1000 }, 'greenhouse', 0, 2);
  assert.equal(nextDilemma(), 'greenhouse-fungus');
});

test('a failed expedition report and scheduled dilemma remain pending independently', () => {
  const base = wastelandState();
  let state = {
    ...base,
    wasteland_turn: 2,
    wastelandMonthCounter: 2,
    randomSeed: 1198,
    inhabitants: base.inhabitants.map((npc, index) => index === 0
      ? { ...npc, is_on_expedition: true, expedition_timer: 1 }
      : npc),
  };

  state = advanceWastelandMonth(state);
  assert.equal(state.pendingBunkerEvent?.id, 'ration-emergency');
  assert.equal(state.pendingExpeditionReports.length, 1);
  assert.equal(advanceWastelandMonth(state).monthCounter, state.monthCounter);
  const reportDismissed = dismissExpeditionReport(state);
  assert.equal(reportDismissed.pendingBunkerEvent?.id, 'ration-emergency');
  assert.equal(advanceWastelandMonth(reportDismissed).monthCounter, state.monthCounter);
  const dilemmaResolved = resolveWastelandEvent(reportDismissed, 'refuse-ration-cuts');
  assert.equal(dilemmaResolved.pendingExpeditionReports.length, 0);
  assert.equal(advanceWastelandMonth(dilemmaResolved).monthCounter, state.monthCounter + 1);
});

test('zero food or energy reduces loyalty gradually without an automatic rebellion', () => {
  const prepared = wastelandState();
  const state = {
    ...prepared,
    shelter_grid: prepared.shelter_grid.map((row, floor) => row.map((room, column) => floor === 0 && column === 2
      ? { id: 'test-life-support', type: 'life_support', floor, column, level: 5 }
      : room)),
    shelter_supplies: { ...prepared.shelter_supplies, food: 0, energy: 0 },
    inhabitants: prepared.inhabitants.map((npc) => ({ ...npc, loyalty: 30 })),
  };
  const result = advanceWastelandMonth(state);

  assert.equal(result.inhabitants[0].loyalty, 20);
  assert.notEqual(result.inhabitants[0].currentState, 'rebel');
  assert.equal(result.scrap, state.scrap + 25);
});

test('three operational generators prevent nighttime rebellion and sabotage odds from doubling', () => {
  const base = {
    randomSeed: 1,
    isNight: true,
    scrap: 100,
    shelter_supplies: { food: 100, energy: 100 },
    inhabitants: [{ id: 'resident-1', loyalty: 0, currentState: 'idle', rebellionCheckDone: false }],
  };
  const withTwo = advanceMonthlyGameMechanics({ ...base, shelter_grid: [[
    { type: 'generator', level: 1 }, { type: 'generator', level: 1 },
  ]] });
  const withThree = advanceMonthlyGameMechanics({ ...base, shelter_grid: [[
    { type: 'generator', level: 1 }, { type: 'generator', level: 1 }, { type: 'generator', level: 1 },
  ]] });

  assert.equal(withTwo.inhabitants[0].currentState, 'rebel');
  assert.equal(withThree.inhabitants[0].currentState, 'idle');
});

test('soldiers and arsenal guards suppress bunker conflict and soften morale loss', () => {
  const prepared = wastelandState();
  const residents = prepared.inhabitants.map((npc, index) => ({
    ...npc,
    loyalty: index === 0 ? 50 : 100,
  }));
  const state = {
    ...prepared,
    shelter_guards: 1,
    shelter_supplies: { ...prepared.shelter_supplies, food: 0 },
    inhabitants: [
      ...residents,
      { id: 'military-vip', role: 'guard', isVIP: true, loyalty: 100, currentState: 'idle' },
    ],
  };

  const suppression = calculateSuppression(state);
  const result = advanceMonthlyGameMechanics(state);

  assert.deepEqual(suppression, { totalSoldiers: 2, suppressionFactor: 0.2, percent: 20 });
  assert.equal(result.inhabitants.find((npc) => npc.id === residents[0].id).loyalty, 42);
  assert.equal(calculateSuppressedChance(0.3, 0.3), 0);
  assert.ok(Math.abs(calculateSuppressedChance(0.3, 0.1) - 0.2) < 1e-9);
});

test('soldier suppression reduces rebellion odds after the nighttime modifier', () => {
  const base = {
    randomSeed: 1,
    isNight: true,
    scrap: 100,
    shelter_supplies: { food: 100, energy: 100 },
    inhabitants: [{ id: 'resident-1', loyalty: 0, currentState: 'idle', rebellionCheckDone: false }],
  };
  const result = advanceMonthlyGameMechanics({ ...base, shelter_guards: 2 });

  assert.equal(result.inhabitants[0].currentState, 'idle');
});

test('a dialogue pacification lowers the rebellion roll chance used by the monthly engine', () => {
  const base = {
    randomSeed: 1,
    scrap: 100,
    shelter_supplies: { food: 100, energy: 100 },
    inhabitants: [{ id: 'resident-1', loyalty: 0, revoltChance: 0, currentState: 'idle', rebellionCheckDone: false }],
  };
  const result = advanceMonthlyGameMechanics(base);
  assert.equal(result.inhabitants[0].currentState, 'idle');
  assert.equal(result.inhabitants[0].rebellionCheckDone, true);
});

test('a rebel can be detained only after building a detention cell and then stops sabotaging', () => {
  const prepared = wastelandState();
  const rebelState = {
    ...prepared,
    inhabitants: prepared.inhabitants.map((npc, index) => index === 0 ? { ...npc, loyalty: 0, currentState: 'rebel' } : npc),
  };
  assert.match(detainRebel(rebelState, 'vault-resident-1').notice, /cela de detencao/i);

  const withCell = buildShelterRoom(rebelState, 'detention', 0, 2);
  const detained = detainRebel(withCell, 'vault-resident-1');
  const prisoner = detained.inhabitants.find((npc) => npc.id === 'vault-resident-1');
  const nextMonth = advanceWastelandMonth(detained);

  assert.equal(prisoner.is_prisoner, true);
  assert.equal(prisoner.currentState, 'idle');
  assert.equal(prisoner.floor, 0);
  assert.equal(prisoner.column, 2);
  assert.equal(nextMonth.scrap, detained.scrap + 25);
});

test('arrest remembers the workplace and frees its production assignment', () => {
  let state = { ...wastelandState(), scrap: 1_000 };
  state = buildShelterRoom(state, 'generator', 0, 2);
  state = buildShelterRoom(state, 'detention', 0, 3);
  const generator = state.shelter_grid[0][2];
  const detainee = state.inhabitants.find((npc) => npc.id === 'worker-0-2');
  state = { ...state, inhabitants: state.inhabitants.map((npc) => npc.id === detainee.id
    ? { ...npc, currentState: 'rebel' } : npc) };

  const arrested = arrestNPC(state, detainee.id);
  const prisoner = arrested.inhabitants.find((npc) => npc.id === detainee.id);

  assert.equal(prisoner.previousRoomId, generator.id);
  assert.equal(prisoner.currentRoomId, arrested.shelter_grid[0][3].id);
  assert.equal(prisoner.workFloor, null);
  assert.equal(prisoner.workColumn, null);
  assert.equal(prisoner.state, 'imprisoned');
});

test('replacing a cell occupant releases the old prisoner back to their available workplace', () => {
  let state = { ...wastelandState(), scrap: 1_000 };
  state = buildShelterRoom(state, 'generator', 0, 2);
  state = buildShelterRoom(state, 'greenhouse', 0, 3);
  state = buildShelterRoom(state, 'detention', 0, 5);
  const first = state.inhabitants.find((npc) => npc.id === 'worker-0-2');
  const second = state.inhabitants.find((npc) => npc.id === 'worker-0-3');
  state = { ...state, inhabitants: state.inhabitants.map((npc) => [first.id, second.id].includes(npc.id)
    ? { ...npc, currentState: 'rebel' } : npc) };

  state = arrestNPC(state, first.id);
  state = arrestNPC(state, second.id);
  const released = state.inhabitants.find((npc) => npc.id === first.id);
  const imprisoned = state.inhabitants.find((npc) => npc.id === second.id);

  assert.equal(released.is_prisoner, false);
  assert.equal(released.state, 'working');
  assert.equal(released.currentRoomId, state.shelter_grid[0][2].id);
  assert.equal(released.workFloor, 0);
  assert.equal(released.workColumn, 2);
  assert.equal(imprisoned.is_prisoner, true);
  assert.equal(imprisoned.currentRoomId, state.shelter_grid[0][5].id);
});

test('released prisoner goes idle in the dormitory when their previous workplace is full', () => {
  let state = { ...wastelandState(), scrap: 1_000 };
  state = buildShelterRoom(state, 'generator', 0, 2);
  state = buildShelterRoom(state, 'dormitory', 0, 3);
  state = buildShelterRoom(state, 'detention', 0, 5);
  const worker = state.inhabitants.find((npc) => npc.id === 'worker-0-2');
  state = { ...state, inhabitants: state.inhabitants.map((npc) => npc.id === worker.id
    ? { ...npc, currentState: 'rebel' } : npc) };
  state = arrestNPC(state, worker.id);
  const extraWorker = { ...worker, id: 'extra-generator-worker', state: 'working', currentRoomId: state.shelter_grid[0][2].id,
    workFloor: 0, workColumn: 2, is_prisoner: false };
  state = { ...state, inhabitants: [...state.inhabitants, extraWorker] };

  const releasedState = releaseNPC(state, worker.id);
  const released = releasedState.inhabitants.find((npc) => npc.id === worker.id);

  assert.equal(released.is_prisoner, false);
  assert.equal(released.state, 'idle');
  assert.equal(released.currentState, 'idle');
  assert.equal(released.currentRoomId, releasedState.shelter_grid[0][3].id);
  assert.equal(released.workFloor, null);
  assert.equal(released.workColumn, null);
});

test('prisoner workplace memory survives save hydration and can be restored after loading', () => {
  let state = { ...wastelandState(), scrap: 1_000 };
  state = buildShelterRoom(state, 'generator', 0, 2);
  state = buildShelterRoom(state, 'detention', 0, 3);
  const worker = state.inhabitants.find((npc) => npc.id === 'worker-0-2');
  state = { ...state, inhabitants: state.inhabitants.map((npc) => npc.id === worker.id
    ? { ...npc, currentState: 'rebel' } : npc) };
  const prisonerState = arrestNPC(state, worker.id);
  const restoredSave = hydrateGameState(JSON.stringify(prisonerState));

  assert.equal(restoredSave.inhabitants.find((npc) => npc.id === worker.id).previousRoomId, 'generator-0-2');
  assert.equal(restoredSave.inhabitants.find((npc) => npc.id === worker.id).currentRoomId, 'detention-0-3');
  const releasedState = releaseNPC(restoredSave, worker.id);
  const released = releasedState.inhabitants.find((npc) => npc.id === worker.id);
  assert.equal(released.currentRoomId, 'generator-0-2');
  assert.equal(released.workFloor, 0);
  assert.equal(released.workColumn, 2);
});

test('wasteland supplies, rebel status, active expeditions, and reports survive save hydration', () => {
  const state = wastelandState();
  const expedition = startExpedition(state, 'vault-resident-1');
  const save = {
    ...expedition,
    shelter_grid: buildShelterRoom(state, 'detention', 0, 2).shelter_grid,
    shelter_supplies: { ...state.shelter_supplies, food: 7, energy: 4 },
    pendingExpeditionReports: [{ id: 'report-1', inhabitantId: 'vault-engineer-1', success: true }],
    inhabitants: expedition.inhabitants.map((npc) => npc.id === 'vault-engineer-1' ? { ...npc, loyalty: 0, currentState: 'rebel' } : npc),
  };
  const restored = hydrateGameState(JSON.stringify(save));

  assert.equal(restored.shelter_supplies.food, 7);
  assert.equal(restored.shelter_supplies.energy, 4);
  assert.equal(restored.inhabitants[0].is_on_expedition, true);
  assert.equal(restored.inhabitants[1].currentState, 'rebel');
  assert.equal(restored.shelter_grid[0][2].type, 'detention');
  assert.equal(restored.pendingExpeditionReports[0].id, 'report-1');
  assert.equal(restored.version, 22);
});

test('bunker UI exposes food, energy, expedition logistics, and a blocking mission report', () => {
  const state = { ...wastelandState(), president_selection_pending: false, presidentClass: 'worker',
    pendingExpeditionReports: [{ id: 'report-1', inhabitantId: 'vault-resident-1', success: false }] };
  const markup = bunkerView(state);
  const logistics = expeditionLogisticsView(state);
  const report = expeditionReportView(state);

  assert.match(markup, /COMIDA/);
  assert.match(markup, /ENERGIA/);
  assert.match(markup, /data-action="advance" disabled/);
  assert.match(logistics, /data-action="start-expedition"/);
  assert.match(report, /SINAL DE vault-resident-1 FOI PERDIDO/);
  assert.match(report, /data-action="dismiss-expedition-report"/);
});

test('a failed fungal cure quarantines the greenhouse and lowers loyalty without going below zero', () => {
  let state = wastelandState();
  state = buildShelterRoom(state, 'greenhouse', 0, 2);
  state = {
    ...state,
    randomSeed: 1198,
    shelter_supplies: { ...state.shelter_supplies, energy: 100 },
    pendingBunkerEvent: { id: 'greenhouse-fungus' },
    inhabitants: state.inhabitants.map((npc, index) => ({ ...npc, loyalty: index === 0 ? 5 : 40 })),
  };

  const result = resolveWastelandEvent(state, 'attempt-cure');
  const greenhouse = result.shelter_grid.flat().find((room) => room?.type === 'greenhouse');
  assert.equal(result.shelter_supplies.energy, 20);
  assert.equal(greenhouse.disabledMonthsRemaining, 3);
  assert.equal(result.inhabitants[0].loyalty, 0);
  assert.ok(result.inhabitants.every((npc, index) => npc.loyalty === (index === 0 ? 0 : 30)));
  assert.notEqual(result.randomSeed, state.randomSeed);
  assert.equal(result.pendingBunkerEvent, null);
});

test('unknown Wasteland events and options leave resources and pending decisions unchanged', () => {
  const original = { ...wastelandState(), pendingBunkerEvent: { id: 'ration-emergency' } };
  const resources = { scrap: original.scrap, supplies: original.shelter_supplies, seed: original.randomSeed };

  const unknownEvent = resolveWastelandEvent({ ...original, pendingBunkerEvent: { id: 'unknown-event' } }, 'unknown-option');
  assert.deepEqual({ scrap: unknownEvent.scrap, supplies: unknownEvent.shelter_supplies, seed: unknownEvent.randomSeed }, resources);
  assert.deepEqual(unknownEvent.pendingBunkerEvent, { id: 'unknown-event' });

  const unknownOption = resolveWastelandEvent(original, 'unknown-option');
  assert.deepEqual({ scrap: unknownOption.scrap, supplies: unknownOption.shelter_supplies, seed: unknownOption.randomSeed }, resources);
  assert.deepEqual(unknownOption.pendingBunkerEvent, original.pendingBunkerEvent);
});
