// Simulacao de partidas longas do modo Presidente com tres estilos de jogo automaticos.
// Uso: node scripts/simulate-presidency.mjs [meses=120] [paises separados por virgula]
import {
  advanceMonth,
  createGameState,
  dispensarAlertaHostil,
  dispensarHistoria,
  recusarJogosMundiais,
  resolvePeaceTreaty,
  resolveEvent,
  setBudget,
  votarNaONU,
} from '../src/core/game-state.js';
import { resolvePresidentialBriefing } from '../src/core/presidential_briefing.js';
import { escolherInterrogatorio, reivindicarInterrogatorio } from '../src/core/interrogation.js';

const MONTHS = Number(process.argv[2]) || 120;
const COUNTRIES = (process.argv[3] ?? 'bra,usa,ind,nga').split(',');

const STRATEGIES = Object.freeze({
  passivo: { label: 'Passivo (nunca mexe no orçamento)', apply: (state) => state },
  guardiao: {
    label: 'Guardião (juros reagem à inflação)',
    apply(state) {
      const inflation = state.economy.inflation;
      const target = inflation > 0.1 ? 0.2 : inflation > 0.06 ? 0.14 : inflation < 0.02 ? 0.06 : 0.1;
      return setBudget(state, 'interestRate', target);
    },
  },
  gastador: {
    label: 'Gastador (impostos baixos, gasto alto, juros baixos)',
    apply(state) {
      let next = setBudget(state, 'interestRate', 0.03);
      next = setBudget(next, 'incomeTaxRate', 0.08);
      next = setBudget(next, 'socialSpend', 0.12);
      return next;
    },
  },
});

function resolvePending(state) {
  let next = state;
  for (let guard = 0; guard < 20; guard++) {
    if (next.pendingInterrogation?.phase === 'choice') { next = escolherInterrogatorio(next, 'soro'); continue; }
    if (next.pendingInterrogation?.phase === 'reward') { next = reivindicarInterrogatorio(next, 'extract-secrets'); continue; }
    if (next.pendingBriefing) { next = resolvePresidentialBriefing(next, next.pendingBriefing.options[0].id); continue; }
    if (next.pendingEvent) { next = resolveEvent(next, next.pendingEvent.options[0].id); continue; }
    if (next.pendingUnVote) { next = votarNaONU(next, 'abstain'); continue; }
    if (next.pendingGlobalBid) { next = recusarJogosMundiais(next); continue; }
    if (next.pendingHostileAlert) { next = dispensarAlertaHostil(next); continue; }
    if (next.geopolitics.peaceTreaty?.status === 'pending') { next = resolvePeaceTreaty(next, next.geopolitics.peaceTreaty.targetId, 'loot'); continue; }
    if (next.pendingStory) { next = dispensarHistoria(next); continue; }
    break;
  }
  return next;
}

function run(countryId, strategy) {
  let state = createGameState(countryId);
  const stats = { months: 0, wars: 0, crises: 0, briefings: 0, maxInflation: 0, inflationSum: 0, minWorkers: 100, stuck: null, ending: null };
  for (let guard = 0; guard < MONTHS * 3 && stats.months < MONTHS; guard++) {
    state = resolvePending(strategy.apply(state));
    const before = state;
    const counter = Number(before.monthCounter) || 0;
    state = advanceMonth(state);
    if (state.regime?.gameOver) { stats.ending = state.regime.outcome ?? 'game over'; break; }
    if (state.is_wasteland) { stats.ending = 'wasteland'; break; }
    if ((Number(state.monthCounter) || 0) === counter) { stats.stuck = `${state.notice} ${JSON.stringify(state.pendingInterrogation ?? null)}`; break; }
    stats.months += 1;
    if (state.pendingEvent) stats.crises += 1;
    if (state.pendingBriefing) stats.briefings += 1;
    const warsBefore = before.geopolitics.contacts.filter((contact) => contact.atWar && contact.defensiveWar).length;
    const warsAfter = state.geopolitics.contacts.filter((contact) => contact.atWar && contact.defensiveWar).length;
    if (warsAfter > warsBefore) stats.wars += warsAfter - warsBefore;
    stats.maxInflation = Math.max(stats.maxInflation, state.economy.inflation);
    stats.inflationSum += state.economy.inflation;
    stats.minWorkers = Math.min(stats.minWorkers, state.factions.trabalhadores);
  }
  stats.avgInflation = stats.months ? stats.inflationSum / stats.months : 0;
  stats.cash = state.economy.cash;
  stats.fiscalHole = state.economy.fiscalHole;
  return stats;
}

const pct = (value) => `${(value * 100).toFixed(1)}%`;
console.log(`Simulação do modo Presidente: ${MONTHS} meses por partida\n`);
for (const [id, strategy] of Object.entries(STRATEGIES)) {
  console.log(`## ${strategy.label}`);
  for (const country of COUNTRIES) {
    const result = run(country, strategy);
    console.log(`${country.padEnd(4)} meses ${String(result.months).padStart(3)} | guerras ${result.wars} | crises ${result.crises} | briefings ${result.briefings} | inflação média ${pct(result.avgInflation)} (pico ${pct(result.maxInflation)}) | trabalhadores mín ${result.minWorkers.toFixed(0)} | fim: ${result.ending ?? 'vivo'}${result.stuck ? ` | PRESO: ${result.stuck}` : ''}`);
  }
  console.log('');
  void id;
}
