import { getSurfaceMap, getExplorationPercent } from './surface_map.js';
import { getPresidentClass } from './player_state.js';

// Capitulo X — A Porta: depois de alguns anos no Vault a superficie volta a ser habitavel e o jogador
// escolhe como sair. Cada final exige um historico (fase presidencial + governo do Vault) e vira um trofeu.
export const DOOR_OPENS_AT_MONTH = 36;
const PLAYER_LAUNCH_REASONS = new Set(['ataque-nuclear', 'mao-morta']);

export const ENDINGS = Object.freeze({
  republic: Object.freeze({ id: 'republic', title: 'A Nova República', icon: '🗳️', choice: '[ ABRIR A PORTA E CONVOCAR ELEIÇÕES ]',
    epigraph: 'Pela primeira vez, ninguém precisou de um presidente.',
    story: 'A porta abriu devagar, rangendo trinta e seis meses de ferrugem. {leader} subiu por último. Lá fora, Lia Moraes organizava a primeira votação do novo mundo em caixas de munição vazias. Tomé contou os votos em voz alta. {leader} não estava em nenhuma cédula — e, pela primeira vez, isso pareceu uma vitória.' }),
  empire: Object.freeze({ id: 'empire', title: 'O Império das Cinzas', icon: '👑', choice: '[ ABRIR A PORTA E PROCLAMAR O IMPÉRIO ]',
    epigraph: 'Você reconstruiu o mundo. À sua imagem.',
    story: 'Os guardas saíram primeiro, em formação. O Coronel Rui Silva fincou a bandeira no topo das ruínas e ninguém ousou perguntar de quem era o país agora. {leader} subiu ao som de botas marchando. As cinzas viraram tijolos, os tijolos viraram muros, e os muros tinham o seu rosto pintado.' }),
  sealed: Object.freeze({ id: 'sealed', title: 'A Porta Fechada', icon: '🚪', choice: '[ MANTER A PORTA FECHADA ]',
    epigraph: 'Lá fora havia sol. Aqui dentro havia você.',
    story: 'Os sensores diziam que o ar estava limpo. {leader} mandou desligar os sensores. Os geradores continuaram girando, as estufas continuaram verdes, e os anos passaram iguais. Tomé cresceu sem nunca ver o céu. Às vezes ele encostava o ouvido na porta e jurava ouvir pássaros.' }),
  exile: Object.freeze({ id: 'exile', title: 'O Exílio', icon: '🥾', forced: true,
    epigraph: 'Te deixaram sair primeiro. Ninguém foi atrás.',
    story: 'Quando a porta abriu, a assembleia de Lia Moraes já tinha votado. Entregaram a {leader} uma mochila, um cantil e um mapa rabiscado do Ermo. Ninguém gritou, ninguém aplaudiu. A porta fechou atrás de {leader} com o mesmo som do primeiro dia. Desta vez, do lado de fora.' }),
  encounter: Object.freeze({ id: 'encounter', title: 'O Encontro', icon: '📻', choice: '[ SEGUIR O SINAL ATÉ O VAULT 0 ]',
    epigraph: 'Dois presidentes. Um mundo. Nenhum cargo.',
    story: 'O mapa estava completo o bastante. {leader} seguiu as coordenadas da Voz até uma escotilha enferrujada a doze quilômetros do Vault. Lá embaixo, um velho de terno puído esperava sentado: o presidente que fugiu na primeira noite. "Demorou", disse ele. Os dois ficaram em silêncio por muito tempo. Não havia mais nada para governar.' }),
  last_office: Object.freeze({ id: 'last_office', title: 'O Último Gabinete', icon: '🕯️', choice: '[ ABRIR A PORTA E ENTREGAR A CHAVE ]', secret: true,
    epigraph: 'Você foi o único que tentou. Isso basta?',
    story: '{leader} nunca desviou um centavo e nunca tocou no botão. A bomba caiu mesmo assim. No dia em que a porta abriu, {leader} devolveu a chave de latão a Helena Vargas e saiu sem olhar para trás. Ninguém escreveu o seu nome na história. Alguns, porém, lembraram.' }),
});

export function averageLoyalty(state) {
  const present = (state.inhabitants ?? []).filter((npc) => !npc.is_on_expedition);
  if (!present.length) return 0;
  return present.reduce((total, npc) => total + (Number(npc.loyalty ?? 100) || 0), 0) / present.length;
}

export function isDoorOpen(state) {
  return Boolean(state?.is_wasteland) && Number(state.wasteland_turn) >= DOOR_OPENS_AT_MONTH && !state.ending;
}

// Requisitos de cada saida; quando falha, devolve o motivo para mostrar ao jogador.
export function getEndingOptions(state) {
  const loyalty = averageLoyalty(state);
  const prisoners = (state.inhabitants ?? []).filter((npc) => npc.is_prisoner).length;
  const guards = Math.max(0, Number(state.shelter_guards) || 0);
  const explored = state.surface_map ? getExplorationPercent(getSurfaceMap(state)) : 0;
  const cleanHands = !(Number(state.slush_fund) > 0) && !PLAYER_LAUNCH_REASONS.has(state.wasteland_reason);
  const options = [
    { ...ENDINGS.republic, available: loyalty >= 60 && prisoners === 0,
      requirement: 'Lealdade média de 60% e nenhum preso na cela.' },
    { ...ENDINGS.empire, available: guards >= 3,
      requirement: 'Pelo menos 3 guardas equipados no arsenal.' },
    { ...ENDINGS.sealed, available: true, requirement: null },
    { ...ENDINGS.encounter, available: explored >= 40,
      requirement: 'Explorar 40% do mapa da superfície.' },
  ];
  if (cleanHands) options.push({ ...ENDINGS.last_office, available: true, requirement: null });
  return options;
}

// Se a colonia perdeu a confianca, nao ha escolha: ela decide pelo Presidente.
export function getForcedEnding(state) {
  return averageLoyalty(state) < 25 ? ENDINGS.exile : null;
}

export function chooseEnding(state, endingId) {
  if (!isDoorOpen(state)) return state;
  const forced = getForcedEnding(state);
  const option = forced ? (endingId === forced.id ? forced : null) : getEndingOptions(state).find((item) => item.id === endingId);
  if (!option || option.available === false) return state;
  return { ...state, ending: { id: option.id, month: Number(state.wasteland_turn) || 0 } };
}

export function getEndingStory(state, endingId) {
  const ending = ENDINGS[endingId];
  if (!ending) return null;
  const leader = getPresidentClass(state.presidentClass)?.leader ?? 'O Presidente';
  return ending.story.replaceAll('{leader}', leader);
}

// Trofeus ficam na conta do jogador (fora da partida) para incentivar jogar de novo.
export function createTrophies(value = {}) {
  const endings = Array.isArray(value?.endings) ? value.endings.filter((id) => ENDINGS[id]) : [];
  return { version: 1, endings: [...new Set(endings)] };
}

export function recordTrophy(trophies, endingId) {
  const current = createTrophies(trophies);
  if (!ENDINGS[endingId] || current.endings.includes(endingId)) return current;
  return { ...current, endings: [...current.endings, endingId] };
}
