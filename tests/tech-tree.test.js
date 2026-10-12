import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MILITARY_TECHNOLOGIES,
  calculateMilitaryResearchPoints,
  getMilitaryTechnology,
  pesquisarTecnologia,
} from '../src/core/tech_tree.js';

test('defines the approved military technology catalog and research formula', () => {
  assert.deepEqual(MILITARY_TECHNOLOGIES.map(({ id, cost, requires }) => [id, cost, requires]), [
    ['missiles', 1_000, []],
    ['cyber', 2_500, []],
    ['bio', 5_000, []],
    ['nuke', 10_000, ['missiles']],
    ['dead_hand', 25_000, ['nuke']],
  ]);
  assert.equal(getMilitaryTechnology('cyber').title, '[ CIBER-GUERRA ZERO-DAY ]');
  assert.equal(calculateMilitaryResearchPoints({ gdp: 2_200_000_000_000 }, { defenseSpend: 0.06 }), 132);
  assert.equal(calculateMilitaryResearchPoints({ gdp: 1 }, { defenseSpend: 0.01 }), 1);
  assert.equal(calculateMilitaryResearchPoints({ gdp: 2_200_000_000_000 }, { defenseSpend: 0 }), 0);
});

test('purchases a military technology without mutating the input state', () => {
  const state = { military_research_points: 1_000, unlocked_techs: [], notice: '' };

  const result = pesquisarTecnologia(state, 'missiles');

  assert.equal(result.military_research_points, 0);
  assert.deepEqual(result.unlocked_techs, ['missiles']);
  assert.match(result.notice, /M.SSEIS/i);
  assert.deepEqual(state, { military_research_points: 1_000, unlocked_techs: [], notice: '' });
});

test('rejects invalid, unaffordable, duplicate, and unmet dependency projects', () => {
  const state = { military_research_points: 25_000, unlocked_techs: [], notice: '' };
  const nukeWithoutMissiles = pesquisarTecnologia(state, 'nuke');
  const missiles = pesquisarTecnologia(state, 'missiles');
  const duplicate = pesquisarTecnologia(missiles, 'missiles');
  const insufficient = pesquisarTecnologia({ ...state, military_research_points: 999 }, 'missiles');
  const missing = pesquisarTecnologia(state, 'unknown');

  assert.equal(nukeWithoutMissiles.military_research_points, state.military_research_points);
  assert.match(nukeWithoutMissiles.notice, /depend/i);
  assert.equal(duplicate.military_research_points, missiles.military_research_points);
  assert.deepEqual(duplicate.unlocked_techs, ['missiles']);
  assert.equal(insufficient.military_research_points, 999);
  assert.match(insufficient.notice, /insuficiente/i);
  assert.equal(missing.military_research_points, state.military_research_points);
  assert.match(missing.notice, /nao encontrado/i);
});
