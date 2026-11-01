import test from 'node:test';
import assert from 'node:assert/strict';
import { DAYS_PER_MONTH, dayShare, getVaultDay } from '../src/core/vault_time.js';
import { advanceWastelandDay, advanceWastelandDays, advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';
import { advanceDay, createGameState, hydrateGameState } from '../src/core/game-state.js';
import { DOOR_OPENS_AT_MONTH } from '../src/core/endings.js';

function vaultState(extra = {}) {
  const base = transicionarParaWasteland(createGameState());
  const grid = base.shelter_grid.map((row) => row.slice());
  grid[1][0] = { type: 'elevator', floor: 1, column: 0, level: 1, operational: true };
  grid[1][1] = { type: 'generator', floor: 1, column: 1, level: 2, operational: true };
  grid[1][2] = { type: 'greenhouse', floor: 1, column: 2, level: 1, operational: true };
  const workers = [[1, 1], [1, 2]].map(([floor, column], index) => ({ id: `w-${index}`, name: 'Op', role: 'engineer', floor, column,
    workFloor: floor, workColumn: column, loyalty: 100, currentState: 'idle', needs: { satiety: 100, rest: 100, morale: 100 } }));
  return { ...base, inhabitants: [...base.inhabitants, ...workers], presidentClass: 'worker', president_selection_pending: false,
    wasteland_cinematic_pending: false, wasteland_cinematic_ready: false, shelter_grid: grid, scrap: 100,
    shelter_supplies: { weapons: 0, medkits: 0, food: 100, energy: 100, oxygen: 300 }, ...extra };
}

test('a monthly flow is split over 30 days without losing or inventing a single unit', () => {
  for (const amount of [0, 1, 7, 29, 30, 243, 1_000, -45, -3]) {
    let total = 0;
    for (let day = 1; day <= DAYS_PER_MONTH; day++) total += dayShare(amount, day);
    assert.equal(total, amount, `flow ${amount}`);
  }
  assert.equal(dayShare(90, 0), 90, 'without a day it is the whole month');
  assert.equal(dayShare(30, 5), 1);
});

test('a day moves resources a little and leaves the month, events and population alone', () => {
  const state = vaultState();
  const next = advanceWastelandDay(state, 0);
  assert.equal(next.wasteland_day, 1);
  assert.equal(next.wasteland_turn, state.wasteland_turn, 'the month has not closed');
  assert.equal(next.calendar.month, state.calendar.month);
  assert.equal(next.country.populacao_base, state.country.populacao_base);
  assert.equal(next.pendingBunkerEvent, state.pendingBunkerEvent);
  assert.match(next.notice, /Dia 1 de 30/);
  assert.equal(getVaultDay(next), getVaultDay(state) + 1);
  const month = advanceWastelandMonth(state, 0);
  assert.ok(Math.abs(next.shelter_supplies.energy - state.shelter_supplies.energy) < Math.abs(month.shelter_supplies.energy - state.shelter_supplies.energy) + 1,
    'one day moves energy far less than one month');
});

test('thirty days add up to the same resources as one month and then the month closes', () => {
  const state = vaultState();
  const month = advanceWastelandMonth(state, 0);
  let current = state;
  for (let day = 1; day < DAYS_PER_MONTH; day++) {
    current = advanceWastelandDay(current, 0);
    assert.equal(current.wasteland_turn, state.wasteland_turn, `day ${day} keeps the month open`);
    assert.equal(current.wasteland_day, day);
  }
  const closing = advanceWastelandDay(current, 0);
  assert.equal(closing.wasteland_turn, state.wasteland_turn + 1);
  assert.equal(closing.wasteland_day, 0);
  for (const key of ['food', 'energy', 'oxygen']) {
    assert.ok(Math.abs(closing.shelter_supplies[key] - month.shelter_supplies[key]) <= 1, `${key}: ${closing.shelter_supplies[key]} vs ${month.shelter_supplies[key]}`);
  }
  assert.ok(Math.abs(closing.scrap - month.scrap) <= 1);
  assert.equal(closing.calendar.month, month.calendar.month);
});

test('several days stop as soon as something needs the player', () => {
  const nearEnd = vaultState({ wasteland_turn: 2, wasteland_day: 27 });
  const stopped = advanceWastelandDays(nearEnd, 10, 0);
  assert.equal(stopped.wasteland_turn, 3, 'stopped right after the month closed');
  assert.equal(stopped.wasteland_day, 0);
  assert.ok(stopped.pendingBunkerEvent, 'a mission or council decision is waiting');
  assert.equal(advanceWastelandDays(vaultState(), 7, 0).wasteland_day, 7);
  const blocked = advanceWastelandDay({ ...vaultState(), pendingRaid: { faction: 'X', won: true } }, 0);
  assert.equal(blocked.wasteland_day, 0);
  assert.match(blocked.notice, /relatório do ataque/);
  const door = vaultState({ wasteland_turn: DOOR_OPENS_AT_MONTH, level: { xp: 4_000, level: 25, recent: [], skins: [] } });
  assert.match(advanceWastelandDay(door, 0).notice, /Decida o destino do Vault/);
});

test('the game state exposes advanceDay and keeps the day in the save', () => {
  const state = vaultState();
  assert.equal(advanceDay(state).wasteland_day, 1);
  assert.equal(advanceDay(state, 7).wasteland_day, 7);
  assert.equal(advanceDay({ ...state, wasteland_cinematic_ready: true }).wasteland_day, 0, 'take command first');
  const presidency = createGameState();
  assert.equal(advanceDay(presidency).calendar.month, 2, 'outside the Vault it is still a month');
  const loaded = hydrateGameState(JSON.stringify({ ...advanceDay(state, 12), version: createGameState().version }));
  assert.equal(loaded.wasteland_day, 12);
  assert.equal(hydrateGameState(JSON.stringify({ ...state, wasteland_day: 99, version: createGameState().version })).wasteland_day, 29);
  assert.equal(hydrateGameState(null).wasteland_day, 0);
});

test('the Vault screen offers only 1 and 3 days and shows the clock', async () => {
  const { bunkerView } = await import('../src/ui/dashboard.js');
  const html = bunkerView(vaultState({ wasteland_turn: 1, wasteland_day: 15 }));
  assert.match(html, /AVANÇAR 1 DIA/);
  assert.match(html, /data-action="advance-days" data-days="3"/);
  assert.match(html, /AVANÇAR 3 DIAS/);
  assert.doesNotMatch(html, /data-days="7"|data-days="30"|\+7 DIAS|\+30 DIAS/);
  assert.match(html, /DIA 45 · MÊS 2 DE 36/);
  assert.doesNotMatch(html, /AVANÇAR MÊS/);
});
