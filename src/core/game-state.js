import { createCongress, negotiateSupport, voteOnLaw } from './congress.js';
import { COUNTRIES, createCountryProfile, getCountryById } from '../data/countries.js';
import { DEFAULT_BUDGET, advanceEconomy, clampTaxRate, setBudgetRate } from './economy.js';
import { advanceGeopolitics, anexarPais as annexTreatyTarget, alterarNotaONU as changeOnuScore, aplicarReparacoes as applyReparationsTreaty, createGeopolitics, criarLiga as createLeagueState, desmilitarizarPais as demilitarizeTreatyTarget, declareWar, exigirAnexacao as demandAnnexation, getGeopoliticalModifiers, importarRecursos as importResources, imporSancao as imposeSanction, inviteToLeague as inviteLeagueMember, proposeAlliance as formAlliance, proposeTradeTreaty, sabotar as sabotageCountry, saquearTesouro as lootTreatyTarget } from './geopolitics.js';
import { advanceMilitary, applyNuclearCompletion, canAutogolpe, comprarBlindados, comprarCacas, comprarEquipamento, comprarNavios, createMilitary, createRegime, evaluateRegime, fundNuclearProject, getPoderTotal, normalizeMilitary, recrutarSoldado as recruitSoldiers } from './military.js';
import { aggregateActiveLawEffects, LAWS, LAW_LABOR_REFORM } from './laws.js';
import { advanceTechnology, createTechnology, getTechnologyModifiers, purchaseTechnology } from './technology.js';
import { getTraitModifiers } from './traits.js';
import { EVENTS, applyEventOption, rollMonthlyEvent } from './events.js';
import { createMinisters, dismissMinister as dismissCabinetMinister, getMinisterModifiers, hireMinister as hireCabinetMinister } from './ministers.js';
import { advanceFactions, createFactions, getFactionModifiers, getFactionSupport, normalizeFactions } from './factions.js';
import { absorverPaisParaUniao as absorbIntoUnion, decretarRevolucaoSocialista as decreeSocialistRevolution } from './revolution.js';
import { financiarRebeldes as fundRebels } from './espionage.js';
import { aplicarResolucoes, registrarVotoONU, verificarAssembleia } from './un_assembly.js';
import { processarMigracoes } from './demographics.js';
import { advanceCyberWarfare, lancarCiberataque as launchCyberAttack } from './cyber_warfare.js';
import { automatizarIndustria as automateIndustry, processarAutomacaoIndustrial } from './infrastructure.js';
import { aplicarEfeitosSoftPower, candidatarJogosMundiais as bidForGlobalGames, getSoftPowerModifiers, recusarCandidaturaGlobal, verificarSedeGlobal } from './soft_power.js';
import { estatizarMegacorporacoes as nationalizeMegacorps, getMegacorpModifiers, isLobbyBlocked, processarMegacorporacoes } from './megacorps.js';

const STATE_VERSION = 6;
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

function getActiveLawIds(laws) {
  return LAWS.filter((law) => laws[law.stateKey]?.approved).map((law) => law.id);
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
    geopolitics,
    world: geopolitics.contacts,
    military: createMilitary(country),
    technology: createTechnology(),
    factions: createFactions(),
    ministers: createMinisters(),
    regime: createRegime(),
    randomSeed: countrySeed(country.id) || 1,
    congress: createCongress(countrySeed(country.id)),
    laws: Object.fromEntries(LAWS.map((law) => [law.stateKey, { approved: false, voteCompleted: false }])),
    history: [],
    news: [],
    pendingEvent: null,
    pendingUnVote: null,
    activeGlobalResolutions: [],
    monthCounter: 0,
    activeLawIds: [],
    megacorp_power: 0,
    pendingGlobalBid: null,
    host_global_event: false,
    globalEventTourismUntil: 0,
    onuReputationLockedUntil: 0,
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

function applyGeopoliticalAction(state, action) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = action(state.geopolitics);
  return syncWorld({ ...state, geopolitics: result.geopolitics, notice: result.reason });
}

export function proposeTreaty(state, contactId) {
  return applyGeopoliticalAction(state, (geopolitics) => proposeTradeTreaty(geopolitics, contactId));
}

export function proposeAlliance(state, contactId) {
  return applyGeopoliticalAction(state, (geopolitics) => formAlliance(geopolitics, contactId));
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
  const next = applyGeopoliticalAction(state, (geopolitics) => declareWar(geopolitics, contactId));
  if (next.geopolitics === state.geopolitics) return next;
  const target = next.geopolitics.contacts.find((contact) => contact.id === contactId);
  return addNews(syncWorld({ ...next, geopolitics: changeOnuScore(next.geopolitics, -18) }), `Guerra declarada contra ${target?.name ?? 'alvo estrangeiro'}.`);
}

export function declararGuerra(state, contactId) {
  return startWar(state, contactId);
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

export function automatizarIndustria(state) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = automateIndustry(state);
  return result.country === state.country ? result : addNews(result, result.notice);
}

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
  return addNews(result, result.notice);
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
  return syncWorld({ ...annexed, military: normalizeMilitary(annexed.military) });
}

export function resolvePeaceTreaty(state, contactId, choice) {
  const treaty = state.geopolitics.peaceTreaty;
  const contact = state.geopolitics.contacts.find((item) => item.id === contactId);
  if (!treaty || treaty.targetId !== contactId || !contact || contact.militaryPower > 0) {
    return { ...state, notice: 'Nenhum tratado de paz valido para este alvo.' };
  }
  if (choice === 'annex') return anexarPais(state, contactId);
  if (choice === 'loot') return syncWorld(lootTreatyTarget(state));
  if (choice === 'demilitarize') return syncWorld(demilitarizeTreatyTarget(state));
  if (choice === 'reparations') return syncWorld(applyReparationsTreaty(state));
  return { ...state, notice: 'Termo de tratado invalido.' };
}

export function exigirAnexacao(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = demandAnnexation(state.geopolitics, contactId, getPoderTotal(state.military), state.randomSeed);
  if (!result.ok) return { ...state, notice: result.reason };
  if (result.accepted) {
    return anexarPais({ ...state, geopolitics: result.geopolitics, randomSeed: result.seed }, contactId);
  }
  return syncWorld({
    ...state,
    geopolitics: changeOnuScore(result.geopolitics, -18),
    randomSeed: result.seed,
    notice: result.reason,
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
  const contact = state.geopolitics.contacts.find((item) => item.id === contactId);
  const arsenal = Math.max(0, Math.floor(Number(state.military.armasNucleares) || 0));
  if (!contact?.atWar || arsenal < 1) return { ...state, notice: 'Ataque nuclear exige guerra ativa e uma arma nuclear operacional.' };
  const contacts = state.geopolitics.contacts.map((item) => item.id === contactId
    ? { ...item, militaryPower: item.militaryPower * 0.2, population: Math.floor((Number(item.population) || 0) * 0.2), nuclearStruck: true, alliance: false }
    : { ...item, alliance: false });
  return syncWorld({
    ...state,
    military: normalizeMilitary({ ...state.military, armasNucleares: arsenal - 1, nuclear: { ...state.military.nuclear, arsenal: Math.max(0, arsenal - 1) } }),
    geopolitics: { ...state.geopolitics, contacts, onuScore: 0, internationalSanctions: true, sanctionSeverity: 1 },
    notice: `Ataque nuclear contra ${contact.name}: reputacao na ONU colapsou.`,
  });
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
  return { ...state, technology: result.technology, notice: result.reason };
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
    return addNews(syncWorld({
      ...state,
      laws: { ...state.laws, [law.stateKey]: { approved: true, voteCompleted: true } },
      activeLawIds: [...new Set([...(state.activeLawIds ?? []), law.id])],
      notice,
      history: addHistory(state, { type: 'decree', message: notice, calendar: state.calendar }),
    }), notice);
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
  return addNews({
    ...state,
    laws,
    activeLawIds: getActiveLawIds(laws),
    notice,
    history: addHistory(state, { type: 'vote', message: notice, calendar: state.calendar }),
  }, notice);
}

// A confirmation modal precedes the vote; the Congress engine still decides approval.
export function confirmarVotoSim(state, lawId) {
  return voteLaw(state, lawId);
}

export function voteLaborLaw(state) {
  return voteLaw(state, LAW_LABOR_REFORM.id);
}

export function advanceMonth(state) {
  if (state.regime?.gameOver) return { ...state, notice: 'A partida foi encerrada.' };
  if (state.geopolitics.peaceTreaty?.status === 'pending') return { ...state, notice: 'Resolva o Tratado de Paz antes de avancar o mes.' };
  if (state.pendingEvent) return { ...state, notice: 'Resolva a crise nacional antes de avancar o mes.' };
  if (state.pendingUnVote) return { ...state, notice: 'Registre seu voto na Assembleia da ONU antes de avancar o mes.' };
  if (state.pendingGlobalBid) return { ...state, notice: 'Decida a candidatura aos Jogos Mundiais antes de avancar o mes.' };
  const corporateState = processarMegacorporacoes({ ...state, activeLawIds: getActiveLawIds(state.laws) });
  const effects = aggregateActiveLawEffects(state.laws);
  const factionModifiers = getFactionModifiers(state.factions);
  const ministerModifiers = getMinisterModifiers(state.ministers);
  const corporateModifiers = getMegacorpModifiers(corporateState.megacorp_power);
  const softPowerModifiers = getSoftPowerModifiers(corporateState);
  const monthlyEffects = { ...effects, taxRevenueModifier: (effects.taxRevenueModifier ?? 0) + ministerModifiers.taxRevenueModifier + corporateModifiers.taxRevenueModifier };
  const technology = advanceTechnology(state.technology, state.economy, state.budget, state.country.trait);
  const technologyModifiers = getTechnologyModifiers(technology);
  const geopoliticalModifiers = getGeopoliticalModifiers(state.geopolitics, state.military);
  const traitModifiers = getTraitModifiers(state.country, state.geopolitics);
  const modifiers = {
    ...geopoliticalModifiers,
    growthModifier: geopoliticalModifiers.growthModifier + technologyModifiers.growthModifier + factionModifiers.growthModifier,
    infrastructureCostModifier: geopoliticalModifiers.infrastructureCostModifier + technologyModifiers.infrastructureCostModifier,
    popularityModifier: geopoliticalModifiers.factionModifier + technologyModifiers.popularityModifier,
    tradeRevenueRate: geopoliticalModifiers.tradeRevenueRate + traitModifiers.exportRevenueRate,
    inflationModifier: traitModifiers.foodInflationModifier + technologyModifiers.foodInflationModifier,
    cashRevenueModifier: softPowerModifiers.cashRevenueModifier,
  };
  const economyAfterPolicy = advanceEconomy(state.economy, state.budget, monthlyEffects, modifiers);
  const traitInterest = economyAfterPolicy.cash > 0 ? economyAfterPolicy.cash * traitModifiers.cashInterest : 0;
  const economicMonth = { ...economyAfterPolicy, cash: economyAfterPolicy.cash + traitInterest };
  const nuclear = applyNuclearCompletion(changeOnuScore(state.geopolitics, effects.onuModifier ?? 0), state.military);
  const preparedMilitary = advanceMilitary(nuclear.military, economicMonth, state.budget, {}, state.factions);
  preparedMilitary.military.infantryMultiplier = technologyModifiers.infantryMultiplier;
  preparedMilitary.military.support = clamp(preparedMilitary.military.support + (effects.militarySupportModifier ?? 0), 0, 100);
  preparedMilitary.military.power = Math.min(100, preparedMilitary.military.power * (1 + technologyModifiers.militaryEffectiveness));
  const geopoliticalMonth = advanceGeopolitics(nuclear.geopolitics, preparedMilitary.military, economicMonth, state.randomSeed);
  const militaryMonth = advanceMilitary(preparedMilitary.military, geopoliticalMonth.economy, { defenseSpend: 0 }, geopoliticalMonth, state.factions);
  const factions = advanceFactions(state.factions, state.economy, militaryMonth.economy, state.budget, effects, { popularityModifier: modifiers.popularityModifier + (geopoliticalMonth.factionDelta ?? 0) });
  const infrastructureState = processarAutomacaoIndustrial({ ...state, country: state.country, factions });
  const stability = evaluateRegime(state.regime, militaryMonth.economy, militaryMonth.military, geopoliticalMonth.geopolitics, geopoliticalMonth.seed, infrastructureState.factions);
  const month = state.calendar.month === 12 ? 1 : state.calendar.month + 1;
  const year = state.calendar.month === 12 ? state.calendar.year + 1 : state.calendar.year;
  const notice = stability.event ?? `Mes encerrado: PIB ${economicMonth.monthlyBalance >= 0 ? 'com superavit' : 'com deficit'}.`;

  const completedState = syncWorld({
    ...state,
    economy: militaryMonth.economy,
    geopolitics: geopoliticalMonth.geopolitics,
    military: militaryMonth.military,
    country: infrastructureState.country,
    factions: infrastructureState.factions,
    technology,
    regime: { ...stability.regime, coupRisk: clamp(stability.regime.coupRisk + (effects.coupRiskModifier ?? 0), 0, 0.8) },
    randomSeed: stability.seed,
    calendar: { month, year },
    monthCounter: (Number(state.monthCounter) || 0) + 1,
    megacorp_power: corporateState.megacorp_power,
    activeLawIds: corporateState.activeLawIds,
    notice,
    history: addHistory(state, { type: 'month', message: [...geopoliticalMonth.events, notice].join(' '), calendar: { month, year } }),
  });
  const resolvedState = aplicarEfeitosSoftPower(processarMigracoes(aplicarResolucoes(advanceCyberWarfare(completedState))));
  const withNews = addNews(syncWorld(resolvedState), notice);
  const globalBidState = verificarSedeGlobal(withNews);
  if (globalBidState.pendingGlobalBid) return addNews(globalBidState, globalBidState.notice);
  const assemblyState = verificarAssembleia(withNews);
  if (assemblyState.pendingUnVote) return addNews(assemblyState, assemblyState.notice);
  const eventRoll = rollMonthlyEvent(stability.seed);
  if (!eventRoll.event) return { ...withNews, randomSeed: eventRoll.seed };
  return addNews({
    ...withNews,
    randomSeed: eventRoll.seed,
    pendingEvent: eventRoll.event,
    notice: `Crise nacional: ${eventRoll.event.title}.`,
  }, `Alerta: ${eventRoll.event.title}.`);
}

export function hydrateGameState(serialized) {
  try {
    const parsed = JSON.parse(serialized);
    if (![1, 2, 3, 4, 5, STATE_VERSION].includes(parsed?.version) || !getCountryById(parsed?.country?.id)) {
      return createGameState();
    }

    const base = createGameState(parsed.country.id);
    const economy = parsed.economy ?? {};
    const calendar = parsed.calendar ?? {};
    const laws = parsed.laws?.laborReform ?? {};
    const hydrated = {
      ...base,
      country: {
        ...base.country,
        area_km2: Number.isFinite(Number(parsed.country?.area_km2)) ? Math.max(1, Number(parsed.country.area_km2)) : base.country.area_km2,
        populacao: Number.isFinite(Number(parsed.country?.populacao ?? parsed.country?.populacao_base)) ? Math.max(1, Number(parsed.country.populacao ?? parsed.country.populacao_base)) : base.country.populacao,
        populacao_base: Number.isFinite(Number(parsed.country?.populacao_base ?? parsed.country?.populacao)) ? Math.max(1, Number(parsed.country.populacao_base ?? parsed.country.populacao)) : base.country.populacao_base,
        pib_base: Number.isFinite(Number(parsed.country?.pib_base)) ? Math.max(1, Number(parsed.country.pib_base)) : base.country.pib_base,
        uranium: Number.isFinite(Number(parsed.country?.uranium)) ? Math.max(0, Number(parsed.country.uranium)) : base.country.uranium,
        steel: Number.isFinite(Number(parsed.country?.steel)) ? Math.max(0, Number(parsed.country.steel)) : base.country.steel,
        rare_earths: Number.isFinite(Number(parsed.country?.rare_earths)) ? Math.max(0, Number(parsed.country.rare_earths)) : base.country.rare_earths,
        industry_automated: Boolean(parsed.country?.industry_automated),
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
      economy: {
        ...base.economy,
        gdp: Math.max(1, Number(economy.gdp) || base.economy.gdp),
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
        })),
      } : base.geopolitics,
      military: parsed.version >= 2 && parsed.military && Number.isFinite(parsed.military.power) && Number.isFinite(parsed.military.support)
        ? normalizeMilitary({ ...base.military, ...parsed.military, nuclear: { ...base.military.nuclear, ...parsed.military.nuclear } })
        : base.military,
      technology: parsed.version >= 3 && Array.isArray(parsed.technology?.unlocked) ? { points: Math.max(0, Number(parsed.technology.points) || 0), unlocked: parsed.technology.unlocked.filter((id) => typeof id === 'string') } : base.technology,
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
      ministers: {
        ...base.ministers,
        economy: parsed.ministers?.economy?.id === 'economy' ? { id: 'economy' } : null,
        defense: parsed.ministers?.defense?.id === 'defense' ? { id: 'defense' } : null,
      },
      news: Array.isArray(parsed.news)
        ? parsed.news.filter((item) => typeof item?.text === 'string' && item.calendar).slice(0, 5)
        : base.news,
      pendingEvent: EVENTS.find((event) => event.id === parsed.pendingEvent?.id) ?? null,
      pendingUnVote: parsed.pendingUnVote && typeof parsed.pendingUnVote.resolutionId === 'string' ? parsed.pendingUnVote : null,
      activeGlobalResolutions: Array.isArray(parsed.activeGlobalResolutions) ? parsed.activeGlobalResolutions.filter((id) => typeof id === 'string') : base.activeGlobalResolutions,
      notice: typeof parsed.notice === 'string' ? parsed.notice : base.notice,
    };
    return syncWorld({
      ...hydrated,
      activeLawIds: getActiveLawIds(hydrated.laws),
      megacorp_power: clamp(Number(parsed.megacorp_power) || 0, 0, 100),
      pendingGlobalBid: parsed.pendingGlobalBid?.status === 'pending' ? { status: 'pending' } : null,
      host_global_event: Boolean(parsed.host_global_event),
      globalEventTourismUntil: Math.max(0, Math.floor(Number(parsed.globalEventTourismUntil) || 0)),
      onuReputationLockedUntil: Math.max(0, Math.floor(Number(parsed.onuReputationLockedUntil) || 0)),
    });
  } catch {
    return createGameState();
  }
}
