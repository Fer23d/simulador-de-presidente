import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/game-state.js';
import { getMapCountryVisual, renderMap } from '../src/core/map_engine.js';
import { warRoomView } from '../src/ui/dashboard.js';

function fakePath(id) {
  const classes = new Set();
  return {
    id,
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    setAttribute(name, value) {
      this[name] = value;
    },
  };
}

function fakeSvg(paths) {
  const classes = new Set();
  return {
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    querySelectorAll(selector) {
      return selector === '[data-map-country]' ? paths : [];
    },
    setAttribute(name, value) {
      this[name] = value;
    },
  };
}

test('classifica países do mapa por jogador, aliança, guerra e relação nuclear', () => {
  const state = createGameState('bra');
  const russia = state.geopolitics.contacts.find((contact) => contact.id === 'rus');
  russia.relation = 0;
  russia.atWar = true;
  const argentina = state.geopolitics.contacts.find((contact) => contact.id === 'arg');
  argentina.relation = 75;
  const visual = getMapCountryVisual({
    ...state,
    player_alliance: ['arg'],
  }, russia);

  assert.equal(getMapCountryVisual(state, state.country).role, 'player');
  assert.equal(getMapCountryVisual({ ...state, player_alliance: ['arg'] }, argentina).role, 'ally');
  assert.equal(visual.role, 'war');
  assert.equal(visual.nuclearThreat, true);
  assert.equal(getMapCountryVisual(state, argentina).role, 'friendly');
});

test('renderMap pinta paths e aplica o estado Fallout ao SVG', () => {
  const state = createGameState('bra');
  const russia = state.geopolitics.contacts.find((contact) => contact.id === 'rus');
  russia.relation = 10;
  const paths = [fakePath('bra'), fakePath('rus')];
  const svg = fakeSvg(paths);

  assert.equal(renderMap(state, svg), 2);
  assert.equal(paths[0].classList.contains('map-player'), true);
  assert.equal(paths[1].classList.contains('map-tense'), true);
  assert.equal(paths[1].classList.contains('map-nuclear-threat'), true);

  renderMap({ ...state, is_wasteland: true }, svg);
  assert.equal(svg.classList.contains('map-fallout'), true);
  assert.equal(svg['aria-disabled'], 'true');
});

test('warRoomView expõe IDs SVG compatíveis com o banco de países', () => {
  const markup = warRoomView(createGameState('bra'));
  assert.match(markup, /data-war-map/);
  assert.match(markup, /id="usa"/);
  assert.match(markup, /id="rus"/);
  assert.match(markup, /id="bra"/);
  assert.match(markup, /SALA DE GUERRA/);
});
