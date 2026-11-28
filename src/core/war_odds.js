// Probabilidades exatas do combate do War (mesma regra de resolveBattleRound): o atacante rola de 1 a 3 dados, o defensor
// de 1 a 2, comparam-se os maiores pares, o empate favorece a defesa e a fortificacao soma +1 no melhor dado da defesa.
const outcomeCache = new Map();
const MAX_TROOPS = 80;

export function clampDice(count, attacking = 3) {
  const wanted = count === null || count === undefined || count === '' ? 3 : Math.floor(Number(count));
  const base = Number.isFinite(wanted) ? wanted : 3;
  return Math.max(1, Math.min(3, Math.max(1, Math.floor(Number(attacking) || 1)), base));
}

const faces = (diceCount) => {
  let rolls = [[]];
  for (let i = 0; i < diceCount; i += 1) rolls = rolls.flatMap((roll) => [1, 2, 3, 4, 5, 6].map((face) => [...roll, face]));
  return rolls.map((roll) => roll.sort((a, b) => b - a));
};

// Todas as combinacoes de dados -> [{ attackerLosses, defenderLosses, p }].
export function roundOutcomes(attackDice, defenseDice, fortified = false) {
  const key = `${attackDice}-${defenseDice}-${fortified ? 1 : 0}`;
  if (outcomeCache.has(key)) return outcomeCache.get(key);
  const attackRolls = faces(attackDice);
  const defenseRolls = faces(defenseDice).map((roll) => (fortified ? roll.map((die, index) => (index === 0 ? Math.min(6, die + 1) : die)).sort((a, b) => b - a) : roll));
  const total = attackRolls.length * defenseRolls.length;
  const counts = new Map();
  for (const attack of attackRolls) {
    for (const defense of defenseRolls) {
      let attackerLosses = 0;
      let defenderLosses = 0;
      for (let i = 0; i < Math.min(attack.length, defense.length); i += 1) {
        if (attack[i] > defense[i]) defenderLosses += 1; else attackerLosses += 1;
      }
      const id = `${attackerLosses}|${defenderLosses}`;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  const result = [...counts.entries()].map(([id, n]) => { const [a, d] = id.split('|').map(Number); return { attackerLosses: a, defenderLosses: d, p: n / total }; }).sort((x, y) => y.p - x.p);
  outcomeCache.set(key, result);
  return result;
}

// Chance de conquistar lutando ate o fim e perdas medias, com `diceCount` dados de ataque em cada rodada.
export function getBattleOdds({ attacking, defending, fortified = false, diceCount = 3 }) {
  const A = Math.max(0, Math.min(MAX_TROOPS, Math.floor(Number(attacking) || 0)));
  const D = Math.max(0, Math.min(MAX_TROOPS, Math.floor(Number(defending) || 0)));
  const table = Array.from({ length: A + 1 }, () => Array.from({ length: D + 1 }, () => null));
  for (let a = 0; a <= A; a += 1) {
    for (let d = 0; d <= D; d += 1) {
      if (d === 0) { table[a][d] = { win: 1, lossA: 0, lossD: 0, survivors: a }; continue; }
      if (a === 0) { table[a][d] = { win: 0, lossA: 0, lossD: 0, survivors: 0 }; continue; }
      let win = 0; let lossA = 0; let lossD = 0; let survivors = 0;
      for (const o of roundOutcomes(clampDice(diceCount, a), Math.min(2, d), fortified)) {
        const next = table[a - o.attackerLosses][d - o.defenderLosses];
        win += o.p * next.win;
        lossA += o.p * (o.attackerLosses + next.lossA);
        lossD += o.p * (o.defenderLosses + next.lossD);
        survivors += o.p * next.survivors;
      }
      table[a][d] = { win, lossA, lossD, survivors };
    }
  }
  const end = table[A][D];
  const first = A > 0 && D > 0 ? roundOutcomes(clampDice(diceCount, A), Math.min(2, D), fortified) : [];
  return {
    win: end.win,
    expectedAttackerLosses: end.lossA,
    expectedDefenderLosses: end.lossD,
    expectedSurvivors: end.win > 0 ? end.survivors / end.win : 0,
    dice: A > 0 ? clampDice(diceCount, A) : 0,
    round: first,
  };
}
