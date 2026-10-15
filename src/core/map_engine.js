function normalizeId(value) {
  return String(value ?? '').trim().toLowerCase();
}

function getWorldCountries(state) {
  if (Array.isArray(state?.world)) return state.world;
  if (state?.world && typeof state.world === 'object') {
    return Object.entries(state.world).map(([id, country]) => ({ id, ...country }));
  }
  return [];
}

function isAtWarWithPlayer(country, playerId) {
  const hasExplicitOpponent = country?.atWarAgainst != null
    || country?.warTargetId != null
    || country?.warInitiator != null
    || country?.defensiveWar === true;
  return Boolean(country?.atWar)
    && (!hasExplicitOpponent
      || normalizeId(country.atWarAgainst) === normalizeId(playerId)
      || normalizeId(country.warTargetId) === normalizeId(playerId)
      || country.defensiveWar === true
      || normalizeId(country.warInitiator) === normalizeId(country.id));
}

export function getMapCountryVisual(state, country) {
  const playerId = normalizeId(state?.country?.id);
  const countryId = normalizeId(country?.id);
  const relation = Number(country?.relation ?? 0);
  const allies = new Set((state?.player_alliance ?? []).map(normalizeId));
  const isPlayer = countryId === playerId;
  const isAlly = !isPlayer && allies.has(countryId);
  const atWar = !isPlayer && isAtWarWithPlayer(country, playerId);
  const nuclearThreat = !isPlayer && country?.has_nukes === true && relation < 20;

  return {
    role: isPlayer ? 'player' : isAlly ? 'ally' : atWar ? 'war' : relation > 50 ? 'friendly' : relation < 20 ? 'tense' : 'neutral',
    nuclearThreat,
    annexed: Boolean(country?.anexado || country?.destruido || country?.wasteland),
  };
}

export function renderMap(state, svg = typeof document !== 'undefined' ? document.querySelector('[data-war-map]') : null) {
  if (!svg?.querySelectorAll) return 0;

  const countries = new Map(getWorldCountries(state).map((country) => [normalizeId(country.id), country]));
  const playerId = normalizeId(state?.country?.id);
  if (state?.country) countries.set(playerId, state.country);
  const paths = [...svg.querySelectorAll('[data-map-country]')];
  const isWasteland = state?.is_wasteland === true;

  svg.classList?.toggle('map-fallout', isWasteland);
  svg.setAttribute?.('aria-disabled', String(isWasteland));

  for (const path of paths) {
    const countryId = normalizeId(path.id || path.dataset?.country);
    const country = countries.get(countryId) ?? { id: countryId, name: countryId };
    const visual = getMapCountryVisual(state, country);
    for (const role of ['player', 'ally', 'war', 'friendly', 'tense', 'neutral', 'annexed', 'nuclear-threat']) {
      path.classList?.toggle(`map-${role}`, role === visual.role || (role === 'annexed' && visual.annexed) || (role === 'nuclear-threat' && visual.nuclearThreat));
    }
    path.setAttribute?.('aria-label', `${country.name ?? country.nome ?? countryId}${visual.nuclearThreat ? ' - potencia nuclear em tensao' : ''}`);
    path.setAttribute?.('aria-disabled', String(isWasteland));
    path.setAttribute?.('data-map-country', '');
  }

  for (const marker of [...(svg.querySelectorAll('[data-radiation-marker]') ?? []), ...(svg.querySelectorAll('[data-vault-marker]') ?? [])]) {
    marker.hidden = !isWasteland;
  }
  return paths.length;
}

export function selectMapCountry(state, countryId) {
  return {
    ...state,
    ui: {
      ...(state.ui ?? {}),
      selectedMapCountryId: normalizeId(countryId),
    },
  };
}
