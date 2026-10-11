import { createCongress, negotiateSupport, voteOnLaw } from './congress.js';
import { COUNTRIES, createCountryProfile, getCountryById } from '../data/countries.js';
import { DEFAULT_BUDGET, advanceEconomy, clampTaxRate, setBudgetRate } from './economy.js';
import { advanceGeopolitics, anexarPais as annexTreatyTarget, alterarNotaONU as changeOnuScore, createGeopolitics, criarLiga as createLeagueState, declareWar, exigirAnexacao as demandAnnexation, getGeopoliticalModifiers, imporSancao as imposeSanction, inviteToLeague as inviteLeagueMember, proposeAlliance as formAlliance, proposeTradeTreaty, sabotar as sabotageCountry, saquearTesouro as lootTreatyTarget } from './geopolitics.js';
import { advanceMilitary, applyNuclearCompletion, canAutogolpe, comprarBlindados, comprarCacas, comprarEquipamento, comprarNavios, createMilitary, createRegime, evaluateRegime, fundNuclearProject, getPoderTotal, normalizeMilitary, recrutarSoldado as recruitSoldiers } from './military.js';
import { aggregateActiveLawEffects, LAWS, LAW_LABOR_REFORM } from './laws.js';
import { advanceTechnology, createTechnology, getTechnologyModifiers, purchaseTechnology } from './technology.js';
import { getTraitModifiers } from './traits.js';

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
    popularity: 54,
    cash: Math.round(country.pib_base * 0.06),
  };
}

function addHistory(state, entry) {
  return [entry, ...state.history].slice(0, 12);
}

function isGameOver(state) {
  return Boolean(state.regime?.gameOver);
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

export function createGameState(countryId = 'bra') {
  const country = createCountryProfile(getCountryById(countryId) ?? COUNTRIES.find((item) => item.id === 'bra'));
  return {
    version: STATE_VERSION,
    country,
    calendar: { month: 1, year: 2026 },
    economy: createEconomy(country),
    budget: { ...DEFAULT_BUDGET },
    geopolitics: createGeopolitics(),
    military: createMilitary(country),
    technology: createTechnology(),
    regime: createRegime(),
    randomSeed: countrySeed(country.id) || 1,
    congress: createCongress(countrySeed(country.id)),
    laws: Object.fromEntries(LAWS.map((law) => [law.stateKey, { approved: false, voteCompleted: false }])),
    history: [],
    notice: 'Gabinete iniciado. O primeiro mes de governo comeca agora.',
  };
}

export function changeTax(state, taxKey, delta) {
  if (!TAX_KEYS.has(taxKey) || !Number.isFinite(delta)) {
    return state;
  }
  const nextRate = clampTaxRate(state.budget[taxKey] + (delta * 0.01));
  return {
    ...state,
    budget: { ...state.budget, [taxKey]: nextRate },
    notice: taxKey === 'incomeTaxRate' ? 'Imposto de renda ajustado.' : 'IVA ajustado.',
  };
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
  return { ...state, geopolitics: result.geopolitics, notice: result.reason };
}

export function proposeTreaty(state, contactId) {
  return applyGeopoliticalAction(state, (geopolitics) => proposeTradeTreaty(geopolitics, contactId));
}

export function proposeAlliance(state, contactId) {
  return applyGeopoliticalAction(state, (geopolitics) => formAlliance(geopolitics, contactId));
}

export function proporAlianca(state, contactId) {
  return proposeAlliance(state, contactId);
}

export function alterarNotaONU(state, value) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  return { ...state, geopolitics: changeOnuScore(state.geopolitics, value), notice: 'Nota da ONU atualizada.' };
}

export function startWar(state, contactId) {
  const next = applyGeopoliticalAction(state, (geopolitics) => declareWar(geopolitics, contactId));
  return next.geopolitics === state.geopolitics ? next : { ...next, geopolitics: changeOnuScore(next.geopolitics, -18) };
}

export function declararGuerra(state, contactId) {
  return startWar(state, contactId);
}

export function sabotar(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = sabotageCountry(state.geopolitics, contactId, state.economy, state.randomSeed);
  return { ...state, geopolitics: result.geopolitics, economy: result.economy, randomSeed: result.seed, notice: result.reason };
}

export function recrutarSoldado(state, amount = 5_000) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = recruitSoldiers(state.military, state.economy, amount);
  return { ...state, military: result.military, economy: result.economy, notice: result.reason };
}

export function comprarMaterialMilitar(state, kind) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = comprarEquipamento(state.military, state.economy, kind);
  return { ...state, military: result.military, economy: result.economy, notice: result.reason };
}

export function comprarBlindado(state, amount = 1) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = comprarBlindados(state.military, state.economy, amount);
  return { ...state, military: result.military, economy: result.economy, notice: result.reason };
}

export function comprarNavio(state, amount = 1) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = comprarNavios(state.military, state.economy, amount);
  return { ...state, military: result.military, economy: result.economy, notice: result.reason };
}

export function comprarCaca(state, amount = 1) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = comprarCacas(state.military, state.economy, amount);
  return { ...state, military: result.military, economy: result.economy, notice: result.reason };
}

export function anexarPais(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const targetId = contactId ?? state.geopolitics.peaceTreaty?.targetId;
  const contact = state.geopolitics.contacts.find((item) => item.id === targetId);
  if (!contact || contact.destruido || contact.anexado || contact.militaryPower > 0) return { ...state, notice: 'Anexacao exige a derrota total do alvo.' };
  const prepared = state.geopolitics.peaceTreaty?.targetId === targetId
    ? state
    : { ...state, geopolitics: { ...state.geopolitics, peaceTreaty: { targetId, status: 'pending' } } };
  return annexTreatyTarget(prepared);
}

export function resolvePeaceTreaty(state, contactId, choice) {
  const treaty = state.geopolitics.peaceTreaty;
  const contact = state.geopolitics.contacts.find((item) => item.id === contactId);
  if (!treaty || treaty.targetId !== contactId || !contact || contact.militaryPower > 0) {
    return { ...state, notice: 'Nenhum tratado de paz valido para este alvo.' };
  }
  if (choice === 'annex') return anexarPais(state, contactId);
  if (choice !== 'loot') return { ...state, notice: 'Termo de tratado invalido.' };
  return lootTreatyTarget(state);
}

export function exigirAnexacao(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = demandAnnexation(state.geopolitics, contactId, getPoderTotal(state.military), state.randomSeed);
  if (!result.ok) return { ...state, notice: result.reason };
  if (result.accepted) {
    return anexarPais({ ...state, geopolitics: result.geopolitics, randomSeed: result.seed }, contactId);
  }
  return {
    ...state,
    geopolitics: changeOnuScore(result.geopolitics, -18),
    randomSeed: result.seed,
    notice: result.reason,
  };
}

export function imporSancao(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = imposeSanction(state.geopolitics, contactId, state.economy.gdp);
  return { ...state, geopolitics: result.geopolitics, notice: result.reason };
}

export function createLeague(state, name = 'Liga Global') {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  return createLeagueState(state, name);
}

export function inviteToLeague(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = inviteLeagueMember(state.geopolitics, contactId);
  return { ...state, geopolitics: result.geopolitics, notice: result.reason };
}

export function lancarAtaqueNuclear(state, contactId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const contact = state.geopolitics.contacts.find((item) => item.id === contactId);
  const arsenal = Math.max(0, Math.floor(Number(state.military.armasNucleares) || 0));
  if (!contact?.atWar || arsenal < 1) return { ...state, notice: 'Ataque nuclear exige guerra ativa e uma arma nuclear operacional.' };
  const contacts = state.geopolitics.contacts.map((item) => item.id === contactId
    ? { ...item, militaryPower: item.militaryPower * 0.2, population: Math.floor((Number(item.population) || 0) * 0.2), nuclearStruck: true, alliance: false }
    : { ...item, alliance: false });
  return {
    ...state,
    military: normalizeMilitary({ ...state.military, armasNucleares: arsenal - 1, nuclear: { ...state.military.nuclear, arsenal: Math.max(0, arsenal - 1) } }),
    geopolitics: { ...state.geopolitics, contacts, onuScore: 0, internationalSanctions: true, sanctionSeverity: 1 },
    notice: `Ataque nuclear contra ${contact.name}: reputacao na ONU colapsou.`,
  };
}

export function fundNuclear(state, kind, amount) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = fundNuclearProject(state.military, state.economy, kind, amount);
  return { ...state, military: result.military, economy: result.economy, notice: result.reason };
}

export function attemptAutogolpe(state) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  if (!canAutogolpe(state.regime, state.military, state.budget)) {
    return { ...state, notice: 'Autogolpe exige apoio militar e defesa elevados.' };
  }
  return {
    ...state,
    regime: { ...state.regime, type: 'dictatorship', electionsSuspended: true, coupRisk: 0 },
    notice: 'Estado de sitio decretado. O Congresso foi suspenso.',
  };
}

export function researchTechnology(state, technologyId) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  const result = purchaseTechnology(state.technology, technologyId);
  return { ...state, technology: result.technology, notice: result.reason };
}

export function negotiate(state, blocId) {
  const result = negotiateSupport(state.congress, state.economy, blocId);
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
    return {
      ...state,
      laws: { ...state.laws, [law.stateKey]: { approved: true, voteCompleted: true } },
      notice,
      history: addHistory(state, { type: 'decree', message: notice, calendar: state.calendar }),
    };
  }
  const lawState = state.laws[law.stateKey] ?? { approved: false, voteCompleted: false };
  if (lawState.voteCompleted) {
    return { ...state, notice: `${law.title} ja foi votada nesta legislatura.` };
  }

  const result = voteOnLaw(state.congress, law, state.economy.popularity);
  const notice = result.approved
    ? `${law.title} aprovada por ${result.votesFor} votos.`
    : `${law.title} rejeitada: ${result.votesFor}/${result.requiredVotes} votos.`;
  return {
    ...state,
    laws: { ...state.laws, [law.stateKey]: { approved: result.approved, voteCompleted: true } },
    notice,
    history: addHistory(state, { type: 'vote', message: notice, calendar: state.calendar }),
  };
}

export function voteLaborLaw(state) {
  return voteLaw(state, LAW_LABOR_REFORM.id);
}

export function advanceMonth(state) {
  if (state.regime?.gameOver) return { ...state, notice: 'A partida foi encerrada.' };
  if (state.geopolitics.peaceTreaty?.status === 'pending') return { ...state, notice: 'Resolva o Tratado de Paz antes de avancar o mes.' };
  const effects = aggregateActiveLawEffects(state.laws);
  const technology = advanceTechnology(state.technology, state.economy, state.budget, state.country.trait);
  const technologyModifiers = getTechnologyModifiers(technology);
  const geopoliticalModifiers = getGeopoliticalModifiers(state.geopolitics, state.military);
  const traitModifiers = getTraitModifiers(state.country, state.geopolitics);
  const modifiers = {
    ...geopoliticalModifiers,
    growthModifier: geopoliticalModifiers.growthModifier + technologyModifiers.growthModifier,
    infrastructureCostModifier: geopoliticalModifiers.infrastructureCostModifier + technologyModifiers.infrastructureCostModifier,
    popularityModifier: geopoliticalModifiers.popularityModifier + technologyModifiers.popularityModifier,
    tradeRevenueRate: geopoliticalModifiers.tradeRevenueRate + traitModifiers.exportRevenueRate,
    inflationModifier: traitModifiers.foodInflationModifier,
  };
  const economyAfterPolicy = advanceEconomy(state.economy, state.budget, effects, modifiers);
  const traitInterest = economyAfterPolicy.cash > 0 ? economyAfterPolicy.cash * traitModifiers.cashInterest : 0;
  const economicMonth = { ...economyAfterPolicy, cash: economyAfterPolicy.cash + traitInterest };
  const nuclear = applyNuclearCompletion(changeOnuScore(state.geopolitics, effects.onuModifier ?? 0), state.military);
  const preparedMilitary = advanceMilitary(nuclear.military, economicMonth, state.budget);
  preparedMilitary.military.support = clamp(preparedMilitary.military.support + (effects.militarySupportModifier ?? 0), 0, 100);
  preparedMilitary.military.power = Math.min(100, preparedMilitary.military.power * (1 + technologyModifiers.militaryEffectiveness));
  const geopoliticalMonth = advanceGeopolitics(nuclear.geopolitics, preparedMilitary.military, economicMonth, state.randomSeed);
  const militaryMonth = advanceMilitary(preparedMilitary.military, geopoliticalMonth.economy, { defenseSpend: 0 }, geopoliticalMonth);
  const stability = evaluateRegime(state.regime, militaryMonth.economy, militaryMonth.military, geopoliticalMonth.geopolitics, geopoliticalMonth.seed);
  const month = state.calendar.month === 12 ? 1 : state.calendar.month + 1;
  const year = state.calendar.month === 12 ? state.calendar.year + 1 : state.calendar.year;
  const notice = stability.event ?? `Mes encerrado: PIB ${economicMonth.monthlyBalance >= 0 ? 'com superavit' : 'com deficit'}.`;

  return {
    ...state,
    economy: militaryMonth.economy,
    geopolitics: geopoliticalMonth.geopolitics,
    military: militaryMonth.military,
    technology,
    regime: { ...stability.regime, coupRisk: clamp(stability.regime.coupRisk + (effects.coupRiskModifier ?? 0), 0, 0.8) },
    randomSeed: stability.seed,
    calendar: { month, year },
    notice,
    history: addHistory(state, { type: 'month', message: [...geopoliticalMonth.events, notice].join(' '), calendar: { month, year } }),
  };
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
    return {
      ...base,
      country: {
        ...base.country,
        area_km2: Number.isFinite(Number(parsed.country?.area_km2)) ? Math.max(1, Number(parsed.country.area_km2)) : base.country.area_km2,
        populacao: Number.isFinite(Number(parsed.country?.populacao ?? parsed.country?.populacao_base)) ? Math.max(1, Number(parsed.country.populacao ?? parsed.country.populacao_base)) : base.country.populacao,
        populacao_base: Number.isFinite(Number(parsed.country?.populacao_base ?? parsed.country?.populacao)) ? Math.max(1, Number(parsed.country.populacao_base ?? parsed.country.populacao)) : base.country.populacao_base,
        pib_base: Number.isFinite(Number(parsed.country?.pib_base)) ? Math.max(1, Number(parsed.country.pib_base)) : base.country.pib_base,
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
        popularity: clamp(Number(economy.popularity) || base.economy.popularity, 0, 100),
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
      regime: parsed.version >= 2 && parsed.regime && typeof parsed.regime === 'object' ? { ...base.regime, ...parsed.regime } : base.regime,
      randomSeed: Number.isFinite(parsed.randomSeed) ? parsed.randomSeed : base.randomSeed,
      congress: isValidCongress(parsed.congress) ? parsed.congress : base.congress,
      laws: Object.fromEntries(LAWS.map((law) => {
        const savedLaw = law.stateKey === 'laborReform' ? laws : parsed.laws?.[law.stateKey];
        return [law.stateKey, { approved: Boolean(savedLaw?.approved), voteCompleted: Boolean(savedLaw?.voteCompleted) }];
      })),
      history: isValidHistory(parsed.history) ? parsed.history.slice(0, 12) : [],
      notice: typeof parsed.notice === 'string' ? parsed.notice : base.notice,
    };
  } catch {
    return createGameState();
  }
}
