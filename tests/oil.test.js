import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOilDerrick, collectOil, formatDuration, getDerrickBuildCost, getDerrickStatus, normalizeOilField,
  OIL_DERRICK_SLOTS, OIL_LEVELS, upgradeOilDerrick } from '../src/core/oil.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';

const MINUTE = 60_000;
const vault = (extra = {}) => ({ is_wasteland: true, scrap: 1_000, oil: 0, oil_derricks: normalizeOilField(), ...extra });

test('the surface has exactly three drilling spots and each new well costs more', () => {
  assert.equal(OIL_DERRICK_SLOTS, 3);
  let state = vault();
  assert.equal(getDerrickBuildCost(state), 150);
  state = buildOilDerrick(state, 0, 0);
  assert.equal(state.scrap, 850);
  assert.equal(getDerrickBuildCost(state), 250);
  state = buildOilDerrick(buildOilDerrick(state, 1, 0), 2, 0);
  assert.equal(state.oil_derricks.filter(Boolean).length, 3);
  assert.equal(getDerrickBuildCost(state), null);
  assert.equal(buildOilDerrick(state, 0, 0).notice, 'Local de perfuração indisponível.');
  assert.equal(buildOilDerrick(vault(), 3, 0).notice, 'Local de perfuração indisponível.', 'slot 4 does not exist');
  assert.match(buildOilDerrick(vault({ scrap: 10 }), 0, 0).notice, /Sucata insuficiente/);
  assert.equal(buildOilDerrick({ ...vault(), is_wasteland: false }, 0, 0).scrap, 1_000);
});

test('a well pumps only after construction, fills its tank and is collected by tapping', () => {
  let state = buildOilDerrick(vault(), 0, 0);
  const built = OIL_LEVELS[1].buildMs;
  assert.equal(getDerrickStatus(state.oil_derricks[0], built / 2).building, true);
  assert.equal(getDerrickStatus(state.oil_derricks[0], built / 2).stored, 0);
  const status = getDerrickStatus(state.oil_derricks[0], built + 10 * MINUTE);
  assert.equal(status.stored, 20);
  assert.equal(status.ready, true);
  assert.equal(getDerrickStatus(state.oil_derricks[0], built + 999 * MINUTE).stored, 60, 'the tank caps production');
  assert.equal(getDerrickStatus(state.oil_derricks[0], built + 999 * MINUTE).full, true);
  state = collectOil(state, 0, built + 10 * MINUTE);
  assert.equal(state.oil, 20);
  assert.equal(getDerrickStatus(state.oil_derricks[0], built + 10 * MINUTE).stored, 0);
  assert.equal(collectOil(state, 0, built + 10 * MINUTE), state, 'nothing to collect keeps the state');
});

test('upgrades cost scrap and oil, take time, stop pumping and then raise production', () => {
  let state = buildOilDerrick(vault({ scrap: 5_000 }), 0, 0);
  const t1 = OIL_LEVELS[1].buildMs + 20 * MINUTE;
  state = upgradeOilDerrick(state, 0, t1);
  assert.equal(state.oil, 40, 'stored oil is collected before the work starts');
  assert.equal(state.scrap, 5_000 - 150 - 120);
  let status = getDerrickStatus(state.oil_derricks[0], t1 + 1_000);
  assert.equal(status.level, 2);
  assert.equal(status.activeLevel, 1);
  assert.equal(status.upgrading, true);
  assert.equal(status.next, null);
  assert.match(upgradeOilDerrick(state, 0, t1 + 1_000).notice, /já está em obras/);
  const t2 = t1 + OIL_LEVELS[2].buildMs;
  status = getDerrickStatus(state.oil_derricks[0], t2 + 10 * MINUTE);
  assert.equal(status.stored, 30);
  assert.equal(status.next.level, 3);
  assert.match(upgradeOilDerrick(state, 0, t2).notice, /100 barris/, 'level 3 needs oil');
  state = { ...state, oil: 100 };
  state = upgradeOilDerrick(state, 0, t2);
  assert.equal(state.oil, 0);
  let field = state.oil_derricks;
  for (const level of [4, 5]) {
    const done = field[0].upgradeUntil;
    state = upgradeOilDerrick({ ...state, oil: 1_000, scrap: 5_000 }, 0, done);
    field = state.oil_derricks;
    assert.equal(field[0].level, level);
  }
  assert.match(upgradeOilDerrick(state, 0, field[0].upgradeUntil).notice, /nível máximo/);
});

test('saves keep the oil and the wells, and drop garbage', () => {
  const parsed = hydrateGameState(JSON.stringify({ ...createGameState(), is_wasteland: true, presidentClass: 'worker', oil: 42.7,
    oil_derricks: [{ level: 9, collectedAt: 5 }, 'x', { level: 2, collectedAt: 1, upgradeUntil: 3 }, { level: 1 }] }));
  assert.equal(parsed.oil, 42);
  assert.equal(parsed.oil_derricks.length, 3);
  assert.equal(parsed.oil_derricks[0].level, 5);
  assert.equal(parsed.oil_derricks[1], null);
  assert.deepEqual(parsed.oil_derricks[2], { level: 2, collectedAt: 1, upgradeUntil: 3 });
  assert.deepEqual(hydrateGameState(null).oil_derricks, [null, null, null]);
});

test('durations read like a game timer', () => {
  assert.equal(formatDuration(20_000), '20s');
  assert.equal(formatDuration(3 * MINUTE), '3min');
  assert.equal(formatDuration(90_500), '1min 31s');
});

test('the well panel shows build, collect and upgrade like a base-builder', async () => {
  const { oilDerrickView, oilDerrickLiveView } = await import('../src/ui/dashboard.js');
  const empty = oilDerrickView(vault(), 1, 0);
  assert.match(empty, /PONTO DE PERFURAÇÃO 2/);
  assert.match(empty, /data-action="oil-build" data-slot="1" >/);
  assert.match(empty, /PERFURAR: 150 SUCATAS/);
  assert.match(oilDerrickLiveView(vault({ scrap: 10 }), 0, 0), /data-action="oil-build" data-slot="0" disabled/);
  let state = buildOilDerrick(vault(), 0, 0);
  assert.match(oilDerrickLiveView(state, 0, 5_000), /MONTANDO A SONDA · FALTAM 15s/);
  const ready = oilDerrickLiveView(state, 0, OIL_LEVELS[1].buildMs + 10 * MINUTE);
  assert.match(ready, /RECOLHER 20 BARRIS/);
  assert.match(ready, /MELHORAR P\/ NÍVEL 2/);
  assert.match(ready, /→ 3\/min \(\+1\)/);
  assert.match(oilDerrickLiveView(state, 0, OIL_LEVELS[1].buildMs + 999 * MINUTE), /TANQUE CHEIO/);
  const header = oilDerrickView(state, 0, OIL_LEVELS[1].buildMs + MINUTE);
  assert.match(header, /NÍVEL 1/);
  assert.equal((header.match(/class="is-on"/g) ?? []).length, 1);
  state = { ...state, oil_derricks: [{ level: 5, collectedAt: 0, upgradeUntil: 0 }, null, null] };
  assert.match(oilDerrickLiveView(state, 0, 1_000), /NÍVEL MÁXIMO/);
});
