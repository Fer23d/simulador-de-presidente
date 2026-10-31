import test from 'node:test';
import assert from 'node:assert/strict';
import { assignGarrison, buildFort, dismissRaid, FORT_LEVELS, getFortStatus, getRaidChance, getRaiderPower, getThreatEstimate,
  normalizeFort, RAID_COOLDOWN_TURNS, recruitSoldiers, rollSurfaceRaid, upgradeFort } from '../src/core/defense.js';
import { FORT_GARRISON_SKIN, getFortArtPlacement } from '../src/core/defense_renderer.js';
import { getSkin } from '../src/core/player_state.js';
import { advanceWastelandMonth } from '../src/core/wasteland.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';

const MINUTE = 60_000;
const horde = { id: 'mutant-horde', name: 'Horda Mutante do Norte', relation: -60, militaryPower: 46 };
const friends = { id: 'scrap-brotherhood', name: 'Irmandade de Sucateiros', relation: 25, militaryPower: 32 };
const vault = (extra = {}) => ({ is_wasteland: true, scrap: 5_000, oil: 1_000, wasteland_turn: 3, randomSeed: 7,
  military: { exercito: { soldados: 350, blindados: 0 } }, geopolitics: { contacts: [horde, friends] },
  oil_derricks: [{ level: 2, collectedAt: 0, upgradeUntil: 0 }, null, null], surface_fort: null, ...extra });
const ready = (fort) => ({ ...fort, upgradeUntil: 0 });

test('surface garrison reuses the existing anti-radiation uniform', () => {
  assert.equal(FORT_GARRISON_SKIN, 'hazmat');
  assert.equal(getSkin(FORT_GARRISON_SKIN)?.accessory, 'hazmat_hood');
});

test('the fort is built with scrap and oil, then levels up on a timer', () => {
  let state = buildFort(vault(), 0);
  assert.equal(state.scrap, 4_700);
  assert.equal(state.oil, 950);
  assert.equal(getFortStatus(state.surface_fort, 1_000).building, true);
  assert.equal(getFortStatus(state.surface_fort, 1_000).wall, 0, 'scaffolding does not stop bullets yet');
  assert.match(buildFort(state, 0).notice, /já existe/);
  assert.match(buildFort(vault({ oil: 0 }), 0).notice, /50 barris/);
  state = upgradeFort(state, FORT_LEVELS[1].buildMs);
  assert.equal(state.surface_fort.level, 2);
  const during = getFortStatus(state.surface_fort, FORT_LEVELS[1].buildMs + 1_000);
  assert.equal(during.activeLevel, 1, 'it defends with the previous level during the work');
  assert.equal(during.wall, FORT_LEVELS[1].wall);
  assert.match(upgradeFort(state, FORT_LEVELS[1].buildMs + 1_000).notice, /já está em obras/);
  state = { ...state, surface_fort: { level: 5, garrison: 0, upgradeUntil: 0 } };
  assert.match(upgradeFort(state, 0).notice, /nível máximo/);
});

test('soldiers move between the army and the fort garrison, within capacity', () => {
  let state = { ...vault(), surface_fort: { level: 1, garrison: 0, upgradeUntil: 0 } };
  state = assignGarrison(state, 100, 0);
  assert.equal(state.surface_fort.garrison, 60, 'level 1 holds 60 soldiers');
  assert.equal(state.military.exercito.soldados, 290);
  assert.match(assignGarrison(state, 10, 0).notice, /lotado/);
  state = assignGarrison(state, -25, 0);
  assert.equal(state.surface_fort.garrison, 35);
  assert.equal(state.military.exercito.soldados, 315);
  assert.equal(getFortStatus(state.surface_fort, 0).defense, 20 + 6 + Math.round(35 * .25));
  const broke = recruitSoldiers({ ...state, scrap: 0 });
  assert.match(broke.notice, /30 sucatas/);
  const recruited = recruitSoldiers(state);
  assert.equal(recruited.military.exercito.soldados, 325);
  assert.equal(recruited.scrap, state.scrap - 30);
});

test('raids only come for an oil field after the grace months, from hostile factions', () => {
  assert.equal(getRaidChance(vault({ oil_derricks: [null, null, null] })), 0);
  assert.equal(getRaidChance(vault({ wasteland_turn: 1 })), 0);
  assert.equal(getRaidChance(vault({ geopolitics: { contacts: [friends] } })), 0);
  assert.equal(getRaidChance(vault({ oil: 0 })), .08);
  assert.equal(getRaidChance(vault({ oil: 99_999 })), .25, 'oil attracts raiders, up to a calmer cap');
  assert.equal(getRaiderPower(horde, 0), 46);
  assert.equal(getRaiderPower(horde, 24), 92);
  assert.deepEqual(getThreatEstimate(vault()), { faction: 'Horda Mutante do Norte', power: 52 });
});

function forceRaid(state) {
  for (let seed = 1; seed < 500; seed++) {
    const next = rollSurfaceRaid({ ...state, randomSeed: seed }, 10 * MINUTE);
    if (next.pendingRaid) return next;
  }
  throw new Error('no raid rolled');
}

test('an undefended field loses oil and the tanks; a strong fort repels and loots', () => {
  const lost = forceRaid(vault());
  assert.equal(lost.pendingRaid.won, false);
  assert.equal(lost.pendingRaid.faction, 'Horda Mutante do Norte');
  assert.equal(lost.pendingRaid.oilLost, 400);
  assert.equal(lost.oil, 600);
  assert.equal(lost.oil_derricks[0].collectedAt, 10 * MINUTE, 'the tanks were emptied');
  assert.equal(lost.raid_log.length, 1);
  assert.equal(lost.raidCooldownUntilTurn, lost.wasteland_turn + RAID_COOLDOWN_TURNS + 1);
  assert.equal(getRaidChance({ ...lost, pendingRaid: null, wasteland_turn: lost.wasteland_turn + 1 }), 0,
    'raiders need time to regroup after an incursion');
  const fort = ready({ level: 3, garrison: 200 });
  const held = forceRaid(vault({ surface_fort: fort }));
  assert.equal(held.pendingRaid.won, true);
  assert.equal(held.oil, 1_000);
  assert.ok(held.pendingRaid.loot > 0);
  assert.equal(held.scrap, 5_000 + held.pendingRaid.loot);
  assert.ok(held.surface_fort.garrison <= 200 && held.surface_fort.garrison >= 170);
  assert.equal(held.surface_fort.garrison, 200 - held.pendingRaid.soldiersLost);
  assert.equal(rollSurfaceRaid(held, 0), held, 'one raid at a time');
  assert.equal(dismissRaid(held).pendingRaid, null);
});

test('the month does not turn while a raid report is open, and saves keep the fort', () => {
  const blocked = advanceWastelandMonth({ ...createGameState(), is_wasteland: true, pendingRaid: { faction: 'X', won: true } });
  assert.match(blocked.notice, /relatório do ataque/);
  const parsed = hydrateGameState(JSON.stringify({ ...createGameState(), is_wasteland: true, presidentClass: 'worker',
    surface_fort: { level: 9, garrison: 40.6, upgradeUntil: 12 }, pendingRaid: { faction: 'Horda', won: true, attack: 50.4 },
    raid_log: [{ faction: 'Horda', won: false }, 'junk'] }));
  assert.deepEqual(parsed.surface_fort, { level: 5, garrison: 40, upgradeUntil: 12 });
  assert.equal(parsed.pendingRaid.attack, 50);
  assert.equal(parsed.raid_log.length, 1);
  assert.equal(normalizeFort({ level: 0 }), null);
});

test('the fort panel and the raid report read like a base-builder', async () => {
  const { fortView, fortLiveView, raidReportView } = await import('../src/ui/dashboard.js');
  const empty = fortView(vault(), 0);
  assert.match(empty, /TERRENO DO FORTE/);
  assert.match(empty, /ERGUER FORTE/);
  assert.match(empty, /AMEAÇA: Horda Mutante do Norte · força estimada 52/);
  const fort = { ...vault(), surface_fort: { level: 2, garrison: 40, upgradeUntil: 0 } };
  const live = fortLiveView(fort, 0);
  assert.match(live, /EXÉRCITO NO VAULT: 350/);
  assert.match(live, /MELHORAR P\/ NÍVEL 3/);
  assert.match(live, /fort-threat is-safe/, 'defense 57 beats a threat of 52');
  assert.match(fortLiveView({ ...fort, surface_fort: { level: 1, garrison: 0, upgradeUntil: 0 } }, 0), /fort-threat is-danger/);
  const raid = raidReportView({ faction: 'Horda Mutante do Norte', won: false, attack: 60, defense: 20, oilLost: 400, soldiersLost: 3, raidersDown: 5, loot: 0, turn: 3 });
  assert.match(raid, /HORDA MUTANTE DO NORTE/);
  assert.match(raid, /400 barris roubados/);
  assert.match(raid, /data-action="raid-dismiss"/);
  assert.equal(raidReportView(null), '');
});

test('loading a Vault save keeps the Ermo factions as raiders, not the old countries', async () => {
  const { transicionarParaWasteland } = await import('../src/core/wasteland.js');
  const vaultState = transicionarParaWasteland(createGameState());
  vaultState.geopolitics.contacts[0].relation = -80;
  const loaded = hydrateGameState(JSON.stringify(vaultState));
  assert.deepEqual(loaded.geopolitics.contacts.map((contact) => contact.id), ['mutant-horde', 'scrap-brotherhood', 'military-remnants']);
  assert.equal(loaded.geopolitics.contacts[0].relation, -80);
  const broken = hydrateGameState(JSON.stringify({ ...vaultState, geopolitics: { ...vaultState.geopolitics, contacts: createGameState().geopolitics.contacts } }));
  assert.equal(broken.geopolitics.contacts.length, 3, 'saves that lost the factions get them back');
  assert.equal(getThreatEstimate({ ...loaded, wasteland_turn: 0 }).faction, 'Remanescentes Militares');
});

test('the fort art rests on the ground instead of floating on its transparent margin', () => {
  const image = { width: 1774, height: 887 };
  for (const level of [1, 2, 3, 4, 5]) {
    const { y, height } = getFortArtPlacement(image, 150, 146, level);
    const visibleBottom = y + height * (1 - .09);
    assert.ok(Math.abs(visibleBottom - 148) < 0.001, 'level ' + level + ' base sits on the ground line');
    assert.ok(y + height > 146, 'the transparent margin hangs below the ground, not the content');
  }
  const wide = getFortArtPlacement(image, 150, 146, 3);
  assert.ok(Math.abs(wide.x + wide.width / 2 - 150) < 0.001, 'the art stays centred on the fort');
});
