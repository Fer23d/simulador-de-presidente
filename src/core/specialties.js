// Recursos estrategicos: cada pais tem uma especialidade (Taiwan: tecnologia, Brasil: alimentos e commodities,
// Venezuela: energia...). Quanto voce aproveita cada uma depende de COMO controla o pais: producao propria, anexacao com
// lealdade, fantoche, alianca ou acordo comercial. Guerra, sancoes e embargos cortam o acesso.
// Tudo e derivado do estado (nao ha campo novo no save): o suprimento de cada tipo vira um efeito mensal.
import { COUNTRY_SPECIALTIES } from '../data/country_specialties.js';
import { COUNTRIES } from '../data/countries.js';
import { adjustFactions } from './factions.js';
import { getTerritoryLoyalty } from './deployments.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const SPECIALTIES = Object.freeze({
  energy: Object.freeze({ id: 'energy', icon: '⚡', label: 'Energia', long: 'Petróleo e gás', effect: 'Mais crescimento e menos inflação.' }),
  tech: Object.freeze({ id: 'tech', icon: '💾', label: 'Tecnologia', long: 'Chips e inovação', effect: 'Pontos de Pesquisa todo mês e um pouco de crescimento.' }),
  food: Object.freeze({ id: 'food', icon: '🌾', label: 'Alimentos', long: 'Alimentos e commodities', effect: 'Menos tensão social, trabalhadores mais satisfeitos e preços mais baixos.' }),
  minerals: Object.freeze({ id: 'minerals', icon: '⛏️', label: 'Minérios', long: 'Minérios e metais', effect: 'Caixa de exportação e estoque de aço e terras raras.' }),
  industry: Object.freeze({ id: 'industry', icon: '🏭', label: 'Indústria', long: 'Indústria pesada', effect: 'Mais PIB e caixa.' }),
  finance: Object.freeze({ id: 'finance', icon: '💰', label: 'Finanças', long: 'Centros financeiros', effect: 'Entrada de capital no caixa todo mês.' }),
  arms: Object.freeze({ id: 'arms', icon: '🎖️', label: 'Armamentos', long: 'Indústria bélica', effect: 'Pontos de pesquisa militar todo mês.' }),
  logistics: Object.freeze({ id: 'logistics', icon: '🚢', label: 'Logística', long: 'Portos, canais e rotas', effect: 'Receita de comércio e reforços mais rápidos.' }),
});

export const SPECIALTY_ORDER = Object.freeze(['energy', 'tech', 'food', 'minerals', 'industry', 'finance', 'arms', 'logistics']);
export const RANK_WEIGHTS = Object.freeze([1, 0.6, 0.4]);
export const LOGISTICS_REINFORCE_THRESHOLD = 0.4;
// Retorno decrescente: a melhor fonte vale tudo, a segunda 65%, a terceira 42%... (ter muitos parceiros nao basta).
export const SOURCE_DECAY = 0.65;

const AREA = Object.fromEntries(COUNTRIES.map((country) => [country.id, country.area_km2]));

export function getSpecialties(countryId) {
  const list = COUNTRY_SPECIALTIES[countryId];
  return Array.isArray(list) ? list.filter((id) => SPECIALTIES[id]) : [];
}

// Paises grandes entregam mais do que os pequenos, mas sem exagero.
function sizeFactor(countryId) {
  return clamp(0.4 + (Math.log10(Math.max(100, Number(AREA[countryId]) || 100000)) / 7), 0.6, 1.3);
}

export function accessLabel(contact) {
  if (contact.anexado) return 'território seu';
  if (contact.puppet && contact.is_puppet_of === 'jogador') return 'fantoche';
  if (contact.alliance) return 'aliança';
  if (contact.tradeTreaty) return 'acordo comercial';
  return 'sem acesso';
}

// Quanto do recurso do pais chega ate voce (0 a 1).
export function getAccess(state, contact) {
  if (!contact || contact.wasteland) return 0;
  if (contact.destruido && !contact.anexado) return 0;
  if (contact.anexado) return clamp(0.5 + (getTerritoryLoyalty(state, contact.id) / 200), 0, 1);
  if (contact.puppet && contact.is_puppet_of === 'jogador') return 0.8;
  if (contact.atWar || contact.sancionado_por_jogador) return 0;
  let access = contact.alliance || (state.player_alliance ?? []).includes(contact.id) ? 0.6 : (contact.tradeTreaty ? 0.4 : 0);
  if (access > 0 && state.geopolitics?.internationalSanctions) access *= 0.5;
  return access;
}

// Suprimento de cada especialidade: producao propria + acesso a cada pais fornecedor.
export function getSupply(state) {
  const result = Object.fromEntries(SPECIALTY_ORDER.map((type) => [type, { supply: 0, strength: 0, sources: [] }]));
  const add = (countryId, name, access, domestic) => {
    if (access <= 0) return;
    getSpecialties(countryId).forEach((type, rank) => {
      const amount = access * (RANK_WEIGHTS[rank] ?? 0.3) * sizeFactor(countryId);
      result[type].supply += amount;
      result[type].sources.push({ id: countryId, name, access, amount, main: rank === 0, domestic });
    });
  };
  if (!state.is_wasteland) add(state.country?.id, state.country?.nome ?? state.country?.id, 1, true);
  for (const contact of state.geopolitics?.contacts ?? []) add(contact.id, contact.name, getAccess(state, contact), false);
  for (const type of SPECIALTY_ORDER) {
    result[type].sources.sort((a, b) => b.amount - a.amount);
    result[type].supply = result[type].sources.reduce((sum, source, index) => sum + (source.amount * (SOURCE_DECAY ** index)), 0);
    result[type].strength = Math.round((1 - (0.5 ** result[type].supply)) * 1000) / 1000;
  }
  return result;
}

export function getStrength(state, type) {
  return getSupply(state)[type]?.strength ?? 0;
}

// Logistica forte encurta em 1 mes a viagem dos comboios de reforco.
export function getLogisticsBonus(state) {
  return getStrength(state, 'logistics') >= LOGISTICS_REINFORCE_THRESHOLD ? 1 : 0;
}

// Resumo do efeito mensal de cada tipo para o suprimento atual (para a interface e para os testes).
export function describeMonthly(type, strength) {
  const pct = (value) => `${(value * 100).toFixed(2).replace('.', ',')}%`;
  if (strength <= 0) return 'sem efeito';
  switch (type) {
    case 'energy': return `PIB +${pct(0.0005 * strength)} e inflação −${pct(0.0005 * strength)} por mês`;
    case 'tech': return `+${Math.round(8 * strength)} Pontos de Pesquisa por mês`;
    case 'food': return `tensão social −${(0.8 * strength).toFixed(1).replace('.', ',')} por mês e inflação −${pct(0.0004 * strength)}`;
    case 'minerals': return `+${Math.round(1200 * strength).toLocaleString('pt-BR')} de aço e +${Math.round(40 * strength)} terras raras por mês, mais caixa de exportação`;
    case 'industry': return `PIB +${pct(0.0004 * strength)} por mês e mais caixa`;
    case 'finance': return 'caixa de capital estrangeiro todo mês';
    case 'arms': return `+${Math.round(8 * strength)} pontos de pesquisa militar por mês`;
    default: return 'receita de comércio e reforços mais rápidos';
  }
}

// O que mudaria se voce controlasse totalmente esse pais (usado no cartao do mapa para mostrar o "premio").
export function describeSpoils(state, contact) {
  return getSpecialties(contact.id).map((type, rank) => ({ type, rank, label: SPECIALTIES[type].long, icon: SPECIALTIES[type].icon }));
}

function isActiveGame(state) {
  return !state.regime?.gameOver && !state.is_wasteland && !state.city && Boolean(state.geopolitics?.contacts);
}

// Fim de mes: aplica o efeito de cada especialidade conforme o suprimento. So bonus: faltar recurso nao pune.
export function processSpecialties(state) {
  if (!isActiveGame(state)) return state;
  const supply = getSupply(state);
  const s = (type) => supply[type].strength;
  const gdp = Number(state.economy?.gdp) || 0;
  const monthly = gdp / 12;
  let economy = { ...state.economy };
  let next = state;
  economy.gdp = Math.round(gdp * (1 + (0.0005 * s('energy')) + (0.0003 * s('tech')) + (0.0004 * s('industry'))));
  economy.inflation = clamp((Number(economy.inflation) || 0) - (0.0005 * s('energy')) - (0.0004 * s('food')), 0, 0.8);
  economy.cash = (Number(economy.cash) || 0) + Math.round(monthly * ((0.002 * s('minerals')) + (0.0015 * s('industry')) + (0.003 * s('finance')) + (0.002 * s('logistics'))));
  next = { ...next, economy };
  if (s('tech') > 0) next = { ...next, technology: { ...next.technology, points: (Number(next.technology?.points) || 0) + Math.round(8 * s('tech')) } };
  if (s('arms') > 0) next = { ...next, military_research_points: (Number(next.military_research_points) || 0) + Math.round(8 * s('arms')) };
  if (s('minerals') > 0) {
    next = { ...next, country: { ...next.country, steel: (Number(next.country?.steel) || 0) + Math.round(1200 * s('minerals')), rare_earths: (Number(next.country?.rare_earths) || 0) + Math.round(40 * s('minerals')) } };
  }
  if (s('food') > 0) {
    next = {
      ...next,
      regime: { ...next.regime, unrest: clamp((Number(next.regime?.unrest) || 0) - (0.8 * s('food')), 0, 100) },
      factions: adjustFactions(next.factions, { trabalhadores: 0.12 * s('food') }),
    };
  }
  return next;
}
