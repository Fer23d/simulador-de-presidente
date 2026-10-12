function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function nuclearConsequence(state) {
  if (!Object.hasOwn(state.factions ?? {}, 'elite')) return state;
  return {
    ...state,
    factions: {
      ...state.factions,
      elite: clamp((Number(state.factions.elite) || 0) + 5, 0, 100),
    },
  };
}

export const STORY_EVENTS = Object.freeze([
  Object.freeze({
    id: 'first_nuke',
    trigger_condition: (state) => (state.unlocked_techs ?? []).includes('nuke'),
    title: 'O NASCIMENTO DE UM DEUS',
    text: 'Nos arquivos lacrados do programa nuclear, uma assinatura transforma a republica em uma ameaca que o mundo nao podera ignorar.',
    button_label: '[ COMPREENDIDO ]',
    action: nuclearConsequence,
  }),
  Object.freeze({
    id: 'first_slush_fund',
    trigger_condition: (state) => (Number(state.slush_fund) || 0) > 0,
    title: 'A PRIMEIRA CONTA',
    text: 'Um numero silencioso apareceu em uma ilha distante. O tesouro perdeu uma parte de si, e uma rota de fuga passou a existir.',
    button_label: '[ ARQUIVAR DOSSIÊ ]',
  }),
]);

export function getStoryEvent(storyId) {
  return STORY_EVENTS.find((story) => story.id === storyId) ?? null;
}

function hasBlockingDecision(state) {
  return Boolean(
    state.geopolitics?.peaceTreaty?.status === 'pending'
    || state.pendingEvent
    || state.pendingUnVote
    || state.pendingGlobalBid
    || state.pendingInterrogation
    || state.pendingFinalDilemma,
  );
}

export function checkStoryEvents(state) {
  if (state.pendingStory || hasBlockingDecision(state)) return state;
  const seenStories = Array.isArray(state.seen_stories) ? state.seen_stories : [];
  const story = STORY_EVENTS.find((candidate) => !seenStories.includes(candidate.id) && candidate.trigger_condition(state));
  if (!story) return state;

  return {
    ...state,
    pendingStory: true,
    currentStory: story.id,
    notice: `Dossie confidencial recebido: ${story.title}.`,
  };
}

export function dismissStory(state) {
  const story = state.pendingStory ? getStoryEvent(state.currentStory) : null;
  if (!story) return state;

  const afterAction = typeof story.action === 'function' ? story.action(state) : state;
  const seenStories = Array.isArray(afterAction.seen_stories) ? afterAction.seen_stories : [];
  return {
    ...afterAction,
    seen_stories: seenStories.includes(story.id) ? seenStories : [...seenStories, story.id],
    pendingStory: false,
    currentStory: null,
    notice: `Dossie arquivado: ${story.title}.`,
  };
}
