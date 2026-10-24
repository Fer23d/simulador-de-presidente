export const NEED_KEYS = Object.freeze(['satiety', 'rest', 'morale']);
export const NEED_CRITICAL_THRESHOLD = 30;
export const DORMITORY_BEDS_PER_LEVEL = 4;
export const NEED_LABELS = Object.freeze({ satiety: 'FOME', rest: 'CANSAÇO', morale: 'MORAL' });
export const NEED_ICONS = Object.freeze({ satiety: '🍖', rest: '💤', morale: '☹' });

const clampNeed = (value) => Math.max(0, Math.min(100, Math.round(Number(value))));

export function normalizeNeeds(value = {}) {
  return Object.fromEntries(NEED_KEYS.map((key) => [key,
    Number.isFinite(Number(value?.[key])) ? clampNeed(value[key]) : 100]));
}

export function getCriticalNeeds(needs) {
  const normalized = normalizeNeeds(needs);
  return NEED_KEYS.filter((key) => normalized[key] < NEED_CRITICAL_THRESHOLD);
}

export function getNeedsProductivityMultiplier(needs) {
  const { satiety, rest } = normalizeNeeds(needs);
  return (satiety < NEED_CRITICAL_THRESHOLD ? .7 : 1) * (rest < NEED_CRITICAL_THRESHOLD ? .8 : 1);
}

export function getNeedsSpeedMultiplier(needs) {
  return normalizeNeeds(needs).rest < NEED_CRITICAL_THRESHOLD ? .75 : 1;
}

export function countDormitoryBeds(grid) {
  return (grid ?? []).flat().reduce((total, room) => room?.type === 'dormitory'
    ? total + DORMITORY_BEDS_PER_LEVEL * Math.max(1, Math.floor(Number(room.level) || 1)) : total, 0);
}

// Avanco mensal: comida do estoque sacia, dormitorios recuperam o descanso e a moral reage a ambos.
export function advanceInhabitantNeeds(inhabitants = [], { fed = true, beds = 0, darkNights = false, stormPenalty = 0 } = {}) {
  const present = inhabitants.filter((inhabitant) => !inhabitant.is_on_expedition);
  const bedRatio = present.length ? Math.min(1, Math.max(0, Number(beds) || 0) / present.length) : 1;
  return inhabitants.map((inhabitant) => {
    if (inhabitant.is_on_expedition) return inhabitant;
    const needs = normalizeNeeds(inhabitant.needs);
    const working = !inhabitant.is_prisoner && Number.isInteger(inhabitant.workFloor) && Number.isInteger(inhabitant.workColumn);
    const satiety = clampNeed(needs.satiety + (fed ? 40 : -35));
    const rest = clampNeed(needs.rest - (working ? 30 : 10) + 10 + 30 * bedRatio);
    const hungry = satiety < NEED_CRITICAL_THRESHOLD;
    const exhausted = rest < NEED_CRITICAL_THRESHOLD;
    const morale = clampNeed(needs.morale + (hungry || exhausted ? 0 : 5)
      - (hungry ? 20 : 0) - (exhausted ? 15 : 0) - (darkNights ? 10 : 0) - Math.max(0, Number(stormPenalty) || 0));
    const loyalty = Math.max(0, Math.min(100, Number(inhabitant.loyalty ?? 100)
      - (morale < NEED_CRITICAL_THRESHOLD ? 10 : 0)));
    return { ...inhabitant, loyalty, needs: { satiety, rest, morale } };
  });
}
