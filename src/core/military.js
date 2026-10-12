import { nextRandom } from './geopolitics.js';
import { getRecruitmentCostMultiplier } from './traits.js';

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function available(resources, key) {
  return Math.max(0, Number(resources?.[key]) || 0);
}

function consume(resources, key, amount) {
  return { ...resources, [key]: available(resources, key) - amount };
}

function nuclearDefaults(nuclear = {}) {
  return {
    civilProgress: clamp(Number(nuclear.civilProgress) || 0, 0, 100),
    militaryProgress: clamp(Number(nuclear.militaryProgress) || 0, 0, 100),
    civilOnline: Boolean(nuclear.civilOnline),
    bombBuilt: Boolean(nuclear.bombBuilt),
    arsenal: Math.max(0, Math.floor(Number(nuclear.arsenal) || (nuclear.bombBuilt ? 1 : 0))),
    diplomaticPenaltyApplied: Boolean(nuclear.diplomaticPenaltyApplied),
  };
}

function branchDefaults(military = {}) {
  const exercito = military.exercito ?? {};
  const marinha = military.marinha ?? {};
  const aeronautica = military.aeronautica ?? {};
  return {
    exercito: {
      soldados: Math.max(0, Math.floor(Number(exercito.soldados ?? military.soldiers) || 0)),
      blindados: Math.max(0, Math.floor(Number(exercito.blindados) || 0)),
    },
    marinha: { navios: Math.max(0, Math.floor(Number(marinha.navios) || 0)) },
    aeronautica: { cacas: Math.max(0, Math.floor(Number(aeronautica.cacas) || 0)) },
  };
}

export function getPoderTotal(military) {
  const branches = branchDefaults(military);
  const terrestrial = ((branches.exercito.soldados / 8_000) + (branches.exercito.blindados * 1.6)) * Math.max(1, Number(military?.infantryMultiplier) || 1);
  const naval = branches.marinha.navios * 3;
  const air = branches.aeronautica.cacas * 3.5;
  const supportBonus = 1 + Math.min(0.65, (naval * 0.012) + (air * 0.012));
  const readiness = clamp(Number(military?.readiness) || 1, 0.5, 1.8);
  const readinessPower = (terrestrial * supportBonus * readiness) + ((naval + air) * 0.45);
  return Math.round(clamp(readinessPower + (Number(military?.combatAdjustment) || 0), 0, 300) * 10) / 10;
}

export function getPoderTerrestre(military) {
  const branches = branchDefaults(military);
  const rawPower = (branches.exercito.soldados / 8_000) + (branches.exercito.blindados * 1.6);
  const readiness = clamp(Number(military?.readiness) || 1, 0.5, 1.8);
  const infantryMultiplier = Math.max(1, Number(military?.infantryMultiplier) || 1);
  return rawPower * readiness * infantryMultiplier;
}

export function normalizeMilitary(military = {}) {
  const branches = branchDefaults(military);
  const nuclear = nuclearDefaults(military.nuclear);
  return {
    ...military,
    ...branches,
    soldiers: branches.exercito.soldados,
    equipmentMultiplier: clamp(1 + (branches.exercito.blindados * 0.003) + (branches.marinha.navios * 0.004) + (branches.aeronautica.cacas * 0.005), 1, 3),
    readiness: clamp(Number(military.readiness) || 1, 0.5, 1.8),
    combatAdjustment: Number(military.combatAdjustment) || 0,
    power: getPoderTotal({ ...military, ...branches }),
    armasNucleares: Math.max(0, Math.floor(Number(military.armasNucleares) || nuclear.arsenal)),
    nuclear,
  };
}

export function createMilitary(country) {
  const populationScore = Math.log10(Math.max(1, country.populacao_base ?? 1)) * 2.2;
  const gdpScore = Math.log10(Math.max(1, country.pib_base ?? 1)) * 1.1;
  const soldiers = Math.max(20_000, Math.round((country.populacao_base ?? 1) * 0.00035));
  return normalizeMilitary({
    trait: country.trait,
    support: 58,
    readiness: clamp((populationScore + gdpScore) / 30, 0.8, 1.2),
    exercito: { soldados: soldiers, blindados: Math.max(1, Math.floor((populationScore + gdpScore) / 8)) },
    marinha: { navios: Math.max(1, Math.floor(gdpScore / 5)) },
    aeronautica: { cacas: Math.max(2, Math.floor((populationScore + gdpScore) / 5)) },
    nuclear: nuclearDefaults(),
  });
}

export function advanceMilitary(military, economy, budget, geopoliticalResult = {}, factions = {}) {
  const normalized = normalizeMilitary(military);
  const defenseSpend = clamp(Number(budget.defenseSpend) || 0, 0, 0.15);
  const warDelta = geopoliticalResult.militaryDelta ?? {};
  const deficitPenalty = economy.cash < 0 ? 0.8 : 0;
  const powerGain = defenseSpend * 18;
  const militaryFaction = Number(factions.militares) || 50;
  const supportShift = (militaryFaction - 50) * 0.015 + (defenseSpend * 8) + (warDelta.supportDelta ?? 0) - deficitPenalty;
  const maintenance = (normalized.exercito.soldados * 180)
    + (normalized.exercito.blindados * 6_000_000)
    + (normalized.marinha.navios * 12_000_000)
    + (normalized.aeronautica.cacas * 9_000_000);
  const nextReadiness = clamp(normalized.readiness + (defenseSpend * 0.12) - ((warDelta.powerLoss ?? 0) * 0.01), 0.5, 1.8);
  return {
    military: normalizeMilitary({
      ...normalized,
      readiness: nextReadiness,
      support: clamp((Number(normalized.support) || 0) + supportShift, 0, 100),
      combatAdjustment: normalized.combatAdjustment + powerGain - (warDelta.powerLoss ?? 0),
    }),
    economy: { ...economy, cash: economy.cash - maintenance },
  };
}

export function recrutarSoldado(military, economy, amount = 5_000, resources = {}) {
  const soldiers = Math.max(1, Math.floor(Number(amount) || 0));
  const cost = soldiers * 12_000 * getRecruitmentCostMultiplier(military?.trait);
  const steelCost = Math.ceil(soldiers / 100);
  const cash = Number(economy?.cash) || 0;
  if (cash < cost) return { ok: false, reason: 'Caixa insuficiente para recrutamento.', military, economy };
  if (available(resources, 'steel') < steelCost) return { ok: false, reason: 'Aco insuficiente para recrutamento.', military, economy, resources };

  const normalized = normalizeMilitary(military);
  return {
    ok: true,
    reason: `${soldiers.toLocaleString('pt-BR')} soldados recrutados.`,
    military: normalizeMilitary({ ...normalized, exercito: { ...normalized.exercito, soldados: normalized.exercito.soldados + soldiers } }),
    economy: { ...economy, cash: cash - cost },
    resources: consume(resources, 'steel', steelCost),
  };
}

function comprarUnidade(military, economy, branch, field, amount, unit, resources = {}) {
  const quantity = Math.max(1, Math.floor(Number(amount) || 0));
  const totalCost = quantity * unit.cost;
  const cash = Number(economy?.cash) || 0;
  if (cash < totalCost) return { ok: false, reason: `Caixa insuficiente para ${unit.label.toLowerCase()}.`, military, economy };
  const steelCost = quantity * unit.steel;
  if (available(resources, 'steel') < steelCost) return { ok: false, reason: `Aco insuficiente para ${unit.label.toLowerCase()}.`, military, economy, resources };
  const normalized = normalizeMilitary(military);
  return {
    ok: true,
    reason: `${quantity} ${unit.label.toLowerCase()} adquiridos.`,
    military: normalizeMilitary({ ...normalized, [branch]: { ...normalized[branch], [field]: normalized[branch][field] + quantity } }),
    economy: { ...economy, cash: cash - totalCost },
    resources: consume(resources, 'steel', steelCost),
  };
}

export function comprarBlindados(military, economy, amount = 1, resources = {}) {
  return comprarUnidade(military, economy, 'exercito', 'blindados', amount, { label: 'Blindados', cost: 4_000_000_000, steel: 2_000 }, resources);
}

export function comprarNavios(military, economy, amount = 1, resources = {}) {
  return comprarUnidade(military, economy, 'marinha', 'navios', amount, { label: 'Navios', cost: 8_000_000_000, steel: 10_000 }, resources);
}

export function comprarCacas(military, economy, amount = 1, resources = {}) {
  return comprarUnidade(military, economy, 'aeronautica', 'cacas', amount, { label: 'Cacas', cost: 7_000_000_000, steel: 1_500 }, resources);
}

export function comprarEquipamento(military, economy, kind, resources = {}) {
  if (kind === 'tanks') return comprarBlindados(military, economy, 1, resources);
  if (kind === 'jets') return comprarCacas(military, economy, 1, resources);
  if (kind === 'ships') return comprarNavios(military, economy, 1, resources);
  return { ok: false, reason: 'Equipamento invalido.', military, economy };
}

export function fundNuclearProject(military, economy, kind, amount, resources = {}) {
  const cost = Number(amount);
  if (!['civil', 'military'].includes(kind) || !Number.isFinite(cost) || cost <= 0) {
    return { ok: false, reason: 'Projeto nuclear invalido.', military, economy };
  }
  if (economy.cash < cost) return { ok: false, reason: 'Caixa insuficiente para o projeto.', military, economy };
  const uraniumCost = Math.ceil(cost / 100_000_000);
  if (available(resources, 'uranium') < uraniumCost) return { ok: false, reason: 'Uranio insuficiente para o projeto.', military, economy, resources };
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
    military: normalizeMilitary({ ...military, armasNucleares: nextNuclear.arsenal, nuclear: nextNuclear }),
    economy: { ...economy, cash: economy.cash - cost },
    resources: consume(resources, 'uranium', uraniumCost),
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
      armasNucleares: Math.max(1, Number(military.armasNucleares) || nuclear.arsenal),
      nuclear: { ...nuclear, arsenal: Math.max(1, nuclear.arsenal), diplomaticPenaltyApplied: true },
    },
  };
}

export function canAutogolpe(regime, military) {
  return regime?.type === 'democracy'
    && !regime.gameOver
    && Number(military?.support) > 60
    && getPoderTerrestre(military) >= 20;
}

export function createRegime() {
  return { type: 'democracy', coupRisk: 0, revolutionRisk: 0, electionsSuspended: false, gameOver: false, outcome: null };
}

export function evaluateRegime(regime, economy, military, geopolitics, seed, factions = {}) {
  if (regime.gameOver) return { regime, seed, event: null };
  if ((Number(factions.militares) || 50) < 20) {
    return {
      seed,
      event: 'Golpe militar encerrou o mandato por perda de apoio nas Forcas Armadas.',
      regime: { ...regime, coupRisk: 1, gameOver: true, outcome: 'golpe-militar', electionsSuspended: true },
    };
  }
  const atWar = geopolitics.contacts?.some((contact) => contact.atWar) ? 1 : 0;
  const sanctions = clamp(Number(geopolitics.sanctionSeverity) || 0, 0, 1);
  const random = nextRandom(seed);
  if (regime.type === 'dictatorship' || regime.type === 'communist_dictatorship') {
    const revolutionRisk = clamp(
      (Number(regime.revolutionRisk) || 0) + 0.015
        + ((100 - (Number(factions.trabalhadores) || 50)) / 100) * 0.12
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
  const severeCrisis = (Number(factions.trabalhadores) || 50) <= 10 && economy.cash < 0;
  const coupRisk = severeCrisis
    ? clamp(0.22 + (atWar * 0.12) + (Math.max(0, military.support - 60) * 0.006), 0, 0.8)
    : 0;
  const gameOver = severeCrisis && random.value < coupRisk;
  return {
    seed: random.seed,
    event: gameOver ? 'Golpe militar encerrou o mandato.' : null,
    regime: { ...regime, coupRisk, revolutionRisk: 0, gameOver, outcome: gameOver ? 'golpe-militar' : null, electionsSuspended: false },
  };
}
