// Corrida nuclear: quando o jogador avanca no Plano Nuclear (ou amplia o arsenal), paises que nao sao aliados
// reagem. Os sem bomba iniciam programas proprios; os que ja tem bomba ampliam o arsenal. O jogador pode frear os
// programas com sancoes, tratado de nao proliferacao, sabotagem, guerra, governo fantoche, anexacao e desmilitarizacao.
import { adjustFactions } from './factions.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const MAX_ACTIVE_PROGRAMS = 4;
export const ELIGIBLE_TOP = 40;
export const NPT_MONTHS = 24;
export const NPT_MIN_RELATION = 30;
export const SABOTAGE_COOLDOWN = 3;
export const SABOTAGE_SETBACK = 25;
export const CYBER_SETBACK = 15;

export function createNuclearRace() {
  return { programs: {}, completed: [], lastPressure: 0, alarmMonths: 0 };
}

export function normalizeNuclearRace(value) {
  const base = createNuclearRace();
  if (!value || typeof value !== 'object') return base;
  const programs = {};
  const raw = value.programs && typeof value.programs === 'object' && !Array.isArray(value.programs) ? value.programs : {};
  for (const [id, item] of Object.entries(raw)) {
    programs[id] = {
      progress: clamp(Number(item?.progress) || 0, 0, 100),
      startedMonth: Math.floor(Number(item?.startedMonth) || 0),
      pausedUntil: Math.floor(Number(item?.pausedUntil) || 0),
      lastSabotage: Number.isFinite(Number(item?.lastSabotage)) ? Math.floor(Number(item.lastSabotage)) : -99,
    };
  }
  return {
    programs,
    completed: Array.isArray(value.completed) ? [...new Set(value.completed.filter((id) => typeof id === 'string'))] : [],
    lastPressure: clamp(Number(value.lastPressure) || 0, 0, 5),
    alarmMonths: Math.max(0, Math.floor(Number(value.alarmMonths) || 0)),
  };
}

function isActiveGame(state) {
  return !state.regime?.gameOver && !state.is_wasteland && !state.city && Boolean(state.geopolitics?.contacts);
}

function hash(month, salt, state) {
  const extra = [...String(state.country?.id ?? '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 131;
  return ((Math.imul(month * 7919 + salt + extra, 2654435761) >>> 0) % 1000) / 1000;
}

const findContact = (state, id) => (state.geopolitics?.contacts ?? []).find((contact) => contact.id === id);
const patchContact = (state, id, patch) => ({ ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((contact) => (contact.id === id ? { ...contact, ...(typeof patch === 'function' ? patch(contact) : patch) } : contact)) } });

function isAlly(state, contact) {
  return Boolean(contact.alliance) || (state.player_alliance ?? []).includes(contact.id);
}

function isMyPuppet(contact) {
  return Boolean(contact.puppet) && contact.is_puppet_of === 'jogador';
}

// Quanto o programa do jogador assusta o mundo: plano iniciado, progresso militar/civil e arsenal.
export function getPlayerNuclearPressure(state) {
  const nuclear = state.military?.nuclear ?? {};
  const arsenal = Math.max(Number(nuclear.arsenal) || 0, Number(state.military?.armasNucleares) || 0);
  if (!nuclear.planStarted && !nuclear.bombBuilt && arsenal < 1) return 0;
  let pressure = 0.3;
  pressure += ((Number(nuclear.militaryProgress) || 0) / 100) * 0.7;
  pressure += ((Number(nuclear.civilProgress) || 0) / 100) * 0.2;
  if (nuclear.bombBuilt) pressure += 0.4;
  pressure += Math.min(arsenal, 6) * 0.05;
  return Math.round(pressure * 1000) / 1000;
}

export function describePressure(pressure) {
  if (pressure <= 0) return 'nenhuma';
  if (pressure < 0.5) return 'baixa';
  if (pressure < 1) return 'média';
  return 'alta';
}

function pibFactor(contact) {
  return clamp((Math.log10(Math.max(1, Number(contact.pib_base) || 1)) - 10.5) * 0.6, 0, 1.8);
}

export function getProgramRate(state, contact, alarm = false) {
  let rate = 0.8 + (pibFactor(contact) * 0.7) + (alarm ? 0.3 : 0);
  if (contact.sancionado_por_jogador) rate *= 0.35;
  if (contact.atWar) rate *= 0.5;
  return Math.round(rate * 100) / 100;
}

export function getPrograms(state) {
  const race = normalizeNuclearRace(state.nuclearRace);
  const month = Number(state.monthCounter) || 0;
  return Object.entries(race.programs).map(([id, program]) => {
    const contact = findContact(state, id);
    return { id, contact, program, paused: program.pausedUntil > month, rate: contact ? getProgramRate(state, contact, race.alarmMonths > 0) : 0 };
  }).filter((item) => item.contact);
}

function eligible(state, contact, race, month) {
  if (contact.destruido || contact.anexado || contact.wasteland || contact.has_nukes === true) return false;
  if (isAlly(state, contact) || isMyPuppet(contact)) return false;
  if (race.programs[contact.id]) return false;
  if ((Number(contact.demilitarizedMonths) || 0) > 0) return false;
  const pausedUntil = race.programs[contact.id]?.pausedUntil ?? 0;
  return pausedUntil <= month;
}

export function getRaceActionStatus(state, kind, id) {
  if (!isActiveGame(state)) return { available: false, reason: 'Indisponível.' };
  const race = normalizeNuclearRace(state.nuclearRace);
  const program = race.programs[id];
  const contact = findContact(state, id);
  if (!program || !contact) return { available: false, reason: 'Esse país não tem programa nuclear em curso.' };
  const month = Number(state.monthCounter) || 0;
  const gdp = Number(state.economy?.gdp) || 0;
  if (kind === 'treaty') {
    if (program.pausedUntil > month) return { available: false, reason: `Tratado em vigor por mais ${program.pausedUntil - month} mês(es).` };
    if (state.military?.nuclear?.bombBuilt) return { available: false, reason: 'Com bomba no seu arsenal, você não tem autoridade para pedir isso.' };
    if (contact.atWar) return { available: false, reason: 'Não se negocia durante uma guerra.' };
    if ((Number(contact.relation) || 0) < NPT_MIN_RELATION) return { available: false, reason: `Relação abaixo de ${NPT_MIN_RELATION}.` };
    return { available: true, reason: '', cost: Math.round(gdp * 0.008) };
  }
  if (kind === 'sabotage') {
    const wait = SABOTAGE_COOLDOWN - (month - program.lastSabotage);
    if (wait > 0) return { available: false, reason: `Nova operação em ${wait} mês(es).` };
    return { available: true, reason: '', cost: Math.round(gdp * 0.005), chance: 0.55 };
  }
  return { available: false, reason: 'Ação desconhecida.' };
}

export function proposeNonProliferation(state, id) {
  const status = getRaceActionStatus(state, 'treaty', id);
  if (!status.available) return { ...state, notice: status.reason };
  const month = Number(state.monthCounter) || 0;
  const race = normalizeNuclearRace(state.nuclearRace);
  const contact = findContact(state, id);
  const next = patchContact(state, id, (item) => ({ relation: clamp((Number(item.relation) || 0) + 5, -100, 100) }));
  return {
    ...next,
    economy: { ...next.economy, cash: next.economy.cash - status.cost },
    nuclearRace: { ...race, programs: { ...race.programs, [id]: { ...race.programs[id], pausedUntil: month + NPT_MONTHS } } },
    notice: `${contact.name} assinou o tratado de não proliferação: o programa nuclear fica congelado por ${NPT_MONTHS} meses.`,
  };
}

export function sabotageProgram(state, id) {
  const status = getRaceActionStatus(state, 'sabotage', id);
  if (!status.available) return { ...state, notice: status.reason };
  const month = Number(state.monthCounter) || 0;
  const race = normalizeNuclearRace(state.nuclearRace);
  const contact = findContact(state, id);
  const program = race.programs[id];
  const paid = { ...state, economy: { ...state.economy, cash: state.economy.cash - status.cost } };
  const success = hash(month, 577 + id.length, state) < status.chance;
  if (!success) {
    const failed = patchContact(paid, id, (item) => ({ relation: clamp((Number(item.relation) || 0) - 25, -100, 100) }));
    return {
      ...failed,
      geopolitics: { ...failed.geopolitics, onuScore: clamp((Number(failed.geopolitics.onuScore) || 0) - 3, 0, 100) },
      nuclearRace: { ...race, programs: { ...race.programs, [id]: { ...program, lastSabotage: month } } },
      notice: `A operação contra o programa nuclear de ${contact.name} foi descoberta. A relação despencou e a ONU reprovou.`,
    };
  }
  return {
    ...paid,
    nuclearRace: { ...race, programs: { ...race.programs, [id]: { ...program, progress: clamp(program.progress - SABOTAGE_SETBACK, 0, 100), lastSabotage: month } } },
    notice: `Sabotagem bem-sucedida: o programa nuclear de ${contact.name} perdeu ${SABOTAGE_SETBACK} pontos de progresso.`,
  };
}

// Usado por outros sistemas (ex.: ciberataque) para atrasar um programa.
export function setbackProgram(state, id, points, reason = 'Ataque') {
  const race = normalizeNuclearRace(state.nuclearRace);
  const program = race.programs[id];
  if (!program) return state;
  return { ...state, nuclearRace: { ...race, programs: { ...race.programs, [id]: { ...program, progress: clamp(program.progress - points, 0, 100) } } }, notice: `${state.notice ?? ''} ${reason}: o programa nuclear de ${findContact(state, id)?.name ?? id} sofreu um atraso.`.trim() };
}

// Fim de mes: cancelamentos, avanco dos programas, novos programas e ampliacao de arsenais.
export function processNuclearRace(state) {
  if (!isActiveGame(state)) return state;
  const month = Number(state.monthCounter) || 0;
  let race = normalizeNuclearRace(state.nuclearRace);
  let next = { ...state };
  const notes = [];
  const pressure = getPlayerNuclearPressure(next);
  // Quando a pressao sobe de forma perceptivel, o mundo fica em alerta por alguns meses.
  if (pressure > race.lastPressure + 0.04) race = { ...race, alarmMonths: 4 };
  else race = { ...race, alarmMonths: Math.max(0, race.alarmMonths - 1) };
  race = { ...race, lastPressure: pressure };
  const alarm = race.alarmMonths > 0;
  const programs = {};
  const completed = [...race.completed];
  let defconReset = false;

  for (const [id, program] of Object.entries(race.programs)) {
    const contact = findContact(next, id);
    if (!contact || contact.destruido || contact.anexado) continue;
    if (isMyPuppet(contact)) { notes.push(`${contact.name} virou seu fantoche e abandonou o programa nuclear.`); continue; }
    if (isAlly(next, contact)) { notes.push(`${contact.name} encerrou o programa nuclear ao se aliar a você.`); continue; }
    if ((Number(contact.demilitarizedMonths) || 0) > 0) { notes.push(`O programa nuclear de ${contact.name} foi desmontado pela desmilitarização.`); continue; }
    if (contact.has_nukes === true) continue;
    if (program.pausedUntil > month) { programs[id] = program; continue; }
    let progress = program.progress + getProgramRate(next, contact, alarm);
    if (contact.atWar && contact.atWarAgainst === next.country?.id) progress -= 1.5;
    progress = clamp(progress, 0, 100);
    if (progress >= 100) {
      next = patchContact(next, id, (item) => ({ has_nukes: true, nuclearWeapons: Math.max(1, Number(item.nuclearWeapons) || 0), militaryPower: clamp((Number(item.militaryPower) || 0) + 8, 0, 100) }));
      completed.push(id);
      defconReset = true;
      notes.push(`${contact.name} testou sua primeira bomba nuclear. O mundo ficou mais perigoso.`);
      continue;
    }
    programs[id] = { ...program, progress };
  }

  const activeCount = Object.keys(programs).length;
  // Novo programa: no maximo um por mes e MAX_ACTIVE_PROGRAMS ao mesmo tempo.
  if (pressure > 0 && activeCount < MAX_ACTIVE_PROGRAMS) {
    const top = [...next.geopolitics.contacts].filter((contact) => !contact.destruido && !contact.anexado && !contact.wasteland)
      .sort((a, b) => (Number(b.pib_base) || 0) - (Number(a.pib_base) || 0)).slice(0, ELIGIBLE_TOP);
    const pool = top.filter((contact) => eligible(next, contact, { ...race, programs }, month));
    for (let index = 0; index < pool.length; index += 1) {
      const contact = pool[index];
      const relation = Number(contact.relation) || 0;
      const relFactor = relation < 0 ? 2 : relation < 20 ? 1.5 : relation < 50 ? 1 : 0.4;
      const milFactor = clamp((Number(contact.militaryPower) || 0) / 40, 0.5, 1.5);
      const chance = 0.0018 * (0.5 + (pressure * 1.5)) * relFactor * milFactor * (alarm ? 2 : 1);
      if (hash(month, 131 + (index * 17), next) < chance) {
        programs[contact.id] = { progress: 0, startedMonth: month, pausedUntil: 0, lastSabotage: -99 };
        notes.push(`${contact.name} iniciou um programa nuclear em resposta ao seu.`);
        break;
      }
    }
  }

  // Quem ja tem bomba e nao e aliado amplia o arsenal quando o mundo esta em alerta.
  if (alarm && pressure >= 0.5) {
    const nuclear = next.geopolitics.contacts.filter((contact) => contact.has_nukes === true && !contact.destruido && !contact.anexado && !isAlly(next, contact) && !isMyPuppet(contact));
    for (let index = 0; index < nuclear.length; index += 1) {
      if (hash(month, 701 + (index * 13), next) < 0.05) {
        const contact = nuclear[index];
        next = patchContact(next, contact.id, (item) => ({ nuclearWeapons: (Number(item.nuclearWeapons) || 1) + 1, militaryPower: clamp((Number(item.militaryPower) || 0) + 1.5, 0, 100) }));
        notes.push(`${contact.name} ampliou seu arsenal nuclear.`);
        break;
      }
    }
  }

  next = { ...next, nuclearRace: { ...race, programs, completed: [...new Set(completed)] } };
  if (defconReset) next = { ...next, defconPeacefulMonths: 0, factions: adjustFactions(next.factions, { militares: 0 }) };
  return notes.length ? { ...next, notice: notes.join(' ') } : next;
}
