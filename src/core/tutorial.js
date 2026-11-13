import { isMissionPending } from './missions.js';
import { getVaultDay } from './vault_time.js';
import { isCampaign } from './elections.js';
import { normalizeCongressLife } from './congress_life.js';

// Tutorial guiado da primeira partida e dicas de contexto que aparecem uma unica vez.
// Passos "ack" esperam o jogador clicar em ENTENDI; os demais concluem sozinhos ao detectar a acao no estado.
export const TUTORIAL_STEPS = Object.freeze([
  Object.freeze({ id: 'presidency', phase: 'presidency', ack: true, title: 'BEM-VINDO AO ÚLTIMO GABINETE',
    text: 'Este guia mostra, aba por aba, tudo o que você controla. A barra lateral à esquerda é o seu painel: vamos percorrê-la de cima para baixo. Você governa mês a mês, cada decisão aproxima ou afasta a guerra — e o Vault espera lá embaixo.' }),
  Object.freeze({ id: 'guide_overview', phase: 'presidency', ack: true, tab: 'overview', title: 'VISÃO GERAL',
    text: 'Seu ponto de partida: a nação (população, área, regime), o botão [ Avançar mês ], a tensão social (use subsídio, diálogo ou repressão), as eleições a cada 4 anos e o relatório anual com as metas do ano. As manchetes do mês aparecem na lateral.' }),
  Object.freeze({ id: 'guide_advance', phase: 'presidency', tab: 'overview', title: 'FAÇA O TEMPO PASSAR',
    text: 'Clique em [ AVANÇAR MÊS ]. Cada mês a economia se move, eventos acontecem e, de vez em quando, um briefing pede uma decisão sua. Nada acontece sem o seu comando.',
    done: (state) => (Number(state.monthCounter) || 0) >= 1 }),
  Object.freeze({ id: 'guide_budget', phase: 'presidency', ack: true, tab: 'budget', title: 'ORÇAMENTO',
    text: 'Impostos (renda e consumo) entram; saúde, educação, infraestrutura, ciência e defesa saem. Gastar mais do que arrecada vira dívida pública: o rating cai e os juros pesam. Desvios geram rombo fiscal. O "Resultado fiscal" mostra a conta do mês.' }),
  Object.freeze({ id: 'guide_interest', phase: 'presidency', ack: true, tab: 'budget', title: 'BANCO CENTRAL',
    text: 'Mais abaixo no Orçamento você controla a taxa de juros. Juros altos seguram a inflação, mas encarecem a dívida e esfriam o crescimento. Inflação acima de 8% ao mês começa a irritar os trabalhadores.' }),
  Object.freeze({ id: 'guide_indicators', phase: 'presidency', ack: true, tab: 'indicators', title: 'INDICADORES',
    text: 'Gráficos de PIB, inflação, desemprego, caixa e apoio interno, mês a mês. Mais abaixo, os quatro setores da economia: infraestrutura puxa indústria e energia, educação e ciência puxam serviços.' }),
  Object.freeze({ id: 'guide_diplomacy', phase: 'presidency', ack: true, tab: 'diplomacy', title: 'DIPLOMACIA: O MAPA',
    text: 'No mapa, cada país tem uma cor: verde é aliado, azul é comércio, vermelho vivo é guerra, roxo tem programa nuclear e laranja impôs tarifas. Clique num país para negociar, sabotar ou declarar guerra. Países derrotados podem ser anexados e viram território seu.' }),
  Object.freeze({ id: 'guide_agenda', phase: 'presidency', ack: true, tab: 'diplomacy', title: 'DIPLOMACIA: AGENDA',
    text: 'No topo da mesma aba ficam seu Título e organização (com 2 países anexados você pode rebatizar o país), a Corrida nuclear, a Guerra comercial e a Agenda internacional, com cúpulas e inspeções da AIEA. Responda a eles para ganhar vantagens e evitar crises.' }),
  Object.freeze({ id: 'guide_military', phase: 'presidency', ack: true, tab: 'military', title: 'FORÇAS ARMADAS',
    text: 'Exército, marinha e aeronáutica: recrute e compre equipamentos para aumentar o poder total (e a manutenção mensal). Tropas enviadas a territórios ou aliados aparecem em "Tropas no exterior", com ofensivas e reforços a caminho.' }),
  Object.freeze({ id: 'guide_cabinet', phase: 'presidency', ack: true, tab: 'cabinet', title: 'GABINETE',
    text: 'Ministros dão bônus ao governo, e você pode demiti-los. Quando o caixa permite, o Auto-Golpe troca a República por um Império Nacional ou um Sindicato Corporativo, com custos e riscos.' }),
  Object.freeze({ id: 'guide_technology', phase: 'presidency', ack: true, tab: 'technology', title: 'TECNOLOGIA',
    text: 'Gaste Pontos de Pesquisa em tecnologias de economia e defesa. É aqui que começa o Plano Nuclear (300 PP e R$ 10 bi): energia civil e dissuasão militar. Ele assusta o mundo e pode iniciar uma corrida nuclear.' }),
  Object.freeze({ id: 'guide_projects', phase: 'presidency', ack: true, tab: 'projects', title: 'PROJETOS INTERNOS',
    text: 'Obras que fazem o país crescer: rodovias, ferrovias, aeroportos, hospitais, indústrias e usinas. Cada uma custa caixa e manutenção mensal. Projetos gigantes, como o Mega-Vault de Contenção, também ficam aqui.' }),
  Object.freeze({ id: 'guide_congress', phase: 'presidency', ack: true, tab: 'congress', title: 'CONGRESSO',
    text: 'Leis precisam de maioria. Cada bancada tem uma lealdade que sobe e desce com o seu governo, cobra favores, e a oposição propõe projetos que você sanciona ou veta. Negocie antes de votar.' }),
  Object.freeze({ id: 'guide_history', phase: 'presidency', ack: true, tab: 'history', title: 'MODO HISTÓRIA',
    text: 'O arquivo pessoal do presidente: capítulos e dossiês de Last Office, liberados conforme você joga. Leia para entender o mundo e o que a Porta do Vault esconde.' }),
  Object.freeze({ id: 'guide_countries', phase: 'presidency', ack: true, tab: 'countries', title: 'PAÍSES',
    text: 'O banco mundial com as 200 nações jogáveis: consulte população, área e dados de cada país antes de escolher aliados, rivais ou uma nova partida.' }),
  Object.freeze({ id: 'guide_profile', phase: 'presidency', ack: true, tab: 'profile', title: 'MEU PERFIL',
    text: 'Seu nome, idioma, volume e as conquistas da conta, que valem para qualquer partida. Também é aqui que você reinicia este guia quando quiser.' }),
  Object.freeze({ id: 'guide_finish', phase: 'presidency', ack: true, tab: 'overview', title: 'PRONTO PARA GOVERNAR',
    text: 'Agora é com você. Dicas aparecem quando algo importante acontece. Para rever este guia, vá a Meu Perfil e use [ Reiniciar tutorial ]. Boa sorte, presidente.' }),
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
    text: 'Clique em [ AVANÇAR 1 DIA ]. Cada dia as salas produzem um pouco e os moradores consomem; a cada 30 dias o mês fecha e o Ermo responde.',
    done: (state) => getVaultDay(state) >= 1 }),
  Object.freeze({ id: 'finish', phase: 'vault', ack: true, title: 'VOCÊ ESTÁ NO COMANDO',
    text: 'Depois de 36 meses e do nível 25 a Porta do Vault fica pronta, mas só você decide quando sair: use o tempo para montar e melhorar o bunker. Alertas de missão mostram andar e setor: vá até lá para ver o que aconteceu.' }),
]);

// Dicas de contexto do modo Presidente: aparecem uma vez, quando a situacao pede.
const PRESIDENCY_TIPS = Object.freeze([
  Object.freeze({ id: 'p_briefing', phase: 'presidency', tab: 'overview', title: 'BRIEFING PRESIDENCIAL',
    text: 'O gabinete trouxe uma decisão. Cada opção mexe em caixa, inflação e no apoio das facções. Leia o custo antes de escolher.',
    when: (state) => Boolean(state.pendingBriefing) }),
  Object.freeze({ id: 'p_inflation', phase: 'presidency', tab: 'budget', title: 'INFLAÇÃO ALTA',
    text: 'A inflação passou de 8% ao mês. Suba a taxa de juros no Banco Central e segure o déficit: os trabalhadores já estão perdendo poder de compra.',
    when: (state) => (Number(state.economy?.inflation) || 0) >= 0.08 }),
  Object.freeze({ id: 'p_debt', phase: 'presidency', tab: 'budget', title: 'O CAIXA FICOU NEGATIVO',
    text: 'Caixa negativo é dívida pública. Quanto maior ela pesa no PIB, pior o rating e maiores os juros. Corte despesas ou suba impostos antes que a conta vire bola de neve.',
    when: (state) => (Number(state.economy?.cash) || 0) < 0 }),
  Object.freeze({ id: 'p_unrest', phase: 'presidency', tab: 'overview', title: 'TENSÃO NAS RUAS',
    text: 'A tensão social passou de 30: há protestos. Na Visão geral você pode dar subsídio, abrir diálogo com sindicatos ou reprimir (rápido, mas deixa ressaca e abala sua imagem). Acima de 80 os quartéis podem agir.',
    when: (state) => (Number(state.regime?.unrest) || 0) >= 30 }),
  Object.freeze({ id: 'p_congress', phase: 'presidency', tab: 'congress', title: 'O CONGRESSO PEDE ALGO',
    text: 'Uma bancada cobra um favor ou a oposição apresentou um projeto. Responda na aba Congresso: ignorar também é uma resposta, e ela custa lealdade.',
    when: (state) => { const life = normalizeCongressLife(state.congressLife); return Boolean(life.demand || life.bill); } }),
  Object.freeze({ id: 'p_election', phase: 'presidency', tab: 'overview', title: 'A CAMPANHA COMEÇOU',
    text: 'Faltam três meses para a eleição. Veja a pesquisa na Visão geral e use propaganda ou promessas populistas: com 50% ou mais dos votos você é reeleito, senão o mandato acaba.',
    when: (state) => isCampaign(state) }),
  Object.freeze({ id: 'p_report', phase: 'presidency', tab: 'overview', title: 'O PRIMEIRO RELATÓRIO',
    text: 'O gabinete fechou o ano: veja a nota, as metas cumpridas e a recomendação na Visão geral. Metas cumpridas melhoram o apoio de trabalhadores e elite; falhar piora.',
    when: (state) => (state.yearReports ?? []).length >= 1 }),
  Object.freeze({ id: 'p_hostile', phase: 'presidency', tab: 'diplomacy', title: 'ALERTA MILITAR',
    text: 'Um país declarou guerra. Reconheça o alerta e escolha como responder na Diplomacia: defender, negociar a paz ou contra-atacar. Gastar com defesa ajuda.',
    when: (state) => Boolean(state.pendingHostileAlert) }),
]);

export const TUTORIAL_TIPS = Object.freeze([
  ...PRESIDENCY_TIPS,
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
    when: (state) => getVaultDay(state) >= 10 && !(state.oil_derricks ?? []).some(Boolean) }),
  Object.freeze({ id: 'fort', title: 'SAQUEADORES À VISTA',
    text: 'Facções do Ermo vão tentar roubar o seu petróleo. Clique em ERGUER FORTE, à esquerda dos poços, e coloque soldados do exército na guarnição.',
    when: (state) => (state.oil_derricks ?? []).some(Boolean) && !state.surface_fort }),
  Object.freeze({ id: 'oil_use', title: 'O QUE FAZER COM O PETRÓLEO',
    text: 'Abra a Sala do Gerador para abastecê-lo com barris (+50% de energia) ou a Sala de Rádio para vender petróleo às facções. Vender a uma facção hostil melhora a relação e evita ataques.',
    when: (state) => (Number(state.oil) || 0) >= 100 }),
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
  const phase = getTutorialPhase(state);
  if (!phase) return current;
  const done = TUTORIAL_STEPS.filter((step) => step.phase === phase && step.done && !current.done.includes(step.id) && step.done(state)).map((step) => step.id);
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
  const phase = getTutorialPhase(state);
  if (!current.enabled || !phase || getTutorialStep(current, state)) return null;
  return TUTORIAL_TIPS.find((tip) => (tip.phase ?? 'vault') === phase && !current.tips.includes(tip.id) && tip.when(state)) ?? null;
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
