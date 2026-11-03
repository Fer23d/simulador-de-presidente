import { hash } from './art.js';

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

export function hasMarketSuit(skinId) {
  return skinId === MARKET_SUIT_SKIN;
}

function factor(turn, id, min, max) {
  return min + hash(turn, id.length * 31 + id.charCodeAt(0), 77) * (max - min);
}

// As ofertas do mes: preco varia a cada visita, e vender sempre rende menos do que comprar custa.
export function rollDarkMarket(turn) {
  const month = Math.max(0, Math.floor(Number(turn) || 0));
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
  return { turn: month, open: true, lastOpenDay: MARKET_OPEN_DAYS, merchant: MERCHANTS[month % MERCHANTS.length], offers };
}

export function normalizeDarkMarket(value) {
  if (!value || !Array.isArray(value.offers) || !value.open) return null;
  const offers = value.offers.filter((offer) => offer && GOODS[offer.res] && (offer.kind === 'sell' || offer.kind === 'buy')
    && Number(offer.amount) > 0 && Number(offer.scrap) > 0).slice(0, 12).map((offer) => ({
    id: `${offer.kind}-${offer.res}`, kind: offer.kind, res: offer.res, amount: Math.floor(offer.amount), scrap: Math.floor(offer.scrap),
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

export function describeOffer(offer) {
  const good = GOODS[offer.res];
  return offer.kind === 'sell'
    ? { give: `${offer.amount} ${good.unit} de ${good.label.toLowerCase()}`, get: `${offer.scrap} sucatas`, icon: good.icon }
    : { give: `${offer.scrap} sucatas`, get: `${offer.amount} ${good.unit} de ${good.label.toLowerCase()}`, icon: good.icon };
}

export function canTrade(state, offerId, skinId) {
  const offer = state?.dark_market?.offers?.find((candidate) => candidate.id === offerId);
  if (!isMarketOpen(state)) return { ok: false, reason: 'O Mercado Sombrio já foi embora. O comboio volta no próximo mês.' };
  if (!hasMarketSuit(skinId)) return { ok: false, reason: 'A superfície mata sem proteção. Equipe o Traje Antirradiação para negociar.' };
  if (!offer) return { ok: false, reason: 'Essa oferta não existe.' };
  if (offer.left <= 0) return { ok: false, reason: 'O mercador não tem mais disso este mês.' };
  if (offer.kind === 'sell' && getStock(state, offer.res) < offer.amount) return { ok: false, reason: `Faltam ${MARKET_GOODS[offer.res].label.toLowerCase()} para essa troca.` };
  if (offer.kind === 'buy' && (Number(state.scrap) || 0) < offer.scrap) return { ok: false, reason: 'Sucata insuficiente.' };
  return { ok: true, offer };
}

export function tradeAtMarket(state, offerId, skinId) {
  const check = canTrade(state, offerId, skinId);
  if (!check.ok) return { ...state, notice: check.reason };
  const { offer } = check;
  const good = GOODS[offer.res];
  const traded = offer.kind === 'sell'
    ? { ...withStock(state, offer.res, -offer.amount), scrap: (Number(state.scrap) || 0) + offer.scrap }
    : { ...withStock(state, offer.res, offer.amount), scrap: (Number(state.scrap) || 0) - offer.scrap };
  return {
    ...traded,
    dark_market: { ...state.dark_market, offers: state.dark_market.offers.map((candidate) => candidate.id === offer.id ? { ...candidate, left: candidate.left - 1 } : candidate) },
    notice: offer.kind === 'sell'
      ? `${state.dark_market.merchant} levou ${offer.amount} ${good.unit} de ${good.label.toLowerCase()}: +${offer.scrap} sucatas.`
      : `Você comprou ${offer.amount} ${good.unit} de ${good.label.toLowerCase()} por ${offer.scrap} sucatas.`,
  };
}
