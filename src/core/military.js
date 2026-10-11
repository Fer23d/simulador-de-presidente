import { nextRandom } from './geopolitics.js';

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function nuclearDefaults(nuclear = {}) {
  return {
    civilProgress: clamp(Number(nuclear.civilProgress) || 0, 0, 100),
    militaryProgress: clamp(Number(nuclear.militaryProgress) || 0, 0, 100),
    civilOnline: Boolean(nuclear.civilOnline),
    bombBuilt: Boolean(nuclear.bombBuilt),
    diplomaticPenaltyApplied: Boolean(nuclear.diplomaticPenaltyApplied),
  };
}

export function createMilitary(country) {
  const populationScore = Math.log10(Math.max(1, country.populacao_base ?? 1)) * 2.2;
  const gdpScore = Math.log10(Math.max(1, country.pib_base ?? 1)) * 1.1;
  return {
    power: clamp(Math.round(populationScore + gdpScore - 18), 8, 70),
    support: 58,
    nuclear: nuclearDefaults(),
  };
}

export function advanceMilitary(military, economy, budget, geopoliticalResult = {}) {
  const defenseSpend = clamp(Number(budget.defenseSpend) || 0, 0, 0.15);
  const warDelta = geopoliticalResult.militaryDelta ?? {};
  const deficitPenalty = economy.cash < 0 ? 0.8 : 0;
  const powerGain = defenseSpend * 18;
  const supportShift = (economy.popularity - 50) * 0.015 + (defenseSpend * 8) + (warDelta.supportDelta ?? 0) - deficitPenalty;
  return {
    military: {
      ...military,
      power: clamp((Number(military.power) || 0) + powerGain - (warDelta.powerLoss ?? 0), 0, 100),
      support: clamp((Number(military.support) || 0) + supportShift, 0, 100),
      nuclear: nuclearDefaults(military.nuclear),
    },
  };
}

export function fundNuclearProject(military, economy, kind, amount) {
  const cost = Number(amount);
  if (!['civil', 'military'].includes(kind) || !Number.isFinite(cost) || cost <= 0) {
    return { ok: false, reason: 'Projeto nuclear invalido.', military, economy };
  }
  if (economy.cash < cost) return { ok: false, reason: 'Caixa insuficiente para o projeto.', military, economy };
  const nuclear = nuclearDefaults(military.nuclear);
  const progressKey = kind === 'civil' ? 'civilProgress' : 'militaryProgress';
  const nextProgress = clamp(nuclear[progressKey] + ((cost / 1_000_000_000) * 5), 0, 100);
  const nextNuclear = {
    ...nuclear,
    [progressKey]: nextProgress,
    civilOnline: nuclear.civilOnline || (kind === 'civil' && nextProgress >= 100),
    bombBuilt: nuclear.bombBuilt || (kind === 'military' && nextProgress >= 100),
  };
  return {
    ok: true,
    reason: `Investimento nuclear de ${Math.round(cost / 1_000_000_000)} bi autorizado.`,
    military: { ...military, nuclear: nextNuclear },
    economy: { ...economy, cash: economy.cash - cost },
  };
}

export function applyNuclearCompletion(geopolitics, military) {
  const nuclear = nuclearDefaults(military.nuclear);
  if (!nuclear.bombBuilt || nuclear.diplomaticPenaltyApplied) {
    return { geopolitics, military: { ...military, nuclear } };
  }
  return {
    geopolitics: {
      ...geopolitics,
      sanctionSeverity: clamp((Number(geopolitics.sanctionSeverity) || 0) + 0.5, 0, 1),
      contacts: geopolitics.contacts.map((contact) => ({ ...contact, relation: clamp(contact.relation - 35, -100, 100) })),
    },
    military: {
      ...military,
      power: clamp((Number(military.power) || 0) + 16, 0, 100),
      nuclear: { ...nuclear, diplomaticPenaltyApplied: true },
    },
  };
}

export function canAutogolpe(regime, military, budget) {
  return regime?.type === 'democracy'
    && !regime.gameOver
    && Number(military?.support) >= 85
    && Number(budget?.defenseSpend) >= 0.06;
}

export function createRegime() {
  return { type: 'democracy', coupRisk: 0, revolutionRisk: 0, electionsSuspended: false, gameOver: false, outcome: null };
}

export function evaluateRegime(regime, economy, military, geopolitics, seed) {
  if (regime.gameOver) return { regime, seed, event: null };
  const atWar = geopolitics.contacts?.some((contact) => contact.atWar) ? 1 : 0;
  const sanctions = clamp(Number(geopolitics.sanctionSeverity) || 0, 0, 1);
  const random = nextRandom(seed);
  if (regime.type === 'dictatorship') {
    const revolutionRisk = clamp(
      ((100 - clamp(Number(economy.popularity) || 0, 0, 100)) / 100) * 0.5
        + (Number(economy.inflation) || 0) * 0.3
        + (Number(economy.unemployment) || 0) * 0.2
        + (atWar * 0.1)
        + (sanctions * 0.1),
      0,
      0.95,
    );
    const gameOver = random.value < revolutionRisk;
    return {
      seed: random.seed,
      event: gameOver ? 'Revolucao popular derrubou o governo.' : null,
      regime: { ...regime, coupRisk: 0, revolutionRisk, gameOver, outcome: gameOver ? 'revolucao-popular' : null, electionsSuspended: true },
    };
  }
  const severeCrisis = economy.popularity <= 10 && economy.cash < 0;
  const coupRisk = severeCrisis
    ? clamp(0.22 + ((10 - economy.popularity) * 0.025) + (atWar * 0.12) + (Math.max(0, military.support - 60) * 0.006), 0, 0.8)
    : 0;
  const gameOver = severeCrisis && random.value < coupRisk;
  return {
    seed: random.seed,
    event: gameOver ? 'Golpe militar encerrou o mandato.' : null,
    regime: { ...regime, coupRisk, revolutionRisk: 0, gameOver, outcome: gameOver ? 'golpe-militar' : null, electionsSuspended: false },
  };
}
