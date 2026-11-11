import { hasLayd } from './companion.js';
import { createMissionLocation } from './missions.js';

// A historia de Layd: ela passou tempo demais la fora, adoece depois de um ano e so uma serie de vacinas a salva.
// Cada vacina e cada racao tirada do Vault custa a confianca do povo, e a desconfianca so cresce ate alguem descobrir.
export const SICK_AFTER_MONTHS = 10;
export const DOSES_NEEDED = 4;
export const DOSE_SCRAP_COST = 25;
export const RATION_SCRAP_COST = 20;
export const SUSPICION_LIMIT = 100;
export const MISSION_GAP_MONTHS = 4;
export const SYNTHETIC_VACCINE_SCRAP_COST = 70;
export const INITIAL_RATION = 8;

const HUNGER_HEALTH_LOSS = 5;
const VISIBLE_SUSPICION_PER_MONTH = 6;
const HIDDEN_SUSPICION_PER_MONTH = 3;
const VACCINE_SUSPICION_GAIN = 4;
const DIVERTED_FOOD_SUSPICION_GAIN = 10;
const DIVERT_FOOD = 15;
const DIVERT_RATIONS = 3;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const LAYD_EVENTS = Object.freeze([
  Object.freeze({
    id: 'layd-vaccine',
    title: 'A Vacina de Layd',
    description: 'No armário refrigerado do laboratório resta uma dose da vacina contra radiação. A enfermaria do Vault a reservou para um dos habitantes. Layd piorou esta semana: tosse, pelo caindo, as patas tremendo. Ninguém está olhando.',
    options: Object.freeze([
      Object.freeze({ id: 'divert-vaccine', label: '[ DESVIAR A VACINA PARA LAYD ]', effects: Object.freeze({ loyalty: -4 }), layd: Object.freeze({ vaccines: 1, suspicion: 14, choice: 'layd' }) }),
      Object.freeze({ id: 'craft-vaccine', label: `[ SINTETIZAR UMA DOSE: ${SYNTHETIC_VACCINE_SCRAP_COST} SUCATAS ]`, cost: Object.freeze({ scrap: SYNTHETIC_VACCINE_SCRAP_COST }), effects: Object.freeze({}), layd: Object.freeze({ vaccines: 1, suspicion: 4, choice: 'layd' }) }),
      Object.freeze({ id: 'deliver-vaccine', label: '[ ENTREGAR À ENFERMARIA DO VAULT ]', effects: Object.freeze({ loyalty: 8 }), layd: Object.freeze({ health: -8, suspicion: -8, choice: 'vault' }) }),
    ]),
  }),
  Object.freeze({
    id: 'layd-ration',
    title: 'A Ração de Layd',
    description: 'A lata de ração de Layd está vazia. Ela te olha da porta da despensa sem pedir nada, o que é pior. Há comida de sobra nas prateleiras, mas ela tem dono: o povo do Vault, que conta cada lata.',
    options: Object.freeze([
      Object.freeze({ id: 'divert-ration', label: '[ SEPARAR RAÇÃO DO ESTOQUE ]', effects: Object.freeze({ food: -20, loyalty: -3 }), layd: Object.freeze({ ration: 4, suspicion: 8, choice: 'layd' }) }),
      Object.freeze({ id: 'trade-ration', label: `[ COMPRAR RAÇÃO: ${RATION_SCRAP_COST} SUCATAS ]`, cost: Object.freeze({ scrap: RATION_SCRAP_COST }), effects: Object.freeze({}), layd: Object.freeze({ ration: 3, suspicion: 2, choice: 'layd' }) }),
      Object.freeze({ id: 'share-ration', label: '[ DEIXAR A COMIDA PARA O POVO ]', effects: Object.freeze({ food: 20, loyalty: 6 }), layd: Object.freeze({ health: -10, suspicion: -4, choice: 'vault' }) }),
    ]),
  }),
]);

export function getLaydEvent(eventId) {
  return LAYD_EVENTS.find((event) => event.id === eventId) ?? null;
}

function shiftLoyalty(state, delta) {
  if (!delta || !Array.isArray(state.inhabitants)) return state;
  return { ...state, inhabitants: state.inhabitants.map((npc) => ({ ...npc, loyalty: clamp((Number(npc.loyalty ?? 100) || 0) + delta, 0, 100) })) };
}

function patchCompanion(state, patch) {
  return { ...state, companion: { ...state.companion, ...patch } };
}

function withStory(state, storyId) {
  return state.pendingStory ? state : { ...state, pendingStory: true, currentStory: storyId };
}

// Resumo mostrado no painel: tudo o que o jogador precisa para decidir.
export function getLaydStatus(state) {
  const c = state?.companion;
  if (!c?.adopted) return null;
  const turn = Number(state.wasteland_turn) || 0;
  const monthsToSick = Math.max(0, c.since + SICK_AFTER_MONTHS - turn);
  const phase = c.status === 'dead' ? 'dead' : c.status === 'gone' ? 'gone' : c.cured ? 'cured' : c.sick ? 'sick' : 'healthy';
  return { phase, health: c.health, ration: c.ration, doses: c.doses, dosesNeeded: DOSES_NEEDED, vaccines: c.vaccines, hidden: c.hidden,
    suspicion: c.suspicion, monthsToSick, choices: c.choices, canDose: canApplyVaccine(state, true).ok };
}

export function canApplyVaccine(state, inClinic) {
  const c = state?.companion;
  if (!hasLayd(state)) return { ok: false, reason: 'Layd não está com você.' };
  if (!state.is_wasteland) return { ok: false, reason: 'Só no Vault.' };
  if (!inClinic) return { ok: false, reason: 'Leve Layd à Sala de Tratamento de Radiação.' };
  if (!c.sick) return { ok: false, reason: c.cured ? 'Layd já está curada.' : 'Layd ainda não apresenta sintomas.' };
  if (c.hidden) return { ok: false, reason: 'Layd está escondida. Tire-a do esconderijo para levá-la à sala.' };
  if (c.vaccines < 1) return { ok: false, reason: 'Sem vacinas. Procure uma dose no laboratório.' };
  if ((Number(state.scrap) || 0) < DOSE_SCRAP_COST) return { ok: false, reason: `Aplicar a dose custa ${DOSE_SCRAP_COST} sucatas.` };
  if (c.lastDoseTurn === (Number(state.wasteland_turn) || 0)) return { ok: false, reason: 'Layd já tomou a dose deste mês.' };
  return { ok: true };
}

export function applyVaccine(state, inClinic) {
  const check = canApplyVaccine(state, inClinic);
  if (!check.ok) return { ...state, notice: check.reason };
  const c = state.companion;
  const turn = Number(state.wasteland_turn) || 0;
  const doses = c.doses + 1;
  const cured = doses >= DOSES_NEEDED;
  let next = {
    ...patchCompanion(state, { vaccines: c.vaccines - 1, doses, lastDoseTurn: turn, health: cured ? 100 : clamp(c.health + 15, 0, 100),
      suspicion: clamp(c.suspicion + VACCINE_SUSPICION_GAIN, 0, SUSPICION_LIMIT), ...(cured ? { sick: false, cured: true } : {}) }),
    scrap: (Number(state.scrap) || 0) - DOSE_SCRAP_COST,
  };
  next = { ...next, notice: cured
    ? 'Última dose aplicada. Layd respira fundo e abana o rabo: a radiação perdeu.'
    : `Dose ${doses} de ${DOSES_NEEDED} aplicada. Layd dorme no chão da sala, exausta.` };
  return cured ? withStory(next, 'layd_cured') : next;
}

export function buyRation(state) {
  if (!hasLayd(state)) return state;
  if ((Number(state.scrap) || 0) < RATION_SCRAP_COST) return { ...state, notice: `A ração custa ${RATION_SCRAP_COST} sucatas.` };
  return { ...patchCompanion(state, { ration: clamp(state.companion.ration + 3, 0, 99) }), scrap: state.scrap - RATION_SCRAP_COST,
    notice: 'Você comprou ração de contrabando. Layd come devagar, desconfiada de que acabe.' };
}

export function divertFood(state) {
  if (!hasLayd(state)) return state;
  const food = Number(state.shelter_supplies?.food) || 0;
  if (food < DIVERT_FOOD) return { ...state, notice: 'Não há comida para desviar.' };
  const c = state.companion;
  const next = { ...patchCompanion(state, { ration: clamp(c.ration + DIVERT_RATIONS, 0, 99), suspicion: clamp(c.suspicion + DIVERTED_FOOD_SUSPICION_GAIN, 0, SUSPICION_LIMIT),
    choices: { ...c.choices, layd: c.choices.layd + 1 } }),
  shelter_supplies: { ...state.shelter_supplies, food: food - DIVERT_FOOD } };
  return { ...shiftLoyalty(next, -2), notice: `Você escondeu ${DIVERT_FOOD} rações do estoque. Alguém contou as latas.` };
}

export function toggleHideLayd(state) {
  if (!hasLayd(state)) return state;
  const hidden = !state.companion.hidden;
  return { ...patchCompanion(state, { hidden }), notice: hidden
    ? 'Layd ficou escondida na suíte presidencial. Ninguém a vê, mas ela estranha a solidão.'
    : 'Layd voltou a andar com você.' };
}

// Efeito das opcoes dos dilemas de Layd, aplicado depois da resolucao padrao do evento.
export function applyLaydEvent(previous, next, optionId) {
  const event = getLaydEvent(previous.pendingBunkerEvent?.id);
  const option = event?.options.find((choice) => choice.id === optionId);
  if (!event || !option || next.pendingBunkerEvent || !hasLayd(next)) return next;
  const patch = option.layd ?? {};
  const c = next.companion;
  const choices = patch.choice ? { ...c.choices, [patch.choice]: c.choices[patch.choice] + 1 } : c.choices;
  return patchCompanion(next, {
    ration: clamp(c.ration + (patch.ration ?? 0), 0, 99), vaccines: clamp(c.vaccines + (patch.vaccines ?? 0), 0, 99),
    health: clamp(c.health + (patch.health ?? 0), 0, 100), suspicion: clamp(c.suspicion + (patch.suspicion ?? 0), 0, SUSPICION_LIMIT), choices,
  });
}

// Um mes passa: Layd come, adoece, piora, e o povo desconfia. Pode abrir um dilema ou a descoberta.
export function advanceLaydMonth(state) {
  if (!hasLayd(state) || state.ending) return state;
  const turn = Number(state.wasteland_turn) || 0;
  const c = { ...state.companion };
  const notes = [];
  let story = null;
  if (c.ration > 0) c.ration -= 1;
  else { c.health -= HUNGER_HEALTH_LOSS; notes.push('> LAYD: passou fome este mês.'); }
  if (!c.sick && !c.cured && turn - c.since >= SICK_AFTER_MONTHS) {
    c.sick = true;
    c.health = Math.min(c.health, 70);
    story = 'layd_sick';
  }
  if (c.sick) {
    const dosedRecently = c.lastDoseTurn >= 0 && turn - c.lastDoseTurn <= 1;
    c.health += dosedRecently ? 3 : -6;
    if (!dosedRecently) notes.push('> LAYD: os sintomas pioram sem tratamento.');
    c.suspicion += c.hidden ? HIDDEN_SUSPICION_PER_MONTH : VISIBLE_SUSPICION_PER_MONTH;
  } else {
    c.suspicion -= 2;
    if (c.ration > 0) c.health += 4;
  }
  c.health = clamp(c.health, 0, 100);
  c.suspicion = clamp(c.suspicion, 0, 100);
  let next = { ...state, companion: c };
  if (c.health <= 0) {
    next = { ...next, companion: { ...c, status: 'dead', health: 0 }, notice: `${state.notice ?? ''} Layd morreu na madrugada. O Vault inteiro ouviu você chorar.`.trim() };
    return shiftLoyalty(withStory(next, 'layd_dead'), 3);
  }
  if (story) next = withStory(next, story);
  if (c.suspicion >= SUSPICION_LIMIT) {
    next = { ...next, pendingLaydDiscovery: true, notice: 'Um grupo de habitantes cercou a suíte presidencial. Eles sabem sobre Layd.' };
    return next;
  }
  if (!next.pendingBunkerEvent && turn - c.lastMissionTurn >= MISSION_GAP_MONTHS) {
    const id = c.sick && c.vaccines < 1 && c.doses < DOSES_NEEDED ? 'layd-vaccine' : c.ration <= 1 ? 'layd-ration' : null;
    if (id) {
      const location = createMissionLocation(state.shelter_grid, id, turn + 7) ?? {};
      next = { ...next, companion: { ...c, lastMissionTurn: turn }, pendingBunkerEvent: { id, ...location } };
      notes.push(id === 'layd-vaccine' ? '> LAYD precisa de uma vacina. Veja o laboratório.' : '> LAYD está sem ração.');
    }
  }
  return notes.length ? { ...next, notice: `${next.notice ?? ''} ${notes.join(' ')}`.trim() } : next;
}

export const ESCAPE_STAGES = Object.freeze({
  fetch: Object.freeze({ room: 'presidential_suite', hint: '[ E ] PEGAR LAYD NO ESCONDERIJO', objective: 'Vá até a suíte presidencial e pegue Layd.' }),
  run: Object.freeze({ room: 'vault', hint: '[ E ] ABRIR A PORTA E PARTIR COM LAYD', objective: 'Leve Layd até a Porta do Vault. Ela precisa estar perto de você.' }),
});

export function normalizeLaydEscape(value) {
  if (!value || !ESCAPE_STAGES[value.stage]) return null;
  return { stage: value.stage, month: Math.max(0, Math.floor(Number(value.month) || 0)) };
}

// Um passo da fuga: pega Layd no esconderijo e, com ela ao lado, abre a Porta.
export function advanceLaydEscape(state, room, { dogNear = false } = {}) {
  const escape = state?.layd_escape;
  const stage = ESCAPE_STAGES[escape?.stage];
  if (!stage || room?.type !== stage.room) return state;
  if (escape.stage === 'fetch') {
    return { ...patchCompanion(state, { hidden: false }), layd_escape: { ...escape, stage: 'run' },
      notice: 'Layd te reconhece no escuro e não late. Ela segue você. Agora, até a Porta.' };
  }
  if (!dogNear) return { ...state, notice: 'Layd ainda não chegou. Espere por ela: sem ela, você não sai.' };
  return { ...state, layd_escape: null, ending: { id: 'layd_flight', month: Number(state.wasteland_turn) || 0 } };
}

// A descoberta: o povo sabe. Fugir pela Porta com Layd ou entrega-la ao Vault.
export function resolveLaydDiscovery(state, choice) {
  if (!state.pendingLaydDiscovery || !hasLayd(state)) return state;
  if (choice === 'flee') {
    // A fuga e fisica: Layd esta escondida na suite, e o jogador precisa busca-la e leva-la ate a Porta.
    return { ...patchCompanion(state, { hidden: true }), pendingLaydDiscovery: false,
      layd_escape: { stage: 'fetch', month: Number(state.wasteland_turn) || 0 },
      notice: 'A FUGA: pegue Layd na suíte presidencial e leve-a até a Porta do Vault antes que o povo feche os corredores.' };
  }
  if (choice === 'surrender') {
    const next = { ...patchCompanion(state, { status: 'gone', hidden: false, suspicion: 0 }), pendingLaydDiscovery: false };
    return { ...shiftLoyalty(next, 15), notice: 'Você entregou Layd. O Vault respirou aliviado. Você não.' };
  }
  return state;
}
