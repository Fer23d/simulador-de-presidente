import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLevelReward, awardXp, computeXpGain, describeLevelGate, describeLevelReward, getRewardAmounts, DOOR_REQUIRED_LEVEL, estimateLegacyXp, getGameMode, getLevel, getLevelForXp,
  getLevelProgress, getLevelTier, getLevelTitle, grantXp, MAX_LEVEL, normalizeLevelState, TIER_MULTIPLIER, totalXpForLevel, XP_VALUES } from '../src/core/levels.js';
import { advanceCityDay, startCity } from '../src/core/city.js';
import { DOOR_OPENS_AT_MONTH, isDoorOpen } from '../src/core/endings.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { advanceWastelandDay, transicionarParaWasteland } from '../src/core/wasteland.js';

const presidency = () => createGameState('bra');
const vault = (extra = {}) => ({ ...transicionarParaWasteland(createGameState('bra')), presidentClass: 'worker', president_selection_pending: false,
  wasteland_cinematic_pending: false, wasteland_cinematic_ready: false, ...extra });
const city = (extra = {}) => startCity({ ...vault({ ending: { id: 'republic', month: 36 }, scrap: 400, oil: 200 }), ...extra });
const atLevel = (state, level) => ({ ...state, level: normalizeLevelState({ xp: totalXpForLevel(level), skins: state.level?.skins }) });

test('the XP curve grows steadily, inverts cleanly and stops at level 60', () => {
  assert.equal(totalXpForLevel(1), 0);
  assert.equal(totalXpForLevel(2), 74);
  for (let level = 2; level <= MAX_LEVEL; level++) assert.ok(totalXpForLevel(level) > totalXpForLevel(level - 1), `level ${level}`);
  for (const level of [1, 2, 10, 25, 37, 60]) {
    assert.equal(getLevelForXp(totalXpForLevel(level)), level);
    assert.equal(getLevelForXp(totalXpForLevel(level) + 1), level);
  }
  assert.equal(getLevelForXp(totalXpForLevel(10) - 1), 9);
  assert.equal(getLevelForXp(10 ** 9), MAX_LEVEL);
  assert.equal(getLevelForXp(-5), 1);
  assert.ok(totalXpForLevel(10) > 800 && totalXpForLevel(10) < 1_300, 'level 10 is about the end of the presidency');
  assert.ok(totalXpForLevel(DOOR_REQUIRED_LEVEL) > 3_000 && totalXpForLevel(DOOR_REQUIRED_LEVEL) < 5_000, 'level 25 is about the end of the Vault');
});

test('levels ending in 5 are better than normal ones and levels ending in 0 are the best', () => {
  assert.equal(getLevelTier(7), 'normal');
  for (const level of [5, 15, 25, 35, 45, 55]) assert.equal(getLevelTier(level), 'five', String(level));
  for (const level of [10, 20, 30, 40, 50, 60]) assert.equal(getLevelTier(level), 'zero', String(level));
  assert.ok(TIER_MULTIPLIER.normal < TIER_MULTIPLIER.five && TIER_MULTIPLIER.five < TIER_MULTIPLIER.zero);
  const scrapGain = (level) => applyLevelReward(atLevel(vault(), level), level).scrap - vault().scrap;
  assert.ok(scrapGain(14) < scrapGain(15), '15 beats 14');
  assert.ok(scrapGain(15) < scrapGain(20), '20 beats 15');
  assert.ok(scrapGain(20) > scrapGain(19) * 3, 'a 0 level is far above the neighbours');
  assert.ok(scrapGain(25) > scrapGain(24) && scrapGain(25) < scrapGain(30));
});

test('the reward depends on the mode the player is in', () => {
  const p = presidency();
  const rewardedPresidency = applyLevelReward(atLevel(p, 5), 5);
  assert.ok(rewardedPresidency.economy.cash > p.economy.cash);
  assert.equal(rewardedPresidency.technology.points, p.technology.points + TIER_MULTIPLIER.five);
  assert.equal(rewardedPresidency.scrap, p.scrap, 'no Vault resources in the presidency');
  const v = vault();
  const rewardedVault = applyLevelReward(atLevel(v, 5), 5);
  assert.ok(rewardedVault.scrap > v.scrap && rewardedVault.oil > v.oil);
  assert.ok(rewardedVault.shelter_supplies.food >= v.shelter_supplies.food);
  assert.ok(rewardedVault.shelter_supplies.medkits > v.shelter_supplies.medkits, 'level 5 also brings medkits');
  assert.equal(applyLevelReward(atLevel(v, 7), 7).shelter_supplies.medkits, v.shelter_supplies.medkits, 'a normal level does not');
  const c = city();
  const rewardedCity = applyLevelReward(atLevel(c, 5), 5);
  assert.ok(rewardedCity.city.resources.scrap > c.city.resources.scrap);
  assert.ok(rewardedCity.city.resources.water > c.city.resources.water);
  assert.ok(rewardedCity.city.happiness > c.city.happiness, 'five levels lift the mood a little');
  assert.equal(applyLevelReward(atLevel(c, 7), 7).city.happiness, c.city.happiness);
  assert.equal(getGameMode(p), 'presidency');
  assert.equal(getGameMode(v), 'vault');
  assert.equal(getGameMode(c), 'city');
  assert.match(rewardedVault.level.recent.at(-1).text, /Sucata/);
  assert.equal(rewardedVault.level.recent.at(-1).mode, 'vault');
});

test('level 0 rewards add a title, an exclusive outfit and extra soldiers in the Vault', () => {
  const v = vault({ military: { exercito: { soldados: 100 } } });
  const ten = applyLevelReward(atLevel(v, 10), 10);
  assert.ok(ten.unlockedSkins.includes('scrap_armor'));
  assert.deepEqual(ten.level.skins, ['scrap_armor']);
  assert.equal(ten.military.exercito.soldados, 120);
  assert.match(ten.level.recent.at(-1).text, /Título: Estadista/);
  assert.match(ten.level.recent.at(-1).text, /Vestimenta exclusiva/);
  assert.ok(!applyLevelReward(atLevel(v, 15), 15).unlockedSkins.includes('scrap_armor'), 'a 5 level brings no outfit');
  assert.ok(applyLevelReward(atLevel(v, 30), 30).unlockedSkins.includes('worker_welder'), 'level 30 gives the epic outfit of your class');
  assert.ok(applyLevelReward(atLevel({ ...v, presidentClass: 'doctor' }, 30), 30).unlockedSkins.includes('doctor_containment'));
  assert.ok(applyLevelReward(atLevel(v, 60), 60).unlockedSkins.includes('shadow'));
  assert.equal(getLevelTitle(9), 'Recém-empossado');
  assert.equal(getLevelTitle(10), 'Estadista');
  assert.equal(getLevelTitle(29), 'Sobrevivente Veterano');
  assert.equal(getLevelTitle(60), 'O Último Presidente');
  const skinsInPresidency = applyLevelReward(atLevel(presidency(), 10), 10);
  assert.deepEqual(skinsInPresidency.level.skins, ['scrap_armor']);
  assert.ok(transicionarParaWasteland(skinsInPresidency).unlockedSkins.includes('scrap_armor'), 'the outfit survives the trip to the Vault');
});

test('gaining several levels at once pays every level and keeps only the latest few', () => {
  const state = grantXp(vault(), totalXpForLevel(12));
  assert.equal(getLevel(state), 12);
  assert.deepEqual(state.level.recent.map((entry) => entry.level), [7, 8, 9, 10, 11, 12]);
  assert.equal(state.level.recent.find((entry) => entry.level === 10).tier, 'zero');
  assert.equal(state.level.recent.find((entry) => entry.level === 5), undefined, 'older entries are dropped');
  assert.ok(state.scrap > vault().scrap * 1 + 10 * 30, 'ten rewards were paid');
  assert.equal(grantXp(vault(), 0).level.xp, 0);
  const capped = grantXp(vault(), 10 ** 7);
  assert.equal(getLevel(capped), MAX_LEVEL);
  assert.equal(grantXp(capped, 500), capped, 'nothing more at the cap');
});

test('XP comes from what the player does in every mode', () => {
  const p = presidency();
  const nextMonth = { ...p, calendar: { ...p.calendar, month: p.calendar.month + 1 } };
  assert.equal(computeXpGain(p, nextMonth), XP_VALUES.presidencyMonth);
  assert.equal(computeXpGain(p, vault()), XP_VALUES.enterVault);
  const v = vault();
  assert.equal(computeXpGain(v, advanceWastelandDay(v, 0)), XP_VALUES.vaultDay);
  let monthEnd = { ...v, wasteland_day: 29 };
  assert.equal(computeXpGain(monthEnd, advanceWastelandDay(monthEnd, 0)), XP_VALUES.vaultDay + XP_VALUES.vaultMonth);
  const grid = v.shelter_grid.map((row) => row.slice());
  grid[1][0] = { type: 'elevator', floor: 1, column: 0, level: 1, operational: true };
  assert.equal(computeXpGain(v, { ...v, shelter_grid: grid }), XP_VALUES.roomLevel);
  assert.equal(computeXpGain(v, { ...v, oil_derricks: [{ level: 2, collectedAt: 0, upgradeUntil: 0 }, null, null] }), 2 * XP_VALUES.derrickLevel);
  assert.equal(computeXpGain(v, { ...v, surface_fort: { level: 1, garrison: 0, upgradeUntil: 0 } }), XP_VALUES.fortLevel);
  assert.equal(computeXpGain({ ...v, pendingBunkerEvent: { id: 'x' } }, v), XP_VALUES.mission);
  assert.equal(computeXpGain(v, { ...v, pendingRaid: { won: true } }), XP_VALUES.raidWon);
  assert.equal(computeXpGain(v, { ...v, pendingRaid: { won: false } }), XP_VALUES.raidLost);
  assert.equal(computeXpGain(v, { ...v, ending: { id: 'republic', month: 36 } }), XP_VALUES.ending);
  const c = city();
  assert.equal(computeXpGain(vault({ ending: { id: 'republic', month: 36 } }), c), XP_VALUES.cityStart);
  assert.equal(computeXpGain(c, advanceCityDay(c)), XP_VALUES.cityDay);
  assert.equal(computeXpGain({ ...c, city: { ...c.city, day: 30 } }, c), 0, 'going back in days is not progress');
  assert.equal(computeXpGain(c, { ...c, city: { ...c.city, buildings: [...c.city.buildings, { id: 'h', type: 'house', x: 1, y: 1 }, { id: 'r', type: 'road', x: 2, y: 2 }] } }),
    XP_VALUES.cityBuilding + XP_VALUES.cityRoad);
  assert.equal(computeXpGain(null, v), 0);
});

test('awardXp pays the XP of a change and ignores restarts', () => {
  const v = vault();
  const day = advanceWastelandDay(v, 0);
  const paid = awardXp(v, day);
  assert.equal(paid.level.xp, XP_VALUES.vaultDay);
  assert.equal(awardXp(v, v), v);
  const veteran = atLevel(v, 12);
  assert.equal(awardXp(veteran, createGameState('bra')).level.xp, 0, 'a brand new game starts from zero');
  assert.equal(awardXp(v, { ...day, level: undefined }).level, undefined);
  const almost = { ...v, level: normalizeLevelState({ xp: totalXpForLevel(2) - 1 }) };
  const crossing = awardXp(almost, advanceWastelandDay(almost, 0));
  assert.equal(getLevel(crossing), 2);
  assert.equal(crossing.level.recent.at(-1).level, 2);
});

test('the Door needs both the three years and level 25', () => {
  const late = vault({ wasteland_turn: DOOR_OPENS_AT_MONTH + 4 });
  assert.equal(isDoorOpen(late), false, 'level 1 is locked out');
  assert.equal(isDoorOpen(atLevel(late, DOOR_REQUIRED_LEVEL - 1)), false);
  assert.equal(isDoorOpen(atLevel(late, DOOR_REQUIRED_LEVEL)), true);
  assert.equal(isDoorOpen(atLevel(vault({ wasteland_turn: DOOR_OPENS_AT_MONTH - 1 }), 40)), false, 'a high level does not skip the three years');
  const gate = describeLevelGate(atLevel(late, 20));
  assert.equal(gate.required, 25);
  assert.equal(gate.missing, 5);
  assert.equal(gate.missingXp, totalXpForLevel(25) - totalXpForLevel(20));
  assert.equal(describeLevelGate(atLevel(late, 25)), null);
  assert.equal(describeLevelGate(presidency()), null);
  assert.equal(describeLevelGate(city()), null);
  assert.equal(advanceWastelandDay(late, 0).wasteland_day, 1, 'the Vault keeps going while the Door is locked');
});

test('progress for the badge reports the current level, the bar and the next special prize', () => {
  const start = getLevelProgress(presidency());
  assert.equal(start.level, 1);
  assert.equal(start.fraction, 0);
  assert.equal(start.needed, 74);
  assert.equal(start.nextSpecial, 5);
  assert.equal(start.title, 'Recém-empossado');
  const half = getLevelProgress({ ...presidency(), level: normalizeLevelState({ xp: 37 }) });
  assert.equal(half.current, 37);
  assert.equal(half.fraction, .5);
  assert.equal(getLevelProgress(atLevel(presidency(), 12)).nextSpecial, 15);
  assert.equal(getLevelProgress(atLevel(presidency(), 15)).nextSpecial, 20);
  const max = getLevelProgress(atLevel(presidency(), MAX_LEVEL));
  assert.equal(max.fraction, 1);
  assert.equal(max.nextSpecial, null);
});

test('the level survives saving and loading, and old saves get an estimate instead of level 1', () => {
  const earned = grantXp(vault(), totalXpForLevel(11));
  const loaded = hydrateGameState(JSON.stringify({ ...earned, version: createGameState().version }));
  assert.equal(loaded.level.xp, earned.level.xp);
  assert.equal(getLevel(loaded), 11);
  assert.deepEqual(loaded.level.skins, ['scrap_armor']);
  assert.equal(loaded.level.recent.length, 6);
  assert.deepEqual(normalizeLevelState(null), { xp: 0, level: 1, recent: [], skins: [] });
  const messy = normalizeLevelState({ xp: -9, skins: ['scrap_armor', 'bogus', 'scrap_armor', 42], recent: [{ level: 99, tier: 'x', mode: 'y', text: 'z' }, 'junk', { level: 'a' }] });
  assert.deepEqual(messy.skins, ['scrap_armor']);
  assert.deepEqual(messy.recent, [{ level: 60, tier: 'normal', mode: 'presidency', text: 'z' }]);
  assert.equal(messy.xp, 0);
  const { level, ...legacy } = { ...createGameState(), version: createGameState().version, monthCounter: 40, wasteland_turn: 30, is_wasteland: true };
  assert.ok(level);
  const old = hydrateGameState(JSON.stringify(legacy));
  assert.equal(old.level.xp, estimateLegacyXp(legacy));
  assert.ok(getLevel(old) >= 20 && getLevel(old) < DOOR_REQUIRED_LEVEL + 5, 'thirty Vault months land near the Door level');
  assert.equal(getLevel(hydrateGameState(JSON.stringify({ ...createGameState(), version: createGameState().version }))), 1);
});

test('the top tab shows the level and a small bar, and marks the locked Door', async () => {
  const { levelTabView } = await import('../src/ui/level_ui.js');
  const html = levelTabView(vault());
  assert.match(html, /data-action="open-levels"/);
  assert.match(html, />NÍVEIS</);
  assert.match(html, /NV 1<\/strong>/);
  assert.match(html, /🔒/, 'the Vault shows the lock until level 25');
  assert.doesNotMatch(levelTabView(presidency()), /🔒/);
  assert.doesNotMatch(levelTabView(atLevel(vault(), 25)), /🔒/);
  assert.match(levelTabView(atLevel(vault(), 12)), /NV 12/);
  assert.match(levelTabView({ ...presidency(), level: normalizeLevelState({ xp: 37 }) }), /width:50%/);
});

test('the track lists all 60 levels with the prize of each, in the chosen mode', async () => {
  const { levelTrackView } = await import('../src/ui/level_ui.js');
  const html = levelTrackView(atLevel(vault(), 14));
  assert.equal((html.match(/class="level-card /g) ?? []).length, MAX_LEVEL);
  assert.equal((html.match(/level-card--zero/g) ?? []).length, 6, 'levels 10, 20, 30, 40, 50 and 60');
  assert.equal((html.match(/level-card--five/g) ?? []).length, 6, 'levels 5, 15, 25, 35, 45 and 55');
  assert.match(html, /is-current/);
  assert.equal((html.match(/is-done/g) ?? []).length, 13, 'levels below the current one are done');
  assert.match(html, /VOCÊ ESTÁ AQUI/);
  assert.match(html, /PRÊMIO MÁXIMO ★★/);
  assert.match(html, /PRÊMIO ESPECIAL ★/);
  assert.match(html, /Ponto de partida/);
  assert.match(html, /A Porta do Vault só abre neste nível/);
  assert.match(html, /faltam 11 níveis/);
  assert.match(html, /Próximo prêmio especial: nível 15 ★\./);
  assert.match(html, /×1[^]*×2[^]*×4/, 'the rules explain the multipliers');
  for (const id of ['presidency', 'vault', 'city']) assert.match(html, new RegExp(`data-level-mode="${id}"`));
  assert.match(html, /data-level-mode="vault" aria-pressed="true"/, 'the current mode is selected');
  assert.match(html, /Vault <small>\(atual\)/);
  assert.match(html, /data-action="close-levels"/);
  assert.match(html, /Título: Estadista/);
  assert.match(html, /Vestimenta exclusiva: Armadura de Sucata/);
  const presidencyHtml = levelTrackView(atLevel(vault(), 14), 'presidency');
  assert.match(presidencyHtml, /Caixa nacional/);
  assert.doesNotMatch(presidencyHtml, /Sucata \+/);
  assert.match(presidencyHtml, /data-level-mode="presidency" aria-pressed="true"/);
  assert.match(levelTrackView(atLevel(vault(), 14), 'city'), /Água \+/);
  assert.match(levelTrackView(vault(), 'nonsense'), /data-level-mode="vault" aria-pressed="true"/, 'an unknown mode falls back to the current one');
  assert.doesNotMatch(levelTrackView(atLevel(vault(), 30)), /faltam/);
});

test('the track shows exactly the prize that a level pays', async () => {
  const { levelTrackView } = await import('../src/ui/level_ui.js');
  for (const mode of ['presidency', 'vault', 'city']) {
    const base = mode === 'presidency' ? presidency() : mode === 'vault' ? vault() : city();
    const html = levelTrackView(base, mode);
    for (const level of [2, 5, 7, 10, 15, 20, 30, 45, 60]) {
      const paid = applyLevelReward(atLevel(base, level), level).level.recent.at(-1).text.split(' · ');
      const card = html.slice(html.indexOf(`data-level="${level}"`));
      const body = card.slice(0, card.indexOf('</ul>'));
      for (const line of paid) assert.ok(body.includes(line), `${mode} level ${level}: ${line}`);
    }
  }
  assert.deepEqual(describeLevelReward(10, 'vault', vault()), ['Sucata +150', 'Petróleo +50', 'Comida +60', 'Energia +50', 'Curativos +4', 'Soldados +20',
    'Vestimenta exclusiva: Armadura de Sucata', 'Título: Estadista']);
  assert.deepEqual(getRewardAmounts(10, 'city', city()), { scrap: 200, food: 125, water: 125, oil: 40, happiness: 6 });
});

test('the level toast gives better prizes a stronger call and more time on screen', async () => {
  const { levelToastParts } = await import('../src/ui/level_ui.js');
  const zero = levelToastParts({ level: 20, tier: 'zero', text: 'Sucata +180' });
  const five = levelToastParts({ level: 15, tier: 'five', text: 'x' });
  const normal = levelToastParts({ level: 14, tier: 'normal', text: 'x' });
  assert.match(zero.title, /PRÊMIO MÁXIMO/);
  assert.match(five.title, /PRÊMIO ESPECIAL/);
  assert.match(normal.title, /Prêmio de nível/);
  assert.ok(zero.durationMs > five.durationMs && five.durationMs > normal.durationMs, 'better prizes stay on screen longer');
});

test('when the three years pass without level 25 the month close tells the player what is missing', () => {
  const locked = vault({ wasteland_turn: DOOR_OPENS_AT_MONTH, wasteland_day: 29, level: normalizeLevelState({ xp: totalXpForLevel(20) }) });
  const closed = advanceWastelandDay(locked, 0);
  assert.equal(closed.wasteland_turn, DOOR_OPENS_AT_MONTH + 1, 'the month still closes');
  assert.match(closed.notice, /Porta do Vault está pronta, mas só abre no nível 25: faltam 5/);
  const early = advanceWastelandDay(vault({ wasteland_turn: 5, wasteland_day: 29 }), 0);
  assert.doesNotMatch(early.notice, /Porta do Vault está pronta/);
  const open = advanceWastelandDay(atLevel(vault({ wasteland_turn: DOOR_OPENS_AT_MONTH - 1, wasteland_day: 29 }), 26), 0);
  assert.doesNotMatch(open.notice, /só abre no nível/);
  assert.equal(isDoorOpen(open), true, 'with the level, the Door opens at month 36');
});
