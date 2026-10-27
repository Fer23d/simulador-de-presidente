// Monta um Vault rico em salas e habitantes, usando somente os modulos do jogo (nada do jogo e alterado).
import { normalizeShelterGrid } from '../../../src/core/shelter_engine.js';

const LAYOUT = [
  [['vault', 1], ['generator', 2], ['generator', 2], ['generator', 3], ['presidential_suite', 1], ['office', 2]],
  [['dormitory', 2], ['greenhouse', 3], ['greenhouse', 2], ['medical', 2], ['laboratory', 3], ['life_support', 2]],
  [['dormitory', 1], ['arsenal', 2], ['radio', 1], ['detention', 1], ['greenhouse', 1], ['life_support', 1]],
  [['dormitory', 2], ['generator', 1], ['laboratory', 1], ['medical', 1], ['greenhouse', 2], ['dormitory', 1]],
  [['greenhouse', 1], ['arsenal', 1], ['dormitory', 1]],
];

export function buildVaultGrid() {
  const raw = Array.from({ length: 6 }, () => Array(7).fill(null));
  LAYOUT.forEach((row, floor) => {
    raw[floor][0] = { type: 'elevator', floor, column: 0, level: 1 };
    row.forEach(([type, level], index) => {
      const column = index + 1;
      raw[floor][column] = { id: `${type}-${floor}-${column}`, type, floor, column, level, operational: true };
    });
  });
  return normalizeShelterGrid(raw);
}

const ROLE_BY_ROOM = {
  generator: 'engineer', greenhouse: 'scientist', laboratory: 'scientist', medical: 'medic', arsenal: 'guard',
  office: 'guard', radio: 'engineer', dormitory: 'resident', vault: 'resident', life_support: 'engineer',
  presidential_suite: 'guard', detention: 'resident',
};

export function buildInhabitants(grid) {
  const people = [];
  let index = 0;
  for (const room of grid.flat()) {
    if (!room || ['elevator'].includes(room.type)) continue;
    const role = ROLE_BY_ROOM[room.type] ?? 'resident';
    const count = room.type === 'presidential_suite' ? 1 : room.type === 'detention' ? 1 : 2;
    for (let slot = 0; slot < count; slot++) {
      index++;
      const walking = index % 3 === 0;
      const offsetX = slot === 0 ? -70 + (index % 4) * 6 : 62 - (index % 3) * 8;
      people.push({
        id: `npc-${index}`, floor: room.floor, column: room.column, offsetX, role,
        pose: ['generator', 'greenhouse', 'laboratory', 'medical', 'radio'].includes(room.type) ? 'working' : 'idle',
        facing: slot === 0 ? 1 : -1,
        currentState: walking ? (slot === 0 ? 'walking_right' : 'walking_left') : 'idle',
        loyalty: 90, needs: { satiety: 90, rest: 85, morale: 80 },
        is_prisoner: room.type === 'detention', state: room.type === 'detention' ? 'imprisoned' : 'working',
        isVIP: false, name: 'Habitante',
      });
    }
  }
  const lab = people.find((npc) => grid[npc.floor][npc.column]?.type === 'laboratory');
  if (lab) Object.assign(lab, { isVIP: true, name: 'Dr. Isaac', role: 'scientist' });
  const tired = people.filter((npc) => grid[npc.floor][npc.column]?.type === 'generator').slice(0, 1);
  tired.forEach((npc) => { npc.needs = { satiety: 20, rest: 15, morale: 45 }; });
  const rebel = people.find((npc) => grid[npc.floor][npc.column]?.type === 'radio');
  if (rebel) Object.assign(rebel, { currentState: 'rebel', loyalty: 0 });
  return people;
}
