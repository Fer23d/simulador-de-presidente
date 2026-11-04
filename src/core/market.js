import { hash } from './art.js';
import { hasLayd } from './companion.js';

// Mercado Sombrio: um comboio de mercadores que para na superficie uma vez por mes, depois das furadeiras.
// So quem veste o Traje Antirradiacao aguenta chegar ate la.
export const MARKET_SUIT_SKIN = 'hazmat';
export const MARKET_TRADES_PER_OFFER = 3;
export const MARKET_OPEN_DAYS = 3;
export const MARKET_SELL_MARGIN = 0.72;
export const MARKET_BUY_MARGIN = 1.32;

// Valor-base de cada mercadoria em sucata, e o lote negociado de cada vez.
const GOODS = Object.freeze({
  oil: { label: 'Petróleo', unit: 'barris', icon: '🛢', value: 1.5, batch: 20 },
  food: { label: 'Comida', unit: 'rações', icon: '🍲', value: .9, batch: 30 },
  energy: { label: 'Energia', unit: 'células', icon: '⚡', value: .6, batch: 40 },
  oxygen: { label: 'Oxigênio', unit: 'cilindros', icon: '💨', value: .5, batch: 40 },
  medkits: { label: 'Curativos', unit: 'kits', icon: '✚', value: 8, batch: 3 },
  weapons: { label: 'Armas', unit: 'armas', icon: '🔫', value: 9, batch: 3 },
});
export const MARKET_GOODS = GOODS;

const SELLABLE = ['oil', 'food', 'energy', 'medkits', 'weapons'];
const BUYABLE = ['food', 'oxygen', 'medkits', 'weapons', 'oil'];
const MERCHANTS = Object.freeze(['Velho Corvo', 'Madame Ferrugem', 'Tio Cinza', 'A Viúva do Comboio', 'Zero-Quatro', 'Padre Sucata']);

// Reputacao com o comboio: cada troca aproxima voce dos mercadores. Mais reputacao = precos melhores e itens raros.
export const MARKET_REP_PER_TRADE = 4;
export const MARKET_TIER_STEP = 25;
export const MARKET_PRICE_STEP = .03;

export function getMarketTier(rep) {
  return Math.max(0, Math.min(4, Math.floor((Number(rep) || 0) / MARKET_TIER_STEP)));
}

// Itens especiais do comboio: aparecem alguns por mes, custam sucata e fazem algo que a troca comum nao faz.
export const MARKET_SPECIALS = Object.freeze({
  vaccine: Object.freeze({ label: 'Vacina antirradiação', effect: '+1 vacina para a Layd', icon: '💉', scrap: 110, minTier: 0, needsLayd: true }),
  layd_ration: Object.freeze({ label: 'Ração de contrabando', effect: '+6 rações para a Layd', icon: '🦴', scrap: 34, minTier: 0, needsLayd: true }),
  power_cells: Object.freeze({ label: 'Células de energia', effect: '+260 de energia', icon: '🔋', scrap: 140, minTier: 0 }),
  air_filters: Object.freeze({ label: 'Filtros de ar', effect: '+220 de oxigênio', icon: '🫁', scrap: 120, minTier: 0 }),
  refined_fuel: Object.freeze({ label: 'Combustível refinado', effect: '+40 barris de petróleo', icon: '⛽', scrap: 150, minTier: 1 }),
  generator_overhaul: Object.freeze({ label: 'Reforma de gerador', effect: '+1 nível em um gerador', icon: '🔧', scrap: 700, minTier: 3 }),
});
const SPECIALS_PER_MONTH = 3;

export function hasMarketSuit(skinId) {
  return skinId === MARKET_SUIT_SKIN;
}

function factor(turn, id, min, max) {
  return min + hash(turn, id.length * 31 + id.charCodeAt(0), 77) * (max - min);
}

// As ofertas do mes: preco varia a cada visita, e vender sempre rende menos do que comprar custa.
export function rollDarkMarket(turn, { rep = 0, layd = false } = {}) {
  const month = Math.max(0, Math.floor(Number(turn) || 0));
  const tier = getMarketTier(rep);
  const offers = [];
  for (const res of SELLABLE) {
    const good = GOODS[res];
    offers.push({ id: `sell-${res}`, kind: 'sell', res, amount: good.batch,
      scrap: Math.max(1, Math.round(good.batch * good.value * MARKET_SELL_MARGIN * factor(month, `sell-${res}`, .8, 1.3))), left: MARKET_TRADES_PER_OFFER });
  }
  for (const res of BUYABLE) {
    const good = GOODS[res];
    offers.push({ id: `buy-${res}`, kind: 'buy', res, amount: good.batch,
      scrap: Math.max(1, Math.round(good.batch * good.value * MARKET_BUY_MARGIN * factor(month, `buy-${res}`, .8, 1.25))), left: MARKET_TRADES_PER_OFFER });
  }
  const specials = Object.keys(MARKET_SPECIALS)
    .filter((key) => MARKET_SPECIALS[key].minTier <= tier && (!MARKET_SPECIALS[key].needsLayd || layd))
    .sort((a, b) => hash(month, a.length * 17, 3) - hash(month, b.length * 17, 3) || (hash(month, a.charCodeAt(0), 9) - hash(month, b.charCodeAt(0), 9)))
    .slice(0, SPECIALS_PER_MONTH);
  for (const key of specials) {
    const base = MARKET_SPECIALS[key];
    offers.push({ id: `special-${key}`, kind: 'special', key, amount: 1, left: 1,
      scrap: Math.max(1, Math.round(base.scrap * factor(month, `special-${key}`, .9, 1.15))) });
  }
  return { turn: month, open: true, lastOpenDay: MARKET_OPEN_DAYS, merchant: MERCHANTS[month % MERCHANTS.length], offers };
}

// Preco final depois da reputacao: quem e conhecido vende mais caro e compra mais barato.
export function priceWithReputation(offer, rep = 0) {
  const tier = getMarketTier(rep);
  if (offer.kind === 'sell') return Math.round(offer.scrap * (1 + MARKET_PRICE_STEP * tier));
  return Math.max(1, Math.round(offer.scrap * (1 - MARKET_PRICE_STEP * tier)));
}

export function normalizeDarkMarket(value) {
  if (!value || !Array.isArray(value.offers) || !value.open) return null;
  const validOffer = (offer) => offer && Number(offer.amount) > 0 && Number(offer.scrap) > 0
    && (((offer.kind === 'sell' || offer.kind === 'buy') && GOODS[offer.res]) || (offer.kind === 'special' && MARKET_SPECIALS[offer.key]));
  const offers = value.offers.filter(validOffer).slice(0, 16).map((offer) => (offer.kind === 'special'
    ? { id: `special-${offer.key}`, kind: 'special', key: offer.key, amount: 1, scrap: Math.floor(offer.scrap), left: Math.max(0, Math.min(1, Math.floor(Number(offer.left) || 0))) }
    : { id: `${offer.kind}-${offer.res}`, kind: offer.kind, res: offer.res, amount: Math.floor(offer.amount), scrap: Math.floor(offer.scrap),
      left: Math.max(0, Math.min(MARKET_TRADES_PER_OFFER, Math.floor(Number(offer.left) || 0))) }));
  if (!offers.length) return null;
  const lastOpenDay = Number(value.lastOpenDay ?? value.closeDay);
  return { turn: Math.max(0, Math.floor(Number(value.turn) || 0)), open: true,
    lastOpenDay: Math.max(1, Math.min(MARKET_OPEN_DAYS, Number.isFinite(lastOpenDay) ? Math.floor(lastOpenDay) : MARKET_OPEN_DAYS)),
    merchant: String(value.merchant ?? MERCHANTS[0]).slice(0, 40), offers };
}

export function isMarketOpen(state) {
  const market = state?.dark_market;
  const turn = Math.max(0, Math.floor(Number(state?.wasteland_turn) || 0));
  const day = Math.max(0, Math.floor(Number(state?.wasteland_day) || 0));
  return Boolean(state?.is_wasteland && market?.open && !state.ending
    && Number(market.turn) === turn && day <= (Number(market.lastOpenDay) || MARKET_OPEN_DAYS));
}

export function getStock(state, res) {
  if (res === 'oil') return Math.max(0, Number(state?.oil) || 0);
  return Math.max(0, Number(state?.shelter_supplies?.[res]) || 0);
}

function withStock(state, res, delta) {
  if (res === 'oil') return { ...state, oil: Math.max(0, (Number(state.oil) || 0) + delta) };
  return { ...state, shelter_supplies: { ...state.shelter_supplies, [res]: Math.max(0, (Number(state.shelter_supplies?.[res]) || 0) + delta) } };
}

export function describeOffer(offer, rep = 0) {
  const price = priceWithReputation(offer, rep);
  if (offer.kind === 'special') {
    const special = MARKET_SPECIALS[offer.key];
    return { give: `${price} sucatas`, get: `${special.label}: ${special.effect}`, icon: special.icon, special: true };
  }
  const good = GOODS[offer.res];
  return offer.kind === 'sell'
    ? { give: `${offer.amount} ${good.unit} de ${good.label.toLowerCase()}`, get: `${price} sucatas`, icon: good.icon }
    : { give: `${price} sucatas`, get: `${offer.amount} ${good.unit} de ${good.label.toLowerCase()}`, icon: good.icon };
}

function specialBlocked(state, key) {
  if (MARKET_SPECIALS[key].needsLayd && !hasLayd(state)) return 'A Layd não está com você.';
  if (key === 'generator_overhaul' && !(state.shelter_grid ?? []).flat().some((room) => room?.type === 'generator' && room.operational && (Number(room.level) || 1) < 5)) {
    return 'Você não tem um gerador funcionando que ainda possa subir de nível.';
  }
  return null;
}

function applySpecial(state, key) {
  if (key === 'vaccine') return { ...state, companion: { ...state.companion, vaccines: Math.min(99, (state.companion.vaccines || 0) + 1) } };
  if (key === 'layd_ration') return { ...state, companion: { ...state.companion, ration: Math.min(99, (state.companion.ration || 0) + 6) } };
  if (key === 'power_cells') return withStock(state, 'energy', 260);
  if (key === 'air_filters') return withStock(state, 'oxygen', 220);
  if (key === 'refined_fuel') return withStock(state, 'oil', 40);
  let upgraded = false;
  const grid = state.shelter_grid.map((row) => row.map((room) => {
    if (!upgraded && room?.type === 'generator' && room.operational && (Number(room.level) || 1) < 5) { upgraded = true; return { ...room, level: (Number(room.level) || 1) + 1 }; }
    return room;
  }));
  return { ...state, shelter_grid: grid };
}

export function canTrade(state, offerId, skinId) {
  const offer = state?.dark_market?.offers?.find((candidate) => candidate.id === offerId);
  if (!isMarketOpen(state)) return { ok: false, reason: 'O Mercado Sombrio já foi embora. O comboio volta no próximo mês.' };
  if (!hasMarketSuit(skinId)) return { ok: false, reason: 'A superfície mata sem proteção. Equipe o Traje Antirradiação para negociar.' };
  if (!offer) return { ok: false, reason: 'Essa oferta não existe.' };
  if (offer.left <= 0) return { ok: false, reason: 'O mercador não tem mais disso este mês.' };
  const price = priceWithReputation(offer, state.market_rep);
  if (offer.kind === 'special') {
    const blocked = specialBlocked(state, offer.key);
    if (blocked) return { ok: false, reason: blocked };
    if ((Number(state.scrap) || 0) < price) return { ok: false, reason: 'Sucata insuficiente.' };
    return { ok: true, offer };
  }
  if (offer.kind === 'sell' && getStock(state, offer.res) < offer.amount) return { ok: false, reason: `Faltam ${MARKET_GOODS[offer.res].label.toLowerCase()} para essa troca.` };
  if (offer.kind === 'buy' && (Number(state.scrap) || 0) < price) return { ok: false, reason: 'Sucata insuficiente.' };
  return { ok: true, offer };
}

export function tradeAtMarket(state, offerId, skinId) {
  const check = canTrade(state, offerId, skinId);
  if (!check.ok) return { ...state, notice: check.reason };
  const { offer } = check;
  const price = priceWithReputation(offer, state.market_rep);
  const rep = Math.min(100, (Number(state.market_rep) || 0) + MARKET_REP_PER_TRADE);
  const tierUp = getMarketTier(rep) > getMarketTier(state.market_rep);
  const tierNote = tierUp ? ` O comboio passou a confiar mais em você (nível ${getMarketTier(rep)}).` : '';
  const marketAfter = { ...state.dark_market, offers: state.dark_market.offers.map((candidate) => candidate.id === offer.id ? { ...candidate, left: candidate.left - 1 } : candidate) };
  if (offer.kind === 'special') {
    const special = MARKET_SPECIALS[offer.key];
    return { ...applySpecial({ ...state, scrap: (Number(state.scrap) || 0) - price }, offer.key), dark_market: marketAfter, market_rep: rep,
      notice: `${special.label}: ${special.effect}. Custou ${price} sucatas.${tierNote}` };
  }
  const good = GOODS[offer.res];
  const traded = offer.kind === 'sell'
    ? { ...withStock(state, offer.res, -offer.amount), scrap: (Number(state.scrap) || 0) + price }
    : { ...withStock(state, offer.res, offer.amount), scrap: (Number(state.scrap) || 0) - price };
  return {
    ...traded,
    dark_market: marketAfter,
    market_rep: rep,
    notice: (offer.kind === 'sell'
      ? `${state.dark_market.merchant} levou ${offer.amount} ${good.unit} de ${good.label.toLowerCase()}: +${price} sucatas.`
      : `Você comprou ${offer.amount} ${good.unit} de ${good.label.toLowerCase()} por ${price} sucatas.`) + tierNote,
  };
}
