const STORY_NOTICE = '[ NOVO CAPÍTULO ADICIONADO AO MODO HISTÓRIA ]';

export const LORE_CHAPTERS = Object.freeze({
  cap_1_origem: Object.freeze({
    id: 'cap_1_origem',
    title: 'CAPÍTULO I: A Herança das Cinzas',
    text: 'Quando o antigo governo fugiu como cobardes, deixaram-me um país em chamas e cofres vazios. A comunidade internacional riu de nós. Eles chamam-me de Presidente interino. Tolos. Eu sou a tempestade que eles próprios criaram. A partir deste ecrã, reescreverei o mapa do mundo.',
  }),
  cap_2_corrupcao: Object.freeze({
    id: 'cap_2_corrupcao',
    title: 'CAPÍTULO II: O Preço do Poder',
    text: 'A moralidade é uma corrente que prende os fracos. Hoje, desviei os primeiros fundos para a escuridão. O povo aplaude as estradas que construo, sem saber que cada bloco de asfalto é cimentado com o dinheiro que lhes roubo. O Estado Profundo nasceu.',
  }),
  cap_3_guerra: Object.freeze({
    id: 'cap_3_guerra',
    title: 'CAPÍTULO III: O Gosto do Sangue',
    text: 'Ordenei o avanço das tropas. A História não é escrita pelos pacíficos, é escrita pelos sobreviventes. Quando a primeira capital inimiga cair, o mundo deixará de rir de nós e começará a temer-nos.',
  }),
  cap_4_imperio: Object.freeze({
    id: 'cap_4_imperio',
    title: 'CAPÍTULO IV: A Coroa de Ferro',
    text: 'A República era uma ilusão patética. Hoje, dissolvi o Congresso. O título de Presidente era demasiado pequeno para o meu destino. Ajoelhem-se perante o Novo Império. A era da diplomacia acabou; começou a era da obediência.',
  }),
  cap_5_wasteland: Object.freeze({
    id: 'cap_5_wasteland',
    title: 'CAPÍTULO V: O Deus das Cinzas',
    text: 'Os céus arderam. A ONU, as superpotências, as leis... tudo virou pó radioativo. Da segurança deste Bunker, ouço os gritos do velho mundo a morrer. Eles destruíram o planeta, mas eu sobrevivi. Serei o Arquiteto do que sobrar.',
  }),
});

const STORY_ORDER = Object.freeze([
  'cap_1_origem',
  'cap_2_corrupcao',
  'cap_3_guerra',
  'cap_4_imperio',
  'cap_5_wasteland',
]);

function hasWarMilestone(state) {
  return Boolean(
    state.history_log?.some((entry) => entry.type === 'guerra')
      || state.geopolitics?.contacts?.some((contact) => contact.atWar),
  );
}

function getUnlockedChapters(state) {
  const known = Array.isArray(state.unlocked_chapters) ? state.unlocked_chapters : [];
  const valid = known.filter((id) => Object.hasOwn(LORE_CHAPTERS, id));
  return valid.includes('cap_1_origem') ? valid : ['cap_1_origem', ...valid];
}

function isChapterReady(state, chapterId) {
  if (chapterId === 'cap_1_origem') return true;
  if (chapterId === 'cap_2_corrupcao') return Number(state.slush_fund) > 0;
  if (chapterId === 'cap_3_guerra') return hasWarMilestone(state);
  if (chapterId === 'cap_4_imperio') return state.government === 'empire';
  if (chapterId === 'cap_5_wasteland') return state.is_wasteland === true;
  return false;
}

export function getLoreChapter(chapterId) {
  return LORE_CHAPTERS[chapterId] ?? null;
}

export function checkStoryChapters(state) {
  const unlockedChapters = getUnlockedChapters(state);
  const newChapters = STORY_ORDER.filter((chapterId) => (
    !unlockedChapters.includes(chapterId) && isChapterReady(state, chapterId)
  ));

  if (!newChapters.length && unlockedChapters.length === (state.unlocked_chapters ?? []).length) {
    return state;
  }

  return {
    ...state,
    unlocked_chapters: [...unlockedChapters, ...newChapters],
    notice: newChapters.length ? STORY_NOTICE : state.notice,
    story_notice: newChapters.length ? STORY_NOTICE : state.story_notice,
  };
}

export { STORY_NOTICE };
