// Noticias do mundo: linha do tempo do que acontece fora do seu pais (anexacoes de rivais, coalizoes, pactos, contratos,
// corrida nuclear) e das suas acoes de peso. Gerada comparando o estado antes e depois de cada mes.
export const NEWS_LIMIT = 60;
export const NEWS_KINDS = Object.freeze({ annex: '⚔️', bloc: '🛡️', pact: '🤝', nuke: '☢️', contract: '💰', challenge: '🏆', territory: '🗺️', world: '🌍' });

export const createWorldNews = () => [];

export function normalizeWorldNews(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item.text === 'string' && item.text)
    .map((item) => ({
      month: Math.max(0, Math.floor(Number(item.month) || 0)),
      calendar: item.calendar && typeof item.calendar === 'object' ? { month: Number(item.calendar.month) || 1, year: Number(item.calendar.year) || 0 } : null,
      kind: NEWS_KINDS[item.kind] ? item.kind : 'world',
      text: String(item.text).slice(0, 240),
    }))
    .slice(0, NEWS_LIMIT);
}

export function pushWorldNews(state, text, kind = 'world') {
  const item = {
    month: Number(state.monthCounter) || 0,
    calendar: state.calendar ? { month: Number(state.calendar.month) || 1, year: Number(state.calendar.year) || 0 } : null,
    kind: NEWS_KINDS[kind] ? kind : 'world',
    text,
  };
  return { ...state, worldNews: [item, ...normalizeWorldNews(state.worldNews)].slice(0, NEWS_LIMIT) };
}

const contactsOf = (state) => state.geopolitics?.contacts ?? [];
const nameIn = (state, id) => contactsOf(state).find((item) => item.id === id)?.name ?? id;

// Compara dois estados e anota o que mudou no mundo.
export function recordWorldNews(prev, next) {
  if (!prev?.geopolitics || !next?.geopolitics || (Number(prev.monthCounter) || 0) === (Number(next.monthCounter) || 0)) return next;
  let out = next;
  const add = (text, kind) => { out = pushWorldNews(out, text, kind); };
  const before = prev.worldOrder ?? {};
  const after = next.worldOrder ?? {};
  const seen = new Set((before.annexations ?? []).map((item) => `${item.by}|${item.victim}|${item.month}`));
  for (const item of after.annexations ?? []) {
    if (seen.has(`${item.by}|${item.victim}|${item.month}`)) continue;
    add(`${nameIn(next, item.by)} anexou ${nameIn(next, item.victim)}.`, 'annex');
  }
  const oldBlocs = new Map((before.coalitions ?? []).map((item) => [item.id, item]));
  const newBlocs = new Map((after.coalitions ?? []).map((item) => [item.id, item]));
  for (const [id, bloc] of newBlocs) if (!oldBlocs.has(id)) add(bloc.player ? `Você fundou o ${bloc.name}.` : `Nasce a coalizão "${bloc.name}", com ${bloc.members.length} países.`, 'bloc');
  for (const [id, bloc] of oldBlocs) if (!newBlocs.has(id) && !bloc.player) add(`A coalizão "${bloc.name}" se desfez.`, 'bloc');
  if (!before.awake && after.awake) add('As potências acordaram: o mundo reage às suas anexações.', 'world');
  for (const id of Object.keys(after.pacts ?? {})) if (!before.pacts?.[id]) add(`Pacto de não agressão assinado com ${nameIn(next, id)}.`, 'pact');
  for (const id of Object.keys(before.pacts ?? {})) if (!after.pacts?.[id] && (after.broken ?? 0) > (before.broken ?? 0)) add(`O pacto com ${nameIn(next, id)} foi rompido.`, 'pact');
  if ((after.liberated ?? 0) > (before.liberated ?? 0)) add('Um país foi libertado do domínio de uma potência.', 'territory');
  const oldNukes = new Set(contactsOf(prev).filter((item) => item.has_nukes).map((item) => item.id));
  for (const item of contactsOf(next)) if (item.has_nukes && !oldNukes.has(item.id)) add(`${item.name} entrou para o clube atômico.`, 'nuke');
  const c0 = prev.contracts ?? {};
  const c1 = next.contracts ?? {};
  if ((c1.proxyWon ?? 0) > (c0.proxyWon ?? 0)) add('Um ataque encomendado por você deu certo e enfraqueceu o alvo.', 'contract');
  if ((c1.proxyLost ?? 0) > (c0.proxyLost ?? 0)) add('Um ataque encomendado por você fracassou.', 'contract');
  if ((c1.failed ?? 0) > (c0.failed ?? 0)) add('Você deixou vencer um contrato de guerra e ofendeu o contratante.', 'contract');
  return out;
}
