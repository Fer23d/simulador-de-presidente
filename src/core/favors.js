// Favores de aliados: quem recebeu um territorio doado fica devendo e retribui, ate 3 vezes, com tropas emprestadas,
// dinheiro ou um voto de peso na ONU (reputacao). Acontece sozinho, sem pedido do jogador.
import { pushWorldNews } from './world_news.js';

export const FIRST_FAVOR_DELAY = 6;
export const FAVOR_INTERVAL = 8;
export const MAX_FAVORS_PER_DEBT = 3;

const monthOf = (state) => Number(state.monthCounter) || 0;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const createFavors = () => ({ debts: {}, granted: 0 });

export function normalizeFavors(value) {
  const out = createFavors();
  if (!value || typeof value !== 'object') return out;
  const int = (n) => Math.max(0, Math.floor(Number(n) || 0));
  for (const [id, debt] of Object.entries(value.debts ?? {})) {
    if (!debt || typeof debt !== 'object') continue;
    out.debts[id] = { next: int(debt.next), count: Math.min(MAX_FAVORS_PER_DEBT, int(debt.count)) };
  }
  out.granted = int(value.granted);
  return out;
}

const view = (state) => normalizeFavors(state.favors);

export function registerDebt(state, allyId) {
  const data = view(state);
  const old = data.debts[allyId];
  return { ...state, favors: { ...data, debts: { ...data.debts, [allyId]: { next: monthOf(state) + FIRST_FAVOR_DELAY, count: old?.count ?? 0 } } } };
}

export function getDebts(state) {
  return Object.entries(view(state).debts).map(([id, debt]) => ({ id, ...debt, name: state.geopolitics?.contacts?.find((item) => item.id === id)?.name ?? id }));
}

function hash(month, salt, id) {
  const extra = [...String(id)].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 131;
  return ((Math.imul(month * 7919 + salt + extra, 2654435761) >>> 0) % 1000) / 1000;
}

export function processFavors(state) {
  if (state.regime?.gameOver || state.is_wasteland || state.city || !state.geopolitics?.contacts) return state;
  const month = monthOf(state);
  let data = view(state);
  let next = state;
  for (const [id, debt] of Object.entries(data.debts)) {
    if (debt.next > month) continue;
    const ally = next.geopolitics.contacts.find((item) => item.id === id);
    // O aliado precisa seguir de pe e amigo; senao a divida caduca.
    if (!ally || ally.destruido || ally.annexedBy || !ally.alliance) {
      const { [id]: gone, ...rest } = data.debts;
      data = { ...data, debts: rest };
      continue;
    }
    const roll = hash(month, 811, id);
    const gdp = Number(next.economy?.gdp) || 0;
    let text;
    if (roll < 0.34) {
      const power = clamp((Number(ally.militaryPower) || 0) * 0.15, 1, 15);
      next = { ...next, alliedLoans: { ...(next.alliedLoans ?? {}), [id]: { power, until: month + 6 } } };
      text = `${ally.name} retribuiu o território recebido e emprestou tropas por 6 meses (+${power.toFixed(1)} de poder).`;
    } else if (roll < 0.67) {
      const gift = Math.round(gdp * 0.006);
      next = { ...next, economy: { ...next.economy, cash: (Number(next.economy.cash) || 0) + gift } };
      text = `${ally.name} retribuiu o território recebido com uma transferência de caixa para o seu governo.`;
    } else {
      next = { ...next, geopolitics: { ...next.geopolitics, onuScore: clamp((Number(next.geopolitics.onuScore) || 0) + 4, 0, 100) } };
      text = `${ally.name} usou seu peso na ONU para defender você (+4 de reputação).`;
    }
    const count = debt.count + 1;
    data = { ...data, granted: data.granted + 1, debts: count >= MAX_FAVORS_PER_DEBT ? Object.fromEntries(Object.entries(data.debts).filter(([key]) => key !== id)) : { ...data.debts, [id]: { next: month + FAVOR_INTERVAL, count } } };
    next = pushWorldNews({ ...next, notice: text }, text, 'territory');
  }
  return { ...next, favors: data };
}
