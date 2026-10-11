import { createCongress, negotiateSupport, voteOnLaw } from './congress.js';
import { COUNTRIES, createCountryProfile, getCountryById } from '../data/countries.js';
import { DEFAULT_BUDGET, advanceEconomy, clampTaxRate, setBudgetRate } from './economy.js';
import { advanceGeopolitics, createGeopolitics, declareWar, getGeopoliticalModifiers, proposeAlliance as formAlliance, proposeTradeTreaty } from './geopolitics.js';
import { advanceMilitary, applyNuclearCompletion, canAutogolpe, createMilitary, createRegime, evaluateRegime, fundNuclearProject } from './military.js';
import { LAW_LABOR_REFORM } from './laws.js';

const STATE_VERSION = 2;
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
    regime: createRegime(),
    randomSeed: countrySeed(country.id) || 1,
    congress: createCongress(countrySeed(country.id)),
    laws: { laborReform: { approved: false, voteCompleted: false } },
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

export function startWar(state, contactId) {
  return applyGeopoliticalAction(state, (geopolitics) => declareWar(geopolitics, contactId));
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

export function negotiate(state, blocId) {
  const result = negotiateSupport(state.congress, state.economy, blocId);
  return {
    ...state,
    congress: result.congress,
    economy: result.economy,
    notice: result.reason,
  };
}

export function voteLaborLaw(state) {
  if (isGameOver(state)) return { ...state, notice: 'A partida foi encerrada.' };
  if (state.regime?.type === 'dictatorship') {
    const notice = 'Lei Trabalhista aprovada por decreto.';
    return {
      ...state,
      laws: { laborReform: { approved: true, voteCompleted: true } },
      notice,
      history: addHistory(state, { type: 'decree', message: notice, calendar: state.calendar }),
    };
  }
  if (state.laws.laborReform.voteCompleted) {
    return { ...state, notice: 'A Lei Trabalhista ja foi votada nesta legislatura.' };
  }

  const result = voteOnLaw(state.congress, LAW_LABOR_REFORM, state.economy.popularity);
  const notice = result.approved
    ? `Lei Trabalhista aprovada por ${result.votesFor} votos.`
    : `Lei Trabalhista rejeitada: ${result.votesFor}/${result.requiredVotes} votos.`;
  return {
    ...state,
    laws: { laborReform: { approved: result.approved, voteCompleted: true } },
    notice,
    history: addHistory(state, { type: 'vote', message: notice, calendar: state.calendar }),
  };
}

export function advanceMonth(state) {
  if (state.regime?.gameOver) return { ...state, notice: 'A partida foi encerrada.' };
  const effects = state.laws.laborReform.approved ? LAW_LABOR_REFORM.monthlyEffects : {};
  const modifiers = getGeopoliticalModifiers(state.geopolitics, state.military);
  const economicMonth = advanceEconomy(state.economy, state.budget, effects, modifiers);
  const nuclear = applyNuclearCompletion(state.geopolitics, state.military);
  const preparedMilitary = advanceMilitary(nuclear.military, economicMonth, state.budget);
  const geopoliticalMonth = advanceGeopolitics(nuclear.geopolitics, preparedMilitary.military, economicMonth, state.randomSeed);
  const militaryMonth = advanceMilitary(preparedMilitary.military, geopoliticalMonth.economy, { defenseSpend: 0 }, geopoliticalMonth);
  const stability = evaluateRegime(state.regime, geopoliticalMonth.economy, militaryMonth.military, geopoliticalMonth.geopolitics, geopoliticalMonth.seed);
  const month = state.calendar.month === 12 ? 1 : state.calendar.month + 1;
  const year = state.calendar.month === 12 ? state.calendar.year + 1 : state.calendar.year;
  const notice = stability.event ?? `Mes encerrado: PIB ${economicMonth.monthlyBalance >= 0 ? 'com superavit' : 'com deficit'}.`;

  return {
    ...state,
    economy: geopoliticalMonth.economy,
    geopolitics: geopoliticalMonth.geopolitics,
    military: militaryMonth.military,
    regime: stability.regime,
    randomSeed: stability.seed,
    calendar: { month, year },
    notice,
    history: addHistory(state, { type: 'month', message: [...geopoliticalMonth.events, notice].join(' '), calendar: { month, year } }),
  };
}

export function hydrateGameState(serialized) {
  try {
    const parsed = JSON.parse(serialized);
    if (![1, STATE_VERSION].includes(parsed?.version) || !getCountryById(parsed?.country?.id)) {
      return createGameState();
    }

    const base = createGameState(parsed.country.id);
    const economy = parsed.economy ?? {};
    const calendar = parsed.calendar ?? {};
    const laws = parsed.laws?.laborReform ?? {};
    return {
      ...base,
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
      geopolitics: parsed.version === STATE_VERSION && Array.isArray(parsed.geopolitics?.contacts) ? parsed.geopolitics : base.geopolitics,
      military: parsed.version === STATE_VERSION && parsed.military?.nuclear && Number.isFinite(parsed.military.power) && Number.isFinite(parsed.military.support) ? parsed.military : base.military,
      regime: parsed.version === STATE_VERSION && parsed.regime && typeof parsed.regime === 'object' ? { ...base.regime, ...parsed.regime } : base.regime,
      randomSeed: Number.isFinite(parsed.randomSeed) ? parsed.randomSeed : base.randomSeed,
      congress: isValidCongress(parsed.congress) ? parsed.congress : base.congress,
      laws: {
        laborReform: {
          approved: Boolean(laws.approved),
          voteCompleted: Boolean(laws.voteCompleted),
        },
      },
      history: isValidHistory(parsed.history) ? parsed.history.slice(0, 12) : [],
      notice: typeof parsed.notice === 'string' ? parsed.notice : base.notice,
    };
  } catch {
    return createGameState();
  }
}
