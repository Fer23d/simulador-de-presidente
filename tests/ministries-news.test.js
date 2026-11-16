import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMonth, createGameState, hireMinister } from '../src/core/game-state.js';
import { MINISTERS, createMinisters, getMinisterModifiers, normalizeMinisters, processMinisters } from '../src/core/ministers.js';
import { getPactChance } from '../src/core/world_order.js';
import { pushWorldNews } from '../src/core/world_news.js';

const base = () => {
  const s = { ...createGameState('bra', { name: 'P', language: 'pt-BR' }), monthCounter: 10, pendingBriefing: null, pendingEvent: null };
  return { ...s, economy: { ...s.economy, cash: 5e12 } };
};

test('o gabinete tem 9 ministerios, todos contrataveis e sem ids repetidos', () => {
  assert.equal(MINISTERS.length, 9);
  assert.equal(new Set(MINISTERS.map((m) => m.id)).size, 9);
  let s = base();
  for (const m of MINISTERS) s = hireMinister(s, m.id);
  assert.equal(Object.values(s.ministers).filter(Boolean).length, 9);
  assert.deepEqual(Object.keys(createMinisters()).sort(), MINISTERS.map((m) => m.id).sort());
});

test('saves antigos so com economia e defesa carregam; dados sujos sao descartados', () => {
  const old = normalizeMinisters({ economy: { id: 'economy' }, defense: { id: 'defense' }, lixo: { id: 'x' } });
  assert.equal(old.economy.id, 'economy');
  assert.equal(old.health, null);
  assert.equal(old.lixo, undefined);
  assert.equal(normalizeMinisters(null).economy, null);
});

test('efeitos: exteriores sobe pactos, inteligencia baixa risco, saude/educacao/agricultura/justica agem por mes', () => {
  const plain = base();
  const mod = getMinisterModifiers({ foreign: { id: 'foreign' }, intelligence: { id: 'intelligence' } });
  assert.equal(mod.pactBonus, 0.06);
  assert.equal(mod.spyRisk, 0.7);
  assert.ok(getPactChance({ ...plain, ministers: { ...plain.ministers, foreign: { id: 'foreign' } } }, 'arg') > getPactChance(plain, 'arg'));
  let s = { ...plain, regime: { ...plain.regime, unrest: 30, coupRisk: 0.1 }, economy: { ...plain.economy, inflation: 0.05 } };
  for (const id of ['health', 'education', 'agriculture', 'justice', 'infrastructure']) s = hireMinister(s, id);
  const out = processMinisters(s);
  assert.ok(out.regime.unrest < 30);
  assert.ok(out.economy.gdp > s.economy.gdp);
  assert.ok(out.economy.inflation < 0.05);
  assert.ok(out.regime.coupRisk < 0.1);
  assert.ok(out.factions.trabalhadores >= s.factions.trabalhadores);
  assert.ok(advanceMonth(s).monthCounter > s.monthCounter);
});

test('o giro de noticias mostra as noticias do mundo', async () => {
  const { renderNews } = await import('../src/ui/dashboard.js');
  const s = pushWorldNews(base(), 'Argentina anexou Uruguai.', 'annex');
  const html = renderNews(s);
  assert.match(html, /Notícias do mundo/);
  assert.match(html, /Argentina anexou Uruguai/);
  assert.doesNotMatch(html, /Ultimas manchetes/);
});
