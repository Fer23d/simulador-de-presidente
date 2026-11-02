import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState, hydrateGameState, updatePlayerProfile } from '../src/core/game-state.js';
import { getUiLanguage, monthName, translateUiText, uiText } from '../src/core/i18n.js';
import { createPlayerProfile, getPlayerDisplayName, normalizeLanguage } from '../src/core/player_profile.js';
import { profileView } from '../src/ui/dashboard.js';
import { levelTrackView } from '../src/ui/level_ui.js';

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
  assert.equal(translateUiText('Diplomacia e Mapa · Reputação global', 'en'), 'Diplomacy and map · Global reputation');
  assert.equal(getUiLanguage({ playerProfile: { language: 'en' } }), 'en');
});

test('progression labels translate completely and can switch languages repeatedly', () => {
  const state = { ...createGameState('bra'), is_wasteland: true, level: { xp: 100, level: 2, recent: [], skins: [] } };
  const english = levelTrackView({ ...state, playerProfile: { ...state.playerProfile, language: 'en' } });
  assert.match(english, /LEVEL TRACK/);
  assert.match(english, /LVL 2/);
  assert.match(english, /SPECIAL REWARD/);
  assert.doesNotMatch(english, /TRILHA DE NÍVEIS|NÍVEL 2|PRÊMIO ESPECIAL/);

  const spanish = levelTrackView({ ...state, playerProfile: { ...state.playerProfile, language: 'es' } });
  assert.match(spanish, /RUTA DE NIVELES/);
  assert.match(spanish, /NIV 2/);
  assert.doesNotMatch(spanish, /LEVEL TRACK|LVL 2|SPECIAL REWARD/);

  const portuguese = levelTrackView({ ...state, playerProfile: { ...state.playerProfile, language: 'pt-BR' } });
  assert.match(portuguese, /TRILHA DE NÍVEIS/);
  assert.match(portuguese, /NV 2/);
});

test('dynamic resource and room labels translate in every direction', () => {
  const labels = 'NÍVEL 4 · PRODUÇÃO · TRABALHADORES · SUCATA · CIÊNCIA · MANUTENÇÃO';
  assert.equal(translateUiText(labels, 'en'), 'LEVEL 4 · PRODUCTION · WORKERS · SCRAP · SCIENCE · MAINTENANCE');
  assert.equal(translateUiText(translateUiText(labels, 'en'), 'es'), 'NIVEL 4 · PRODUCCIÓN · TRABAJADORES · CHATARRA · CIENCIA · MANTENIMIENTO');
  assert.equal(translateUiText(translateUiText(labels, 'es'), 'pt-BR'), labels);
});
