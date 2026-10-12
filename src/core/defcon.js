function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function syncContacts(state, contacts) {
  return {
    ...state,
    geopolitics: { ...state.geopolitics, contacts },
    world: contacts,
  };
}

export function markAnnexationTension(state) {
  return {
    ...state,
    defconAnnexationMonths: Math.max(12, Number(state.defconAnnexationMonths) || 0),
    defconPeacefulMonths: 0,
  };
}

export function advanceDefcon(state) {
  const activeWars = (state.geopolitics?.contacts ?? []).filter((contact) => contact.atWar).length;
  const annexationMonths = Math.max(0, Math.floor(Number(state.defconAnnexationMonths) || 0));
  const tense = activeWars >= 3 || annexationMonths > 0;
  let level = clamp(Math.floor(Number(state.global_defcon) || 5), 1, 5);
  let peacefulMonths = Math.max(0, Math.floor(Number(state.defconPeacefulMonths) || 0));

  if (tense) {
    level = Math.max(1, level - 1);
    peacefulMonths = 0;
  } else {
    peacefulMonths += 1;
    if (peacefulMonths >= 12 && level < 5) {
      level += 1;
      peacefulMonths = 0;
    }
  }

  return {
    ...state,
    global_defcon: level,
    defconPeacefulMonths: peacefulMonths,
    defconAnnexationMonths: Math.max(0, annexationMonths - 1),
  };
}

export function applyDefconEconomicShock(state) {
  const level = clamp(Math.floor(Number(state.global_defcon) || 5), 1, 5);
  if (level > 2) return state;

  const reduceGdp = (value) => Math.max(0, Math.round((Number(value) || 0) * 0.995));
  const contacts = (state.geopolitics?.contacts ?? []).map((contact) => ({
    ...contact,
    pib_base: reduceGdp(contact.pib_base),
  }));
  return syncContacts({
    ...state,
    country: { ...state.country, pib_base: reduceGdp(state.country.pib_base) },
    economy: { ...state.economy, gdp: reduceGdp(state.economy.gdp) },
  }, contacts);
}
