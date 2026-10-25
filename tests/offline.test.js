import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOfflineProgress, dismissOfflineReport, OFFLINE_MAX_MS, OFFLINE_MIN_MS } from '../src/core/offline.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { transicionarParaWasteland } from '../src/core/wasteland.js';
import { buildShelterRoom } from '../src/core/shelter_engine.js';
import { offlineReportView } from '../src/ui/dashboard.js';

const HOUR = 3_600_000;

function vault() {
  let state = transicionarParaWasteland(createGameState('bra'));
  state = { ...state, scrap: 2_000, president_selection_pending: false, wasteland_cinematic_pending: false,
    wasteland_cinematic_ready: false };
  state = buildShelterRoom(state, 'greenhouse', 0, 2);
  return { ...state, lastSeenAt: 1_000_000 };
}

test('short absences only refresh the timestamp', () => {
  const state = vault();
  const next = applyOfflineProgress(state, state.lastSeenAt + OFFLINE_MIN_MS - 1);
  assert.equal(next.pendingOfflineReport, undefined);
  assert.equal(next.lastSeenAt, state.lastSeenAt + OFFLINE_MIN_MS - 1);
  assert.equal(next.shelter_supplies, state.shelter_supplies);
});

test('the presidential phase and the class selection never simulate offline time', () => {
  const president = { ...createGameState('bra'), lastSeenAt: 1 };
  assert.equal(applyOfflineProgress(president, 5 * HOUR).pendingOfflineReport, undefined);
  const selecting = { ...vault(), president_selection_pending: true };
  assert.equal(applyOfflineProgress(selecting, selecting.lastSeenAt + 5 * HOUR).pendingOfflineReport, undefined);
});

test('hours away produce resources, advance days and weather, and write a report', () => {
  const state = vault();
  const next = applyOfflineProgress(state, state.lastSeenAt + 4 * HOUR);
  const report = next.pendingOfflineReport;
  assert.ok(next.shelter_supplies.food > state.shelter_supplies.food);
  assert.ok(report.resources.some((item) => item.key === 'food' && item.delta > 0));
  assert.equal(report.daysPassed, 24);
  assert.equal(next.currentDay, state.currentDay + 24);
  assert.ok(report.storms.length > 0);
  assert.notDeepEqual(next.weather, state.weather);
  assert.ok(next.inhabitants.some((npc, index) => npc.needs !== state.inhabitants[index].needs));
});

test('nothing grave happens offline: no events, deaths, expeditions or rebellions', () => {
  const state = vault();
  const next = applyOfflineProgress(state, state.lastSeenAt + 8 * HOUR);
  assert.equal(next.inhabitants.length, state.inhabitants.length);
  assert.equal(next.pendingBunkerEvent, state.pendingBunkerEvent);
  assert.equal(next.pendingLoot, state.pendingLoot);
  assert.equal(next.wasteland_turn, state.wasteland_turn);
  assert.ok(next.inhabitants.every((npc) => npc.currentState !== 'rebel'));
});

test('absences are capped at eight hours and pending decisions are counted', () => {
  const state = { ...vault(), pendingBunkerEvent: { id: 'radio-signal' } };
  const capped = applyOfflineProgress(state, state.lastSeenAt + 30 * HOUR);
  const eightHours = applyOfflineProgress(state, state.lastSeenAt + OFFLINE_MAX_MS);
  assert.equal(capped.pendingOfflineReport.capped, true);
  assert.equal(capped.pendingOfflineReport.simulatedMs, OFFLINE_MAX_MS);
  assert.deepEqual(capped.shelter_supplies, eightHours.shelter_supplies);
  assert.equal(capped.pendingOfflineReport.pendingDecisions, 1);
});

test('the report renders, survives the save and can be dismissed', () => {
  const state = vault();
  const next = applyOfflineProgress(state, state.lastSeenAt + 3 * HOUR + 12 * 60_000);
  const view = offlineReportView(next);
  assert.match(view, /ENQUANTO VOCÊ ESTAVA FORA · 3h12/);
  assert.match(view, /COMIDA/);
  assert.match(view, /dismiss-offline-report/);
  const restored = hydrateGameState(JSON.stringify(next));
  assert.deepEqual(restored.pendingOfflineReport, next.pendingOfflineReport);
  assert.equal(restored.lastSeenAt, next.lastSeenAt);
  assert.equal(dismissOfflineReport(next).pendingOfflineReport, undefined);
  assert.equal(offlineReportView(dismissOfflineReport(next)), '');
});
