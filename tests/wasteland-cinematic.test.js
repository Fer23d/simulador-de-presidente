import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/game-state.js';
import { transicionarParaWasteland } from '../src/core/wasteland.js';
import { renderWastelandCinematic } from '../src/ui/dashboard.js';

test('marks the nuclear transition as cinematic and preserves the Wasteland chapter', () => {
  const state = transicionarParaWasteland(createGameState('bra'), 'ataque-nuclear');

  assert.equal(state.is_wasteland, true);
  assert.equal(state.wasteland_cinematic_pending, true);
  assert.equal(state.wasteland_cinematic_ready, false);
  assert.ok(state.unlocked_chapters.includes('cap_5_wasteland'));
});

test('renders the cinematic Vault command card only after the flash completes', () => {
  assert.equal(renderWastelandCinematic({ is_wasteland: true, wasteland_cinematic_ready: false }), '');

  const markup = renderWastelandCinematic({ is_wasteland: true, wasteland_cinematic_ready: true });
  assert.match(markup, /☢️/);
  assert.match(markup, /SENSORES EXTERNOS DESTRUÍDOS/);
  assert.match(markup, /ASSUMIR COMANDO DO VAULT/);
});
