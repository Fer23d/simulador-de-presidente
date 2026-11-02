import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState, hydrateGameState, updatePlayerProfile } from '../src/core/game-state.js';
import { getUiLanguage, monthName, uiText } from '../src/core/i18n.js';
import { createPlayerProfile, getPlayerDisplayName, normalizeLanguage } from '../src/core/player_profile.js';
import { profileView } from '../src/ui/dashboard.js';

test('creates a safe profile and normalizes the call name', () => {
  const profile = createPlayerProfile({ name: '  Layd   Almeida  ', language: 'en' });

  assert.deepEqual(profile, { name: 'Layd Almeida', language: 'en' });
  assert.equal(normalizeLanguage('fr'), 'pt-BR');
});

test('profile updates are immutable and survive serialization', () => {
  const state = createGameState('bra');
  const next = updatePlayerProfile(state, { name: 'Comandante Aurora', language: 'es' });
  const loaded = hydrateGameState(JSON.stringify(next));

  assert.equal(state.playerProfile.name, '');
  assert.deepEqual(loaded.playerProfile, { name: 'Comandante Aurora', language: 'es' });
  assert.equal(getPlayerDisplayName(loaded), 'Comandante Aurora');
});

test('profile view exposes identity, language and existing settings controls', () => {
  const state = updatePlayerProfile(createGameState('bra'), { name: 'Aurora', language: 'en' });
  const markup = profileView(state, { audio: { volume: 0.7, muted: false }, tutorialEnabled: true });

  assert.match(markup, /My profile/);
  assert.match(markup, /Aurora/);
  assert.match(markup, /Interface language/);
  assert.match(markup, /Português \(Brasil\)/);
  assert.match(markup, /Restart tutorial/);
  assert.match(markup, /data-profile-volume/);
});

test('interface labels and calendar months change without touching story text', () => {
  assert.equal(uiText('es', 'nav.profile'), 'Mi perfil');
  assert.equal(uiText('en', 'metric.cash'), 'National treasury');
  assert.equal(monthName('es', 3), 'Marzo');
  assert.equal(getUiLanguage({ playerProfile: { language: 'en' } }), 'en');
});
