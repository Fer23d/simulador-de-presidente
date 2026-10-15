import { createCongress, negotiateSupport, voteOnLaw } from './congress.js';
import { COUNTRIES, createCountryProfile, getCountryById } from '../data/countries.js';
import { DEFAULT_BUDGET, advanceEconomy, clampTaxRate, setBudgetRate } from './economy.js';
import { advanceGeopolitics, anexarPais as annexTreatyTarget, alterarNotaONU as changeOnuScore, aplicarReparacoes as applyReparationsTreaty, createGeopolitics, criarLiga as createLeagueState, desmilitarizarPais as demilitarizeTreatyTarget, declareWar, estabelecerFantoche as establishPuppet, exigirAnexacao as demandAnnexation, getGeopoliticalModifiers, insultarNacao as insultNation, importarRecursos as importResources, imporSancao as imposeSanction, interceptArticle5 as detectArticle5, inviteToLeague as inviteLeagueMember, isLegitimateDefenseTarget, processarAgressaoIA, proposeAlliance as formAlliance, proposeTradeTreaty, respondArticle5 as respondArticle5State, sabotar as sabotageCountry, saquearTesouro as lootTreatyTarget } from './geopolitics.js';
import { advanceMilitary, applyNuclearCompletion, calculateMilitaryMaintenance, canAutogolpe, comprarBlindados, comprarCacas, comprarEquipamento, comprarNavios, createMilitary, createRegime, evaluateRegime, fundNuclearProject, getPoderTotal, normalizeMilitary, recrutarSoldado as recruitSoldiers } from './military.js';
import { aggregateActiveLawEffects, LAWS, LAW_LABOR_REFORM } from './laws.js';
import { advanceTechnology, createTechnology, getTechnologyModifiers, purchaseTechnology } from './technology.js';
import { calculateMilitaryResearchPoints, getMilitaryTechnology, pesquisarTecnologia } from './tech_tree.js';
import { getTraitModifiers } from './traits.js';
import { EVENTS, applyEventOption, rollMonthlyEvent } from './events.js';
import { createMinisters, dismissMinister as dismissCabinetMinister, getMinisterModifiers, hireMinister as hireCabinetMinister } from './ministers.js';
import { advanceFactions, createFactions, getFactionModifiers, getFactionSupport, normalizeFactions } from './factions.js';
import { absorverPaisParaUniao as absorbIntoUnion, decretarRevolucaoSocialista as decreeSocialistRevolution } from './revolution.js';
import { financiarRebeldes as fundRebels } from './espionage.js';
import { aplicarResolucoes, registrarVotoONU, verificarAssembleia } from './un_assembly.js';
import { processarMigracoes } from './demographics.js';
import { advanceCyberWarfare, lancarCiberataque as launchCyberAttack } from './cyber_warfare.js';
import {
  automatizarIndustria as automateIndustry,
  buildInternalProject,
  getInternalProjectModifiers,
  processarAutomacaoIndustrial,
  processarProjetosInternos,
} from './infrastructure.js';
import { aplicarEfeitosSoftPower, candidatarJogosMundiais as bidForGlobalGames, getSoftPowerModifiers, recusarCandidaturaGlobal, verificarSedeGlobal } from './soft_power.js';
import { estatizarMegacorporacoes as nationalizeMegacorps, getMegacorpModifiers, isLobbyBlocked, processarMegacorporacoes } from './megacorps.js';
import { advanceDefcon, applyDefconEconomicShock, markAnnexationTension } from './defcon.js';
import { injetarVirusSintetico, infiltrarSosia, orquestrarFalsaBandeira, processarInfeccoesBiologicas } from './black_ops.js';
import { aplicarModificadoresConstitucionais, promulgarConstituicao } from './constitution.js';
import { iniciarProjetoMaoMorta as startDeadHandProject, interceptarGameOverComMaoMorta, processarMegaprojetos } from './megaprojects.js';
import { desviarFundos, interceptarFinalCaixa2, isEscapeEligible } from './corruption.js';
import { escolherInterrogatorio as chooseInterrogation, reivindicarInterrogatorio as claimInterrogation, resolverInterrogatorio as resolveInterrogation, sortearCapturaAgente } from './interrogation.js';
import { checkStoryEvents, dismissStory as dismissNarrativeStory, gerarEntradaDiario, getStoryEvent } from './story_engine.js';
import { checkStoryChapters, getLoreChapter } from './story_lore.js';
import { advanceGovernment, applyGovernmentEconomy, openAutoCoup, resolveAutoCoup, resolveCorporateDefault } from './politics.js';
import { advanceWastelandMonth, buildMegaVault, buildWastelandProject, enviarBatedores, transicionarParaWasteland as transitionToWasteland } from './wasteland.js';
import { createRpgPlayer, normalizeInhabitants, normalizeRpgPlayer } from './rpg_bunker.js';
import { INITIAL_SHELTER_GRID, migrateLegacyPlayer, migrateLegacyRooms, normalizeShelterGrid, normalizeShelterInhabitants } from './shelter_engine.js';

const STATE_VERSION = 16;
const TAX_KEYS = new Set(['incomeTaxRate', 'vatRate']);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function countrySeed(id) {
  return [...id].reduce((total, character) => total + character.charCodeAt(0), 0);
}

function createEconomy(country) {
  const seed = countrySeed(country.id);
  return {
    gdp: country.pib_base,
    inflation: 0.035 + ((seed % 40) / 1_000),
    unemployment: 0.05 + ((seed % 80) / 1_000),
    cash: Math.round(country.pib_base * 0.06),
  };
}

function addHistory(state, entry) {
  return [entry, ...state.history].slice(0, 12);
}

export function registrarEventoHistorico(state, type, text) {
  if (typeof type !== 'string' || !type || typeof text !== 'string' || !text) return state;
  const entry = {
    month: state.calendar?.month ?? 1,
    year: state.calendar?.year ?? 2026,
    type,
    text,
  };
  return { ...state, history_log: [...(state.history_log ?? []), entry] };
}

function registrarGameOver(state) {
  if (!state.regime?.gameOver || state.history_log?.some((entry) => entry.type === 'game_over')) return state;
  return registrarEventoHistorico(state, 'game_over', `O governo chegou ao fim: ${state.regime.outcome ?? 'colapso nacional'}.`);
}

function isGameOver(state) {
  return Boolean(state.regime?.gameOver);
}

function syncWorld(state) {
  return { ...state, world: state.geopolitics?.contacts ?? state.world ?? [] };
}

export function addNews(state, text) {
  const item = { text, calendar: { ...state.calendar } };
  return { ...state, news: [item, ...(state.news ?? [])].slice(0, 5) };
}

function interceptDeadHandGameOver(state) {
  const result = interceptarGameOverComMaoMorta(state);
  if (result.dead_hand_triggered && state.vault_built) return enterWasteland(result, 'mao-morta');
  return result.dead_hand_triggered && !state.dead_hand_triggered
    ? addNews(syncWorld(result), 'Diretriz Omega executada: os silos da Mao Morta lancaram contra todos os alvos.')
    : result;
}

function resolverFinalDeJogo(state) {
  if (!state.regime?.gameOver) return state;
  state = registrarGameOver(state);
  if (state.pendingFinalDilemma || state.escape_ending_triggered || state.dead_hand_triggered) return state;
  if (isEscapeEligible(state) && state.dead_hand_active) {
    return {
      ...state,
      pendingFinalDilemma: true,
      notice: 'Colapso iminente: escolha entre fuga pessoal e a Diretriz Omega.',
    };
  }
  if (isEscapeEligible(state)) {
    const result = interceptarFinalCaixa2(state);
    return result.escape_ending_triggered && !state.escape_ending_triggered
      ? addNews(result, 'O pais caiu, mas o helicoptero privado decolou.')
      : result;
  }
  return interceptDeadHandGameOver(state);
}

function enterWasteland(state, reason) {
  return checkStoryChapters(transitionToWasteland(state, reason));
}

function isValidCongress(congress) {
  return Array.isArray(congress?.blocs)
    && congress.blocs.length === 4
    && congress.blocs.every((bloc) => bloc
      && typeof bloc.id === 'string'
      && Number.isFinite(bloc.seats)
      && bloc.seats > 0
      && Number.isFinite(bloc.support)
      && bloc.support >= 0
      && bloc.support <= 1)
    && congress.blocs.reduce((total, bloc) => total + bloc.seats, 0) === 300;
}

function isValidHistory(history) {
  return Array.isArray(history)
    && history.every((entry) => entry
      && typeof entry.type === 'string'
      && typeof entry.message === 'string'
      && entry.calendar
      && Number.isFinite(entry.calendar.month)
      && Number.isFinite(entry.calendar.year));
}

function isValidHistoryLog(historyLog) {
  return Array.isArray(historyLog)
    && historyLog.every((entry) => entry
      && Number.isInteger(entry.month)
      && entry.month >= 1
      && entry.month <= 12
      && Number.isInteger(entry.year)
      && typeof entry.type === 'string'
      && typeof entry.text === 'string');
}

function getActiveLawIds(laws) {
  return LAWS.filter((law) => laws[law.stateKey]?.approved).map((law) => law.id);
}

function collectPuppetTribute(economy, geopolitics) {
  const tribute = (geopolitics.contacts ?? []).reduce((total, contact) => total + (contact.is_puppet_of === 'jogador'
    ? Math.floor(Math.max(0, Number(contact.pib_base) || 0) * 0.2)
    : 0), 0);
  return tribute > 0 ? { ...economy, cash: economy.cash + tribute } : economy;
}

export function createGameState(countryId = 'bra') {
  const country = createCountryProfile(getCountryById(countryId) ?? COUNTRIES.find((item) => item.id === 'bra'));
  const geopolitics = createGeopolitics(country.id);
  return {
    version: STATE_VERSION,
    country,
    calendar: { month: 1, year: 2026 },
    economy: createEconomy(country),
    budget: { ...DEFAULT_BUDGET },
    government: 'republic',
    title: 'Presidente',
    pendingGovernmentChoice: false,
    is_wasteland: false,
    wasteland_cinematic_pending: false,
    wasteland_cinematic_ready: false,
    vault_built: false,
    scrap: 0,
    shelter_grid: normalizeShelterGrid(INITIAL_SHELTER_GRID),
    shelter_inhabitants: [],
    inhabitants: [],
    rpg_player: createRpgPlayer(INITIAL_SHELTER_GRID),
    shelter_supplies: { weapons: 0, medkits: 0 },
    shelter_guards: 0,
    shelter_radiation: 0,
    wastelandBuildings: { waterPurifiers: 0, geothermalGenerators: 0 },
    infrastructure: { roads: 0, railways: 0, airports: 0 },
    health: { hospitals: 0, clinics: 0 },
    industry: { factories: 0, power_plants: 0 },
    environment_health: 100,
    internal_maintenance_cost: 0,
    geopolitics,
    world: geopolitics.contacts,
    military: createMilitary(country),
    military_tech_level: 1,
    player_alliance: [],
    technology: createTechnology(),
    military_research_points: 0,
    unlocked_techs: [],
    factions: createFactions(),
    ministers: createMinisters(),
    regime: createRegime(),
    randomSeed: countrySeed(country.id) || 1,
    congress: createCongress(countrySeed(country.id)),
    laws: Object.fromEntries(LAWS.map((law) => [law.stateKey, { approved: false, voteCompleted: false }])),
    history: [],
    history_log: [],
    unlocked_chapters: ['cap_1_origem'],
    news: [],
    pendingEvent: null,
    pendingAllianceInvocation: null,
    pendingHostileAlert: null,
    pendingUnVote: null,
    activeGlobalResolutions: [],
    monthCounter: 0,
    activeLawIds: [],
    megacorp_power: 0,
    pendingGlobalBid: null,
    host_global_event: false,
    globalEventTourismUntil: 0,
    onuReputationLockedUntil: 0,
    global_defcon: 5,
    defconPeacefulMonths: 0,
    defconAnnexationMonths: 0,
    defcon_one_triggered: false,
    nuclearSanctionsPending: false,
    onuReputationPermanentlyZero: false,
    just_war_target: null,
    megaprojects: { deadHand: null },
    dead_hand_active: false,
    dead_hand_triggered: false,
    slush_fund: 0,
    slushFundTransfersThisMonth: 0,
    escape_ending_triggered: false,
    pendingFinalDilemma: false,
    double_agent_active: false,
    pendingInterrogation: null,
    seen_stories: [],
    pendingStory: false,
    currentStory: null,
    notice: 'Gabinete iniciado. O primeiro mes de governo comeca agora.',
  };
}

export function changeTax(state, taxKey, delta) {
  if (!TAX_KEYS.has(taxKey) || !Number.isFinite(delta)) {
    return state;
  }
  const nextRate = clampTaxRate(state.budget[taxKey] + (delta * 0.01));
  return syncWorld({
    ...state,
    budget: { ...state.budget, [taxKey]: nextRate },
    notice: taxKey === 'incomeTaxRate' ? 'Imposto de renda ajustado.' : 'IVA ajustado.',
  });
}

export function setBudget(state, budgetKey, value) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const budget = setBudgetRate(state.budget, budgetKey, value);
  if (budget === state.budget) return { ...state, notice: 'Controle orcamentario invalido.' };
  return { ...state, budget, notice: 'Orcamento atualizado.' };
}

export function desviarFundosParaCaixa2(state) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  if (state.pendingFinalDilemma) return { ...state, notice: 'Resolva o dilema final antes de executar novas acoes.' };
  const result = desviarFundos(state);
  return result.slush_fund !== state.slush_fund
    ? checkStoryChapters(checkStoryEvents(registrarEventoHistorico(addNews(result, `Caixa 2 atualizado: R$ ${result.slush_fund.toLocaleString('pt-BR')}.`), 'corrupcao', 'Fundos foram desviados para uma conta offshore.')))
    : result;
}

export function fugirEmSilencio(state) {
  if (!state.pendingFinalDilemma) return { ...state, notice: 'Nenhum dilema final aguarda decisao.' };
  return interceptarFinalCaixa2({ ...state, pendingFinalDilemma: false });
}

export function afundarComONavio(state) {
  if (!state.pendingFinalDilemma) return { ...state, notice: 'Nenhum dilema final aguarda decisao.' };
  return interceptDeadHandGameOver({ ...state, pendingFinalDilemma: false });
}

export function destruirDoHelicoptero(state) {
  if (!state.pendingFinalDilemma) return { ...state, notice: 'Nenhum dilema final aguarda decisao.' };
  const retaliation = interceptDeadHandGameOver({ ...state, pendingFinalDilemma: false });
  return interceptarFinalCaixa2(retaliation);
}

export function resolverSitioNegro(state, method) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  return resolveInterrogation(state, method);
}

export function escolherSitioNegro(state, action) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  return chooseInterrogation(state, action);
}

export function reivindicarSitioNegro(state, reward) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  return claimInterrogation(state, reward);
}

function applyGeopoliticalAction(state, action) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = action(state.geopolitics);
  return syncWorld({ ...state, geopolitics: result.geopolitics, notice: result.reason });
}

export function proposeTreaty(state, contactId) {
  return applyGeopoliticalAction(state, (geopolitics) => proposeTradeTreaty(geopolitics, contactId));
}

export function proposeAlliance(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = formAlliance(state.geopolitics, contactId);
  if (result.geopolitics === state.geopolitics) return { ...state, notice: result.reason };
  return syncWorld({
    ...state,
    geopolitics: { ...result.geopolitics, tradeGrowthBonus: (Number(state.geopolitics.tradeGrowthBonus) || 0) + 0.001 },
    player_alliance: [...new Set([...(state.player_alliance ?? []), contactId])],
    notice: result.reason,
  });
}

export function criarLiga(state, targetId) {
  if (targetId) return proposeAlliance(state, targetId);
  return createLeague(state, 'Liga Global');
}

export function respondArticle5(state, decision) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  return syncWorld(respondArticle5State(state, decision));
}

export function importarRecursos(state, contactId, resource, amount) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = importResources(state.geopolitics, state.economy, state.country, contactId, resource, amount);
  return syncWorld({ ...state, geopolitics: result.geopolitics, economy: result.economy, country: result.country, notice: result.reason });
}

export function proporAlianca(state, contactId) {
  return proposeAlliance(state, contactId);
}

export function alterarNotaONU(state, value) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  return syncWorld({ ...state, geopolitics: changeOnuScore(state.geopolitics, value), notice: 'Nota da ONU atualizada.' });
}

export function startWar(state, contactId) {
  const targetBeforeWar = state.geopolitics.contacts.find((contact) => contact.id === contactId);
  const isPlayerAllianceMember = Boolean(targetBeforeWar && ((state.player_alliance ?? []).includes(contactId) || targetBeforeWar.alliance));
  if (isPlayerAllianceMember) {
    return detectArticle5({
      ...state,
      geopolitics: {
        ...state.geopolitics,
        contacts: state.geopolitics.contacts.map((contact) => contact.id === contactId
          ? { ...contact, alliance: true, atWar: true, atWarAgainst: state.country.id }
          : contact),
      },
    });
  }
  const next = applyGeopoliticalAction(state, (geopolitics) => declareWar(geopolitics, contactId));
  if (next.geopolitics === state.geopolitics) return next;
  const target = next.geopolitics.contacts.find((contact) => contact.id === contactId);
  const legitimateDefense = isLegitimateDefenseTarget(state, contactId) || state.government === 'empire';
  const geopolitics = legitimateDefense ? next.geopolitics : changeOnuScore(next.geopolitics, -18);
  const notice = legitimateDefense
    ? (state.government === 'empire'
      ? `Guerra declarada contra ${target?.name ?? 'alvo estrangeiro'} por decreto imperial.`
      : `Guerra declarada contra ${target?.name ?? 'alvo estrangeiro'} sob alegacao de legitima defesa.`)
    : `Guerra declarada contra ${target?.name ?? 'alvo estrangeiro'}.`;
  return checkStoryChapters(registrarEventoHistorico(addNews(syncWorld({ ...next, geopolitics, notice }), notice), 'guerra', `Declarada guerra contra ${target?.name ?? 'um alvo estrangeiro'}. O mundo sustem a respiracao.`));
}

export function declararGuerra(state, contactId) {
  return startWar(state, contactId);
}

export function insultarNacao(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  if (state.pendingHostileAlert) return { ...state, notice: 'Resolva o alerta militar antes de provocar outra nacao.' };
  const result = insultNation(state.geopolitics, contactId, state.randomSeed);
  if (!result.ok) return { ...state, notice: result.reason };
  const factions = {
    ...state.factions,
    elite: clamp((Number(state.factions?.elite) || 0) + 2, 0, 100),
    militares: clamp((Number(state.factions?.militares) || 0) + (result.retaliation ? 4 : 2), 0, 100),
  };
  const next = syncWorld({
    ...state,
    geopolitics: result.geopolitics,
    randomSeed: result.seed,
    factions,
    notice: result.retaliation
      ? `O insulto saiu caro: ${result.target.name} declarou guerra contra nos.`
      : `${result.target.name} foi insultado. A crise diplomatica continua em aberto.`,
    pendingHostileAlert: result.retaliation && !result.nuclearRetaliation
      ? { type: 'war', targetId: result.target.id, targetName: result.target.name, dismissed: false }
      : null,
  });
  if (result.nuclearRetaliation) {
    const nuclearState = {
      ...next,
      global_defcon: 1,
      notice: `${result.target.name} respondeu ao insulto com retaliacao nuclear.`,
    };
    if (state.vault_built) return checkStoryChapters({ ...enterWasteland(nuclearState, 'retaliacao-nuclear-insulto'), global_defcon: 1, pendingHostileAlert: null });
    return resolverFinalDeJogo({
      ...nuclearState,
      regime: { ...nuclearState.regime, gameOver: true, outcome: 'aniquilacao-nuclear-por-retaliacao', electionsSuspended: true },
    });
  }
  return result.retaliation
    ? addNews(next, `Alerta militar: ${result.target.name} declarou guerra apos um insulto presidencial.`)
    : next;
}

export function dispensarAlertaHostil(state) {
  if (!state.pendingHostileAlert) return state;
  return { ...state, pendingHostileAlert: null, notice: 'Alerta militar reconhecido. O gabinete aguarda novas ordens.' };
}

export function sabotar(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const technology = getTechnologyModifiers(state.technology);
  const result = sabotageCountry(state.geopolitics, contactId, state.economy, state.randomSeed, { guaranteedSuccess: technology.guaranteedSabotage });
  return syncWorld({ ...state, geopolitics: result.geopolitics, economy: result.economy, randomSeed: result.seed, notice: result.reason });
}

export function lancarCiberataque(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = launchCyberAttack(state, contactId);
  return result.geopolitics === state.geopolitics ? result : addNews(syncWorld(result), result.notice);
}

export function lancarVirusSintetico(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = injetarVirusSintetico(state, contactId);
  return result.geopolitics === state.geopolitics ? result : addNews(syncWorld(result), result.notice);
}

export function executarFalsaBandeira(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = orquestrarFalsaBandeira(state, contactId);
  return result.just_war_target === contactId ? addNews(syncWorld(result), result.notice) : result;
}

export function infiltrarSosiaLider(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = infiltrarSosia(state, contactId);
  return result.geopolitics === state.geopolitics ? result : addNews(syncWorld(result), result.notice);
}

export function promulgarNovaConstituicao(state, pillar) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = promulgarConstituicao(state, pillar);
  return result.regime === state.regime ? result : addNews(syncWorld(result), result.notice);
}

export function automatizarIndustria(state) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = automateIndustry(state);
  return result.country === state.country ? result : addNews(result, result.notice);
}

export function construirProjetoInterno(state, projectId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = buildInternalProject(state, projectId);
  return result === state ? result : addNews(result, result.notice);
}

export function executarAutoGolpe(state) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  return openAutoCoup(state);
}

export function resolverAutoGolpe(state, government) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  return checkStoryChapters(resolveAutoCoup(state, government));
}

export function construirMegaVault(state) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  return buildMegaVault(state);
}

export function construirProjetoWasteland(state, projectId) {
  return buildWastelandProject(state, projectId);
}

export function enviarBatedoresWasteland(state, factionId) {
  return enviarBatedores(state, factionId);
}

export function transicionarParaWastelandMode(state, reason) {
  return enterWasteland(state, reason);
}

export { transicionarParaWastelandMode as transicionarParaWasteland };

export function candidatarJogosMundiais(state) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = bidForGlobalGames(state);
  return result.host_global_event && !state.host_global_event ? addNews(syncWorld(result), result.notice) : syncWorld(result);
}

export function recusarJogosMundiais(state) {
  return syncWorld(recusarCandidaturaGlobal(state));
}

export function estatizarMegacorporacoes(state) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = nationalizeMegacorps(state);
  return addNews(interceptDeadHandGameOver(result), result.notice);
}

export function iniciarProjetoMaoMorta(state) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = startDeadHandProject(state);
  return result.megaprojects !== state.megaprojects ? addNews(result, result.notice) : result;
}

export function recrutarSoldado(state, amount = 5_000) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const modifiers = getMinisterModifiers(state.ministers);
  const result = recruitSoldiers(state.military, state.economy, Math.round(amount * modifiers.recruitmentMultiplier), state.country);
  return { ...state, military: result.military, economy: result.economy, country: result.resources ?? state.country, notice: result.reason };
}

export function hireMinister(state, ministerId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = hireCabinetMinister(state.ministers, state.economy, ministerId);
  return addNews({ ...state, ministers: result.ministers, economy: result.economy, notice: result.reason }, result.reason);
}

export function dismissMinister(state, ministerId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = dismissCabinetMinister(state.ministers, state.economy, ministerId);
  const factions = { ...state.factions, trabalhadores: Math.min(100, state.factions.trabalhadores + 3), religiosos: Math.min(100, state.factions.religiosos + 2) };
  return addNews({ ...state, ministers: result.ministers, economy: result.economy, factions, notice: result.reason }, result.reason);
}

export function decretarRevolucaoSocialista(state) {
  const result = decreeSocialistRevolution(state);
  return result.regime === state.regime ? result : addNews(syncWorld(result), result.notice);
}

export function absorverPaisParaUniao(state, contactId) {
  const result = absorbIntoUnion(state, contactId);
  return result.geopolitics === state.geopolitics ? result : addNews(syncWorld(result), result.notice);
}

export function financiarRebeldes(state, contactId) {
  const result = fundRebels(state, contactId);
  return result.geopolitics === state.geopolitics ? result : addNews(syncWorld(result), result.notice);
}

export function resolveEvent(state, optionId) {
  if (!state.pendingEvent) return { ...state, notice: 'Nenhuma crise aguarda resposta.' };
  const resolved = applyEventOption(state, optionId);
  return addNews(resolved, `Crise resolvida: ${state.pendingEvent.title}.`);
}

export function votarNaONU(state, vote) {
  if (!state.pendingUnVote) return { ...state, notice: 'Nenhuma votacao da ONU aguarda resposta.' };
  const result = registrarVotoONU(state, vote);
  return addNews(syncWorld(result), result.notice);
}

export function comprarMaterialMilitar(state, kind) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = comprarEquipamento(state.military, state.economy, kind, state.country);
  return { ...state, military: result.military, economy: result.economy, country: result.resources ?? state.country, notice: result.reason };
}

export function comprarBlindado(state, amount = 1) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = comprarBlindados(state.military, state.economy, amount, state.country);
  return { ...state, military: result.military, economy: result.economy, country: result.resources ?? state.country, notice: result.reason };
}

export function comprarNavio(state, amount = 1) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = comprarNavios(state.military, state.economy, amount, state.country);
  return { ...state, military: result.military, economy: result.economy, country: result.resources ?? state.country, notice: result.reason };
}

export function comprarCaca(state, amount = 1) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = comprarCacas(state.military, state.economy, amount, state.country);
  return { ...state, military: result.military, economy: result.economy, country: result.resources ?? state.country, notice: result.reason };
}

export function anexarPais(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const targetId = contactId ?? state.geopolitics.peaceTreaty?.targetId;
  const contact = state.geopolitics.contacts.find((item) => item.id === targetId);
  if (!contact || contact.destruido || contact.anexado || contact.militaryPower > 0) return { ...state, notice: 'Anexacao exige a derrota total do alvo.' };
  const prepared = state.geopolitics.peaceTreaty?.targetId === targetId
    ? state
    : { ...state, geopolitics: { ...state.geopolitics, peaceTreaty: { targetId, status: 'pending' } } };
  const annexed = annexTreatyTarget(prepared);
  return markAnnexationTension(syncWorld({ ...annexed, military: normalizeMilitary(annexed.military) }));
}

export function resolvePeaceTreaty(state, contactId, choice) {
  const treaty = state.geopolitics.peaceTreaty;
  const contact = state.geopolitics.contacts.find((item) => item.id === contactId);
  if (!treaty || treaty.targetId !== contactId || !contact || contact.militaryPower > 0) {
    return { ...state, notice: 'Nenhum tratado de paz valido para este alvo.' };
  }
  const consumeLegitimacy = (result) => state.just_war_target === contactId
    ? { ...result, just_war_target: null }
    : result;
  if (choice === 'annex') return consumeLegitimacy(anexarPais(state, contactId));
  if (choice === 'loot') return consumeLegitimacy(syncWorld(lootTreatyTarget(state)));
  if (choice === 'puppet') return consumeLegitimacy(syncWorld(establishPuppet(state)));
  if (choice === 'demilitarize') return consumeLegitimacy(syncWorld(demilitarizeTreatyTarget(state)));
  if (choice === 'reparations') return consumeLegitimacy(syncWorld(applyReparationsTreaty(state)));
  return { ...state, notice: 'Termo de tratado invalido.' };
}

export function exigirAnexacao(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const legitimateDefense = isLegitimateDefenseTarget(state, contactId);
  const result = demandAnnexation(state.geopolitics, contactId, getPoderTotal(state.military), state.randomSeed);
  if (!result.ok) return { ...state, notice: result.reason };
  if (result.accepted) {
    return anexarPais({ ...state, geopolitics: result.geopolitics, randomSeed: result.seed }, contactId);
  }
  return syncWorld({
    ...state,
    geopolitics: legitimateDefense ? result.geopolitics : changeOnuScore(result.geopolitics, -18),
    randomSeed: result.seed,
    notice: legitimateDefense ? `${result.reason} A ONU reconheceu a alegacao de legitima defesa.` : result.reason,
  });
}

export function imporSancao(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = imposeSanction(state.geopolitics, contactId, state.economy.gdp);
  return syncWorld({ ...state, geopolitics: result.geopolitics, notice: result.reason });
}

export function createLeague(state, name = 'Liga Global') {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  return syncWorld(createLeagueState(state, name));
}

export function inviteToLeague(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = inviteLeagueMember(state.geopolitics, contactId);
  return syncWorld({ ...state, geopolitics: result.geopolitics, notice: result.reason });
}

export function lancarAtaqueNuclear(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  if (!state.unlocked_techs?.includes('nuke')) return { ...state, notice: 'Ataque nuclear exige [ ENRIQUECIMENTO DE URÂNIO ].' };
  const contact = state.geopolitics.contacts.find((item) => item.id === contactId);
  const arsenal = Math.max(0, Math.floor(Number(state.military.armasNucleares) || 0));
  if (!contact?.atWar || arsenal < 1) return { ...state, notice: 'Ataque nuclear exige guerra ativa e uma arma nuclear operacional.' };
  const contacts = state.geopolitics.contacts.map((item) => item.id === contactId
    ? { ...item, militaryPower: item.militaryPower * 0.2, population: Math.floor((Number(item.population) || 0) * 0.2), nuclearStruck: true, alliance: false }
    : { ...item, alliance: false });
  const result = syncWorld({
    ...state,
    military: normalizeMilitary({ ...state.military, armasNucleares: arsenal - 1, nuclear: { ...state.military.nuclear, arsenal: Math.max(0, arsenal - 1) } }),
    geopolitics: { ...state.geopolitics, contacts, onuScore: 0, internationalSanctions: true, sanctionSeverity: 1 },
    notice: `Ataque nuclear contra ${contact.name}: reputacao na ONU colapsou.`,
  });
  return state.vault_built ? enterWasteland(result, 'ataque-nuclear') : result;
}

export function canAutorizarAniquilacaoNuclear(state) {
  return Number(state.country?.uranium) > 100
    && Boolean(state.military?.nuclear?.bombBuilt)
    && Boolean(state.unlocked_techs?.includes('nuke'));
}

export function autorizarAniquilacaoNuclear(state, contactId, authorizationCode) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  if (authorizationCode !== 'KABOOM') return { ...state, notice: 'Codigo de autorizacao invalido.' };
  if (!canAutorizarAniquilacaoNuclear(state)) {
    return { ...state, notice: 'Codigos nucleares exigem uranio, arma nuclear e [ ENRIQUECIMENTO DE URÂNIO ].' };
  }

  const target = state.geopolitics.contacts.find((contact) => contact.id === contactId);
  if (!target?.atWar || target.wasteland) {
    return { ...state, notice: 'Aniquilacao nuclear exige um alvo em guerra ativa.' };
  }

  const contacts = state.geopolitics.contacts.map((contact) => contact.id === contactId
    ? {
      ...contact,
      wasteland: true,
      atWar: false,
      population: 0,
      populacao_base: 0,
      pib_base: 0,
      militaryPower: 0,
      military: { exercito: { soldados: 0, blindados: 0 }, marinha: { navios: 0 }, aeronautica: { cacas: 0 } },
      alliance: false,
      tradeTreaty: false,
      relation: -100,
    }
    : { ...contact, alliance: false });
  const result = addNews(syncWorld({
    ...state,
    country: { ...state.country, uranium: Number(state.country.uranium) - 100 },
    geopolitics: { ...state.geopolitics, contacts, onuScore: 0, internationalSanctions: true, sanctionSeverity: 1 },
    global_defcon: 1,
    defconPeacefulMonths: 0,
    nuclearSanctionsPending: true,
    onuReputationPermanentlyZero: true,
    notice: `${target.name} foi reduzido a uma zona de aniquilacao nuclear.`,
  }), `${target.name} foi reduzido a uma zona de aniquilacao nuclear.`);
  return state.vault_built ? enterWasteland(result, 'ataque-nuclear') : result;
}

export function fundNuclear(state, kind, amount) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = fundNuclearProject(state.military, state.economy, kind, amount, state.country);
  return { ...state, military: result.military, economy: result.economy, country: result.resources ?? state.country, notice: result.reason };
}

export function attemptAutogolpe(state) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  if (!canAutogolpe(state.regime, state.military)) {
    return { ...state, notice: 'Autogolpe exige apoio militar acima de 60% e poder terrestre elevado.' };
  }
  return syncWorld({
    ...state,
    regime: { ...state.regime, type: 'dictatorship', electionsSuspended: true, coupRisk: 0, revolutionRisk: 0.015 },
    laws: Object.fromEntries(LAWS.map((law) => [law.stateKey, { approved: true, voteCompleted: true }])),
    activeLawIds: LAWS.map((law) => law.id),
    notice: 'Estado de sitio decretado. Congresso dissolvido e leis aprovadas por decreto.',
  });
}

export function researchTechnology(state, technologyId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = purchaseTechnology(state.technology, technologyId);
  const nextState = { ...state, technology: result.technology, notice: result.reason };
  return result.ok ? registrarEventoHistorico(nextState, 'tecnologia', result.reason) : nextState;
}

export function pesquisarTecnologiaMilitar(state, technologyId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = pesquisarTecnologia(state, technologyId);
  const researched = result.unlocked_techs.includes('nuke') && !result.country.has_nukes
    ? { ...result, country: { ...result.country, has_nukes: true } }
    : result;
  return researched.unlocked_techs.length > (state.unlocked_techs?.length ?? 0)
    ? checkStoryEvents(registrarEventoHistorico(addNews(researched, researched.notice), 'tecnologia', researched.notice))
    : researched;
}

export function dispensarHistoria(state) {
  return dismissNarrativeStory(state);
}

export function negotiate(state, blocId) {
  const result = negotiateSupport(state.congress, state.economy, blocId, state.factions);
  return {
    ...state,
    congress: result.congress,
    economy: result.economy,
    notice: result.reason,
  };
}

export function voteLaw(state, lawId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const law = LAWS.find((item) => item.id === lawId);
  if (!law) return { ...state, notice: 'Projeto de lei nao encontrado.' };
  if (state.regime?.type === 'dictatorship') {
    const notice = `${law.title} aprovada por decreto.`;
    return registrarEventoHistorico(addNews(syncWorld({
      ...state,
      laws: { ...state.laws, [law.stateKey]: { approved: true, voteCompleted: true } },
      activeLawIds: [...new Set([...(state.activeLawIds ?? []), law.id])],
      notice,
      history: addHistory(state, { type: 'decree', message: notice, calendar: state.calendar }),
    }), notice), 'lei', `${law.title} foi aprovada por decreto.`);
  }
  const lawState = state.laws[law.stateKey] ?? { approved: false, voteCompleted: false };
  if (lawState.voteCompleted) {
    return { ...state, notice: `${law.title} ja foi votada nesta legislatura.` };
  }

  if (isLobbyBlocked(law, state.megacorp_power)) {
    const notice = 'Acao bloqueada: O lobby das Megacorporacoes comprou os votos.';
    return addNews({
      ...state,
      laws: { ...state.laws, [law.stateKey]: { approved: false, voteCompleted: true } },
      notice,
      history: addHistory(state, { type: 'lobby', message: notice, calendar: state.calendar }),
    }, notice);
  }

  const result = voteOnLaw(state.congress, law, state.factions);
  const notice = result.approved
    ? `${law.title} aprovada por ${result.votesFor} votos.`
    : `${law.title} rejeitada: ${result.votesFor}/${result.requiredVotes} votos.`;
  const laws = { ...state.laws, [law.stateKey]: { approved: result.approved, voteCompleted: true } };
  const nextState = addNews({
    ...state,
    laws,
    activeLawIds: getActiveLawIds(laws),
    notice,
    history: addHistory(state, { type: 'vote', message: notice, calendar: state.calendar }),
  }, notice);
  return result.approved
    ? registrarEventoHistorico(nextState, 'lei', `${law.title} foi aprovada pelo Congresso.`)
    : nextState;
}

// A confirmation modal precedes the vote; the Congress engine still decides approval.
export function confirmarVotoSim(state, lawId) {
  return voteLaw(state, lawId);
}

export function voteLaborLaw(state) {
  return voteLaw(state, LAW_LABOR_REFORM.id);
}

export function advanceMonth(state) {
  if (state.regime?.gameOver) return resolverFinalDeJogo({ ...state, notice: 'A partida foi encerrada.' });
  if (state.pendingHostileAlert) return { ...state, notice: 'Reconheca o alerta militar antes de avancar o mes.' };
  if (state.wasteland_cinematic_ready) return { ...state, notice: 'Assuma o comando do Vault antes de avancar o mes.' };
  if (state.is_wasteland) return advanceWastelandMonth(state);
  if (state.geopolitics.peaceTreaty?.status === 'pending') return { ...state, notice: 'Resolva o Tratado de Paz antes de avancar o mes.' };
  if (state.pendingEvent) return { ...state, notice: 'Resolva a crise nacional antes de avancar o mes.' };
  if (state.pendingUnVote) return { ...state, notice: 'Registre seu voto na Assembleia da ONU antes de avancar o mes.' };
  if (state.pendingGlobalBid) return { ...state, notice: 'Decida a candidatura aos Jogos Mundiais antes de avancar o mes.' };
  if (state.pendingInterrogation) return { ...state, notice: 'Resolva o interrogatorio antes de avancar o mes.' };
  if (state.pendingStory) return { ...state, notice: 'Leia o dossie confidencial antes de avancar o mes.' };
  if (state.pendingAllianceInvocation) return { ...state, notice: 'Decida se a alianca sera defendida antes de avancar o mes.' };
  state = advanceGovernment(state);
  if (state.nuclearSanctionsPending) {
    state = {
      ...state,
      country: { ...state.country, pib_base: Math.round(state.country.pib_base * 0.7) },
      economy: { ...state.economy, gdp: Math.round(state.economy.gdp * 0.7) },
      nuclearSanctionsPending: false,
    };
  }
  const corporateState = processarMegacorporacoes({ ...state, activeLawIds: getActiveLawIds(state.laws) });
  const effects = aggregateActiveLawEffects(state.laws);
  const factionModifiers = getFactionModifiers(state.factions);
  const ministerModifiers = getMinisterModifiers(state.ministers);
  const corporateModifiers = getMegacorpModifiers(corporateState.megacorp_power);
  const softPowerModifiers = getSoftPowerModifiers(corporateState);
  const monthlyEffects = applyGovernmentEconomy(state, { ...effects, taxRevenueModifier: (effects.taxRevenueModifier ?? 0) + ministerModifiers.taxRevenueModifier + corporateModifiers.taxRevenueModifier });
  const technology = state.regime?.constitution === 'theocratic'
    ? { ...state.technology, generated: 0 }
    : advanceTechnology(state.technology, state.economy, state.budget, state.country.trait);
  const militaryResearchGenerated = calculateMilitaryResearchPoints(state.economy, state.budget);
  const technologyModifiers = getTechnologyModifiers(technology);
  const geopoliticalModifiers = getGeopoliticalModifiers(state.geopolitics, state.military);
  const traitModifiers = getTraitModifiers(state.country, state.geopolitics);
  const internalProjectModifiers = getInternalProjectModifiers(state, technologyModifiers);
  const modifiers = {
    ...geopoliticalModifiers,
    growthModifier: geopoliticalModifiers.growthModifier + technologyModifiers.growthModifier + factionModifiers.growthModifier + internalProjectModifiers.growthModifier,
    infrastructureCostModifier: geopoliticalModifiers.infrastructureCostModifier + technologyModifiers.infrastructureCostModifier,
    popularityModifier: geopoliticalModifiers.factionModifier + technologyModifiers.popularityModifier,
    tradeRevenueRate: geopoliticalModifiers.tradeRevenueRate + traitModifiers.exportRevenueRate,
    inflationModifier: traitModifiers.foodInflationModifier + technologyModifiers.foodInflationModifier,
    cashRevenueModifier: softPowerModifiers.cashRevenueModifier + internalProjectModifiers.cashRevenueModifier,
  };
  const economyAfterPolicy = advanceEconomy(state.economy, state.budget, monthlyEffects, modifiers);
  const traitInterest = economyAfterPolicy.cash > 0 ? economyAfterPolicy.cash * traitModifiers.cashInterest : 0;
  const economicMonth = { ...economyAfterPolicy, cash: economyAfterPolicy.cash + traitInterest };
  const internalProjectState = processarProjetosInternos({ ...state, economy: economicMonth }, technologyModifiers);
  const economyAfterInternalMaintenance = {
    ...internalProjectState.economy,
    cash: internalProjectState.economy.cash - internalProjectState.internal_maintenance_cost,
  };
  const militaryMaintenance = Math.round(calculateMilitaryMaintenance(state.military, state.military_tech_level) * technologyModifiers.militaryMaintenanceModifier);
  const economyAfterMilitaryMaintenance = { ...economyAfterInternalMaintenance, cash: economyAfterInternalMaintenance.cash - militaryMaintenance };
  const nuclearResult = applyNuclearCompletion(changeOnuScore(state.geopolitics, effects.onuModifier ?? 0), state.military);
  const nuclear = state.onuReputationPermanentlyZero
    ? { ...nuclearResult, geopolitics: { ...nuclearResult.geopolitics, onuScore: 0, internationalSanctions: true, sanctionSeverity: 1 } }
    : nuclearResult;
  const preparedMilitary = advanceMilitary(nuclear.military, economyAfterMilitaryMaintenance, state.budget, {}, state.factions);
  preparedMilitary.military.infantryMultiplier = technologyModifiers.infantryMultiplier;
  preparedMilitary.military.support = clamp(preparedMilitary.military.support + (effects.militarySupportModifier ?? 0), 0, 100);
  preparedMilitary.military.power = Math.min(100, preparedMilitary.military.power * (1 + technologyModifiers.militaryEffectiveness));
  const geopoliticalMonth = advanceGeopolitics(nuclear.geopolitics, preparedMilitary.military, economyAfterMilitaryMaintenance, internalProjectState.randomSeed);
  const militaryMonth = advanceMilitary(preparedMilitary.military, geopoliticalMonth.economy, { defenseSpend: 0, applyDeficitPenalty: false }, geopoliticalMonth, state.factions);
  const economyWithPuppetTribute = collectPuppetTribute(militaryMonth.economy, geopoliticalMonth.geopolitics);
  const factions = advanceFactions(state.factions, state.economy, economyWithPuppetTribute, state.budget, effects, { popularityModifier: modifiers.popularityModifier + (geopoliticalMonth.factionDelta ?? 0) });
  const factionsAfterEcology = internalProjectState.ecologicalDisaster
    ? {
      ...factions,
      trabalhadores: Math.max(0, (Number(factions.trabalhadores) || 0) - 8),
      elite: Math.max(0, (Number(factions.elite) || 0) - 3),
    }
    : factions;
  const infrastructureState = processarAutomacaoIndustrial({
    ...state,
    country: state.country,
    factions: factionsAfterEcology,
    infrastructure: internalProjectState.infrastructure,
    health: internalProjectState.health,
    industry: internalProjectState.industry,
    environment_health: internalProjectState.environment_health,
    internal_maintenance_cost: internalProjectState.internal_maintenance_cost,
  });
  const constitutionalState = aplicarModificadoresConstitucionais(state, {
    economy: economyWithPuppetTribute,
    military: militaryMonth.military,
    factions: infrastructureState.factions,
    technology,
  });
  const stability = state.regime?.stabilityLocked
    ? { regime: { ...state.regime, coupRisk: 0, revolutionRisk: 0, gameOver: false, outcome: null }, seed: geopoliticalMonth.seed, event: null }
    : evaluateRegime(state.regime, constitutionalState.economy, constitutionalState.military, geopoliticalMonth.geopolitics, geopoliticalMonth.seed, constitutionalState.factions);
  const month = state.calendar.month === 12 ? 1 : state.calendar.month + 1;
  const year = state.calendar.month === 12 ? state.calendar.year + 1 : state.calendar.year;
  const notice = stability.event ?? internalProjectState.notice ?? `Mes encerrado: PIB ${economicMonth.monthlyBalance >= 0 ? 'com superavit' : 'com deficit'}.`;

  const completedState = syncWorld({
    ...state,
    economy: constitutionalState.economy,
    geopolitics: geopoliticalMonth.geopolitics,
    military: normalizeMilitary(constitutionalState.military),
    country: infrastructureState.country,
    factions: constitutionalState.factions,
    technology: constitutionalState.technology,
    infrastructure: internalProjectState.infrastructure,
    health: internalProjectState.health,
    industry: internalProjectState.industry,
    environment_health: internalProjectState.environment_health,
    internal_maintenance_cost: internalProjectState.internal_maintenance_cost,
    military_research_points: Math.max(0, Number(state.military_research_points) || 0) + militaryResearchGenerated,
    military_tech_level: Math.max(1, Number(state.military_tech_level) || 1),
    player_alliance: Array.isArray(state.player_alliance) ? state.player_alliance : [],
    unlocked_techs: Array.isArray(state.unlocked_techs) ? state.unlocked_techs : [],
    regime: { ...stability.regime, coupRisk: clamp(stability.regime.coupRisk + (effects.coupRiskModifier ?? 0), 0, 0.8) },
    randomSeed: stability.seed,
    calendar: { month, year },
    monthCounter: (Number(state.monthCounter) || 0) + 1,
    megacorp_power: corporateState.megacorp_power,
    slushFundTransfersThisMonth: 0,
    activeLawIds: corporateState.activeLawIds,
    notice,
    history: addHistory(state, { type: 'month', message: [...geopoliticalMonth.events, notice].join(' '), calendar: { month, year } }),
  });
  const corporateDefault = resolveCorporateDefault(completedState);
  if (corporateDefault.regime?.gameOver) return resolverFinalDeJogo(corporateDefault);
  const article5State = detectArticle5(completedState);
  if (article5State.pendingAllianceInvocation) return article5State;
  const narrativeState = registrarEventoHistorico(completedState, 'diario', gerarEntradaDiario(completedState, state));
  const megaprojectState = processarMegaprojetos(narrativeState);
  const terminalState = resolverFinalDeJogo(megaprojectState);
  if (terminalState.dead_hand_triggered || terminalState.escape_ending_triggered || terminalState.pendingFinalDilemma) return terminalState;
  const resolvedState = aplicarEfeitosSoftPower(processarMigracoes(aplicarResolucoes(processarInfeccoesBiologicas(advanceCyberWarfare(megaprojectState)))));
  const bioAlert = Boolean(resolvedState.country?.bio_infected) || Boolean(completedState.country?.bio_infected);
  const withNews = bioAlert
    ? addNews(addNews(syncWorld(resolvedState), notice), 'Alerta sanitario: o pais esta sob ataque biologico silencioso.')
    : addNews(syncWorld(resolvedState), notice);
  const defconState = applyDefconEconomicShock(advanceDefcon(withNews));
  const hostileState = processarAgressaoIA(defconState);
  if (hostileState.pendingHostileAlert?.type === 'nuclear') {
    const nuclearCollapse = { ...hostileState, global_defcon: 1, notice: `Ataque nuclear recebido de ${hostileState.pendingHostileAlert.targetName}.` };
    if (nuclearCollapse.vault_built) return checkStoryChapters(enterWasteland(nuclearCollapse, 'ataque-nuclear-inimigo'));
    return checkStoryChapters(resolverFinalDeJogo({
      ...nuclearCollapse,
      regime: { ...nuclearCollapse.regime, gameOver: true, outcome: 'aniquilacao-nuclear-inimiga', electionsSuspended: true },
    }));
  }
  if (defconState.global_defcon === 1 && !defconState.defcon_one_triggered) {
    const defconCollapse = defconState.vault_built
      ? enterWasteland({ ...defconState, defcon_one_triggered: true }, 'defcon-1')
      : {
        ...defconState,
        defcon_one_triggered: true,
        regime: { ...defconState.regime, gameOver: true, outcome: 'aniquilacao-nuclear', electionsSuspended: true },
        notice: 'DEFCON 1: a destruicao global encerrou a civilizacao.',
      };
    return checkStoryChapters(checkStoryEvents(defconCollapse));
  }
  const globalBidState = verificarSedeGlobal(hostileState);
  if (globalBidState.pendingGlobalBid) return addNews(globalBidState, globalBidState.notice);
  const assemblyState = verificarAssembleia(hostileState);
  if (assemblyState.pendingUnVote) return addNews(assemblyState, assemblyState.notice);
  const eventRoll = rollMonthlyEvent(stability.seed);
  if (!eventRoll.event) return checkStoryChapters(checkStoryEvents(sortearCapturaAgente({ ...assemblyState, randomSeed: eventRoll.seed })));
  return checkStoryChapters(checkStoryEvents(addNews({
    ...assemblyState,
    randomSeed: eventRoll.seed,
    pendingEvent: eventRoll.event,
    notice: `Crise nacional: ${eventRoll.event.title}.`,
  }, `Alerta: ${eventRoll.event.title}.`)));
}

export function hydrateGameState(serialized) {
  try {
    const parsed = JSON.parse(serialized);
    if (!Number.isInteger(parsed?.version) || parsed.version < 1 || parsed.version > STATE_VERSION || !getCountryById(parsed?.country?.id)) {
      return createGameState();
    }

    const base = createGameState(parsed.country.id);
    const economy = parsed.economy ?? {};
    const calendar = parsed.calendar ?? {};
    const laws = parsed.laws?.laborReform ?? {};
    const countryIsWasteland = Boolean(parsed.country?.wasteland);
    const shelterGrid = normalizeShelterGrid(parsed.shelter_grid ?? migrateLegacyRooms(parsed.bunker_rooms));
    const hydrated = {
      ...base,
      country: {
        ...base.country,
        nome: typeof parsed.country?.nome === 'string' ? parsed.country.nome : base.country.nome,
        area_km2: countryIsWasteland ? 0 : (Number.isFinite(Number(parsed.country?.area_km2)) ? Math.max(1, Number(parsed.country.area_km2)) : base.country.area_km2),
        populacao: countryIsWasteland ? 0 : (Number.isFinite(Number(parsed.country?.populacao ?? parsed.country?.populacao_base)) ? Math.max(1, Number(parsed.country.populacao ?? parsed.country.populacao_base)) : base.country.populacao),
        populacao_base: countryIsWasteland ? 0 : (Number.isFinite(Number(parsed.country?.populacao_base ?? parsed.country?.populacao)) ? Math.max(1, Number(parsed.country.populacao_base ?? parsed.country.populacao)) : base.country.populacao_base),
        pib_base: countryIsWasteland ? 0 : (Number.isFinite(Number(parsed.country?.pib_base)) ? Math.max(1, Number(parsed.country.pib_base)) : base.country.pib_base),
        wasteland: countryIsWasteland,
        uranium: Number.isFinite(Number(parsed.country?.uranium)) ? Math.max(0, Number(parsed.country.uranium)) : base.country.uranium,
        steel: Number.isFinite(Number(parsed.country?.steel)) ? Math.max(0, Number(parsed.country.steel)) : base.country.steel,
        rare_earths: Number.isFinite(Number(parsed.country?.rare_earths)) ? Math.max(0, Number(parsed.country.rare_earths)) : base.country.rare_earths,
        industry_automated: Boolean(parsed.country?.industry_automated),
        bio_infected: Boolean(parsed.country?.bio_infected),
        bio_timer: Math.max(0, Math.floor(Number(parsed.country?.bio_timer) || 0)),
        has_nukes: base.country.has_nukes,
      },
      calendar: {
        month: clamp(Math.floor(Number(calendar.month) || 1), 1, 12),
        year: clamp(Math.floor(Number(calendar.year) || 2026), 1900, 2500),
      },
      budget: {
        ...base.budget,
        incomeTaxRate: clampTaxRate(parsed.budget?.incomeTaxRate ?? base.budget.incomeTaxRate),
        vatRate: clampTaxRate(parsed.budget?.vatRate ?? base.budget.vatRate),
        healthSpend: Number.isFinite(Number(parsed.budget?.healthSpend)) ? Math.max(0, Number(parsed.budget.healthSpend)) : base.budget.healthSpend,
        educationSpend: Number.isFinite(Number(parsed.budget?.educationSpend)) ? Math.max(0, Number(parsed.budget.educationSpend)) : base.budget.educationSpend,
        infrastructureSpend: Number.isFinite(Number(parsed.budget?.infrastructureSpend)) ? Math.max(0, Number(parsed.budget.infrastructureSpend)) : base.budget.infrastructureSpend,
        scienceSpend: Number.isFinite(Number(parsed.budget?.scienceSpend)) ? Math.max(0, Number(parsed.budget.scienceSpend)) : base.budget.scienceSpend,
        defenseSpend: Number.isFinite(Number(parsed.budget?.defenseSpend)) ? Math.max(0, Number(parsed.budget.defenseSpend)) : base.budget.defenseSpend,
      },
      infrastructure: {
        roads: Math.max(0, Math.floor(Number(parsed.infrastructure?.roads) || 0)),
        railways: Math.max(0, Math.floor(Number(parsed.infrastructure?.railways) || 0)),
        airports: Math.max(0, Math.floor(Number(parsed.infrastructure?.airports) || 0)),
      },
      health: {
        hospitals: Math.max(0, Math.floor(Number(parsed.health?.hospitals) || 0)),
        clinics: Math.max(0, Math.floor(Number(parsed.health?.clinics) || 0)),
      },
      industry: {
        factories: Math.max(0, Math.floor(Number(parsed.industry?.factories) || 0)),
        power_plants: Math.max(0, Math.floor(Number(parsed.industry?.power_plants) || 0)),
      },
      environment_health: clamp(Number(parsed.environment_health ?? base.environment_health), 0, 100),
      internal_maintenance_cost: Math.max(0, Number(parsed.internal_maintenance_cost) || 0),
      economy: {
        ...base.economy,
        gdp: countryIsWasteland ? 0 : Math.max(1, Number(economy.gdp) || base.economy.gdp),
        inflation: clamp(Number(economy.inflation) || 0, 0, 0.8),
        unemployment: clamp(Number(economy.unemployment) || base.economy.unemployment, 0.02, 0.45),
        cash: Number.isFinite(Number(economy.cash)) ? Number(economy.cash) : base.economy.cash,
      },
      geopolitics: parsed.version >= 2 && Array.isArray(parsed.geopolitics?.contacts) ? {
        ...base.geopolitics,
        ...parsed.geopolitics,
        contacts: base.geopolitics.contacts.map((baseContact) => ({
          ...baseContact,
          ...(parsed.geopolitics.contacts.find((savedContact) => savedContact?.id === baseContact.id) ?? {}),
          has_nukes: baseContact.has_nukes,
        })),
      } : base.geopolitics,
      military: parsed.version >= 2 && parsed.military && Number.isFinite(parsed.military.power) && Number.isFinite(parsed.military.support)
        ? normalizeMilitary({ ...base.military, ...parsed.military, nuclear: { ...base.military.nuclear, ...parsed.military.nuclear } })
        : base.military,
      technology: parsed.version >= 3 && Array.isArray(parsed.technology?.unlocked) ? { points: Math.max(0, Number(parsed.technology.points) || 0), unlocked: parsed.technology.unlocked.filter((id) => typeof id === 'string') } : base.technology,
      military_research_points: Math.max(0, Number(parsed.military_research_points) || 0),
      military_tech_level: Math.max(1, Number(parsed.military_tech_level) || 1),
      player_alliance: Array.isArray(parsed.player_alliance) ? parsed.player_alliance.filter((id) => typeof id === 'string') : base.player_alliance,
      unlocked_techs: Array.isArray(parsed.unlocked_techs)
        ? parsed.unlocked_techs.filter((id) => typeof id === 'string' && getMilitaryTechnology(id))
        : base.unlocked_techs,
      factions: parsed.factions ? normalizeFactions(parsed.factions) : normalizeFactions({
        elite: Number(parsed.economy?.popularity) || 50,
        trabalhadores: Number(parsed.economy?.popularity) || 50,
        militares: Number(parsed.military?.support) || 50,
        religiosos: Number(parsed.economy?.popularity) || 50,
      }),
      regime: parsed.version >= 2 && parsed.regime && typeof parsed.regime === 'object' ? { ...base.regime, ...parsed.regime } : base.regime,
      randomSeed: Number.isFinite(parsed.randomSeed) ? parsed.randomSeed : base.randomSeed,
      monthCounter: Math.max(0, Math.floor(Number(parsed.monthCounter) || 0)),
      congress: isValidCongress(parsed.congress) ? parsed.congress : base.congress,
      laws: Object.fromEntries(LAWS.map((law) => {
        const savedLaw = law.stateKey === 'laborReform' ? laws : parsed.laws?.[law.stateKey];
        return [law.stateKey, { approved: Boolean(savedLaw?.approved), voteCompleted: Boolean(savedLaw?.voteCompleted) }];
      })),
      history: isValidHistory(parsed.history) ? parsed.history.slice(0, 12) : [],
      history_log: isValidHistoryLog(parsed.history_log) ? parsed.history_log : [],
      unlocked_chapters: Array.isArray(parsed.unlocked_chapters)
        ? [...new Set(['cap_1_origem', ...parsed.unlocked_chapters.filter((id) => typeof id === 'string' && getLoreChapter(id))])]
        : base.unlocked_chapters,
      ministers: {
        ...base.ministers,
        economy: parsed.ministers?.economy?.id === 'economy' ? { id: 'economy' } : null,
        defense: parsed.ministers?.defense?.id === 'defense' ? { id: 'defense' } : null,
      },
      news: Array.isArray(parsed.news)
        ? parsed.news.filter((item) => typeof item?.text === 'string' && item.calendar).slice(0, 5)
        : base.news,
      pendingEvent: EVENTS.find((event) => event.id === parsed.pendingEvent?.id) ?? null,
      pendingAllianceInvocation: parsed.pendingAllianceInvocation?.allyId && parsed.pendingAllianceInvocation?.attackerId
        ? {
          allyId: parsed.pendingAllianceInvocation.allyId,
          allyName: typeof parsed.pendingAllianceInvocation.allyName === 'string' ? parsed.pendingAllianceInvocation.allyName : parsed.pendingAllianceInvocation.allyId,
          attackerId: parsed.pendingAllianceInvocation.attackerId,
          attackerName: typeof parsed.pendingAllianceInvocation.attackerName === 'string' ? parsed.pendingAllianceInvocation.attackerName : parsed.pendingAllianceInvocation.attackerId,
        }
        : null,
      pendingHostileAlert: parsed.pendingHostileAlert?.type && parsed.pendingHostileAlert?.targetId
        ? {
          type: parsed.pendingHostileAlert.type === 'nuclear' ? 'nuclear' : 'war',
          targetId: parsed.pendingHostileAlert.targetId,
          targetName: typeof parsed.pendingHostileAlert.targetName === 'string' ? parsed.pendingHostileAlert.targetName : parsed.pendingHostileAlert.targetId,
          dismissed: false,
        }
        : null,
      pendingUnVote: parsed.pendingUnVote && typeof parsed.pendingUnVote.resolutionId === 'string' ? parsed.pendingUnVote : null,
      activeGlobalResolutions: Array.isArray(parsed.activeGlobalResolutions) ? parsed.activeGlobalResolutions.filter((id) => typeof id === 'string') : base.activeGlobalResolutions,
      notice: typeof parsed.notice === 'string' ? parsed.notice : base.notice,
    };
    const normalizedFactions = hydrated.regime?.constitution === 'theocratic'
      ? Object.fromEntries(Object.entries(hydrated.factions).filter(([key]) => key !== 'elite' && key !== 'trabalhadores'))
      : hydrated.factions;
    const seenStories = Array.isArray(parsed.seen_stories)
      ? [...new Set(parsed.seen_stories.filter((id) => typeof id === 'string' && getStoryEvent(id)))]
      : [];
    const pendingStoryId = Boolean(parsed.pendingStory) && getStoryEvent(parsed.currentStory) && !seenStories.includes(parsed.currentStory)
      ? parsed.currentStory
      : null;
    return syncWorld({
      ...hydrated,
      factions: normalizedFactions,
      activeLawIds: getActiveLawIds(hydrated.laws),
      megacorp_power: clamp(Number(parsed.megacorp_power) || 0, 0, 100),
      pendingGlobalBid: parsed.pendingGlobalBid?.status === 'pending' ? { status: 'pending' } : null,
      host_global_event: Boolean(parsed.host_global_event),
      globalEventTourismUntil: Math.max(0, Math.floor(Number(parsed.globalEventTourismUntil) || 0)),
      onuReputationLockedUntil: Math.max(0, Math.floor(Number(parsed.onuReputationLockedUntil) || 0)),
      global_defcon: clamp(Math.floor(Number(parsed.global_defcon) || base.global_defcon), 1, 5),
      defconPeacefulMonths: Math.max(0, Math.floor(Number(parsed.defconPeacefulMonths) || 0)),
      defconAnnexationMonths: Math.max(0, Math.floor(Number(parsed.defconAnnexationMonths) || 0)),
      defcon_one_triggered: Boolean(parsed.defcon_one_triggered),
      government: ['republic', 'empire', 'corporate'].includes(parsed.government) ? parsed.government : base.government,
      title: typeof parsed.title === 'string' ? parsed.title : base.title,
      pendingGovernmentChoice: Boolean(parsed.pendingGovernmentChoice),
      is_wasteland: Boolean(parsed.is_wasteland),
      wasteland_cinematic_pending: Boolean(parsed.wasteland_cinematic_pending),
      wasteland_cinematic_ready: Boolean(parsed.wasteland_cinematic_ready),
      vault_built: Boolean(parsed.vault_built || parsed.megaprojects?.megaVault?.completed),
      scrap: Math.max(0, Number(parsed.scrap) || 0),
      shelter_grid: shelterGrid,
      shelter_inhabitants: normalizeShelterInhabitants(parsed.shelter_inhabitants ?? migrateLegacyPlayer(parsed.bunker_player, parsed.bunker_rooms, shelterGrid), shelterGrid),
      inhabitants: parsed.is_wasteland ? normalizeInhabitants(parsed.inhabitants ??
        (parsed.shelter_inhabitants?.some((actor) => actor?.id !== 'president')
          ? parsed.shelter_inhabitants.filter((actor) => actor?.id !== 'president') : undefined), shelterGrid) : [],
      rpg_player: normalizeRpgPlayer(parsed.rpg_player ?? parsed.shelter_inhabitants?.find((actor) => actor.id === 'president'), shelterGrid),
      shelter_supplies: {
        weapons: Math.max(0, Math.floor(Number(parsed.shelter_supplies?.weapons) || 0)),
        medkits: Math.max(0, Math.floor(Number(parsed.shelter_supplies?.medkits) || 0)),
      },
      shelter_guards: Math.max(0, Math.floor(Number(parsed.shelter_guards) || 0)),
      shelter_radiation: Math.max(0, Math.min(100, Number(parsed.shelter_radiation) || 0)),
      wastelandBuildings: {
        waterPurifiers: Math.max(0, Math.floor(Number(parsed.wastelandBuildings?.waterPurifiers) || 0)),
        geothermalGenerators: Math.max(0, Math.floor(Number(parsed.wastelandBuildings?.geothermalGenerators) || 0)),
      },
      nuclearSanctionsPending: Boolean(parsed.nuclearSanctionsPending),
      onuReputationPermanentlyZero: Boolean(parsed.onuReputationPermanentlyZero),
      just_war_target: typeof parsed.just_war_target === 'string' ? parsed.just_war_target : null,
      megaprojects: {
        deadHand: parsed.megaprojects?.deadHand
          ? {
            remainingMonths: Boolean(parsed.dead_hand_active) ? 0 : Math.max(1, Math.min(12, Math.floor(Number(parsed.megaprojects.deadHand.remainingMonths) || 12))),
            uraniumReserve: Math.max(0, Number(parsed.megaprojects.deadHand.uraniumReserve) || 0),
            completed: Boolean(parsed.megaprojects.deadHand.completed),
          }
          : null,
        megaVault: parsed.megaprojects?.megaVault?.completed ? { completed: true } : null,
      },
      dead_hand_active: Boolean(parsed.dead_hand_active),
      dead_hand_triggered: Boolean(parsed.dead_hand_triggered),
      slush_fund: Math.max(0, Number(parsed.slush_fund) || 0),
      slushFundTransfersThisMonth: Math.max(0, Math.floor(Number(parsed.slushFundTransfersThisMonth) || 0)),
      escape_ending_triggered: Boolean(parsed.escape_ending_triggered),
      pendingFinalDilemma: Boolean(parsed.pendingFinalDilemma),
      double_agent_active: Boolean(parsed.double_agent_active),
      pendingInterrogation: parsed.pendingInterrogation?.phase === 'choice' || parsed.pendingInterrogation?.phase === 'reward'
        ? { phase: parsed.pendingInterrogation.phase, prisonerId: 847 }
        : null,
      seen_stories: seenStories,
      pendingStory: Boolean(pendingStoryId),
      currentStory: pendingStoryId,
    });
  } catch {
    return createGameState();
  }
}
