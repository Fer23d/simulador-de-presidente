import { nextRandom } from './geopolitics.js';

const CYBER_ATTACK_DURATION = 6;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function resourceOutput(contact, resource) {
  if (resource === 'steel') return Math.max(100, Math.floor((Number(contact.area_km2) || 0) / 3_000));
  return Math.max(1, Math.floor((Number(contact.uranium) || 0) * 0.001));
}

export function getCyberTech(technology) {
  return (technology?.unlocked ?? []).includes('state-hackers') ? 85 : 25;
}

export function lancarCiberataque(state, alvoId) {
  const target = state.geopolitics.contacts.find((contact) => contact.id === alvoId && !contact.destruido && !contact.anexado);
  if (!target) return { ...state, notice: 'Alvo cibernetico invalido.' };
  if (!state.unlocked_techs?.includes('cyber')) return { ...state, notice: 'A operacao exige [ CIBER-GUERRA ZERO-DAY ].' };
  if ((Number(target.cyber_paralyzed_until) || 0) > (Number(state.monthCounter) || 0)) {
    return { ...state, notice: `${target.name} ja esta com a infraestrutura digital paralisada.` };
  }
  const cyberTech = getCyberTech(state.technology);
  const guaranteed = Boolean(state.double_agent_active);
  const chance = guaranteed ? 1 : clamp(0.2 + ((cyberTech - (Number(target.cyber_defense) || 0)) / 100), 0.05, 0.95);
  const random = nextRandom(state.randomSeed);
  if (random.value >= chance) {
    return { ...state, randomSeed: random.seed, notice: `O Zero-Day contra ${target.name} foi bloqueado pela defesa digital.` };
  }
  return {
    ...state,
    randomSeed: random.seed,
    double_agent_active: guaranteed ? false : state.double_agent_active,
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === alvoId
        ? { ...contact, cyber_paralyzed_until: (Number(state.monthCounter) || 0) + CYBER_ATTACK_DURATION }
        : contact),
    },
    notice: guaranteed ? `Agente duplo ativado: Zero-Day executado contra ${target.name}.` : `Zero-Day executado: ${target.name} ficara paralisado por seis meses.`,
  };
}

export function advanceCyberWarfare(state) {
  const monthCounter = Number(state.monthCounter) || 0;
  const contacts = state.geopolitics.contacts.map((contact) => {
    const deadline = Number(contact.cyber_paralyzed_until) || 0;
    if (deadline > monthCounter) {
      const originalGdp = Number(contact.cyber_original_pib_base) || Number(contact.pib_base) || 1;
      return {
        ...contact,
        pib_base: Math.max(1, Math.round(originalGdp * 0.5)),
        cyber_original_pib_base: originalGdp,
        steel_production: 0,
        uranium_production: 0,
      };
    }
    const { cyber_paralyzed_until: _deadline, cyber_original_pib_base: originalGdp, ...restored } = contact;
    const normalGdp = Number(originalGdp) || Number(restored.pib_base) || 1;
    const steelProduction = resourceOutput(restored, 'steel');
    const uraniumProduction = resourceOutput(restored, 'uranium');
    return {
      ...restored,
      pib_base: normalGdp,
      steel: (Number(restored.steel) || 0) + steelProduction,
      uranium: (Number(restored.uranium) || 0) + uraniumProduction,
      steel_production: steelProduction,
      uranium_production: uraniumProduction,
    };
  });
  return { ...state, geopolitics: { ...state.geopolitics, contacts } };
}
