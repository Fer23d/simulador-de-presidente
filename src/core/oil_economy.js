// Usos do petroleo no Vault: combustivel dos geradores e venda no radio para as faccoes do Ermo.
export const GENERATOR_FUEL_BOOST = 1.5;
export const FUEL_BARRELS_PER_GENERATOR_LEVEL = 3;
export const OIL_SALE_BATCH = 50;
export const OIL_SALE_BASE_RATE = 1.2;
export const OIL_SALE_RELATION_GAIN = 4;

function activeGenerators(state) {
  return (state?.shelter_grid ?? []).flat().filter((room) => room?.type === 'generator' && room.operational);
}

// Quanto o abastecimento custa neste mes e se o estoque aguenta; sem petroleo suficiente os geradores voltam ao normal.
export function getGeneratorFuelPlan(state) {
  const generators = activeGenerators(state);
  const cost = generators.reduce((total, room) => total + Math.max(1, Number(room.level) || 1) * FUEL_BARRELS_PER_GENERATOR_LEVEL, 0);
  const enabled = state?.generator_fuel === true;
  const funded = cost > 0 && (Number(state?.oil) || 0) >= cost;
  return { enabled, cost, generators: generators.length, funded, active: enabled && funded, multiplier: enabled && funded ? GENERATOR_FUEL_BOOST : 1 };
}

export function toggleGeneratorFuel(state) {
  if (!state?.is_wasteland) return state;
  const enabled = !(state.generator_fuel === true);
  return { ...state, generator_fuel: enabled,
    notice: enabled ? 'Geradores abastecidos com petróleo: +50% de energia enquanto houver barris.' : 'Geradores voltaram ao modo normal.' };
}

export function getOilSaleOffer(contact) {
  const relation = Number(contact?.relation) || 0;
  const rate = OIL_SALE_BASE_RATE + Math.max(0, relation) / 100;
  return { batch: OIL_SALE_BATCH, scrap: Math.round(OIL_SALE_BATCH * rate), relationGain: OIL_SALE_RELATION_GAIN };
}

export function sellOil(state, contactId) {
  const contacts = state?.geopolitics?.contacts ?? [];
  const contact = contacts.find((candidate) => candidate.id === contactId);
  const hasRadio = (state?.shelter_grid ?? []).flat().some((room) => room?.type === 'radio');
  if (!state?.is_wasteland || !contact) return { ...state, notice: 'Facção indisponível para negociar.' };
  if (!hasRadio) return { ...state, notice: 'Construa uma Sala de Rádio para negociar petróleo.' };
  const offer = getOilSaleOffer(contact);
  if ((Number(state.oil) || 0) < offer.batch) return { ...state, notice: `Venda mínima: ${offer.batch} barris de petróleo.` };
  return {
    ...state,
    oil: state.oil - offer.batch,
    scrap: (Number(state.scrap) || 0) + offer.scrap,
    geopolitics: { ...state.geopolitics, contacts: contacts.map((candidate) => candidate.id === contactId
      ? { ...candidate, relation: Math.min(100, (Number(candidate.relation) || 0) + offer.relationGain) } : candidate) },
    notice: `${contact.name} comprou ${offer.batch} barris: +${offer.scrap} sucatas e relação melhor.`,
  };
}
