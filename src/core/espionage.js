import { alterarNotaONU, nextRandom } from './geopolitics.js';

const REBEL_FUNDING_COST = 8_000_000_000;

export function financiarRebeldes(state, targetId) {
  if (state.regime?.gameOver) return { ...state, notice: 'A partida foi encerrada.' };
  const target = state.geopolitics?.contacts?.find((contact) => contact.id === targetId && !contact.destruido && !contact.anexado);
  if (!target) return { ...state, notice: 'Pais nao encontrado ou indisponivel para operacao clandestina.' };
  if ((Number(state.economy.cash) || 0) < REBEL_FUNDING_COST) return { ...state, notice: 'Caixa insuficiente para financiar rebeldes.' };
  const random = nextRandom(state.randomSeed);
  const successful = random.value < 0.5;
  const contacts = state.geopolitics.contacts.map((contact) => contact.id === targetId
    ? successful
      ? { ...contact, puppet: true, civilWar: true, relation: Math.max(40, contact.relation), militaryPower: Math.max(1, contact.militaryPower * 0.55) }
      : { ...contact, relation: -100 }
    : contact);
  const geopolitics = successful
    ? { ...state.geopolitics, contacts }
    : alterarNotaONU({ ...state.geopolitics, contacts }, -100);
  return {
    ...state,
    economy: { ...state.economy, cash: state.economy.cash - REBEL_FUNDING_COST },
    geopolitics,
    randomSeed: random.seed,
    notice: successful ? `Guerra civil iniciada em ${target.name}; um governo fantoche foi instalado.` : `Operacao exposta em ${target.name}; a reputacao na ONU colapsou.`,
  };
}
