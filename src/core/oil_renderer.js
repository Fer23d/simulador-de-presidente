import { WORLD_TOP } from './shelter_engine.js';
import { formatDuration, getDerrickStatus } from './oil.js';
import { gradeStructure, hash, linear, paintBackdrop, tone as T } from './art.js';

// Os tres pontos de perfuracao ficam na faixa de superficie que a camera mostra desde o inicio,
// a direita do Forte, sobre a porta do Vault.
export const OIL_SLOT_X = Object.freeze([370, 590, 810]);
const GROUND_Y = WORLD_TOP - 30;
// O conjunto e desenhado em coordenadas "de bancada" (origem no chao, centro do poco) e reduzido na cena.
const SCALE = .85;
const CACHE_W = 320;
const CACHE_H = 300;
const CACHE_ORIGIN_X = 160;
const CACHE_GROUND_Y = 282;

// Geometria do cavalo-de-pau: o cabo desce na vertical do ponto mais a esquerda do arco do cabeca-de-cavalo.
const PIVOT = Object.freeze({ x: -12, y: -88 });
const HORSEHEAD_RADIUS = 52;
const BEAM_TAIL = 40;
const CRANK = Object.freeze({ x: 28, y: -24 });
const CRANK_RADIUS = 10;
const WELLHEAD_X = PIVOT.x - HORSEHEAD_RADIUS;
const TANK_X = 112;

// Cada nivel traz equipamento diferente: da sonda enferrujada ao campo de producao completo.
const PAINT = Object.freeze([null,
  Object.freeze({ body: '#7d4325', mid: '#5c2f19', dark: '#2e170b', trim: '#b8714a', tank: '#6b4a32' }),
  Object.freeze({ body: '#5f7040', mid: '#45532e', dark: '#232b16', trim: '#a7b878', tank: '#8a8a72' }),
  Object.freeze({ body: '#c2661c', mid: '#92490f', dark: '#4a2506', trim: '#f0a24a', tank: '#b9a47a' }),
  Object.freeze({ body: '#33648f', mid: '#244a6c', dark: '#102536', trim: '#e8c84a', tank: '#9aa8b2' }),
  Object.freeze({ body: '#b0281f', mid: '#821a14', dark: '#3f0a07', trim: '#f4efe6', tank: '#e3ded2' }),
]);
const TANK_HEIGHT = Object.freeze([0, 0, 0, 46, 52, 58]);

export function getOilDerrickRect(slot) {
  const centerX = OIL_SLOT_X[slot];
  if (centerX === undefined) return null;
  return { x: centerX - 92 * SCALE, y: GROUND_Y - 142 * SCALE, width: 222 * SCALE, height: 150 * SCALE, centerX, groundY: GROUND_Y };
}

export function findOilDerrickAt(worldX, worldY) {
  for (let slot = 0; slot < OIL_SLOT_X.length; slot++) {
    const rect = getOilDerrickRect(slot);
    // A bolha de coleta fica acima do poco, entao a area de toque sobe junto.
    if (worldX >= rect.x && worldX <= rect.x + rect.width && worldY >= rect.y - 50 && worldY <= rect.y + rect.height) return slot;
  }
  return null;
}

// ---------- Materiais ----------

function speckle(ctx, x, y, w, h, seed, { density = .12, rust = .3 } = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let index = 0; index < w * h * density; index++) {
    const px = x + hash(index, x, seed) * w;
    const py = y + hash(y, index, seed + 3) * h;
    const roll = hash(px, py, seed);
    ctx.fillStyle = roll < rust ? 'rgba(135, 62, 22, .38)' : roll > .62 ? 'rgba(255, 255, 255, .1)' : 'rgba(0, 0, 0, .18)';
    ctx.fillRect(px, py, 1.3, 1.3);
  }
  ctx.restore();
}

// Escorrido de ferrugem e oleo sobre superficies pintadas.
function streaks(ctx, x, y, w, h, seed, count = 5) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let index = 0; index < count; index++) {
    const sx = x + hash(index, seed, 1) * w;
    const top = y + hash(index, seed, 2) * h * .5;
    const length = h * (.3 + hash(index, seed, 3) * .6);
    ctx.fillStyle = hash(index, seed, 4) > .45 ? 'rgba(125, 55, 18, .3)' : 'rgba(20, 14, 8, .28)';
    ctx.fillRect(sx, top, 1.6 + hash(index, seed, 5) * 1.6, length);
  }
  ctx.restore();
}

function steelBlock(ctx, x, y, w, h, light, base, dark) {
  ctx.fillStyle = linear(ctx, 0, y, 0, y + h, [[0, light], [.22, base], [1, dark]]);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255, 255, 255, .2)';
  ctx.fillRect(x, y, w, 1.2);
  ctx.fillStyle = 'rgba(0, 0, 0, .28)';
  ctx.fillRect(x, y + h - 1.2, w, 1.2);
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pipe(ctx, x0, x1, y, diameter) {
  ctx.fillStyle = linear(ctx, 0, y - diameter / 2, 0, y + diameter / 2, [[0, '#9a9ea3'], [.35, '#6b7075'], [1, '#2a2d30']]);
  ctx.fillRect(x0, y - diameter / 2, x1 - x0, diameter);
  ctx.fillStyle = 'rgba(255, 255, 255, .3)';
  ctx.fillRect(x0, y - diameter / 2 + .5, x1 - x0, 1);
  for (let x = x0 + 14; x < x1 - 4; x += 34) {
    ctx.fillStyle = '#3a3d40';
    ctx.fillRect(x, y - diameter / 2 - 1.5, 3, diameter + 3);
    ctx.fillStyle = 'rgba(255, 255, 255, .25)';
    ctx.fillRect(x, y - diameter / 2 - 1.5, 1, diameter + 3);
  }
}

// Poca de oleo com brilho iridescente, como o petroleo derramado de verdade.
function oilPuddle(ctx, x, y, rx, ry) {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 6, 4, .78)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  const sheen = ctx.createLinearGradient(x - rx, y, x + rx, y);
  sheen.addColorStop(0, 'rgba(120, 80, 190, 0)');
  sheen.addColorStop(.3, 'rgba(120, 90, 200, .38)');
  sheen.addColorStop(.55, 'rgba(70, 170, 150, .3)');
  sheen.addColorStop(.8, 'rgba(210, 150, 70, .22)');
  sheen.addColorStop(1, 'rgba(120, 80, 190, 0)');
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.ellipse(x - rx * .1, y - ry * .2, rx * .8, ry * .55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, .22)';
  ctx.fillRect(x - rx * .4, y - ry * .5, rx * .35, 1);
  ctx.restore();
}

// ---------- Estrutura estatica ----------

function drawPad(ctx, level, seed) {
  ctx.fillStyle = 'rgba(0, 0, 0, .35)';
  ctx.beginPath(); ctx.ellipse(10, 2, 128, 7, 0, 0, Math.PI * 2); ctx.fill();
  // Cascalho solto ao redor da laje.
  for (let index = 0; index < 260; index++) {
    const x = -112 + hash(index, 1, seed) * 236;
    const y = 4 - hash(index, 2, seed) * 11;
    const size = 1 + hash(index, 3, seed) * 2;
    ctx.fillStyle = hash(index, 4, seed) > .5 ? 'rgba(150, 125, 95, .55)' : 'rgba(40, 30, 20, .55)';
    ctx.fillRect(x, y, size, size * .7);
  }
  if (level <= 1) {
    // Pranchas de madeira sobre o chao: a sonda do primeiro nivel nao tem laje.
    for (let x = -84; x < 56; x += 12) {
      ctx.fillStyle = linear(ctx, 0, -8, 0, 0, [[0, '#8a6a46'], [1, '#3a2a18']]);
      ctx.fillRect(x, -8, 11, 8);
      ctx.fillStyle = 'rgba(0, 0, 0, .35)';
      ctx.fillRect(x + 11, -8, 1, 8);
    }
    speckle(ctx, -84, -8, 140, 8, seed, { density: .2, rust: .05 });
  } else {
    steelBlock(ctx, -84, -10, 188, 10, '#a09a8c', '#7f796b', '#4a463c');
    speckle(ctx, -84, -10, 188, 10, seed, { density: .22, rust: .02 });
    ctx.strokeStyle = 'rgba(25, 22, 18, .6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-30, -10); ctx.lineTo(-27, -6); ctx.lineTo(-31, -3); ctx.lineTo(-29, 0);
    ctx.moveTo(48, -10); ctx.lineTo(51, -5); ctx.lineTo(49, 0);
    ctx.stroke();
    // Quina lascada.
    ctx.fillStyle = '#1b130b';
    ctx.beginPath(); ctx.moveTo(-84, -10); ctx.lineTo(-77, -10); ctx.lineTo(-84, -4); ctx.fill();
  }
  oilPuddle(ctx, WELLHEAD_X, -9, 24, 2.6);
  oilPuddle(ctx, 30, -9, 18, 2.2);
}

function drawWellhead(ctx, seed) {
  const x = WELLHEAD_X;
  // Flange de base e corpo da arvore de natal.
  steelBlock(ctx, x - 10, -17, 20, 7, '#9fa3a8', '#6d7277', '#2c2f32');
  for (const bolt of [-8, -3, 3, 8]) { ctx.fillStyle = '#22252a'; ctx.fillRect(x + bolt - 1, -16, 2, 2); }
  steelBlock(ctx, x - 4, -34, 8, 18, '#8e9297', '#62676c', '#26292c');
  // Valvula mestra com volante.
  steelBlock(ctx, x - 8, -30, 16, 9, '#a2a6ab', '#70757a', '#2b2e31');
  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + 8, -25); ctx.lineTo(x + 16, -25); ctx.stroke();
  ctx.fillStyle = '#b03226';
  ctx.beginPath(); ctx.ellipse(x + 17, -25, 2.5, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, .3)';
  ctx.fillRect(x + 16, -31, 1, 12);
  // Te de fluxo e linha de producao descendo ate o chao.
  steelBlock(ctx, x - 3, -43, 6, 10, '#8e9297', '#62676c', '#26292c');
  steelBlock(ctx, x + 2, -41, 20, 6, '#9a9ea3', '#6b7075', '#2a2d30');
  steelBlock(ctx, x + 19, -41, 6, 33, '#8e9297', '#62676c', '#26292c');
  // Caixa de gaxeta no topo, por onde passa a haste polida.
  steelBlock(ctx, x - 5, -50, 10, 8, '#b4b8bc', '#7a7f84', '#30343a');
  ctx.fillStyle = '#d6a21e';
  ctx.fillRect(x - 5, -47, 10, 2);
  // Manometro.
  ctx.fillStyle = '#e8e6df';
  ctx.beginPath(); ctx.arc(x + 14, -48, 4.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.strokeStyle = '#a02018'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 14, -48); ctx.lineTo(x + 16.4, -50.4); ctx.stroke();
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x + 13.4, -44, 1.4, 3);
  speckle(ctx, x - 10, -50, 36, 42, seed, { density: .08, rust: .35 });
}

function drawSamson(ctx, paint, seed) {
  const apexY = PIVOT.y + 6;
  const legs = [[-38, -10, PIVOT.x - 3, apexY], [14, -10, PIVOT.x + 3, apexY]];
  legs.forEach(([x0, y0, x1, y1], index) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0 - 4, y0); ctx.lineTo(x0 + 4, y0); ctx.lineTo(x1 + 3, y1); ctx.lineTo(x1 - 3, y1);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, x0 - 4, 0, x0 + 4, 0, index ? [[0, paint.mid], [.5, paint.body], [1, paint.dark]] : [[0, paint.trim], [.4, paint.body], [1, paint.mid]]);
    ctx.fill();
    ctx.clip();
    streaks(ctx, Math.min(x0, x1) - 6, apexY, 20, 78, seed + index, 3);
    ctx.restore();
  });
  // Travessas horizontais e diagonal, como na estrutura em A real.
  for (const t of [.32, .62]) {
    const y = -10 + (apexY + 10) * t;
    const xl = -38 + (PIVOT.x - 3 + 38) * t;
    const xr = 14 + (PIVOT.x + 3 - 14) * t;
    steelBlock(ctx, xl, y - 2, xr - xl, 4, paint.trim, paint.body, paint.dark);
  }
  ctx.strokeStyle = paint.mid; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-31, -10 + (apexY + 10) * .32 - 1); ctx.lineTo(PIVOT.x + 1, -10 + (apexY + 10) * .62 + 1); ctx.stroke();
  // Pes parafusados na laje.
  for (const x of [-38, 14]) {
    steelBlock(ctx, x - 8, -13, 16, 4, '#8f949a', '#686d72', '#2c2f32');
    for (const bolt of [-6, 6]) { ctx.fillStyle = '#1a1c1e'; ctx.fillRect(x + bolt - 1, -12.5, 2.2, 2.4); }
  }
  // Alojamento do mancal central.
  steelBlock(ctx, PIVOT.x - 13, PIVOT.y - 1, 26, 11, '#8f949a', '#686d72', '#26292c');
  ctx.fillStyle = paint.dark;
  ctx.fillRect(PIVOT.x - 13, PIVOT.y + 8, 26, 2);
  for (const bolt of [-9, 9]) { ctx.fillStyle = '#c4c8cc'; ctx.fillRect(PIVOT.x + bolt - 1, PIVOT.y + 3, 2, 2); }
}

function drawGearbox(ctx, paint, seed) {
  const x = CRANK.x - 15;
  const top = -10 - 28;
  steelBlock(ctx, x, top, 30, 28, paint.trim, paint.mid, paint.dark);
  // Nervuras de reforco, visor de oleo e respiro.
  for (let rib = x + 4; rib < x + 28; rib += 6) {
    ctx.fillStyle = 'rgba(0, 0, 0, .28)'; ctx.fillRect(rib, top + 3, 1.4, 22);
    ctx.fillStyle = 'rgba(255, 255, 255, .14)'; ctx.fillRect(rib + 1.4, top + 3, 1, 22);
  }
  ctx.fillStyle = '#0d0b08';
  ctx.beginPath(); ctx.arc(x + 8, -10 - 7, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(200, 150, 40, .65)';
  ctx.beginPath(); ctx.arc(x + 8, -10 - 6, 2.3, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#2a2c2e'; ctx.fillRect(x + 22, top - 4, 3, 4);
  ctx.fillStyle = '#9a9ea3'; ctx.fillRect(x + 21, top - 5, 5, 1.6);
  speckle(ctx, x, top, 30, 28, seed + 5, { density: .1, rust: .4 });
  streaks(ctx, x, top, 30, 28, seed + 6, 3);
}

function drawMotor(ctx, level, seed) {
  const x = 74;
  // Base soldada.
  steelBlock(ctx, x - 6, -13, 36, 4, '#7a7f84', '#55595d', '#26292c');
  if (level <= 2) {
    // Motor a combustao: bloco, cabecote, tanque e escape.
    steelBlock(ctx, x, -32, 26, 19, '#c9b77a', '#8c7c4c', '#3c3320');
    steelBlock(ctx, x + 4, -38, 14, 7, '#7a7f84', '#52565a', '#26292c');
    for (let fin = x + 5; fin < x + 18; fin += 3) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(fin, -37, 1, 5); }
    ctx.fillStyle = '#b03a24';
    ctx.beginPath(); ctx.ellipse(x + 20, -34, 7, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, .3)'; ctx.fillRect(x + 15, -36, 8, 1);
    steelBlock(ctx, x + 22, -48, 3, 17, '#6e7378', '#4a4e52', '#1e2022');
    ctx.fillStyle = '#16181a'; ctx.fillRect(x + 20.5, -50, 6, 2.4);
  } else {
    // Motor eletrico: carcaca aletada e caixa de ligacao.
    ctx.fillStyle = linear(ctx, 0, -32, 0, -13, [[0, '#7fa0b8'], [.3, '#4c6d86'], [1, '#1d2e3b']]);
    roundedRect(ctx, x, -32, 28, 19, 4); ctx.fill();
    for (let fin = x + 4; fin < x + 26; fin += 3.2) { ctx.fillStyle = 'rgba(0, 0, 0, .3)'; ctx.fillRect(fin, -30, 1.1, 15); }
    steelBlock(ctx, x + 9, -38, 11, 7, '#9aa0a6', '#6a6f75', '#2a2d30');
    ctx.fillStyle = '#e0b020'; ctx.fillRect(x + 22, -28, 6, 3);
    ctx.fillStyle = '#111'; ctx.font = 'bold 4px monospace'; ctx.textAlign = 'center'; ctx.fillText('HP', x + 25, -26);
  }
  speckle(ctx, x, -32, 28, 19, seed + 9, { density: .1, rust: level <= 2 ? .5 : .1 });
}

function verticalTank(ctx, x, radius, height, paint, seed, level) {
  ctx.fillStyle = 'rgba(0, 0, 0, .38)';
  ctx.beginPath(); ctx.ellipse(x + 8, 1, radius + 11, 5, 0, 0, Math.PI * 2); ctx.fill();
  // Anel de concreto da base.
  steelBlock(ctx, x - radius - 3, -6, radius * 2 + 6, 6, '#8d877a', '#6a655a', '#35322b');
  ctx.save();
  ctx.fillStyle = paint.tank;
  ctx.fillRect(x - radius, -height - 6, radius * 2, height);
  ctx.fillStyle = linear(ctx, x - radius, 0, x + radius, 0, [[0, 'rgba(0,0,0,.55)'], [.16, 'rgba(0,0,0,.18)'], [.38, 'rgba(255,255,255,.3)'], [.62, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.6)']]);
  ctx.fillRect(x - radius, -height - 6, radius * 2, height);
  ctx.beginPath(); ctx.rect(x - radius, -height - 6, radius * 2, height); ctx.clip();
  // Cordoes de solda horizontais.
  for (let y = -6 - 14; y > -height - 6; y -= 14) {
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - radius, y, radius * 2, 1.4);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x - radius, y + 1.4, radius * 2, 1);
  }
  // Faixa de identificacao e losango de inflamavel.
  ctx.fillStyle = paint.body;
  ctx.fillRect(x - radius, -height * .55 - 6, radius * 2, 7);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - radius, -height * .55 + 1, radius * 2, 1);
  ctx.fillStyle = '#c4281c';
  ctx.save(); ctx.translate(x - 2, -height * .3 - 6); ctx.rotate(Math.PI / 4); ctx.fillRect(-4, -4, 8, 8); ctx.restore();
  ctx.fillStyle = '#fff'; ctx.fillRect(x - 4, -height * .3 - 7, 4, 2);
  streaks(ctx, x - radius, -height - 6, radius * 2, height, seed, 7);
  speckle(ctx, x - radius, -height - 6, radius * 2, height, seed, { density: .08, rust: .45 });
  ctx.restore();
  // Teto conico, tampa de inspecao e guarda-corpo.
  const roofY = -height - 6;
  ctx.fillStyle = linear(ctx, x - radius, 0, x + radius, 0, [[0, '#3a3a38'], [.4, '#8a8a84'], [1, '#2a2a28']]);
  ctx.beginPath(); ctx.moveTo(x - radius - 1, roofY); ctx.lineTo(x - 2, roofY - 9); ctx.lineTo(x + 2, roofY - 9); ctx.lineTo(x + radius + 1, roofY); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#44443f'; ctx.fillRect(x - 4, roofY - 11, 8, 3);
  if (level >= 4) {
    ctx.strokeStyle = '#d6a21e'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - radius, roofY - 1); ctx.lineTo(x - radius, roofY - 8); ctx.lineTo(x - radius + 8, roofY - 8); ctx.stroke();
  }
  // Escada marinheiro na lateral.
  ctx.strokeStyle = '#2a2c2e'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x + radius - 7, -6); ctx.lineTo(x + radius - 7, roofY); ctx.moveTo(x + radius - 3, -6); ctx.lineTo(x + radius - 3, roofY); ctx.stroke();
  for (let y = -10; y > roofY; y -= 5) { ctx.beginPath(); ctx.moveTo(x + radius - 7, y); ctx.lineTo(x + radius - 3, y); ctx.stroke(); }
  // Conexao com a linha de producao e valvula de dreno.
  steelBlock(ctx, x - radius - 6, -14, 8, 5, '#9a9ea3', '#6b7075', '#2a2d30');
  ctx.fillStyle = '#b03226'; ctx.beginPath(); ctx.arc(x - radius - 2, -18, 2.6, 0, Math.PI * 2); ctx.fill();
  oilPuddle(ctx, x - radius + 4, 0, 14, 2);
}

function horizontalTank(ctx, x, paint, seed) {
  const length = 38;
  const y = -26;
  ctx.fillStyle = 'rgba(0, 0, 0, .35)';
  ctx.beginPath(); ctx.ellipse(x + length / 2 + 4, 1, length / 2 + 8, 4, 0, 0, Math.PI * 2); ctx.fill();
  for (const sx of [x + 6, x + length - 8]) steelBlock(ctx, sx - 3, -8, 6, 8, '#6d6a62', '#4c4a44', '#22211d');
  ctx.fillStyle = paint.tank;
  roundedRect(ctx, x, y, length, 19, 9); ctx.fill();
  ctx.fillStyle = linear(ctx, 0, y, 0, y + 19, [[0, 'rgba(255,255,255,.36)'], [.35, 'rgba(255,255,255,.04)'], [1, 'rgba(0,0,0,.55)']]);
  roundedRect(ctx, x, y, length, 19, 9); ctx.fill();
  ctx.save();
  roundedRect(ctx, x, y, length, 19, 9); ctx.clip();
  for (const seam of [x + 12, x + 26]) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(seam, y, 1.4, 19); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(seam + 1.4, y, 1, 19); }
  streaks(ctx, x, y, length, 19, seed, 4);
  speckle(ctx, x, y, length, 19, seed, { density: .1, rust: .5 });
  ctx.restore();
  steelBlock(ctx, x + 16, y - 4, 8, 5, '#8f949a', '#686d72', '#2c2f32');
  steelBlock(ctx, x - 4, -15, 6, 4, '#9a9ea3', '#6b7075', '#2a2d30');
}

function barrel(ctx, x, color, seed) {
  const w = 12;
  const h = 19;
  ctx.fillStyle = 'rgba(0, 0, 0, .35)';
  ctx.beginPath(); ctx.ellipse(x + 2, 0, w / 2 + 3, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, -h, w, h);
  ctx.fillStyle = linear(ctx, x - w / 2, 0, x + w / 2, 0, [[0, 'rgba(0,0,0,.55)'], [.3, 'rgba(255,255,255,.28)'], [.6, 'rgba(0,0,0,.05)'], [1, 'rgba(0,0,0,.6)']]);
  ctx.fillRect(x - w / 2, -h, w, h);
  for (const rib of [-h * .25, -h * .5, -h * .78]) { ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(x - w / 2, rib, w, 1.3); ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x - w / 2, rib + 1.3, w, .8); }
  ctx.fillStyle = '#25231f';
  ctx.beginPath(); ctx.ellipse(x, -h, w / 2, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6a6760'; ctx.beginPath(); ctx.arc(x + 2, -h, 1.2, 0, Math.PI * 2); ctx.fill();
  streaks(ctx, x - w / 2, -h, w, h, seed, 2);
}

function controlCabinet(ctx, paint, seed) {
  const x = WELLHEAD_X - 26;
  steelBlock(ctx, x, -38, 14, 28, '#a9adb2', '#767b80', '#2e3134');
  ctx.fillStyle = '#1b1d1f'; ctx.fillRect(x + 2, -34, 10, 12);
  ctx.fillStyle = 'rgba(80, 160, 110, .5)'; ctx.fillRect(x + 3, -33, 8, 4);
  ctx.fillStyle = paint.trim; ctx.fillRect(x, -39, 14, 2);
  ctx.fillStyle = '#d6a21e'; ctx.fillRect(x + 4, -19, 6, 4);
  speckle(ctx, x, -38, 14, 28, seed, { density: .12, rust: .3 });
}

function ventStack(ctx, level) {
  const x = TANK_X - 2;
  const top = -TANK_HEIGHT[level] - 6 - 10;
  steelBlock(ctx, x - 1.2, top - 18, 2.4, 20, '#8f949a', '#686d72', '#2c2f32');
  ctx.fillStyle = '#26292c'; ctx.fillRect(x - 3, top - 20, 6, 3);
}

// Laje, tanques, linha de producao, cabeca de poco, mastro em A, caixa de engrenagens e motor.
function drawBack(ctx, level, paint, seed) {
  drawPad(ctx, level, seed);
  if (level >= 2) pipe(ctx, WELLHEAD_X + 24, TANK_X - 10, -7, 4.2);
  if (level <= 1) { barrel(ctx, 106, '#7a3b24', seed); barrel(ctx, 120, '#2f4a63', seed + 1); barrel(ctx, 113, '#6b4a32', seed + 2); }
  else if (level === 2) horizontalTank(ctx, 98, paint, seed);
  else verticalTank(ctx, TANK_X + 8, 15, TANK_HEIGHT[level], paint, seed, level);
  if (level >= 4) { ventStack(ctx, level); controlCabinet(ctx, paint, seed); }
  drawWellhead(ctx, seed);
  drawSamson(ctx, paint, seed);
  drawGearbox(ctx, paint, seed);
  drawMotor(ctx, level, seed);
}

// Primeiro plano: cascalho a frente, ervas secas, balizas e a placa de nivel.
function drawFront(ctx, level, seed) {
  oilPuddle(ctx, WELLHEAD_X + 8, 5, 30, 3.2);
  for (let index = 0; index < 70; index++) {
    const x = -100 + hash(index, 9, seed) * 230;
    const size = 1 + hash(index, 10, seed) * 2.4;
    ctx.fillStyle = hash(index, 11, seed) > .5 ? 'rgba(120, 95, 70, .7)' : 'rgba(30, 22, 14, .7)';
    ctx.fillRect(x, 3 + hash(index, 12, seed) * 8, size, size * .6);
  }
  ctx.strokeStyle = 'rgba(120, 95, 50, .75)';
  ctx.lineWidth = 1;
  for (const x of [-96, 86, 126]) {
    ctx.beginPath();
    for (let blade = 0; blade < 4; blade++) { ctx.moveTo(x + blade, 5); ctx.quadraticCurveTo(x + blade + (blade - 1.5) * 3, -4, x + blade + (blade - 1.5) * 4, -11 - blade * 2); }
    ctx.stroke();
  }
  if (level >= 4) {
    // Balizas de protecao em amarelo e preto com corrente.
    for (const x of [-92, 106]) {
      ctx.fillStyle = linear(ctx, x - 3, 0, x + 3, 0, [[0, '#f2c230'], [1, '#8a6a10']]);
      ctx.fillRect(x - 3, -22, 6, 24);
      ctx.fillStyle = '#17140c';
      for (let stripe = -20; stripe < 0; stripe += 8) ctx.fillRect(x - 3, stripe, 6, 3.5);
    }
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-92, -18); ctx.quadraticCurveTo(7, -4, 106, -18); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(10, 8, 6, .88)';
  ctx.fillRect(-88, 4, 24, 14);
  ctx.fillStyle = '#ffcf7a';
  ctx.font = 'bold 10px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`N${level}`, -76, 15);
}

const structureCache = new Map();
function getLayer(level, layer) {
  const key = `${level}:${layer}`;
  if (structureCache.has(key)) return structureCache.get(key);
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = CACHE_W;
  canvas.height = CACHE_H;
  const ctx = canvas.getContext('2d');
  ctx.translate(CACHE_ORIGIN_X, CACHE_GROUND_Y);
  if (layer === 'back') drawBack(ctx, level, PAINT[level], level * 17);
  else drawFront(ctx, level, level * 17);
  gradeStructure(canvas, level);
  structureCache.set(key, canvas);
  return canvas;
}

// ---------- Partes em movimento ----------

function drawMoving(ctx, level, time, pumping, flicker) {
  const paint = PAINT[level];
  const body = T(paint.body);
  const mid = T(paint.mid);
  const dark = T(paint.dark);
  const trim = T(paint.trim);
  const speed = .8 + level * .13;
  const phase = pumping ? time / 520 * speed : 1.2;
  const pin = { x: CRANK.x + Math.cos(phase) * CRANK_RADIUS, y: CRANK.y + Math.sin(phase) * CRANK_RADIUS };
  // O curso da cabeca de cavalo sai da geometria: a biela empurra o rabo da viga e ela gira em torno do mancal.
  const tilt = Math.asin(Math.max(-.9, Math.min(.9, (pin.y - CRANK.y) / BEAM_TAIL)));
  const tail = { x: PIVOT.x + Math.cos(tilt) * BEAM_TAIL, y: PIVOT.y + Math.sin(tilt) * BEAM_TAIL };
  ctx.save();
  // Haste polida e cabo: o cabo sai do ponto mais a esquerda do arco e sobe e desce com a viga.
  const rodTop = -64 - HORSEHEAD_RADIUS * tilt;
  ctx.fillStyle = linear(ctx, WELLHEAD_X - 1.6, 0, WELLHEAD_X + 1.6, 0, [[0, '#5a5e63'], [.4, '#f4f6f8'], [1, '#6c7076']]);
  ctx.fillRect(WELLHEAD_X - 1.6, rodTop, 3.2, -50 - rodTop);
  ctx.fillStyle = T('#3a3d40');
  ctx.fillRect(WELLHEAD_X - 6, rodTop - 3, 12, 4);
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(WELLHEAD_X - 6, rodTop - 3, 12, 1);
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(WELLHEAD_X - 1.4, PIVOT.y); ctx.lineTo(WELLHEAD_X - 5, rodTop - 3);
  ctx.moveTo(WELLHEAD_X + 1.4, PIVOT.y); ctx.lineTo(WELLHEAD_X + 5, rodTop - 3);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(210, 205, 190, .45)'; ctx.lineWidth = .6;
  ctx.beginPath(); ctx.moveTo(WELLHEAD_X - 1.4, PIVOT.y); ctx.lineTo(WELLHEAD_X - 5, rodTop - 3); ctx.stroke();
  // Correia em V e polias.
  const gearSheave = { x: 48, y: -18, r: 9 };
  const motorSheave = { x: 68, y: -18, r: 4 };
  ctx.strokeStyle = '#121212'; ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(gearSheave.x, gearSheave.y - gearSheave.r); ctx.lineTo(motorSheave.x, motorSheave.y - motorSheave.r);
  ctx.moveTo(gearSheave.x, gearSheave.y + gearSheave.r); ctx.lineTo(motorSheave.x, motorSheave.y + motorSheave.r);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.moveTo(gearSheave.x, gearSheave.y - gearSheave.r - 1); ctx.lineTo(motorSheave.x, motorSheave.y - motorSheave.r - 1); ctx.stroke();
  for (const [sheave, turns] of [[gearSheave, 5], [motorSheave, 14]]) {
    ctx.save();
    ctx.translate(sheave.x, sheave.y);
    ctx.fillStyle = linear(ctx, -sheave.r, -sheave.r, sheave.r, sheave.r, [[0, T('#a4a8ad')], [.5, T('#6b7075')], [1, T('#26292c')]]);
    ctx.beginPath(); ctx.arc(0, 0, sheave.r, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(phase * turns);
    ctx.strokeStyle = 'rgba(20,20,20,.7)'; ctx.lineWidth = Math.max(1, sheave.r * .22);
    for (let spoke = 0; spoke < 4; spoke++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sheave.r * .8, 0); ctx.stroke(); }
    ctx.restore();
  }
  // Biela e manivela com contrapeso.
  ctx.strokeStyle = dark; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(pin.x, pin.y); ctx.lineTo(tail.x, tail.y); ctx.stroke();
  ctx.strokeStyle = trim; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(pin.x - 1.2, pin.y); ctx.lineTo(tail.x - 1.2, tail.y); ctx.stroke();
  ctx.save();
  ctx.translate(CRANK.x, CRANK.y);
  ctx.rotate(phase);
  ctx.fillStyle = linear(ctx, 0, -24, 0, 24, [[0, trim], [.3, body], [1, dark]]);
  ctx.beginPath();
  ctx.arc(0, 0, 25, Math.PI - .78, Math.PI + .78);
  ctx.arc(0, 0, 10, Math.PI + .78, Math.PI - .78, true);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.arc(-18, 0, 1.6, 0, Math.PI * 2); ctx.arc(-21, -7, 1.6, 0, Math.PI * 2); ctx.arc(-21, 7, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = linear(ctx, 0, -4, 0, 4, [[0, trim], [.4, mid], [1, '#1c1a16']]);
  roundedRect(ctx, -2, -4, CRANK_RADIUS + 6, 8, 2.4); ctx.fill();
  ctx.fillStyle = T('#1b1d1f'); ctx.beginPath(); ctx.arc(CRANK_RADIUS, 0, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = T('#a4a8ad'); ctx.beginPath(); ctx.arc(CRANK_RADIUS, 0, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = T('#26292c'); ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = T('#8f949a'); ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Viga com cabeca de cavalo: placa em setor, viga em I e mancal.
  ctx.save();
  ctx.translate(PIVOT.x, PIVOT.y);
  ctx.rotate(tilt);
  ctx.fillStyle = linear(ctx, -HORSEHEAD_RADIUS, -28, -4, 28, [[0, body], [.5, mid], [1, dark]]);
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.arc(0, 0, HORSEHEAD_RADIUS, Math.PI - .6, Math.PI + .6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = trim; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(0, 0, HORSEHEAD_RADIUS - 1, Math.PI - .6, Math.PI + .6); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  for (const [hx, hy] of [[-34, -13], [-34, 13], [-24, 0]]) { ctx.beginPath(); ctx.arc(hx, hy, 4.4, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = linear(ctx, 0, -6, 0, 6, [[0, trim], [.25, body], [1, dark]]);
  ctx.fillRect(-18, -6, BEAM_TAIL + 22, 12);
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(-18, -1, BEAM_TAIL + 22, 2);
  ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(-18, -6, BEAM_TAIL + 22, 1.4);
  for (let rivet = -14; rivet < BEAM_TAIL + 2; rivet += 9) { ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(rivet, -4.5, 1.4, 1.4); ctx.fillRect(rivet, 3.2, 1.4, 1.4); }
  ctx.fillStyle = dark; ctx.fillRect(BEAM_TAIL - 3, -8, 6, 16);
  ctx.fillStyle = T('#26292c'); ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = T('#1b1d1f'); ctx.beginPath(); ctx.arc(tail.x, tail.y, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = T('#a4a8ad'); ctx.beginPath(); ctx.arc(tail.x, tail.y, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = T('#1b1d1f'); ctx.beginPath(); ctx.arc(pin.x, pin.y, 2.6, 0, Math.PI * 2); ctx.fill();
  // Fumaca do escape nos motores a combustao.
  if (level <= 2 && pumping) {
    for (let puff = 0; puff < 4; puff++) {
      const age = (time / 1_100 + puff / 4) % 1;
      ctx.fillStyle = `rgba(60, 56, 50, ${(1 - age) * .4})`;
      ctx.beginPath(); ctx.arc(98 + age * 12 + Math.sin(time / 400 + puff) * 2, -52 - age * 34, 2 + age * 6, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Luz de status piscando no armario de comando.
  if (level >= 4) {
    const on = Math.sin(time / 360) > 0;
    const lx = WELLHEAD_X - 21;
    ctx.fillStyle = on ? '#ff3b30' : '#4a1410';
    ctx.beginPath(); ctx.arc(lx, -36.4, 1.5, 0, Math.PI * 2); ctx.fill();
    if (on) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(lx, -36, 0, lx, -36, 9);
      glow.addColorStop(0, 'rgba(255, 70, 50, .55)'); glow.addColorStop(1, 'rgba(255, 70, 50, 0)');
      ctx.fillStyle = glow; ctx.fillRect(lx - 9, -45, 18, 18);
      ctx.restore();
    }
  }
  // Chama do respiro do tanque no nivel maximo: o gas associado queima sem parar.
  if (level >= 5) {
    const fx = TANK_X - 2;
    const fy = -TANK_HEIGHT[level] - 6 - 38;
    const wobble = Math.sin(time / 90) * 1.6 + flicker * 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(fx, fy - 6, 0, fx, fy - 6, 34);
    glow.addColorStop(0, 'rgba(255, 170, 60, .5)'); glow.addColorStop(1, 'rgba(255, 120, 30, 0)');
    ctx.fillStyle = glow; ctx.fillRect(fx - 34, fy - 40, 68, 68);
    ctx.fillStyle = 'rgba(255, 110, 20, .9)';
    ctx.beginPath(); ctx.moveTo(fx - 3.4, fy); ctx.quadraticCurveTo(fx - 4 + wobble, fy - 9, fx + wobble, fy - 19 - flicker * 3); ctx.quadraticCurveTo(fx + 4 + wobble, fy - 9, fx + 3.4, fy); ctx.fill();
    ctx.fillStyle = 'rgba(255, 220, 120, .95)';
    ctx.beginPath(); ctx.moveTo(fx - 1.8, fy); ctx.quadraticCurveTo(fx - 2 + wobble * .6, fy - 6, fx + wobble * .6, fy - 12); ctx.quadraticCurveTo(fx + 2 + wobble * .6, fy - 6, fx + 1.8, fy); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function plainSteel(ctx, x, y, w, h) {
  ctx.fillStyle = linear(ctx, 0, y, 0, y + h, [[0, '#d2d5d8'], [.5, '#8d9296'], [1, '#34383b']]);
  ctx.fillRect(x, y, w, h);
}

// Andaime tubular com pranchas e faiscas de solda, mostrado enquanto o poco esta em obra.
function drawScaffold(ctx, time) {
  ctx.save();
  const xs = [-92, -30, 38, 100];
  for (const x of xs) {
    ctx.fillStyle = linear(ctx, x - 2, 0, x + 2, 0, [[0, '#d2d5d8'], [.4, '#8d9296'], [1, '#34383b']]);
    ctx.fillRect(x - 2, -132, 4, 132);
  }
  for (const y of [-44, -88, -130]) {
    plainSteel(ctx, xs[0], y, xs[3] - xs[0], 3.4);
    if (y !== -130) {
      ctx.fillStyle = linear(ctx, 0, y - 6, 0, y, [[0, '#9a7a52'], [1, '#4a3520']]);
      ctx.fillRect(xs[0], y - 6, xs[3] - xs[0], 6);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      for (let plank = xs[0] + 14; plank < xs[3]; plank += 14) ctx.fillRect(plank, y - 6, 1, 6);
    }
  }
  ctx.strokeStyle = '#9ca0a4'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xs[0], 0); ctx.lineTo(xs[1], -44); ctx.moveTo(xs[1], -44); ctx.lineTo(xs[2], -88); ctx.moveTo(xs[2], -88); ctx.lineTo(xs[3], -130);
  ctx.stroke();
  // Fita de zebra pendurada na frente.
  ctx.fillStyle = '#e0b020';
  ctx.fillRect(xs[0], -38, xs[3] - xs[0], 3);
  ctx.fillStyle = '#17140c';
  for (let x = xs[0]; x < xs[3]; x += 12) ctx.fillRect(x, -38, 5, 3);
  if (Math.sin(time / 80) > .25) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sx = -10 + Math.sin(time / 31) * 36;
    const sy = -70 + Math.cos(time / 47) * 10;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 12);
    glow.addColorStop(0, 'rgba(255, 245, 190, .9)'); glow.addColorStop(1, 'rgba(255, 180, 60, 0)');
    ctx.fillStyle = glow; ctx.fillRect(sx - 12, sy - 12, 24, 24);
    ctx.restore();
  }
  ctx.restore();
}

// Terreno livre: estacas de topografo com fita, marcacao da laje e placa de obra.
function drawEmptyPlot(ctx, time) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, .3)';
  ctx.beginPath(); ctx.ellipse(10, 2, 120, 7, 0, 0, Math.PI * 2); ctx.fill();
  for (let index = 0; index < 150; index++) {
    ctx.fillStyle = hash(index, 1, 4) > .5 ? 'rgba(150, 125, 95, .5)' : 'rgba(40, 30, 20, .5)';
    ctx.fillRect(-100 + hash(index, 2, 4) * 210, 3 - hash(index, 3, 4) * 9, 1.5 + hash(index, 4, 4) * 1.6, 1.2);
  }
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = `rgba(255, 150, 60, ${.5 + Math.sin(time / 300) * .25})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(-92, -6, 196, 8);
  ctx.setLineDash([]);
  for (const [x, hue] of [[-92, '#e0701c'], [104, '#e0701c'], [6, '#d8c22a']]) {
    ctx.fillStyle = linear(ctx, x - 2, 0, x + 2, 0, [[0, '#9a7a52'], [1, '#4a3520']]);
    ctx.fillRect(x - 2, -34, 4, 36);
    ctx.fillStyle = hue;
    ctx.beginPath();
    ctx.moveTo(x + 2, -33);
    for (let step = 0; step <= 16; step += 2) ctx.lineTo(x + 2 + step, -33 + Math.sin(time / 240 + step / 4 + x) * 2.5);
    for (let step = 16; step >= 0; step -= 2) ctx.lineTo(x + 2 + step, -26 + Math.sin(time / 240 + step / 4 + x) * 2.5);
    ctx.fill();
  }
  // Placa de obra em chapa enferrujada.
  for (const x of [-16, 28]) { ctx.fillStyle = '#4a3520'; ctx.fillRect(x - 1.5, -56, 3, 56); }
  ctx.fillStyle = linear(ctx, 0, -92, 0, -52, [[0, '#d8b46a'], [1, '#8f6e30']]);
  roundedRect(ctx, -26, -92, 64, 36, 3); ctx.fill();
  ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 2; ctx.stroke();
  speckle(ctx, -26, -92, 64, 36, 11, { density: .15, rust: .6 });
  ctx.fillStyle = '#2a1608';
  ctx.font = 'bold 9px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PERFURE', 6, -77);
  ctx.fillText('AQUI', 6, -64);
  ctx.restore();
}

// Corpo dos pocos: desenhado no mundo, antes da noite escurecer a superficie.
export function renderOilField(ctx, derricks = [], { time = 0, now = Date.now() } = {}) {
  for (let slot = 0; slot < OIL_SLOT_X.length; slot++) {
    const { centerX, groundY } = getOilDerrickRect(slot);
    const status = getDerrickStatus(derricks[slot], now);
    ctx.save();
    ctx.translate(centerX, groundY);
    ctx.scale(SCALE, SCALE);
    if (!status) drawEmptyPlot(ctx, time);
    else {
      const level = Math.max(1, Math.min(5, status.activeLevel));
      const back = getLayer(level, 'back');
      const front = getLayer(level, 'front');
      if (back) ctx.drawImage(back, -CACHE_ORIGIN_X, -CACHE_GROUND_Y);
      drawMoving(ctx, level, time + slot * 420, !status.upgrading && !status.full, Math.sin(time / 53 + slot) * .5 + .5);
      if (front) ctx.drawImage(front, -CACHE_ORIGIN_X, -CACHE_GROUND_Y);
      if (status.upgrading) drawScaffold(ctx, time);
    }
    ctx.restore();
  }
}

// Bolhas, barras de obra e o "+N" de coleta: desenhados por cima da noite para continuarem legiveis.
export function renderOilFieldOverlay(ctx, derricks = [], { time = 0, now = Date.now(), feedback = null, perfNow = time } = {}) {
  ctx.save();
  ctx.textAlign = 'center';
  for (let slot = 0; slot < OIL_SLOT_X.length; slot++) {
    const { centerX, groundY } = getOilDerrickRect(slot);
    const status = getDerrickStatus(derricks[slot], now);
    if (status?.upgrading) {
      const y = groundY - 118;
      ctx.fillStyle = 'rgba(0, 0, 0, .78)';
      ctx.fillRect(centerX - 52, y - 16, 104, 30);
      ctx.fillStyle = '#3a2a10';
      ctx.fillRect(centerX - 46, y + 2, 92, 7);
      ctx.fillStyle = '#ffb000';
      ctx.fillRect(centerX - 46, y + 2, 92 * Math.max(0, Math.min(1, status.upgradeProgress)), 7);
      ctx.fillStyle = '#ffe2a8';
      ctx.font = 'bold 11px "Share Tech Mono", monospace';
      ctx.fillText(`${status.building ? 'MONTANDO' : `NÍVEL ${status.level}`} · ${formatDuration(status.upgradeRemainingMs)}`, centerX, y - 3);
    } else if (status?.ready) {
      const bob = Math.sin(time / 260 + slot) * 4;
      const y = groundY - 128 + bob;
      ctx.fillStyle = status.full ? '#ffdddd' : '#fff6e0';
      ctx.strokeStyle = status.full ? '#ff3b30' : '#2a1a08';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerX, y, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(centerX - 6, y + 22); ctx.lineTo(centerX, y + 30); ctx.lineTo(centerX + 6, y + 22);
      ctx.fill();
      // Gota de petroleo com brilho.
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.moveTo(centerX, y - 13);
      ctx.quadraticCurveTo(centerX + 11, y + 2, centerX, y + 10);
      ctx.quadraticCurveTo(centerX - 11, y + 2, centerX, y - 13);
      ctx.fill();
      ctx.fillStyle = 'rgba(170, 150, 255, .8)';
      ctx.fillRect(centerX - 4, y - 2, 2, 6);
      // Etiqueta escura para a quantidade continuar legivel sobre a ferragem do poco.
      const label = status.full ? `CHEIO ${status.stored}` : String(status.stored);
      ctx.font = 'bold 12px "Share Tech Mono", monospace';
      const labelWidth = ctx.measureText(label).width + 12;
      ctx.fillStyle = 'rgba(8, 5, 2, .82)';
      ctx.fillRect(centerX - labelWidth / 2, y + 33, labelWidth, 17);
      ctx.strokeStyle = status.full ? '#ff3b30' : '#8a5a1c';
      ctx.lineWidth = 1;
      ctx.strokeRect(centerX - labelWidth / 2, y + 33, labelWidth, 17);
      ctx.fillStyle = status.full ? '#ff6b5c' : '#ffe2a8';
      ctx.fillText(label, centerX, y + 46);
    }
    if (feedback?.slot === slot) {
      const elapsed = perfNow - feedback.at;
      if (elapsed >= 0 && elapsed < 1_400) {
        ctx.globalAlpha = 1 - elapsed / 1_400;
        ctx.fillStyle = '#ffd34d';
        ctx.font = 'bold 20px "Press Start 2P", monospace';
        ctx.fillText(`+${feedback.amount}`, centerX, groundY - 150 - elapsed * .05);
        ctx.globalAlpha = 1;
      }
    }
  }
  ctx.restore();
}

// Miniatura animada do poco para o painel de melhoria, sobre o cenario real do jogo.
export function drawOilDerrickPreview(ctx, { level = 1, time = 0, width = 220, height = 150, pumping = true, scenery = null } = {}) {
  const groundY = height - 16;
  paintBackdrop(ctx, width, height, groundY, scenery);
  const safeLevel = Math.max(1, Math.min(5, level));
  ctx.save();
  const scale = Math.min(.74, width / 300);
  ctx.translate(width / 2 - 14 * scale, groundY);
  ctx.scale(scale, scale);
  const back = getLayer(safeLevel, 'back');
  const front = getLayer(safeLevel, 'front');
  if (back) ctx.drawImage(back, -CACHE_ORIGIN_X, -CACHE_GROUND_Y);
  drawMoving(ctx, safeLevel, time, pumping, Math.sin(time / 53) * .5 + .5);
  if (front) ctx.drawImage(front, -CACHE_ORIGIN_X, -CACHE_GROUND_Y);
  ctx.restore();
}
