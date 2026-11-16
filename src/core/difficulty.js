// Dificuldade da partida (fica no perfil do jogador): ajusta a agressividade do mundo e o preco da diplomacia.
export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Fácil', text: 'Rivais anexam e atacam menos, pactos são aceitos com mais facilidade e contratos pagam mais.', rival: 0.6, formation: 0.6, attack: 0.6, pact: 1.2, reward: 1.25 }),
  normal: Object.freeze({ id: 'normal', label: 'Normal', text: 'O equilíbrio pensado para a primeira partida.', rival: 1, formation: 1, attack: 1, pact: 1, reward: 1 }),
  hard: Object.freeze({ id: 'hard', label: 'Difícil', text: 'Rivais anexam e atacam mais, coalizões surgem mais cedo, pactos são mais difíceis e contratos pagam menos.', rival: 1.5, formation: 1.5, attack: 1.5, pact: 0.8, reward: 0.85 }),
});
export const DIFFICULTY_LIST = Object.freeze(Object.values(DIFFICULTIES));

export const normalizeDifficulty = (value) => (DIFFICULTIES[value] ? value : 'normal');

export function getDifficulty(state) {
  return DIFFICULTIES[normalizeDifficulty(state?.playerProfile?.difficulty)];
}
