import test from 'node:test';
import assert from 'node:assert/strict';
import { adoptLayd, hasLayd, isLaydVisible } from '../src/core/companion.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { transicionarParaWasteland, advanceWastelandMonth } from '../src/core/wasteland.js';
import { resolveWastelandEvent, getWastelandEvent } from '../src/core/game_mechanics.js';
import { advanceLaydEscape, applyVaccine, advanceLaydMonth, buyRation, canApplyVaccine, divertFood, DOSES_NEEDED, getLaydStatus, resolveLaydDiscovery,
  SICK_AFTER_MONTHS, SUSPICION_LIMIT, toggleHideLayd } from '../src/core/layd_care.js';
import { ENDINGS, getEndingStory } from '../src/core/endings.js';
import { SHELTER_TYPES } from '../src/core/shelter_engine.js';
import { laydCareView, laydDiscoveryView, doorView } from '../src/ui/dashboard.js';
import { INITIAL_RATION, RATION_SCRAP_COST, SYNTHETIC_VACCINE_SCRAP_COST } from '../src/core/layd_care.js';

function vault(extra = {}) {
  const base = transicionarParaWasteland(createGameState());
  const loyal = (base.inhabitants ?? []).map((npc) => ({ ...npc, loyalty: 80 }));
  const adopted = adoptLayd({ ...base, inhabitants: loyal, wasteland_turn: 2, scrap: 500,
    shelter_supplies: { ...base.shelter_supplies, food: 100, medkits: 5 }, ...extra });
  return { ...adopted, pendingStory: false, currentStory: null };
}
const withCare = (state, patch) => ({ ...state, companion: { ...state.companion, ...patch } });

test('Layd arrives healthy with food, and the care data survives the save', () => {
  const state = vault();
  assert.equal(state.companion.ration, INITIAL_RATION);
  assert.equal(state.companion.health, 100);
  assert.equal(state.companion.sick, false);
  assert.equal(adoptLayd(state), state);
  const sick = withCare(state, { sick: true, doses: 2, vaccines: 1, suspicion: 33, hidden: true, health: 55 });
  const loaded = hydrateGameState(JSON.stringify({ ...sick, version: createGameState().version }));
  assert.deepEqual({ ...loaded.companion }, { ...sick.companion, bond: 0 });
});

test('each month Layd eats a ration and goes hungry when it runs out', () => {
  let state = vault();
  state = advanceLaydMonth({ ...state, wasteland_turn: 3 });
  assert.equal(state.companion.ration, INITIAL_RATION - 1);
  const hungry = advanceLaydMonth({ ...withCare(vault(), { ration: 0, health: 80 }), wasteland_turn: 3 });
  assert.ok(hungry.companion.health < 80);
  assert.match(hungry.notice, /fome/);
});

test('after a year Layd shows symptoms, which tell a story and worsen without doses', () => {
  const state = vault();
  const turn = state.companion.since + SICK_AFTER_MONTHS;
  const before = advanceLaydMonth({ ...state, wasteland_turn: turn - 1 });
  assert.equal(before.companion.sick, false);
  const onset = advanceLaydMonth({ ...withCare(state, { ration: 6 }), wasteland_turn: turn });
  assert.equal(onset.companion.sick, true);
  assert.equal(onset.currentStory, 'layd_sick');
  const worse = advanceLaydMonth({ ...onset, pendingStory: false, wasteland_turn: turn + 1 });
  assert.ok(worse.companion.health < onset.companion.health);
  assert.equal(getLaydStatus(worse).phase, 'sick');
});

test('a sick Layd without vaccines opens a laboratory mission, which lets the player pick between her and the Vault', () => {
  const sick = withCare(vault(), { sick: true, ration: 8, health: 70, lastMissionTurn: -1 });
  const month = advanceLaydMonth({ ...sick, wasteland_turn: 20 });
  assert.equal(month.pendingBunkerEvent.id, 'layd-vaccine');
  assert.ok(Number.isInteger(month.pendingBunkerEvent.floor));
  const event = getWastelandEvent('layd-vaccine');
  assert.equal(event.options.length, 3);
  const arrived = { ...month, pendingBunkerEvent: { ...month.pendingBunkerEvent, arrived: true } };
  const diverted = resolveWastelandEvent(arrived, 'divert-vaccine');
  assert.equal(diverted.companion.vaccines, 1);
  assert.ok(diverted.companion.suspicion > month.companion.suspicion);
  assert.ok(diverted.inhabitants[0].loyalty < arrived.inhabitants[0].loyalty, 'the Vault trusts you less');
  assert.equal(diverted.companion.choices.layd, 1);
  const delivered = resolveWastelandEvent(arrived, 'deliver-vaccine');
  assert.equal(delivered.companion.vaccines, 0);
  assert.ok(delivered.companion.health < month.companion.health, 'Layd pays for the Vault getting the dose');
  assert.ok(delivered.inhabitants[0].loyalty > arrived.inhabitants[0].loyalty);
  assert.equal(delivered.companion.choices.vault, 1);
  const crafted = resolveWastelandEvent(arrived, 'craft-vaccine');
  assert.equal(crafted.scrap, arrived.scrap - SYNTHETIC_VACCINE_SCRAP_COST + 25 + 10 * arrived.pendingBunkerEvent.floor, 'synthesising costs scrap (plus the mission reward)');
  assert.equal(crafted.companion.vaccines, 1);
});

test('the ration mission can also be solved by diverting food from the Vault', () => {
  const state = withCare(vault(), { ration: 0, lastMissionTurn: -1 });
  const month = advanceLaydMonth({ ...state, wasteland_turn: 5 });
  assert.equal(month.pendingBunkerEvent.id, 'layd-ration');
  const arrived = { ...month, pendingBunkerEvent: { ...month.pendingBunkerEvent, arrived: true } };
  const taken = resolveWastelandEvent(arrived, 'divert-ration');
  assert.equal(taken.companion.ration, 4);
  assert.equal(taken.shelter_supplies.food, arrived.shelter_supplies.food - 20);
  assert.ok(taken.companion.suspicion > 0);
});

test('the vaccine needs the treatment room, a sick and visible Layd, a dose and scrap, and cures her after four doses', () => {
  let state = withCare(vault(), { sick: true, vaccines: 4, health: 50 });
  assert.equal(canApplyVaccine(state, false).ok, false);
  assert.match(canApplyVaccine(state, false).reason, /Sala de Tratamento/);
  assert.equal(canApplyVaccine(withCare(state, { hidden: true }), true).ok, false);
  assert.equal(canApplyVaccine(withCare(state, { vaccines: 0 }), true).ok, false);
  assert.equal(canApplyVaccine({ ...state, scrap: 0 }, true).ok, false);
  for (let dose = 1; dose <= DOSES_NEEDED; dose++) {
    state = applyVaccine({ ...state, wasteland_turn: 10 + dose }, true);
    assert.equal(state.companion.doses, dose);
  }
  assert.equal(state.companion.cured, true);
  assert.equal(state.companion.sick, false);
  assert.equal(state.companion.health, 100);
  assert.equal(state.currentStory, 'layd_cured');
  assert.equal(canApplyVaccine({ ...withCare(state, { sick: true, cured: false, doses: 1 }), wasteland_turn: 14 }, true).ok, false, 'one dose per month');
});

test('buying and diverting rations, and hiding Layd, change her needs and the suspicion', () => {
  const state = vault();
  const bought = buyRation(state);
  assert.equal(bought.companion.ration, state.companion.ration + 3);
  assert.equal(bought.scrap, state.scrap - RATION_SCRAP_COST);
  assert.equal(buyRation({ ...state, scrap: 1 }).companion.ration, state.companion.ration);
  const diverted = divertFood(state);
  assert.equal(diverted.shelter_supplies.food, 85);
  assert.ok(diverted.companion.suspicion > 0);
  assert.ok(diverted.inhabitants[0].loyalty < state.inhabitants[0].loyalty);
  const hidden = toggleHideLayd(state);
  assert.equal(isLaydVisible(hidden), false);
  assert.equal(hasLayd(hidden), true);
  assert.equal(isLaydVisible(toggleHideLayd(hidden)), true);
});

test('hiding her slows the suspicion, but it never stops growing while she is sick', () => {
  const sick = { ...withCare(vault(), { sick: true, ration: 9, health: 90, lastDoseTurn: 5, vaccines: 1, lastMissionTurn: 5 }), wasteland_turn: 6 };
  const open = advanceLaydMonth(sick);
  const hidden = advanceLaydMonth(withCare(sick, { hidden: true }));
  assert.ok(hidden.companion.suspicion > 0);
  assert.ok(open.companion.suspicion > hidden.companion.suspicion);
});

test('when the Vault finds out the player can flee through the Door or hand Layd over', () => {
  const near = withCare(vault(), { sick: true, ration: 9, health: 90, suspicion: SUSPICION_LIMIT - 1, lastDoseTurn: 6, lastMissionTurn: 6 });
  const found = advanceLaydMonth({ ...near, wasteland_turn: 7 });
  assert.equal(found.pendingLaydDiscovery, true);
  assert.match(laydDiscoveryView(found), /PEGAR LAYD E FUGIR PELA PORTA/);
  assert.match(doorView(found), /ELES SABEM/);
  const month = advanceWastelandMonth(found);
  assert.equal(month.wasteland_turn, found.wasteland_turn, 'time stops until the player decides');
  const fled = resolveLaydDiscovery(found, 'flee');
  assert.equal(fled.pendingLaydDiscovery, false);
  assert.equal(fled.ending ?? null, null, 'the flight is not instant: the player has to walk it');
  assert.equal(fled.layd_escape.stage, 'fetch');
  assert.equal(isLaydVisible(fled), false, 'Layd is still hidden in the suite');
  assert.equal(advanceWastelandMonth(fled).wasteland_turn, fled.wasteland_turn, 'no time passes during the escape');
  assert.match(doorView(fled), /^$/, 'the discovery modal is gone');
  const wrongRoom = advanceLaydEscape(fled, { type: 'laboratory' });
  assert.equal(wrongRoom.layd_escape.stage, 'fetch');
  const picked = advanceLaydEscape(fled, { type: 'presidential_suite' });
  assert.equal(picked.layd_escape.stage, 'run');
  assert.equal(isLaydVisible(picked), true, 'Layd follows the player now');
  const alone = advanceLaydEscape(picked, { type: 'vault' }, { dogNear: false });
  assert.equal(alone.layd_escape.stage, 'run', 'the Door will not open without her');
  assert.match(alone.notice, /Layd ainda não chegou/);
  const done = advanceLaydEscape(picked, { type: 'vault' }, { dogNear: true });
  assert.equal(done.ending.id, 'layd_flight');
  assert.equal(done.layd_escape, null);
  assert.match(getEndingStory(done, 'layd_flight'), /Layd/);
  const loaded = hydrateGameState(JSON.stringify({ ...picked, version: createGameState().version }));
  assert.equal(loaded.layd_escape.stage, 'run', 'the escape survives the save');
  assert.equal(ENDINGS.layd_flight.forced, true);
  const surrendered = resolveLaydDiscovery(found, 'surrender');
  assert.ok(!surrendered.ending);
  assert.equal(hasLayd(surrendered), false);
  assert.ok(surrendered.inhabitants[0].loyalty > found.inhabitants[0].loyalty);
  assert.equal(advanceLaydMonth(surrendered), surrendered, 'she is gone');
});

test('Layd dies if her health reaches zero', () => {
  const dying = withCare(vault(), { sick: true, ration: 0, health: 4, lastMissionTurn: 20 });
  const dead = advanceLaydMonth({ ...dying, wasteland_turn: 21 });
  assert.equal(dead.companion.status, 'dead');
  assert.equal(hasLayd(dead), false);
  assert.equal(dead.currentStory, 'layd_dead');
});

test('the radiation treatment room exists and the care panel shows the numbers', () => {
  assert.equal(SHELTER_TYPES.radiation_clinic.name, 'Sala de Tratamento de Radiação');
  const sick = withCare(vault(), { sick: true, vaccines: 1, suspicion: 75 });
  const view = laydCareView(sick, true);
  assert.match(view, /APLICAR VACINA/);
  assert.match(view, /DESCONFIANÇA DO VAULT/);
  assert.match(view, /is-danger/);
  assert.match(laydCareView(sick, false), /só na Sala de Tratamento/);
  assert.equal(laydCareView({ ...sick, companion: { ...sick.companion, status: 'dead' } }, true), '');
});

test('the flight ending changes with how Layd and the Vault are doing', () => {
  const flee = (care, loyalty) => {
    const state = vault();
    const inhabitants = state.inhabitants.map((npc) => ({ ...npc, loyalty }));
    return getEndingStory({ ...withCare(state, care), inhabitants, ending: { id: 'layd_flight', month: 30 } }, 'layd_flight');
  };
  const cured = flee({ cured: true, health: 100 }, 80);
  const dying = flee({ sick: true, health: 20 }, 10);
  const sick = flee({ sick: true, health: 60 }, 45);
  assert.match(cured, /curada/);
  assert.match(cured, /porta aberta/);
  assert.match(dying, /não tinha mais força/);
  assert.match(dying, /Ninguém mencionou seu nome/);
  assert.match(sick, /dias, não anos/);
  assert.match(sick, /lata de ração com o nome dela/);
  assert.doesNotMatch(cured + dying + sick, /\{layd\}|\{vault\}|\{leader\}/);
  assert.notEqual(cured, dying);
});
