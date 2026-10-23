export const DIALOGUES = Object.freeze({
  doctor: Object.freeze([
    'A radiação está controlada, Senhor. Por enquanto.',
    'Faltam ligaduras no andar dois. Já improvisei algumas.',
    'Tenho feito horas extras no laboratório; os pacientes não podem esperar.',
  ]),
  engineer: Object.freeze([
    'O gerador aguenta, mas não gosto do ruído que está fazendo.',
    'Se me arranjar peças, consigo extrair mais energia desta máquina.',
    'Há um cabo queimado no corredor. Vou cuidar disso depois do turno.',
  ]),
  soldier: Object.freeze([
    'Área segura, Presidente. Estou mantendo os olhos abertos.',
    'Os rebeldes estão calmos hoje. Espero que continue assim.',
    'Armas limpas e prontas. Só precisamos de uma ordem.',
  ]),
  worker: Object.freeze([
    'Estou exausto. Um dia de descanso faria diferença.',
    'A comida hoje sabia a metal, mas pelo menos havia comida.',
    'Ainda acredito que podemos construir algo melhor aqui embaixo.',
  ]),
});

const ROLE_DIALOGUE = Object.freeze({
  doctor: 'doctor', medic: 'doctor',
  engineer: 'engineer',
  soldier: 'soldier', guard: 'soldier',
  worker: 'worker', resident: 'worker', scientist: 'worker',
});

export function chooseDialogueLine(npc, random = Math.random) {
  const key = ROLE_DIALOGUE[npc?.role] ?? 'worker';
  const lines = DIALOGUES[key];
  const value = Number(random());
  const index = Math.min(lines.length - 1, Math.max(0, Math.floor((Number.isFinite(value) ? value : 0) * lines.length)));
  return lines[index];
}

export function applyDialoguePacification(state, inhabitantId) {
  const currentDay = Math.max(1, Math.floor(Number(state.currentDay) || 1));
  const inhabitants = Array.isArray(state.inhabitants) ? state.inhabitants : [];
  const index = inhabitants.findIndex((npc) => npc.id === inhabitantId);
  if (index < 0) return { state, pacified: false };
  const npc = inhabitants[index];
  if (Math.max(0, Math.floor(Number(npc.lastTalkedDay) || 0)) >= currentDay) return { state, pacified: false };

  const nextNpc = {
    ...npc,
    loyalty: Math.min(100, Math.max(0, Number(npc.loyalty ?? 100)) + 15),
    revoltChance: Math.max(0, Math.min(100, Number(npc.revoltChance ?? 20) || 0) - 15),
    lastTalkedDay: currentDay,
    rebellionCheckDone: false,
  };
  const nextInhabitants = [...inhabitants];
  nextInhabitants[index] = nextNpc;
  return { state: { ...state, inhabitants: nextInhabitants }, pacified: true, npc: nextNpc };
}
