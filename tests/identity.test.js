import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceMonth, createGameState, enviarTropas, hydrateGameState, proporNaoProliferacao, renomearOrganizacao, restaurarNomeOriginal, startWar } from '../src/core/game-state.js';
import {
  ORG_MIN_ANNEXED, ORG_RENAME_COOLDOWN, TITLES, TITLE_ORDER, createReputation, getActiveTitles, getCurrentTitle, getOrgNameSuggestions,
  getRenameStatus, getTitleModifier, normalizeReputation, processReputation, sanitizeOrgName,
} from '../src/core/identity.js';
import { getTradeWarRisk } from '../src/core/trade_war.js';
import { getAttackChance, processTerritoryThreats } from '../src/core/territory_defense.js';
import { getRaceActionStatus } from '../src/core/nuclear_race.js';
import { diplomacyMap, identityPanel } from '../src/ui/dashboard.js';

const mapContacts = (state, fn) => ({ ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map(fn) } });
const annex = (state, ids) => mapContacts(state, (c) => (ids.includes(c.id) ? { ...c, anexado: true, destruido: true, militaryPower: 0 } : c));
const rep = (state, patch) => ({ ...state, reputation: { ...createReputation(), ...patch } });
const base = (id = 'rus', month = 30) => ({ ...createGameState(id), monthCounter: month });

test('estado novo e saves antigos ganham reputacao e controle de renomeacao', () => {
  const fresh = createGameState('bra');
  assert.deepEqual(fresh.reputation, createReputation());
  assert.equal(fresh.orgRenameMonth, -99);
  const legacy = JSON.parse(JSON.stringify(fresh));
  delete legacy.reputation; delete legacy.orgRenameMonth;
  const loaded = hydrateGameState(JSON.stringify(legacy));
  assert.deepEqual(loaded.reputation, createReputation());
  const dirty = normalizeReputation({ stats: { warsDeclared: -4, ntpSigned: 2.7 }, active: ['inexistente', 'pacifier'], current: 'xx' });
  assert.equal(dirty.stats.warsDeclared, 0);
  assert.equal(dirty.stats.ntpSigned, 2);
  assert.deepEqual(dirty.active, ['pacifier']);
  assert.equal(dirty.current, 'pacifier');
});

test('so da para rebatizar a organizacao com 2 paises anexados', () => {
  const none = base();
  assert.equal(getRenameStatus(none).available, false);
  assert.match(getRenameStatus(none).reason, /Anexe 2 países/);
  const one = annex(none, ['chl']);
  assert.equal(getRenameStatus(one).available, false);
  assert.match(renomearOrganizacao(one, 'União Soviética').notice, /Anexe 2 países.*hoje 1/);
  const two = annex(none, ['chl', 'ury']);
  assert.equal(getRenameStatus(two).available, true);
  assert.equal(ORG_MIN_ANNEXED, 2);
});

test('rebatizar muda o nome em todo o jogo e guarda o original', () => {
  const state = annex(base('rus'), ['chl', 'ury']);
  const original = state.country.nome;
  const renamed = renomearOrganizacao(state, '  União   Soviética ');
  assert.equal(renamed.country.nome, 'União Soviética');
  assert.equal(renamed.country.originalName, original);
  assert.equal(renamed.orgRenameMonth, 30);
  assert.ok(renamed.factions.militares > state.factions.militares);
  assert.ok(renamed.factions.elite < state.factions.elite);
  assert.match(renamed.notice, /agora se chama União Soviética/);
  assert.match(renamed.news[0].text, /União Soviética/);
  assert.match(diplomacyMap(renamed, {}), /União Soviética \(você\)/);
  assert.match(identityPanel(renamed), /União Soviética/);
  assert.match(identityPanel(renamed), new RegExp(`antes: ${original}`));
  const loaded = hydrateGameState(JSON.stringify(renamed));
  assert.equal(loaded.country.nome, 'União Soviética');
  assert.equal(loaded.country.originalName, original);
});

test('validacoes do novo nome: curto, igual, caracteres perigosos e intervalo entre trocas', () => {
  const state = annex(base('rus'), ['chl', 'ury']);
  assert.match(renomearOrganizacao(state, 'ab').notice, /pelo menos 3 letras/);
  assert.match(renomearOrganizacao(state, state.country.nome).notice, /já é o nome/);
  assert.equal(sanitizeOrgName('<b>Império</b> "X"&`'), 'bImpério/b X');
  assert.equal(sanitizeOrgName('a'.repeat(100)).length, 40);
  const renamed = renomearOrganizacao(state, 'Império Russo');
  assert.match(renomearOrganizacao(renamed, 'Federação Eurasiana').notice, /Novo nome em 24 mês/);
  const later = { ...renamed, monthCounter: renamed.monthCounter + ORG_RENAME_COOLDOWN };
  assert.equal(renomearOrganizacao(later, 'Federação Eurasiana').country.nome, 'Federação Eurasiana');
  assert.equal(renomearOrganizacao(later, 'Federação Eurasiana').country.originalName, state.country.nome, 'o original nunca e perdido');
});

test('voltar ao nome original e sugestoes por pais', () => {
  const state = annex(base('rus'), ['chl', 'ury']);
  assert.ok(getOrgNameSuggestions(state).includes('União Soviética'));
  assert.ok(getOrgNameSuggestions(state).some((name) => name.startsWith('Império')));
  assert.match(restaurarNomeOriginal(state).notice, /já usa o nome original/);
  const renamed = renomearOrganizacao(state, 'União Soviética');
  assert.match(restaurarNomeOriginal(renamed).notice, /Novo nome em/);
  const later = { ...renamed, monthCounter: 60 };
  const restored = restaurarNomeOriginal(later);
  assert.equal(restored.country.nome, state.country.nome);
  const generic = base('bra');
  assert.ok(getOrgNameSuggestions(generic).includes('Império do Brasil'));
  assert.ok(!getOrgNameSuggestions(renomearOrganizacao({ ...annex(generic, ['chl', 'ury']) }, 'Império do Brasil')).includes('Império do Brasil'));
});

test('cada titulo exige o que promete', () => {
  const clean = base('bra');
  assert.equal(TITLE_ORDER.length, Object.keys(TITLES).length);
  assert.deepEqual(getActiveTitles(rep(clean, {})).filter((id) => id !== 'pacifier'), []);
  const two = annex(clean, ['chl', 'ury']);
  assert.ok(getActiveTitles(two).includes('conqueror'));
  assert.ok(!getActiveTitles(two).includes('emperor'));
  assert.ok(getActiveTitles(annex(clean, ['chl', 'ury', 'arg', 'per'])).includes('emperor'));
  assert.ok(getActiveTitles(rep(clean, { stats: { warsDeclared: 3, ntpSigned: 0, territoriesLost: 0 } })).includes('warmonger'));
  const bomb = { ...clean, military: { ...clean.military, nuclear: { ...clean.military.nuclear, bombBuilt: true } }, nuclearRace: { programs: {}, completed: ['arg'], lastPressure: 0, alarmMonths: 0 } };
  assert.ok(getActiveTitles(bomb).includes('proliferator'));
  assert.ok(!getActiveTitles({ ...bomb, nuclearRace: { ...bomb.nuclearRace, completed: [] } }).includes('proliferator'));
  assert.ok(getActiveTitles({ ...clean, capitalId: 'chl' }).includes('wanderer'));
  assert.ok(getActiveTitles(rep(clean, { stats: { warsDeclared: 0, ntpSigned: 2, territoriesLost: 0 } })).includes('guardian'));
  assert.ok(!getActiveTitles({ ...rep(clean, { stats: { warsDeclared: 0, ntpSigned: 2, territoriesLost: 0 } }), military: bomb.military }).includes('guardian'), 'com bomba nao ha guardiao');
  const peaceful = { ...clean, geopolitics: { ...clean.geopolitics, onuScore: 70 } };
  assert.ok(getActiveTitles(peaceful).includes('pacifier'));
  assert.ok(!getActiveTitles(rep(peaceful, { stats: { warsDeclared: 1, ntpSigned: 0, territoriesLost: 0 } })).includes('pacifier'));
  assert.ok(!getActiveTitles({ ...peaceful, monthCounter: 6 }).includes('pacifier'), 'so depois de 12 meses');
  const diplomat = { ...clean, diplomacyLife: { ...clean.diplomacyLife, summitsHeld: 3, inspectionsAccepted: 1 } };
  assert.ok(getActiveTitles(diplomat).includes('diplomat'));
  const merchant = { ...mapContacts(clean, (c, i) => (i < 10 ? { ...c, tradeTreaty: true } : c)), tradeWar: { ...clean.tradeWar, history: [{ aggressorId: 'usa', startMonth: 1, endMonth: 4, outcome: 'acordo', loss: 1 }] } };
  assert.ok(getActiveTitles(merchant).includes('merchant'));
});

test('o titulo atual segue a prioridade e o mes avisa sobre titulos novos e perdidos', () => {
  const state = { ...annex(base('bra'), ['chl', 'ury']), geopolitics: { ...annex(base('bra'), ['chl', 'ury']).geopolitics, onuScore: 70 } };
  assert.equal(getCurrentTitle(state).id, 'conqueror', 'conquistador tem prioridade sobre pacificador');
  const gained = processReputation(state);
  assert.match(gained.notice, /Novo título: Conquistador/);
  assert.equal(gained.reputation.current, 'conqueror');
  assert.ok(gained.reputation.active.includes('pacifier'));
  const lost = processReputation({ ...gained, geopolitics: { ...gained.geopolitics, contacts: gained.geopolitics.contacts.map((c) => ({ ...c, anexado: false, destruido: false })) } });
  assert.match(lost.notice, /perdeu o título de Conquistador/);
  assert.equal(lost.reputation.current, 'pacifier');
});

test('titulos mudam a relacao e a ONU todo mes, sem mexer em aliados, guerras ou extremos', () => {
  const peaceful = mapContacts({ ...base('bra'), geopolitics: { ...base('bra').geopolitics, onuScore: 70 } }, (c, i) => ({ ...c, relation: 10, alliance: i === 0, atWar: i === 1 }));
  const after = processReputation(peaceful);
  const [ally, warring, other] = after.geopolitics.contacts;
  assert.equal(ally.relation, 10);
  assert.equal(warring.relation, 10);
  assert.ok(other.relation > 10);
  assert.ok(after.geopolitics.onuScore > 70);
  const maxed = processReputation(mapContacts(peaceful, (c) => ({ ...c, relation: 80 })));
  assert.equal(maxed.geopolitics.contacts[2].relation, 80, 'sem deriva acima de 75');
  const feared = processReputation(mapContacts(annex(base('bra'), ['chl', 'ury']), (c) => (c.anexado ? c : { ...c, relation: 10 })));
  assert.ok(feared.geopolitics.contacts.find((c) => c.id === 'arg').relation < 10);
});

test('titulos mexem em riscos de outros sistemas: ataques, guerra comercial e tratado nuclear', () => {
  const plain = base('bra');
  assert.equal(getTitleModifier(plain, 'territoryAttack'), 1);
  assert.equal(getTitleModifier(plain, 'relationDrift'), 0);
  const conqueror = annex(plain, ['chl', 'ury']);
  assert.equal(getTitleModifier(conqueror, 'territoryAttack'), 0.8);
  const hostile = mapContacts(conqueror, (c) => (c.id === 'arg' ? { ...c, relation: -50, militaryPower: 30 } : { ...c, relation: 80, militaryPower: 2 }));
  const chance = getAttackChance(hostile, 'chl');
  const noTitle = getAttackChance(mapContacts(hostile, (c) => (c.id === 'ury' ? { ...c, anexado: false, destruido: false } : c)), 'chl');
  assert.ok(chance < noTitle);
  const merchant = { ...mapContacts(plain, (c, i) => (i < 10 ? { ...c, tradeTreaty: true } : c)), tradeWar: { ...plain.tradeWar, history: [{ aggressorId: 'usa', startMonth: 1, endMonth: 4, outcome: 'acordo', loss: 1 }] } };
  assert.ok(getTitleModifier(merchant, 'tradeWarRisk') < 1);
  assert.ok(getTradeWarRisk(merchant) < getTradeWarRisk({ ...merchant, tradeWar: { ...merchant.tradeWar, history: [] } }));
  const target = plain.geopolitics.contacts.find((c) => !c.has_nukes && !c.alliance);
  const race = { ...plain, military: { ...plain.military, nuclear: { ...plain.military.nuclear, planStarted: true } }, nuclearRace: { programs: { [target.id]: { progress: 30, startedMonth: 1, pausedUntil: 0, lastSabotage: -99 } }, completed: [], lastPressure: 0, alarmMonths: 0 } };
  const lowRelation = mapContacts(race, (c) => (c.id === target.id ? { ...c, relation: 22 } : c));
  assert.equal(getRaceActionStatus(lowRelation, 'treaty', target.id).available, false);
  const guardian = { ...lowRelation, reputation: { ...createReputation(), stats: { warsDeclared: 0, ntpSigned: 2, territoriesLost: 0 } } };
  assert.equal(getRaceActionStatus(guardian, 'treaty', target.id).available, true);
});

test('os contadores da reputacao sobem com guerras, tratados e territorios perdidos', () => {
  const state = base('bra');
  const victim = state.geopolitics.contacts.find((c) => !c.alliance && !c.atWar && !c.puppet);
  const warred = startWar(state, victim.id);
  assert.equal(warred.reputation.stats.warsDeclared, 1);
  assert.equal(startWar(warred, victim.id).reputation.stats.warsDeclared, 1, 'a mesma guerra nao conta duas vezes');
  const target = state.geopolitics.contacts.find((c) => !c.has_nukes && !c.alliance && c.id !== victim.id);
  const racing = mapContacts({ ...state, nuclearRace: { programs: { [target.id]: { progress: 30, startedMonth: 1, pausedUntil: 0, lastSabotage: -99 } }, completed: [], lastPressure: 0, alarmMonths: 0 } }, (c) => (c.id === target.id ? { ...c, relation: 60 } : c));
  assert.equal(proporNaoProliferacao(racing, target.id).reputation.stats.ntpSigned, 1);
  assert.equal(proporNaoProliferacao(base('bra'), target.id).reputation.stats.ntpSigned, 0, 'tratado recusado nao conta');
  let territory = annex({ ...state, monthCounter: 20 }, ['chl']);
  territory = mapContacts(territory, (c) => (c.id === 'arg' ? { ...c, relation: -50, militaryPower: 95 } : c.id === 'chl' ? c : { ...c, relation: 80, militaryPower: Math.min(c.militaryPower, 4) }));
  territory.world = territory.geopolitics.contacts;
  territory = enviarTropas(territory, 'chl');
  let lostTerritory = null;
  for (let month = 20; month < 800 && !lostTerritory; month += 1) {
    const result = processTerritoryThreats({ ...territory, monthCounter: month });
    if (!result.geopolitics.contacts.find((c) => c.id === 'chl').anexado) lostTerritory = result;
  }
  assert.ok(lostTerritory);
  assert.equal(lostTerritory.reputation.stats.territoriesLost, 1);
});

test('painel de identidade: bloqueado com menos de 2 anexados e liberado com 2', () => {
  const locked = identityPanel(base('rus'));
  assert.match(locked, /Título e organização/);
  assert.match(locked, /Anexe 2 países/);
  assert.match(locked, /data-action="rename-org"[^>]*disabled/);
  assert.match(locked, /data-org-name[^>]*disabled/);
  const open = identityPanel(annex(base('rus'), ['chl', 'ury']));
  assert.match(open, /União Soviética/);
  assert.match(open, /data-action="rename-org" data-name="União Soviética"/);
  assert.doesNotMatch(open, /data-org-name[^>]*disabled/);
  assert.match(open, /Conquistador/);
  const renamed = identityPanel(renomearOrganizacao(annex(base('rus'), ['chl', 'ury']), 'União Soviética'));
  assert.match(renamed, /data-action="restore-org-name"/);
  assert.match(identityPanel({ ...base('bra'), reputation: createReputation() }), /Você ainda não tem um título|Pacificador/);
});

test('avancar meses completos avalia os titulos sem erros', () => {
  let state = annex({ ...createGameState('bra'), monthCounter: 8 }, ['chl', 'ury']);
  for (let index = 0; index < 30; index += 1) {
    state = advanceMonth({ ...state, pendingEvent: null, pendingBriefing: null, pendingHostileAlert: null, pendingUnVote: null, pendingGlobalBid: null, pendingStory: null, pendingAllianceInvocation: null });
    if (state.regime.gameOver) break;
    assert.ok(Array.isArray(state.reputation.active));
    assert.ok(state.geopolitics.contacts.every((c) => c.relation >= -100 && c.relation <= 100));
    state = { ...state, geopolitics: { ...state.geopolitics, peaceTreaty: null } };
  }
  assert.ok(state.reputation.active.includes('conqueror') || state.geopolitics.contacts.filter((c) => c.anexado).length < 2);
});
