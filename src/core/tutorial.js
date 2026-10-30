import { isMissionPending } from './missions.js';

// Tutorial guiado da primeira partida e dicas de contexto que aparecem uma unica vez.
// Passos "ack" esperam o jogador clicar em ENTENDI; os demais concluem sozinhos ao detectar a acao no estado.
export const TUTORIAL_STEPS = Object.freeze([
  Object.freeze({ id: 'presidency', phase: 'presidency', ack: true, title: 'O GABINETE',
    text: 'Você governa o país mês a mês. Ajuste o orçamento, negocie com os blocos e use [ Avançar mês ] para o tempo correr. Cada decisão aproxima ou afasta a guerra — e o Vault espera lá embaixo.' }),
  Object.freeze({ id: 'controls', phase: 'vault', ack: true, title: 'O ÚLTIMO GABINETE',
    text: 'A e D movem você pelo andar. W e S chamam o elevador. Aperte E perto de uma sala para gerenciá-la.' }),
  Object.freeze({ id: 'dormitory', phase: 'vault', title: 'ABRIGUE OS SOBREVIVENTES',
    text: 'Clique em [ EXPANDIR VAULT ], escolha Dormitório e construa num setor livre. Sem camas, ninguém descansa.',
    done: (state) => hasRoom(state, 'dormitory') }),
  Object.freeze({ id: 'generator', phase: 'vault', title: 'LIGUE AS LUZES',
    text: 'Construa um Gerador. Energia mantém o Vault funcionando — e com 3 geradores a noite deixa de ser escura.',
    done: (state) => countRooms(state, (room) => room.type === 'generator' && room.operational) > 0 }),
  Object.freeze({ id: 'greenhouse', phase: 'vault', title: 'COMIDA NA MESA',
    text: 'Construa uma Estufa Hidropônica. Moradores com fome perdem moral e produzem menos.',
    done: (state) => hasRoom(state, 'greenhouse') }),
  Object.freeze({ id: 'advance', phase: 'vault', title: 'O TEMPO PASSA',
    text: 'Clique em [ AVANÇAR MÊS ]. As salas produzem, os moradores comem e o Ermo responde.',
    done: (state) => (Number(state.wasteland_turn) || 0) >= 1 }),
  Object.freeze({ id: 'finish', phase: 'vault', ack: true, title: 'VOCÊ ESTÁ NO COMANDO',
    text: 'Mantenha o Vault vivo até a porta abrir no fim do terceiro ano. Alertas de missão mostram andar e setor: vá até lá para ver o que aconteceu.' }),
]);

export const TUTORIAL_TIPS = Object.freeze([
  Object.freeze({ id: 'mission', title: 'ALERTA NO VAULT',
    text: 'Um problema surgiu em outro andar. Leia o alerta, vá até o andar e o setor indicados e descubra o que houve. Resolver rende sucata.',
    when: (state) => isMissionPending(state.pendingBunkerEvent) }),
  Object.freeze({ id: 'dark_night', title: 'A NOITE CHEGOU',
    text: 'Com menos de 3 geradores funcionando, as noites ficam escuras e a moral cai. Construa mais geradores.',
    when: (state) => state.isNight === true && countRooms(state, (room) => room.type === 'generator' && room.operational) < 3 }),
  Object.freeze({ id: 'low_food', title: 'COMIDA ACABANDO',
    text: 'O estoque de comida está no fim. Construa ou melhore Estufas antes que a fome chegue.',
    when: (state) => (Number(state.shelter_supplies?.food) || 0) <= 5 }),
  Object.freeze({ id: 'oxygen', title: 'AR RAREFEITO',
    text: 'O oxigênio não está chegando a todos. Construa um Suporte de Vida e mantenha a energia ligada.',
    when: (state) => state.oxygen_deprived === true }),
  Object.freeze({ id: 'oil', title: 'PETRÓLEO NA SUPERFÍCIE',
    text: 'Acima do Vault há 3 pontos de perfuração. Suba ao andar de cima, clique em PERFURE AQUI e monte uma sonda. Toque na gota para recolher e melhore o poço até o nível 5.',
    when: (state) => (Number(state.wasteland_turn) || 0) >= 1 && !(state.oil_derricks ?? []).some(Boolean) }),
  Object.freeze({ id: 'fort', title: 'SAQUEADORES À VISTA',
    text: 'Facções do Ermo vão tentar roubar o seu petróleo. Clique em ERGUER FORTE, à esquerda dos poços, e coloque soldados do exército na guarnição.',
    when: (state) => (state.oil_derricks ?? []).some(Boolean) && !state.surface_fort }),
  Object.freeze({ id: 'storm', title: 'TEMPESTADE NA SUPERFÍCIE',
    text: 'O clima lá em cima piorou. Tempestades atrapalham expedições e cansam os moradores.',
    when: (state) => Boolean(state.weather?.type) && state.weather.type !== 'clear' }),
]);

const STEP_IDS = new Set(TUTORIAL_STEPS.map((step) => step.id));
const TIP_IDS = new Set(TUTORIAL_TIPS.map((tip) => tip.id));

function countRooms(state, predicate) {
  return (state?.shelter_grid ?? []).flat().filter((room) => room && predicate(room)).length;
}

function hasRoom(state, type) {
  return countRooms(state, (room) => room.type === type) > 0;
}

export function createTutorial(value = {}) {
  const list = (items, ids) => [...new Set(Array.isArray(items) ? items.filter((id) => ids.has(id)) : [])];
  return { enabled: value?.enabled !== false, done: list(value?.done, STEP_IDS), tips: list(value?.tips, TIP_IDS) };
}

export function getTutorialPhase(state) {
  if (!state?.is_wasteland) return 'presidency';
  if (state.president_selection_pending || state.wasteland_cinematic_pending || state.wasteland_cinematic_ready || state.ending) return null;
  return 'vault';
}

// Conclui sozinhos os passos cuja acao ja aparece no estado (inclusive de saves antigos).
export function syncTutorial(tutorial, state) {
  const current = createTutorial(tutorial);
  if (getTutorialPhase(state) !== 'vault') return current;
  const done = TUTORIAL_STEPS.filter((step) => step.done && !current.done.includes(step.id) && step.done(state)).map((step) => step.id);
  return done.length ? { ...current, done: [...current.done, ...done] } : current;
}

export function getTutorialStep(tutorial, state) {
  const current = createTutorial(tutorial);
  const phase = getTutorialPhase(state);
  if (!current.enabled || !phase) return null;
  const steps = TUTORIAL_STEPS.filter((step) => step.phase === phase);
  const index = steps.findIndex((step) => !current.done.includes(step.id) && !step.done?.(state));
  if (index < 0) return null;
  return { ...steps[index], number: index + 1, total: steps.length };
}

export function completeTutorialStep(tutorial, id) {
  const current = createTutorial(tutorial);
  return STEP_IDS.has(id) && !current.done.includes(id) ? { ...current, done: [...current.done, id] } : current;
}

// Dicas so aparecem no Vault, uma vez cada, e nunca por cima de um passo do tutorial.
export function getContextTip(tutorial, state) {
  const current = createTutorial(tutorial);
  if (!current.enabled || getTutorialPhase(state) !== 'vault' || getTutorialStep(current, state)) return null;
  return TUTORIAL_TIPS.find((tip) => !current.tips.includes(tip.id) && tip.when(state)) ?? null;
}

export function markTipSeen(tutorial, id) {
  const current = createTutorial(tutorial);
  return TIP_IDS.has(id) && !current.tips.includes(id) ? { ...current, tips: [...current.tips, id] } : current;
}

export function setTutorialEnabled(tutorial, enabled) {
  return { ...createTutorial(tutorial), enabled: Boolean(enabled) };
}

export function restartTutorial() {
  return { enabled: true, done: [], tips: [] };
}
