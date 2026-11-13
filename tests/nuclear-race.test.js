import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceMonth, createGameState, hydrateGameState, lancarCiberataque, proporNaoProliferacao, sabotarProgramaNuclear } from '../src/core/game-state.js';
import { advanceDefcon, hasHostileNuclearPower } from '../src/core/defcon.js';
import { processarAgressaoIA } from '../src/core/geopolitics.js';
import {
  MAX_ACTIVE_PROGRAMS, NPT_MONTHS, createNuclearRace, describePressure, getPlayerNuclearPressure, getProgramRate, getRaceActionStatus, normalizeNuclearRace, processNuclearRace, setbackProgram,
} from '../src/core/nuclear_race.js';
import { diplomacyMap, nuclearRacePanel } from '../src/ui/dashboard.js';

const patchContact = (state, id, patch) => ({ ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)) } });
const mapContacts = (state, fn) => ({ ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map(fn) } });
const withPlan = (state, nuclear = {}) => ({ ...state, military: { ...state.military, nuclear: { ...state.military.nuclear, planStarted: true, ...nuclear } } });
const base = (month = 30) => ({ ...createGameState('bra'), monthCounter: month });
const candidate = (state) => state.geopolitics.contacts.find((c) => c.id !== 'bra' && !c.has_nukes && !c.alliance && !c.destruido);
const withProgram = (state, id, patch = {}) => ({ ...state, nuclearRace: { ...createNuclearRace(), programs: { [id]: { progress: 40, startedMonth: 1, pausedUntil: 0, lastSabotage: -99, ...patch } } } });

test('BUG: com todas as potencias nucleares amigas o DEFCON nao chega a 1 mesmo em tensao total', () => {
  let state = mapContacts(base(), (c) => (c.has_nukes ? { ...c, relation: 60 } : c));
  assert.equal(hasHostileNuclearPower(state), false);
  state = { ...state, defconAnnexationMonths: 24 };
  for (let i = 0; i < 12; i += 1) state = advanceDefcon(state);
  assert.ok(state.global_defcon >= 2, `DEFCON ${state.global_defcon}`);
  assert.equal(state.global_defcon, 2);
});

test('BUG: uma potencia nuclear hostil continua levando ao DEFCON 1; aliada ou fantoche nao conta', () => {
  const hostileNuke = createGameState('bra').geopolitics.contacts.find((c) => c.has_nukes).id;
  let hostile = mapContacts({ ...base(), defconAnnexationMonths: 24 }, (c) => (c.has_nukes ? { ...c, relation: 60 } : c));
  hostile = patchContact(hostile, hostileNuke, { relation: -10 });
  assert.equal(hasHostileNuclearPower(hostile), true);
  for (let i = 0; i < 6; i += 1) hostile = advanceDefcon(hostile);
  assert.equal(hostile.global_defcon, 1);
  const allied = patchContact(hostile, hostileNuke, { alliance: true });
  assert.equal(hasHostileNuclearPower(allied), false);
  const puppet = patchContact(hostile, hostileNuke, { puppet: true, is_puppet_of: 'jogador' });
  assert.equal(hasHostileNuclearPower(puppet), false);
});

test('BUG: no DEFCON 1 so ataca com bomba quem nao e aliado nem fantoche', () => {
  const nuke = createGameState('bra').geopolitics.contacts.find((c) => c.has_nukes).id;
  const calmWorld = mapContacts({ ...base(), global_defcon: 1 }, (c) => (c.has_nukes ? { ...c, relation: 60 } : c));
  const dangerous = { ...patchContact(calmWorld, nuke, { relation: -50 }), pendingHostileAlert: null };
  assert.equal(processarAgressaoIA(dangerous, 0).pendingHostileAlert?.type, 'nuclear');
  const allied = patchContact(dangerous, nuke, { alliance: true });
  assert.equal(processarAgressaoIA(allied, 0).pendingHostileAlert, null);
  const puppet = patchContact(dangerous, nuke, { puppet: true, is_puppet_of: 'jogador' });
  assert.equal(processarAgressaoIA(puppet, 0).pendingHostileAlert, null);
});

test('estado novo e saves antigos ganham nuclearRace; saves normalizam dados sujos', () => {
  assert.deepEqual(createGameState('bra').nuclearRace, createNuclearRace());
  const legacy = JSON.parse(JSON.stringify(createGameState('bra')));
  delete legacy.nuclearRace;
  assert.deepEqual(hydrateGameState(JSON.stringify(legacy)).nuclearRace, createNuclearRace());
  const dirty = normalizeNuclearRace({ programs: { x: { progress: 900 } }, completed: ['a', 'a', 4], alarmMonths: -3 });
  assert.equal(dirty.programs.x.progress, 100);
  assert.deepEqual(dirty.completed, ['a']);
  assert.equal(dirty.alarmMonths, 0);
});

test('a pressao nuclear do jogador sobe com plano, progresso militar e bomba', () => {
  assert.equal(getPlayerNuclearPressure(base()), 0);
  const plan = withPlan(base());
  const advanced = withPlan(base(), { militaryProgress: 60 });
  const bomb = withPlan(base(), { militaryProgress: 100, bombBuilt: true, arsenal: 2 });
  assert.ok(getPlayerNuclearPressure(plan) > 0);
  assert.ok(getPlayerNuclearPressure(advanced) > getPlayerNuclearPressure(plan));
  assert.ok(getPlayerNuclearPressure(bomb) > getPlayerNuclearPressure(advanced));
  assert.match(describePressure(getPlayerNuclearPressure(bomb)), /alta/);
});

test('sem plano nuclear nada acontece; com plano, paises nao aliados iniciam programas ao longo do tempo', () => {
  let quiet = base(20);
  for (let month = 20; month < 160; month += 1) quiet = processNuclearRace({ ...quiet, monthCounter: month });
  assert.deepEqual(quiet.nuclearRace.programs, {});
  let racing = withPlan(base(20), { militaryProgress: 40 });
  for (let month = 20; month < 80; month += 1) racing = processNuclearRace({ ...racing, monthCounter: month });
  assert.ok(Object.keys(racing.nuclearRace.programs).length + racing.nuclearRace.completed.length > 0, 'algum pais entrou na corrida');
  assert.ok(Object.keys(racing.nuclearRace.programs).length <= MAX_ACTIVE_PROGRAMS);
});

test('aliados e fantoches nunca iniciam programas nucleares', () => {
  let state = withPlan(base(20), { militaryProgress: 80 });
  state = mapContacts(state, (c) => ({ ...c, alliance: true }));
  for (let month = 20; month < 200; month += 1) state = processNuclearRace({ ...state, monthCounter: month });
  assert.deepEqual(state.nuclearRace.programs, {});
});

test('o programa avanca todo mes; sancao, guerra e tratado o desaceleram ou congelam', () => {
  const target = candidate(base());
  const plain = withProgram(withPlan(base(), { militaryProgress: 30 }), target.id);
  const rate = getProgramRate(plain, target);
  assert.ok(rate >= 0.8);
  const after = processNuclearRace({ ...plain, monthCounter: 31 });
  assert.ok(after.nuclearRace.programs[target.id].progress > 40);
  const sanctioned = patchContact(plain, target.id, { sancionado_por_jogador: true });
  assert.ok(getProgramRate(sanctioned, sanctioned.geopolitics.contacts.find((c) => c.id === target.id)) < rate * 0.4);
  const warring = patchContact(plain, target.id, { atWar: true, atWarAgainst: 'bra' });
  const bombed = processNuclearRace({ ...warring, monthCounter: 31 });
  assert.ok(bombed.nuclearRace.programs[target.id].progress < after.nuclearRace.programs[target.id].progress);
  const paused = withProgram(withPlan(base(), { militaryProgress: 30 }), target.id, { pausedUntil: 99 });
  assert.equal(processNuclearRace({ ...paused, monthCounter: 31 }).nuclearRace.programs[target.id].progress, 40);
});

test('programa completo vira bomba, reinicia o DEFCON e sobrevive a salvar e carregar', () => {
  const target = candidate(base());
  const near = withProgram(withPlan(base(), { militaryProgress: 30 }), target.id, { progress: 99.5 });
  const done = processNuclearRace({ ...near, monthCounter: 31, defconPeacefulMonths: 7 });
  const contact = done.geopolitics.contacts.find((c) => c.id === target.id);
  assert.equal(contact.has_nukes, true);
  assert.ok(contact.nuclearWeapons >= 1);
  assert.deepEqual(done.nuclearRace.completed, [target.id]);
  assert.equal(done.nuclearRace.programs[target.id], undefined);
  assert.equal(done.defconPeacefulMonths, 0);
  assert.match(done.notice, /testou sua primeira bomba/);
  const loaded = hydrateGameState(JSON.stringify(done));
  assert.equal(loaded.geopolitics.contacts.find((c) => c.id === target.id).has_nukes, true);
  const original = createGameState('bra').geopolitics.contacts.find((c) => c.id === target.id);
  assert.equal(original.has_nukes, false);
});

test('fantoche, anexacao, alianca e desmilitarizacao encerram o programa', () => {
  const target = candidate(base());
  const racing = withProgram(withPlan(base(), { militaryProgress: 30 }), target.id);
  const gone = (patch) => processNuclearRace({ ...patchContact(racing, target.id, patch), monthCounter: 31 }).nuclearRace.programs[target.id];
  assert.equal(gone({ puppet: true, is_puppet_of: 'jogador' }), undefined);
  assert.equal(gone({ anexado: true, destruido: true }), undefined);
  assert.equal(gone({ alliance: true }), undefined);
  assert.equal(gone({ demilitarizedMonths: 100 }), undefined);
  assert.ok(gone({}), 'sem nada disso o programa segue');
});

test('tratado de nao proliferacao: exige relacao, nao vale com bomba no seu arsenal, congela por 24 meses', () => {
  const target = candidate(base());
  const racing = withProgram(withPlan(base(), { militaryProgress: 30 }), target.id);
  const friendly = patchContact(racing, target.id, { relation: 50 });
  assert.equal(getRaceActionStatus(patchContact(racing, target.id, { relation: 10 }), 'treaty', target.id).available, false);
  const bomb = withPlan(friendly, { bombBuilt: true });
  assert.match(getRaceActionStatus(bomb, 'treaty', target.id).reason, /autoridade/);
  const signed = proporNaoProliferacao(friendly, target.id);
  assert.equal(signed.nuclearRace.programs[target.id].pausedUntil, 30 + NPT_MONTHS);
  assert.ok(signed.economy.cash < friendly.economy.cash);
  assert.ok(signed.geopolitics.contacts.find((c) => c.id === target.id).relation > 50);
  assert.equal(getRaceActionStatus(signed, 'treaty', target.id).available, false);
  assert.match(proporNaoProliferacao(base(), 'arg').notice, /não tem programa/);
});

test('sabotagem: custa caixa, tem intervalo, e as vezes funciona e as vezes e descoberta', () => {
  const target = candidate(base());
  const outcomes = new Set();
  for (let month = 30; month < 90; month += 1) {
    const racing = { ...withProgram(withPlan(base(month), { militaryProgress: 30 }), target.id), monthCounter: month };
    const result = sabotarProgramaNuclear(racing, target.id);
    assert.ok(result.economy.cash < racing.economy.cash);
    const progress = result.nuclearRace.programs[target.id].progress;
    outcomes.add(progress < 40 ? 'sucesso' : 'descoberta');
    if (progress < 40) assert.equal(progress, 15);
    else assert.ok(result.geopolitics.contacts.find((c) => c.id === target.id).relation < racing.geopolitics.contacts.find((c) => c.id === target.id).relation);
    assert.equal(getRaceActionStatus(result, 'sabotage', target.id).available, false, 'intervalo');
  }
  assert.deepEqual([...outcomes].sort(), ['descoberta', 'sucesso']);
});

test('ciberataque atrasa o programa e o alerta de pressao acelera a corrida', () => {
  const target = candidate(base());
  const racing = withProgram(withPlan(base(), { militaryProgress: 30 }), target.id);
  assert.equal(setbackProgram(racing, target.id, 15).nuclearRace.programs[target.id].progress, 25);
  const calm = processNuclearRace({ ...racing, monthCounter: 31, nuclearRace: { ...racing.nuclearRace, lastPressure: 9 } });
  const alarmed = processNuclearRace({ ...racing, monthCounter: 31, nuclearRace: { ...racing.nuclearRace, lastPressure: 0 } });
  assert.equal(alarmed.nuclearRace.alarmMonths, 4);
  assert.ok(alarmed.nuclearRace.programs[target.id].progress > calm.nuclearRace.programs[target.id].progress, 'em alerta o ritmo e maior');
  assert.equal(typeof lancarCiberataque, 'function');
});

test('em alerta, potencias nucleares nao aliadas ampliam o arsenal', () => {
  let state = withPlan(base(20), { militaryProgress: 90, bombBuilt: true });
  const before = state.geopolitics.contacts.filter((c) => c.has_nukes).reduce((sum, c) => sum + (c.nuclearWeapons || 0), 0);
  for (let month = 20; month < 200; month += 1) {
    state = processNuclearRace({ ...state, monthCounter: month, nuclearRace: { ...state.nuclearRace, lastPressure: Math.max(0, state.nuclearRace.lastPressure - 0.2) } });
  }
  const after = state.geopolitics.contacts.filter((c) => c.has_nukes).reduce((sum, c) => sum + (c.nuclearWeapons || 0), 0);
  assert.ok(after > before);
});

test('painel e mapa mostram os programas e as opcoes de supressao', () => {
  const target = candidate(base());
  const state = withProgram(withPlan(base(), { militaryProgress: 30 }), target.id);
  const html = nuclearRacePanel(state);
  assert.match(html, /Corrida nuclear/);
  assert.match(html, new RegExp(`data-action="sanction" data-contact="${target.id}"`));
  assert.match(html, /data-action="nuclear-treaty"/);
  assert.match(html, /data-action="nuclear-sabotage"/);
  assert.match(html, /data-action="war"/);
  assert.equal(nuclearRacePanel(base()), '');
  assert.match(diplomacyMap(state, { selected: target.id }), /map-shape--atomic/);
  assert.match(diplomacyMap(state, { selected: target.id }), /Programa nuclear em curso/);
});

test('avancar meses completos com plano nuclear e corrida mantem o estado valido', () => {
  let state = withPlan({ ...createGameState('bra'), monthCounter: 8 }, { militaryProgress: 50, civilProgress: 20 });
  for (let index = 0; index < 48; index += 1) {
    state = advanceMonth({ ...state, pendingEvent: null, pendingBriefing: null, pendingHostileAlert: null, pendingUnVote: null, pendingGlobalBid: null, pendingStory: null });
    if (state.regime.gameOver) break;
    assert.ok(Number.isFinite(state.economy.cash));
    assert.ok(Object.values(state.nuclearRace.programs).every((p) => p.progress >= 0 && p.progress < 100));
  }
});
