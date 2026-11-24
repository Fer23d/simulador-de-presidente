import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMonth, createGameState, hydrateGameState } from '../src/core/game-state.js';
import { advanceMissionTurn, allCountries, canAttackTerritory, conquerTerritory, exitMissionMatch, getCountryOwner, getCountryRegion, getMissionProgress, revealMissionTurn, startMissionMatch, territoryCounts } from '../src/core/mission_mode.js';
import { isWarPhase, warScreenView } from '../src/ui/war_view.js';
import { COUNTRIES } from '../src/data/countries.js';
import { COUNTRY_PATHS, COUNTRY_POINTS } from '../src/data/world_map.js';
import { WAR_COUNTRY_COUNT, WAR_COUNTRY_IDS, WAR_REGIONS } from '../src/data/war_countries.js';

test('mission mode assigns two to six players, owners and one secret mission per player', () => {
  const state = startMissionMatch(createGameState('bra'), 4, ['Ana', 'Bruno', 'Carla', 'Davi'], () => 0.25);
  assert.equal(state.missionMode.active, true);
  assert.equal(state.missionMode.players.length, 4);
  assert.equal(new Set(state.missionMode.players.map((player) => player.mission.id)).size, 4);
  assert.equal(state.country.ownerId, 'player-1');
  assert.equal(allCountries(state).length, 100);
  assert.ok(allCountries(state).every((country) => typeof country.ownerId === 'string'));
  assert.ok(state.geopolitics.contacts.filter((country) => !WAR_COUNTRY_IDS.includes(country.id)).every((country) => country.ownerId === null));
  assert.ok(getMissionProgress(state, 'player-1').label.length > 0);
});

test('the existing map regions provide stable labels for mission objectives', () => {
  assert.equal(getCountryRegion('bra'), 'americas');
  assert.equal(getCountryRegion('fra'), 'europe');
  assert.equal(getCountryRegion('chn'), 'asia');
  assert.equal(getCountryRegion('zaf'), 'africa');
  assert.equal(getCountryRegion('aus'), 'oceania');
});

test('turn handoff hides the next mission until the next player reveals it', () => {
  const state = startMissionMatch(createGameState('bra'), 2, ['Ana', 'Bruno'], () => 0.4);
  const handedOff = advanceMissionTurn(revealMissionTurn(state));
  assert.equal(handedOff.missionMode.currentPlayerId, 'player-2');
  assert.equal(handedOff.missionMode.handoffRequired, true);
  assert.equal(revealMissionTurn(handedOff).missionMode.handoffRequired, false);
});

test('a successful territorial attack is immutable and can complete an elimination mission', () => {
  let state = revealMissionTurn(startMissionMatch(createGameState('bra'), 2, ['Ana', 'Bruno'], () => 0.1));
  const lastEnemy = state.geopolitics.contacts.find((country) => country.ownerId === 'player-2');
  const contacts = state.geopolitics.contacts.map((country) => ({ ...country, ownerId: country.id === lastEnemy.id ? 'player-2' : 'player-1', militaryPower: country.id === lastEnemy.id ? 1 : country.militaryPower }));
  state = {
    ...state,
    missionMode: {
      ...state.missionMode,
      players: state.missionMode.players.map((player) => player.id === 'player-1'
        ? { ...player, mission: { id: 'break-a-rival', title: 'Quebrar um rival', description: 'Eliminar Bruno.', kind: 'eliminate', targetPlayerId: 'player-2' } }
        : player),
    },
    geopolitics: { ...state.geopolitics, contacts },
    world: contacts,
  };
  const result = conquerTerritory(state, lastEnemy.id, () => 0);
  assert.equal(state.missionMode.finished, false);
  assert.equal(result.missionMode.finished, true);
  assert.equal(result.missionMode.winnerId, 'player-1');
  assert.equal(result.geopolitics.contacts.find((country) => country.id === lastEnemy.id).ownerId, 'player-1');
});

test('2–6 players have balanced ownership and no mission starts completed across seeded deals', () => {
  for (let count = 2; count <= 6; count++) for (let seed = 1; seed <= 25; seed++) {
    let value = seed;
    const rng = () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
    const state = startMissionMatch(createGameState('bra'), count, [], rng);
    const counts = Object.values(territoryCounts(state));
    assert.equal(counts.reduce((sum, count) => sum + count, 0), 100);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    for (const player of state.missionMode.players) {
      assert.equal(getMissionProgress(state, player.id).done, false, `${count} players / seed ${seed} / ${player.mission.id}`);
      assert.equal(player.mission.target ?? player.mission.minimumTerritories ?? player.mission.fallbackTarget, territoryCounts(state)[player.id] + 12);
      if (player.mission.targetPlayerId) assert.notEqual(player.mission.targetPlayerId, player.id);
    }
  }
});

test('compact roster has exactly 100 distinct, mapped countries distributed across every region', () => {
  assert.equal(WAR_COUNTRY_COUNT, 100);
  assert.equal(new Set(WAR_COUNTRY_IDS).size, 100);
  assert.deepEqual(Object.fromEntries(Object.entries(WAR_REGIONS).map(([region, ids]) => [region, ids.length])), {
    americas: 20, europe: 25, africa: 25, asia: 25, oceania: 5,
  });
  for (const [region, ids] of Object.entries(WAR_REGIONS)) for (const id of ids) {
    assert.ok(COUNTRIES.some((country) => country.id === id), id);
    assert.ok(COUNTRY_PATHS[id] || COUNTRY_POINTS[id], id);
    assert.equal(getCountryRegion(id), region, id);
  }
  assert.equal(COUNTRIES.length, 200, 'the shared country database remains intact');
});

test('excluded countries cannot be targeted or counted, including when an old home is excluded', () => {
  const original = createGameState('lie');
  const state = revealMissionTurn(startMissionMatch(original, 6, [], () => .4));
  assert.equal(allCountries(state).length, 100);
  assert.equal(state.missionMode.players[0].homeCountryId, 'bra');
  assert.equal(getCountryOwner(state, 'lie'), null);
  assert.equal(canAttackTerritory(state, 'lie').ok, false);
  assert.equal(canAttackTerritory(state, 'and').ok, false);
  assert.deepEqual(conquerTerritory(state, 'lie', () => 0).missionMode, state.missionMode);
  const html = warScreenView(state);
  assert.doesNotMatch(html, /data-country="(?:lie|and)"|<option value="(?:lie|and)"/);
  assert.equal((html.match(/class="war-country /g) ?? []).length, 100);
  assert.deepEqual(territoryCounts(hydrateGameState(JSON.stringify(state))), territoryCounts(state));
  assert.deepEqual(exitMissionMatch(state).country, original.country);
});

test('regional missions count only the countries on the compact board', () => {
  let state = revealMissionTurn(startMissionMatch(createGameState('bra'), 3, [], () => .4));
  state = { ...state, missionMode: { ...state.missionMode, players: state.missionMode.players.map((player, index) => index === 0
    ? { ...player, mission: { kind: 'region', regionId: 'europe', share: 1, minimumTerritories: 0 } } : player) } };
  const contacts = state.geopolitics.contacts.map((country) => ({ ...country,
    ownerId: WAR_REGIONS.europe.includes(country.id) ? 'player-1' : country.ownerId }));
  state = { ...state, geopolitics: { ...state.geopolitics, contacts }, world: contacts };
  const progress = getMissionProgress(state);
  assert.equal(progress.target, 25);
  assert.equal(progress.value, 25);
  assert.equal(progress.done, true);
  assert.equal(getCountryOwner(state, 'and'), null);
});

test('legacy 200-country matches retain their owners and missions; next match uses 100', () => {
  const fresh = startMissionMatch(createGameState('bra'), 2, [], () => .4);
  const { territoryIds, ...legacyMode } = fresh.missionMode;
  const contacts = fresh.geopolitics.contacts.map((country, index) => ({ ...country, ownerId: `player-${1 + ((index + 1) % 2)}` }));
  const legacy = { ...fresh, missionMode: { ...legacyMode, players: legacyMode.players.map((player) => ({ ...player,
    mission: { id: 'old-expansion', kind: 'territories', target: 124, title: 'Conquistar 124 territórios', description: 'Objetivo original.' } })) },
    geopolitics: { ...fresh.geopolitics, contacts }, world: contacts };
  const loaded = hydrateGameState(JSON.stringify(legacy));
  assert.equal(allCountries(loaded).length, 200);
  assert.deepEqual(loaded.missionMode.players, legacy.missionMode.players);
  assert.deepEqual(territoryCounts(loaded), territoryCounts(legacy));
  assert.match(warScreenView(loaded), /Esta partida mantém seus 200 países/);
  assert.equal(getMissionProgress(loaded).target, 124);
  const restarted = startMissionMatch(exitMissionMatch(loaded), 2, [], () => .4);
  assert.equal(allCountries(restarted).length, 100);
  assert.equal(restarted.missionMode.territoryIds.length, 100);
  assert.equal(allCountries(hydrateGameState(JSON.stringify(restarted))).length, 100);
});

test('home territory is conquerable and ownership survives reloading the save', () => {
  let state = revealMissionTurn(startMissionMatch(createGameState('bra'), 2, [], () => .3));
  state = revealMissionTurn(advanceMissionTurn(state));
  const next = conquerTerritory(state, 'bra', () => 0);
  assert.equal(getCountryOwner(next, 'bra'), 'player-2');
  assert.equal(state.country.ownerId, 'player-1');
  const saved = hydrateGameState(JSON.stringify(next));
  assert.equal(getCountryOwner(saved, 'bra'), 'player-2');
  assert.equal(saved.missionMode.lastBattle.roll, 6);
  assert.deepEqual(territoryCounts(saved), territoryCounts(next));
});

test('handoff, failed attacks, duplicate clicks and month advance cannot bypass a War turn', () => {
  let state = startMissionMatch(createGameState('bra'), 3, [], () => .3);
  const enemy = allCountries(state).find((country) => country.ownerId === 'player-2');
  assert.equal(canAttackTerritory(state, enemy.id).ok, false);
  assert.equal(advanceMissionTurn(state), state);
  state = revealMissionTurn(state);
  const failed = conquerTerritory(state, enemy.id, () => .999);
  assert.equal(failed.missionMode.lastBattle.roll, 1);
  assert.equal(failed.missionMode.actionUsed, true);
  assert.equal(getCountryOwner(failed, enemy.id), 'player-2');
  assert.equal(canAttackTerritory(failed, enemy.id).ok, false);
  assert.deepEqual(conquerTerritory(failed, enemy.id, () => 0).geopolitics, failed.geopolitics);
  assert.equal(advanceMonth(failed).monthCounter, failed.monthCounter);
});

test('eliminated players are skipped and passing cannot skip the next handoff', () => {
  let state = revealMissionTurn(startMissionMatch(createGameState('bra'), 3, [], () => .3));
  const contacts = state.geopolitics.contacts.map((country) => ({ ...country, ownerId: country.ownerId === 'player-2' ? 'player-1' : country.ownerId }));
  state = { ...state, geopolitics: { ...state.geopolitics, contacts }, world: contacts };
  const next = advanceMissionTurn(state);
  assert.equal(next.missionMode.currentPlayerId, 'player-3');
  assert.equal(advanceMissionTurn(next), next);
  assert.equal(advanceMissionTurn(revealMissionTurn(next)).missionMode.turnNumber, 2);
});

test('War screen replaces presidential menus and protects mission text during handoff', () => {
  const original = createGameState('bra');
  const setup = warScreenView(original);
  assert.ok(isWarPhase(original));
  assert.equal(isWarPhase({ ...original, is_wasteland: true }), false);
  assert.equal(isWarPhase({ ...original, city: {} }), false);
  assert.match(setup, /data-action="war-start"/);
  assert.doesNotMatch(setup, /data-tab="(?:budget|congress|diplomacy)"|Avançar mês|PIB|Inflação/);
  const state = startMissionMatch(original, 3, ['<Ana>', 'Bruno', 'Carla'], () => .4);
  const locked = warScreenView(state, { missionVisible: true });
  assert.doesNotMatch(locked, new RegExp(state.missionMode.players[0].mission.description));
  assert.match(locked, /inert aria-hidden="true"/);
  assert.match(locked, /&lt;Ana&gt;/);
  assert.match(locked, /data-country="bra"/);
  const revealed = warScreenView(revealMissionTurn(state), { missionVisible: true });
  assert.ok(revealed.includes(state.missionMode.players[0].mission.description));
  assert.equal((revealed.match(/class="war-country /g) ?? []).length, allCountries(state).length);
});

test('closing War removes only competitive ownership and leaves campaign data intact', () => {
  const original = createGameState('bra');
  const started = startMissionMatch(original, 4, [], () => .3);
  const enemy = allCountries(started).find((country) => country.ownerId === 'player-2');
  const ended = exitMissionMatch(conquerTerritory(revealMissionTurn(started), enemy.id, () => 0));
  assert.deepEqual(ended.country, original.country);
  assert.deepEqual(ended.geopolitics, original.geopolitics);
  assert.deepEqual(ended.economy, original.economy);
  assert.equal(ended.missionMode.active, false);
});
