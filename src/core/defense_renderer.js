import { WORLD_TOP } from './shelter_engine.js';
import { formatDuration } from './oil.js';
import { getFortStatus } from './defense.js';
import { drawActorSprite } from './sprite_engine.js';
import { gradeStructure, hash, linear, paintBackdrop } from './art.js';

// O Forte fica a esquerda do campo de petroleo, guardando a entrada do Vault.
export const FORT_X = 150;
const GROUND_Y = WORLD_TOP - 30;
// Mesma altura dos personagens dentro do Vault, para os soldados da superficie terem a mesma escala.
const SOLDIER_HEIGHT = 74;
const HALF_WIDTH = 132;
const STRUCTURE_HEIGHT = 214;

export function getFortRect() {
  return { x: FORT_X - HALF_WIDTH, y: GROUND_Y - 192, width: HALF_WIDTH * 2, height: 200, centerX: FORT_X, groundY: GROUND_Y };
}

export function isFortAt(worldX, worldY) {
  const rect = getFortRect();
  return worldX >= rect.x && worldX <= rect.x + rect.width && worldY >= rect.y && worldY <= rect.y + rect.height;
}

// ---------- Materiais ----------

function sandbag(ctx, x, y, width, height, seed) {
  const tone = hash(x, y, seed);
  const base = [148 + tone * 22, 124 + tone * 18, 82 + tone * 14].map(Math.round);
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, .35)';
  ctx.beginPath();
  ctx.ellipse(x + width / 2 + 2, y + height - 1, width / 2, height * .28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 4, y + height * .15);
  ctx.quadraticCurveTo(x + width / 2, y - height * .22, x + width - 4, y + height * .15);
  ctx.quadraticCurveTo(x + width + 2, y + height * .55, x + width - 4, y + height * .95);
  ctx.quadraticCurveTo(x + width / 2, y + height * 1.12, x + 4, y + height * .95);
  ctx.quadraticCurveTo(x - 2, y + height * .55, x + 4, y + height * .15);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, x, y, x + width * .3, y + height, [
    [0, `rgb(${base.map((channel) => Math.min(255, channel + 38)).join(',')})`],
    [.45, `rgb(${base.join(',')})`],
    [1, `rgb(${base.map((channel) => Math.round(channel * .48)).join(',')})`],
  ]);
  ctx.fill();
  ctx.clip();
  // Trama de juta e manchas de terra.
  for (let index = 0; index < width * height / 9; index++) {
    const px = x + hash(index, x, seed) * width;
    const py = y + hash(y, index, seed + 1) * height;
    ctx.fillStyle = hash(px, py) > .5 ? 'rgba(255, 240, 200, .14)' : 'rgba(40, 25, 10, .2)';
    ctx.fillRect(px, py, 1.2, 1.2);
  }
  ctx.strokeStyle = 'rgba(60, 40, 18, .55)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(x + width - 7, y + 2);
  ctx.quadraticCurveTo(x + width - 4, y + height / 2, x + width - 7, y + height - 1);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function sandbagWall(ctx, left, right, groundY, rows, seed = 0) {
  const bagW = 30;
  const bagH = 13;
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 ? bagW / 2 : 0;
    const inset = row * 3;
    for (let x = left + inset + offset - (row % 2 ? bagW : 0); x < right - inset; x += bagW - 3) {
      if (x + bagW < left + inset - 4) continue;
      sandbag(ctx, Math.max(left + inset - 6, x), groundY - (row + 1) * (bagH - 2), bagW, bagH, seed + row * 13);
    }
  }
  return rows * (bagH - 2);
}

function timber(ctx, x0, y0, x1, y1, thickness, seed) {
  const angle = Math.atan2(y1 - y0, x1 - x0);
  const length = Math.hypot(x1 - x0, y1 - y0);
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(angle);
  ctx.fillStyle = linear(ctx, 0, -thickness / 2, 0, thickness / 2, [[0, '#8a6440'], [.35, '#6b4a2c'], [1, '#2e1d0f']]);
  ctx.fillRect(0, -thickness / 2, length, thickness);
  ctx.strokeStyle = 'rgba(30, 18, 8, .45)';
  ctx.lineWidth = .8;
  for (let line = 0; line < 3; line++) {
    const y = -thickness / 2 + (line + 1) * thickness / 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let step = 0; step <= length; step += 8) ctx.lineTo(step, y + (hash(step, line, seed) - .5) * 1.2);
    ctx.stroke();
  }
  ctx.restore();
}

function tinRoof(ctx, x, y, width, height) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - 8, y + height);
  ctx.lineTo(x + width / 2, y);
  ctx.lineTo(x + width + 8, y + height);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, x, y, x + width, y + height, [[0, '#8f8a80'], [.4, '#6d5a48'], [1, '#3b2c22']]);
  ctx.fill();
  ctx.clip();
  // Ondulacoes da chapa e escorrido de ferrugem.
  for (let rib = x - 8; rib < x + width + 8; rib += 4) {
    ctx.fillStyle = 'rgba(255, 255, 255, .08)';
    ctx.fillRect(rib, y, 1.5, height);
    ctx.fillStyle = 'rgba(0, 0, 0, .18)';
    ctx.fillRect(rib + 2, y, 1, height);
  }
  for (let streak = 0; streak < 7; streak++) {
    const sx = x + hash(streak, 3) * width;
    ctx.fillStyle = 'rgba(150, 70, 20, .35)';
    ctx.fillRect(sx, y + height * .3, 2, height * .7);
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(0, 0, 0, .35)';
  ctx.fillRect(x - 6, y + height, width + 12, 3);
}

function watchtower(ctx, x, groundY, height, seed, { armored = false } = {}) {
  const platformY = groundY - height;
  const halfBase = 20;
  const halfTop = 14;
  ctx.fillStyle = 'rgba(0, 0, 0, .3)';
  ctx.beginPath();
  ctx.ellipse(x + 6, groundY, 30, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pernas de tras mais escuras, depois travamentos em X, depois pernas da frente.
  ctx.globalAlpha = .65;
  timber(ctx, x - halfBase + 8, groundY, x - halfTop + 6, platformY, 5, seed);
  timber(ctx, x + halfBase - 8, groundY, x + halfTop - 6, platformY, 5, seed + 1);
  ctx.globalAlpha = 1;
  for (let level = 0; level < 3; level++) {
    const y0 = groundY - level * height / 3;
    const y1 = groundY - (level + 1) * height / 3;
    const w0 = halfBase - (halfBase - halfTop) * level / 3;
    const w1 = halfBase - (halfBase - halfTop) * (level + 1) / 3;
    timber(ctx, x - w0, y0, x + w1, y1, 3, seed + level);
    timber(ctx, x + w0, y0, x - w1, y1, 3, seed + level + 5);
  }
  timber(ctx, x - halfBase, groundY, x - halfTop, platformY, 7, seed + 2);
  timber(ctx, x + halfBase, groundY, x + halfTop, platformY, 7, seed + 3);
  // Plataforma de tabuas.
  ctx.fillStyle = linear(ctx, 0, platformY - 4, 0, platformY + 6, [[0, '#9a7650'], [1, '#3b2814']]);
  ctx.fillRect(x - 26, platformY - 4, 52, 9);
  ctx.strokeStyle = 'rgba(30, 18, 8, .5)';
  for (let plank = x - 26; plank < x + 26; plank += 7) {
    ctx.beginPath(); ctx.moveTo(plank, platformY - 4); ctx.lineTo(plank, platformY + 5); ctx.stroke();
  }
  return { platformY, roof: () => {
    timber(ctx, x - 24, platformY - 4, x - 24, platformY - 58, 4, seed + 7);
    timber(ctx, x + 24, platformY - 4, x + 24, platformY - 58, 4, seed + 8);
    tinRoof(ctx, x - 30, platformY - 76, 60, 20);
  } };
}

// Parapeito da guarita: fica na camada da frente para o vigia aparecer atras dele.
function towerParapet(ctx, x, platformY, seed, armored) {
  if (armored) {
      ctx.fillStyle = linear(ctx, x - 26, 0, x + 26, 0, [[0, '#7c8288'], [.5, '#4a5056'], [1, '#262a2e']]);
      ctx.fillRect(x - 26, platformY - 26, 52, 22);
      ctx.fillStyle = 'rgba(255, 255, 255, .5)';
      for (let rivet = x - 22; rivet < x + 26; rivet += 9) { ctx.fillRect(rivet, platformY - 23, 1.5, 1.5); ctx.fillRect(rivet, platformY - 8, 1.5, 1.5); }
    } else {
      sandbag(ctx, x - 28, platformY - 15, 20, 11, seed);
      sandbag(ctx, x - 10, platformY - 15, 20, 11, seed + 1);
      sandbag(ctx, x + 8, platformY - 15, 20, 11, seed + 2);
  }
}

function concreteWall(ctx, left, right, groundY, height, seed, steel = false) {
  const top = groundY - height;
  ctx.fillStyle = 'rgba(0, 0, 0, .35)';
  ctx.fillRect(left + 4, groundY - 3, right - left, 6);
  const slab = steel ? 34 : 40;
  for (let x = left; x < right; x += slab) {
    const width = Math.min(slab, right - x) - 2;
    ctx.fillStyle = steel
      ? linear(ctx, x, top, x + width, groundY, [[0, '#8d949a'], [.25, '#5f666c'], [.7, '#41474c'], [1, '#22262a']])
      : linear(ctx, x, top, x + width * .4, groundY, [[0, '#a9a294'], [.5, '#7f786b'], [1, '#4a453c']]);
    ctx.fillRect(x, top, width, height);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, top, width, height); ctx.clip();
    for (let index = 0; index < width * height / 7; index++) {
      const px = x + hash(index, x, seed) * width;
      const py = top + hash(x, index, seed + 2) * height;
      ctx.fillStyle = hash(px, py, seed) > .5 ? 'rgba(255, 255, 255, .07)' : 'rgba(0, 0, 0, .14)';
      ctx.fillRect(px, py, 1.3, 1.3);
    }
    if (steel) {
      ctx.fillStyle = 'rgba(255, 255, 255, .55)';
      for (let rivet = top + 5; rivet < groundY; rivet += 10) { ctx.fillRect(x + 3, rivet, 2, 2); ctx.fillRect(x + width - 5, rivet, 2, 2); }
      ctx.fillStyle = 'rgba(120, 55, 20, .4)';
      ctx.fillRect(x + width * hash(x, 9), top + height * .3, 3, height * .7);
    } else {
      // Rachaduras e escorrido de umidade.
      ctx.strokeStyle = 'rgba(30, 25, 20, .55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      let cx = x + hash(x, 1, seed) * width;
      let cy = top + 3;
      ctx.moveTo(cx, cy);
      for (let step = 0; step < 6; step++) { cx += (hash(step, x) - .5) * 8; cy += height / 7; ctx.lineTo(cx, cy); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(40, 35, 25, .25)';
      ctx.fillRect(x + width * hash(x, 4), top, 4, height * .6);
    }
    ctx.restore();
  }
  // Faixa de alerta gasta no aco.
  if (steel) {
    ctx.save();
    ctx.beginPath(); ctx.rect(left, top + 4, right - left, 7); ctx.clip();
    for (let x = left - 10; x < right; x += 14) {
      ctx.fillStyle = 'rgba(230, 180, 40, .85)';
      ctx.beginPath(); ctx.moveTo(x, top + 11); ctx.lineTo(x + 7, top + 4); ctx.lineTo(x + 14, top + 4); ctx.lineTo(x + 7, top + 11); ctx.fill();
    }
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(255, 255, 255, .18)';
  ctx.fillRect(left, top, right - left, 2);
  return height;
}

function barbedWire(ctx, left, right, y) {
  ctx.save();
  ctx.lineWidth = 1;
  for (let x = left; x < right; x += 9) {
    ctx.strokeStyle = 'rgba(30, 30, 30, .85)';
    ctx.beginPath(); ctx.ellipse(x, y - 7, 6, 7, .3, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(210, 200, 180, .45)';
    ctx.beginPath(); ctx.ellipse(x, y - 7, 6, 7, .3, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
  }
  for (let x = left; x < right; x += 30) timber(ctx, x, y, x + 2, y - 18, 2.5, x);
  ctx.restore();
}

function machineGun(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = '#1b1d1f';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x - 7, y); ctx.moveTo(x, y - 9); ctx.lineTo(x + 6, y); ctx.stroke();
  ctx.fillStyle = linear(ctx, 0, y - 15, 0, y - 7, [[0, '#6d7277'], [1, '#202326']]);
  ctx.fillRect(x - 10, y - 15, 18, 7);
  ctx.fillStyle = '#16181a';
  ctx.fillRect(x + 8, y - 13, 18, 3);
  ctx.fillStyle = '#3e4a2e';
  ctx.fillRect(x - 9, y - 9, 8, 6);
  ctx.fillStyle = 'rgba(255, 255, 255, .25)';
  ctx.fillRect(x - 10, y - 15, 18, 1);
  ctx.restore();
}

function howitzer(ctx, x, groundY) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, .35)';
  ctx.beginPath(); ctx.ellipse(x, groundY, 34, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(x + 4, groundY - 26);
  ctx.rotate(-.42);
  ctx.fillStyle = linear(ctx, 0, -5, 0, 5, [[0, '#7b8460'], [1, '#2c301f']]);
  ctx.fillRect(0, -5, 62, 10);
  ctx.fillStyle = '#23261a';
  ctx.fillRect(58, -6, 8, 12);
  ctx.restore();
  ctx.fillStyle = linear(ctx, x - 22, 0, x + 22, 0, [[0, '#6c7553'], [1, '#2f3423']]);
  ctx.beginPath(); ctx.moveTo(x - 20, groundY - 40); ctx.lineTo(x + 18, groundY - 46); ctx.lineTo(x + 20, groundY - 18); ctx.lineTo(x - 22, groundY - 16); ctx.fill();
  for (const wx of [x - 16, x + 14]) {
    ctx.fillStyle = '#1c1c18';
    ctx.beginPath(); ctx.arc(wx, groundY - 10, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#55584a';
    ctx.beginPath(); ctx.arc(wx, groundY - 10, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------- Estrutura pre-renderizada por nivel ----------

const structureCache = new Map();
const TOWER_X = [-96, 104];

function towerCount(level) { return level >= 2 ? 2 : 1; }

function wallHeight(level) {
  return level >= 4 ? 58 : level >= 3 ? 50 : (level + 2) * 11;
}

// Desenha a estrutura estatica numa tela propria, com granulado e o tom quente do por do sol do Ermo.
function getFortStructure(level, layer) {
  const key = `${level}:${layer}`;
  if (structureCache.has(key)) return structureCache.get(key);
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = HALF_WIDTH * 2 + 40;
  canvas.height = STRUCTURE_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, STRUCTURE_HEIGHT - 6);
  const towers = TOWER_X.slice(0, towerCount(level));
  if (layer === 'back') {
    // Atras dos soldados: torres, artilharia e a sombra no chao.
    ctx.fillStyle = 'rgba(0, 0, 0, .28)';
    ctx.beginPath(); ctx.ellipse(10, 2, HALF_WIDTH + 10, 8, 0, 0, Math.PI * 2); ctx.fill();
    towers.forEach((x, index) => {
      const tower = watchtower(ctx, x, 0, 104 + index * 6, index * 31 + level, { armored: level >= 4 });
      tower.roof();
    });
    if (level >= 5) howitzer(ctx, -30, -wallHeight(level) + 30);
  } else {
    // Na frente dos soldados: muralha, metralhadoras e arame.
    const left = -70;
    const right = 82;
    let height;
    if (level >= 3) {
      height = concreteWall(ctx, left, right, 0, wallHeight(level), level, level >= 4);
      sandbagWall(ctx, left + 6, right - 6, -height + 11, 1, level * 7);
    } else height = sandbagWall(ctx, left, right, 0, level + 2, level * 7);
    if (level >= 2) barbedWire(ctx, -HALF_WIDTH + 4, HALF_WIDTH - 2, 2);
    towers.forEach((x, index) => towerParapet(ctx, x, -(104 + index * 6), index * 31 + level, level >= 4));
  }
  gradeStructure(canvas, level);
  structureCache.set(key, canvas);
  return canvas;
}

function drawStructureLayer(ctx, centerX, groundY, level, layer) {
  const canvas = getFortStructure(level, layer);
  if (canvas) ctx.drawImage(canvas, centerX - canvas.width / 2, groundY - STRUCTURE_HEIGHT + 6);
}

function flag(ctx, x, groundY, height, color, time) {
  timber(ctx, x, groundY, x, groundY - height, 2.5, 99);
  ctx.save();
  const top = groundY - height + 2;
  ctx.beginPath();
  // O vento sopra para a esquerda, para longe da muralha.
  ctx.moveTo(x - 1, top);
  for (let step = 0; step <= 26; step += 2) ctx.lineTo(x - 1 - step, top + Math.sin(time / 260 + step / 6) * 2.5 * step / 26);
  for (let step = 26; step >= 0; step -= 2) ctx.lineTo(x - 1 - step, top + 16 + Math.sin(time / 260 + step / 6) * 2.5 * step / 26);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, x, top, x - 26, top + 16, [[0, color], [1, 'rgba(0, 0, 0, .55)']]);
  ctx.fill();
  ctx.restore();
}

function searchlight(ctx, x, y, time) {
  const angle = Math.sin(time / 1_600) * .35 + .3;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gradient = ctx.createRadialGradient(x, y, 2, x, y, 170);
  gradient.addColorStop(0, 'rgba(255, 240, 190, .35)');
  gradient.addColorStop(1, 'rgba(255, 240, 190, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle - .09) * 170, y + Math.sin(angle - .09) * 170);
  ctx.lineTo(x + Math.cos(angle + .09) * 170, y + Math.sin(angle + .09) * 170);
  ctx.fill();
  ctx.restore();
}

// Soldados do Vault (mesmo sprite de guarda dos andares) postados atras da muralha e nas torres.
function garrisonSoldiers(ctx, centerX, groundY, level, garrison, time, soldierImage) {
  if (!soldierImage || garrison <= 0) return;
  const wall = wallHeight(level);
  const onWall = Math.min(4, Math.ceil(garrison / 40));
  for (let index = 0; index < onWall; index++) {
    const x = centerX - 46 + index * 38;
    // Em pe num degrau atras do muro: so o tronco aparece por cima dos sacos.
    drawActorSprite(ctx, { role: 'guard', x, y: groundY - wall * .45, facing: index % 2 ? -1 : 1, currentState: 'idle' },
      soldierImage, time + index * 300, { height: SOLDIER_HEIGHT });
  }
  // Vigias nas plataformas das torres.
  TOWER_X.slice(0, towerCount(level)).forEach((offset, index) => {
    if (garrison < 10 * (index + 1)) return;
    drawActorSprite(ctx, { role: 'guard', x: centerX + offset, y: groundY - 104 - index * 6 - 2, facing: index ? -1 : 1, currentState: 'idle' },
      soldierImage, time, { height: SOLDIER_HEIGHT * .7 });
  });
}

// Desenha o Forte no nivel ativo, com os soldados da guarnicao entre a estrutura de tras e a muralha.
export function drawFort(ctx, centerX, groundY, { level = 1, turrets = 1, garrison = 0, time = 0, night = false, firing = false, soldierImage = null } = {}) {
  ctx.save();
  drawStructureLayer(ctx, centerX, groundY, level, 'back');
  if (level >= 3 && night) TOWER_X.slice(0, towerCount(level)).forEach((offset, index) => searchlight(ctx, centerX + offset + 6, groundY - 150 - index * 6, time + index * 900));
  garrisonSoldiers(ctx, centerX, groundY, level, garrison, time, soldierImage);
  drawStructureLayer(ctx, centerX, groundY, level, 'front');
  const wall = wallHeight(level);
  const shown = Math.min(6, turrets);
  for (let index = 0; index < shown; index++) {
    const x = centerX - 62 + index * (shown > 1 ? 124 / (shown - 1) : 0) + (shown === 1 ? 40 : 0);
    machineGun(ctx, x, groundY - wall + 2);
    if (firing && Math.sin(time / 45 + index * 2.3) > .55) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255, 220, 120, .9)';
      ctx.beginPath(); ctx.arc(x + 28, groundY - wall - 9, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  flag(ctx, centerX - 66, groundY - wall + 4, 50, level >= 5 ? '#e0a020' : '#9c3a26', time);
  ctx.fillStyle = 'rgba(10, 8, 6, .85)';
  ctx.fillRect(centerX - HALF_WIDTH + 2, groundY - 4, 24, 15);
  ctx.fillStyle = '#ffcf7a';
  ctx.font = 'bold 10px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`N${level}`, centerX - HALF_WIDTH + 14, groundY + 8);
  ctx.restore();
}

function drawEmptyFortPlot(ctx, centerX, groundY, time) {
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = `rgba(255, 120, 80, ${.45 + Math.sin(time / 300) * .25})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(centerX - 110, groundY - 84, 220, 82);
  ctx.setLineDash([]);
  sandbag(ctx, centerX - 90, groundY - 12, 30, 13, 1);
  sandbag(ctx, centerX - 63, groundY - 12, 30, 13, 2);
  sandbag(ctx, centerX - 77, groundY - 23, 30, 13, 3);
  timber(ctx, centerX + 30, groundY, centerX + 30, groundY - 58, 5, 4);
  ctx.fillStyle = linear(ctx, 0, groundY - 70, 0, groundY - 44, [[0, '#d8b46a'], [1, '#9c7a3a']]);
  ctx.fillRect(centerX - 6, groundY - 70, 72, 26);
  ctx.strokeStyle = '#3a2410';
  ctx.strokeRect(centerX - 6, groundY - 70, 72, 26);
  ctx.fillStyle = '#2a1608';
  ctx.font = 'bold 10px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ERGUER', centerX + 30, groundY - 59);
  ctx.fillText('FORTE', centerX + 30, groundY - 48);
  ctx.restore();
}

function drawFortScaffold(ctx, centerX, groundY, time) {
  ctx.save();
  for (const x of [centerX - 100, centerX - 34, centerX + 34, centerX + 100]) timber(ctx, x, groundY, x, groundY - 110, 3, x);
  for (const y of [groundY - 38, groundY - 74, groundY - 110]) timber(ctx, centerX - 104, y, centerX + 104, y, 3, y);
  timber(ctx, centerX - 100, groundY, centerX - 34, groundY - 74, 2, 5);
  timber(ctx, centerX + 34, groundY, centerX + 100, groundY - 74, 2, 6);
  if (Math.sin(time / 90) > .3) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#fff3a0';
    ctx.beginPath(); ctx.arc(centerX + Math.sin(time / 37) * 40, groundY - 60 + Math.cos(time / 53) * 8, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function renderFort(ctx, fort, { time = 0, now = Date.now(), night = false, soldierImage = null } = {}) {
  const { centerX, groundY } = getFortRect();
  const status = getFortStatus(fort, now);
  if (!status) { drawEmptyFortPlot(ctx, centerX, groundY, time); return; }
  if (status.activeLevel >= 1) {
    drawFort(ctx, centerX, groundY, { level: status.activeLevel, turrets: status.turrets, garrison: status.garrison, time, night, soldierImage });
  } else sandbagWall(ctx, centerX - 60, centerX + 20, groundY, 1, 3);
  if (status.upgrading) drawFortScaffold(ctx, centerX, groundY, time);
}

export function renderFortOverlay(ctx, fort, { now = Date.now() } = {}) {
  const status = getFortStatus(fort, now);
  if (!status?.upgrading) return;
  const { centerX, groundY } = getFortRect();
  const y = groundY - 128;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0, 0, 0, .78)';
  ctx.fillRect(centerX - 60, y - 16, 120, 30);
  ctx.fillStyle = '#3a2a10';
  ctx.fillRect(centerX - 54, y + 2, 108, 7);
  ctx.fillStyle = '#ff7a4a';
  ctx.fillRect(centerX - 54, y + 2, 108 * Math.max(0, Math.min(1, status.upgradeProgress)), 7);
  ctx.fillStyle = '#ffe2a8';
  ctx.font = 'bold 11px "Share Tech Mono", monospace';
  ctx.fillText(`${status.building ? 'ERGUENDO' : `FORTE N${status.level}`} · ${formatDuration(status.upgradeRemainingMs)}`, centerX, y - 3);
  ctx.restore();
}

export function drawFortPreview(ctx, { level = 1, garrison = 0, time = 0, width = 220, height = 150, soldierImage = null, scenery = null } = {}) {
  const groundY = height - 18;
  paintBackdrop(ctx, width, height, groundY, scenery);
  ctx.save();
  const scale = Math.min(.8, width / 300);
  ctx.translate(width / 2, groundY);
  ctx.scale(scale, scale);
  if (level >= 1) drawFort(ctx, 0, 0, { level, turrets: [0, 1, 2, 3, 4, 6][level], garrison, time, soldierImage });
  else drawEmptyFortPlot(ctx, 0, 0, time);
  ctx.restore();
}

// Cena da batalha no relatorio: o bando atravessa o Ermo ate o Forte; a defesa abate ou e saqueada.
export const RAID_ANIMATION_MS = 4_500;
// Saqueadores usam o mesmo sprite de soldado, escurecido e com a cor da faccao.
const FACTION_FILTERS = Object.freeze({
  'Horda Mutante do Norte': 'sepia(.8) hue-rotate(50deg) saturate(1.6) brightness(.75)',
  'Remanescentes Militares': 'sepia(.5) hue-rotate(20deg) brightness(.7)',
  'Irmandade de Sucateiros': 'sepia(.9) hue-rotate(-20deg) saturate(1.4) brightness(.8)',
});

export function drawRaidBattle(ctx, report, { fort = null, elapsed = 0, time = 0, width = 560, height = 220, soldierImage = null, scenery = null } = {}) {
  const groundY = height - 34;
  paintBackdrop(ctx, width, height, groundY, scenery);
  const status = getFortStatus(fort, Date.now());
  const fortX = 112;
  ctx.save();
  ctx.translate(fortX, groundY);
  ctx.scale(.62, .62);
  if (status?.activeLevel >= 1) {
    drawFort(ctx, 0, 0, { level: status.activeLevel, turrets: status.turrets, garrison: status.garrison, time, firing: elapsed < RAID_ANIMATION_MS, soldierImage });
  } else drawEmptyFortPlot(ctx, 0, 0, time);
  ctx.restore();
  const filter = FACTION_FILTERS[report.faction] ?? 'brightness(.7)';
  const count = Math.min(10, Math.max(3, Math.ceil(report.attack / 8)));
  const progress = Math.min(1, elapsed / RAID_ANIMATION_MS);
  const stopX = report.won ? 300 : 230;
  for (let index = 0; index < count; index++) {
    const start = width + 30 + index * 26;
    let x = start - (start - stopX - index * 24) * Math.min(1, progress * 1.4);
    const down = report.won && progress > .35 + index / count * .55;
    const fleeing = !report.won && progress > .7;
    if (fleeing) x = stopX + index * 24 + (progress - .7) / .3 * (width - stopX + 60);
    if (down) {
      ctx.save();
      ctx.translate(x, groundY - 4);
      ctx.rotate(-Math.PI / 2);
      if (soldierImage) drawActorSprite(ctx, { role: 'guard', x: 0, y: 0, facing: 1 }, soldierImage, 0, { height: 46 }, filter);
      ctx.restore();
    } else if (soldierImage) {
      drawActorSprite(ctx, { role: 'guard', x, y: groundY, facing: fleeing ? 1 : -1, currentState: 'walking_left' }, soldierImage,
        time + index * 97, { height: 50 }, filter);
      if (fleeing) {
        ctx.fillStyle = linear(ctx, x, 0, x + 10, 0, [[0, '#2a2a2a'], [1, '#0c0c0c']]);
        ctx.fillRect(x - 14, groundY - 34, 10, 14);
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(x - 14, groundY - 29, 10, 2);
      }
    }
    if (status && !down && !fleeing && progress < .9 && Math.sin(time / 60 + index * 1.7) > .85) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255, 220, 120, .85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(fortX + 30, groundY - 36); ctx.lineTo(x, groundY - 26); ctx.stroke();
      ctx.restore();
    }
  }
  if (progress >= 1) {
    ctx.fillStyle = 'rgba(0, 0, 0, .6)';
    ctx.fillRect(0, height / 2 - 30, width, 52);
    ctx.fillStyle = report.won ? '#8fe39a' : '#ff6b5c';
    ctx.font = 'bold 22px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(report.won ? 'ATAQUE REPELIDO' : 'CAMPO SAQUEADO', width / 2, height / 2 + 6);
  }
}
