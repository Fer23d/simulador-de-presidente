// Pontuacao da partida e ranking local (melhores 10 campanhas neste aparelho).
import { getDifficulty } from './difficulty.js';

export const RANKING_KEY = 'simulador-presidente-ranking-v1';
export const RANKING_SIZE = 10;

const contactsOf = (state) => state.geopolitics?.contacts ?? [];

// Mede o que a campanha construiu: territorio, aliados, riqueza, reputacao, objetivos e tempo no poder.
export function computeScore(state) {
  const contacts = contactsOf(state);
  const annexed = Math.max(contacts.filter((item) => item.anexado).length, (state.geopolitics?.annexedCountryIds ?? []).length);
  const puppets = contacts.filter((item) => item.puppet && item.is_puppet_of === 'jogador' && !item.destruido).length;
  const allies = contacts.filter((item) => item.alliance && !item.destruido).length;
  const gdp = Math.max(1, Number(state.economy?.gdp) || 1);
  const challenges = Object.keys(state.challenges?.completed ?? {}).length;
  const missions = Object.keys(state.missions?.completed ?? {}).length;
  const months = Math.max(0, Number(state.monthCounter) || 0);
  const rows = [
    ['Territórios anexados', annexed * 150],
    ['Países fantoche', puppets * 60],
    ['Aliados', allies * 25],
    ['Riqueza (PIB)', Math.round(Math.log10(gdp) * 50)],
    ['Reputação na ONU', Math.round((Number(state.geopolitics?.onuScore) || 0) * 5)],
    ['Desafios cumpridos', challenges * 300],
    ['Missões históricas', missions * 800],
    ['Tempo no poder', Math.round((months / 12) * 40)],
  ].map(([label, value]) => ({ label, value }));
  const subtotal = rows.reduce((sum, row) => sum + row.value, 0);
  const difficulty = getDifficulty(state);
  const ruin = state.regime?.gameOver && /nuclear/.test(String(state.regime.outcome ?? '')) ? 0.5 : 1;
  const multiplier = difficulty.score * ruin;
  return { total: Math.round(subtotal * multiplier), subtotal, multiplier, difficulty: difficulty.label, rows, ruin: ruin < 1 };
}

export function normalizeRanking(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item.id === 'string' && Number.isFinite(Number(item.total)))
    .map((item) => ({ id: item.id, name: String(item.name ?? 'Presidente').slice(0, 32), country: String(item.country ?? '').slice(0, 40), total: Math.round(Number(item.total)), difficulty: String(item.difficulty ?? 'Normal').slice(0, 12), months: Math.max(0, Math.floor(Number(item.months) || 0)), over: item.over === true }))
    .sort((a, b) => b.total - a.total)
    .slice(0, RANKING_SIZE);
}

export function makeRankingEntry(state) {
  const score = computeScore(state);
  const over = Boolean(state.regime?.gameOver);
  return { id: `${state.country?.id ?? 'x'}:${Number(state.monthCounter) || 0}:${getDifficulty(state).id}`, name: state.playerProfile?.name || 'Presidente', country: state.country?.nome ?? state.country?.id ?? '', total: score.total, difficulty: score.difficulty, months: Number(state.monthCounter) || 0, over };
}

// Mesma campanha (pais, mes e dificuldade) so conta uma vez: guarda a maior pontuacao.
export function addRankingEntry(list, entry) {
  const current = normalizeRanking(list).filter((item) => item.id !== entry.id || item.total > entry.total);
  if (current.some((item) => item.id === entry.id)) return normalizeRanking(current);
  return normalizeRanking([...current, entry]);
}
