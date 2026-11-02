import { WORLD_TOP } from './shelter_engine.js';
import { hash, linear } from './art.js';

// A banca do Mercado Sombrio fica na superficie, depois do ultimo poco de petroleo.
export const MARKET_X = 990;
const SCALE = .8;
const GROUND_Y = WORLD_TOP - 30;
const W = 300;
const H = 200;
const ORIGIN_X = 150;
const ORIGIN_Y = 188;
const RES = 2;
let cache = null;

export function getMarketRect() {
  return { x: MARKET_X - 118 * SCALE, y: GROUND_Y - 124 * SCALE, width: 236 * SCALE, height: 132 * SCALE, centerX: MARKET_X, groundY: GROUND_Y };
}

export function isMarketAt(worldX, worldY) {
  const rect = getMarketRect();
  return worldX >= rect.x && worldX <= rect.x + rect.width && worldY >= rect.y - 30 && worldY <= rect.y + rect.height;
}

function wood(c, x, y, w, h, seed) {
  c.fillStyle = linear(c, x, y, x, y + h, [[0, '#6b4a2c'], [.5, '#563a21'], [1, '#3a2614']]);
  c.fillRect(x, y, w, h);
  c.strokeStyle = 'rgba(20, 12, 6, .55)';
  c.lineWidth = .8;
  for (let line = 1; line < 4; line++) {
    const yy = y + h * line / 4;
    c.beginPath();
    c.moveTo(x, yy);
    c.lineTo(x + w, yy);
    c.stroke();
  }
  c.strokeStyle = 'rgba(210, 170, 110, .18)';
  for (let grain = 0; grain < Math.floor(w / 3); grain++) {
    const gx = x + hash(grain, 1, seed) * w;
    const gy = y + hash(grain, 2, seed) * h;
    c.beginPath();
    c.moveTo(gx, gy);
    c.lineTo(gx + 5 + hash(grain, 3, seed) * 6, gy + .6);
    c.stroke();
  }
  c.strokeStyle = 'rgba(0, 0, 0, .6)';
  c.strokeRect(x + .5, y + .5, w - 1, h - 1);
}

function barrel(c, x, y, tint) {
  c.fillStyle = linear(c, x - 14, 0, x + 14, 0, [[0, tint[0]], [.35, tint[1]], [1, tint[2]]]);
  c.beginPath();
  c.moveTo(x - 13, y);
  c.lineTo(x - 14, y - 40);
  c.quadraticCurveTo(x, y - 46, x + 14, y - 40);
  c.lineTo(x + 13, y);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(0, 0, 0, .55)';
  c.lineWidth = 1;
  c.stroke();
  c.strokeStyle = 'rgba(0, 0, 0, .4)';
  for (const band of [-10, -22, -34]) {
    c.beginPath();
    c.moveTo(x - 13.4, y + band);
    c.quadraticCurveTo(x, y + band + 3, x + 13.4, y + band);
    c.stroke();
  }
  c.fillStyle = '#e8c53a';
  c.beginPath();
  c.arc(x, y - 22, 4.2, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#1a1408';
  c.beginPath();
  c.arc(x, y - 22, 1.2, 0, Math.PI * 2);
  c.fill();
}

function drawStatic(c) {
  c.lineJoin = 'round';
  c.lineCap = 'round';
  // Sombra no chao.
  c.fillStyle = 'rgba(0, 0, 0, .38)';
  c.beginPath();
  c.ellipse(0, 3, 126, 9, 0, 0, Math.PI * 2);
  c.fill();
  // Caixotes e barris ao fundo.
  wood(c, -112, -34, 44, 34, 3);
  wood(c, -104, -62, 34, 28, 5);
  barrel(c, 104, 0, ['#3f4a3a', '#6a7a58', '#2c3328']);
  barrel(c, 124, 2, ['#5a2a1a', '#8a4a2a', '#3a1a0e']);
  // Postes e lona remendada.
  c.strokeStyle = '#2a1c10';
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(-92, 0);
  c.lineTo(-92, -112);
  c.moveTo(96, 0);
  c.lineTo(96, -100);
  c.stroke();
  c.strokeStyle = '#7a5a38';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-93, 0);
  c.lineTo(-93, -112);
  c.stroke();
  const tarp = linear(c, 0, -118, 0, -84, [[0, '#7c6a4a'], [1, '#4c3e2a']]);
  c.fillStyle = tarp;
  c.beginPath();
  c.moveTo(-108, -114);
  c.quadraticCurveTo(0, -126, 112, -106);
  c.lineTo(112, -86);
  c.quadraticCurveTo(10, -98, -108, -92);
  c.closePath();
  c.fill();
  const patches = [[-84, -112, 38, 18, '#7a3a22'], [-30, -116, 34, 18, '#355a5a'], [20, -112, 40, 18, '#9a8456'], [70, -106, 34, 16, '#6a2a2a']];
  patches.forEach(([x, y, w, h, color], index) => {
    c.fillStyle = color;
    c.globalAlpha = .88;
    c.fillRect(x, y + Math.sin(index) * 2, w, h);
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(15, 8, 4, .6)';
    c.setLineDash([2, 2]);
    c.strokeRect(x + .5, y + Math.sin(index) * 2 + .5, w, h);
    c.setLineDash([]);
  });
  c.strokeStyle = 'rgba(0, 0, 0, .55)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(-108, -114);
  c.quadraticCurveTo(0, -126, 112, -106);
  c.lineTo(112, -86);
  c.quadraticCurveTo(10, -98, -108, -92);
  c.closePath();
  c.stroke();
  // Franja de trapos pendurados na beirada da lona.
  for (let tag = 0; tag < 18; tag++) {
    const x = -104 + tag * 12;
    const y = -92 + Math.sin(tag * .5) * 1 + tag * .5;
    c.fillStyle = tag % 3 === 0 ? '#8a3a28' : tag % 3 === 1 ? '#c9b78a' : '#3f5a5a';
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + 7, y);
    c.lineTo(x + 3.5, y + 6 + hash(tag, 1, 9) * 5);
    c.closePath();
    c.fill();
  }
  // Balcao de tabuas com mercadorias.
  wood(c, -86, -34, 176, 8, 11);
  wood(c, -80, -26, 6, 26, 12);
  wood(c, 76, -26, 6, 26, 13);
  c.fillStyle = 'rgba(0, 0, 0, .35)';
  c.fillRect(-84, -26, 172, 3);
  // Mercadorias: potes verdes radioativos, latas, caixa de curativos e uma arma.
  [[-70, '#7bff6a'], [-58, '#9aff7a']].forEach(([x, color]) => {
    c.fillStyle = 'rgba(200, 230, 210, .35)';
    c.fillRect(x, -48, 9, 14);
    c.fillStyle = color;
    c.globalAlpha = .75;
    c.fillRect(x + 1, -42, 7, 7);
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(0, 0, 0, .6)';
    c.strokeRect(x + .5, -47.5, 8, 13);
  });
  [[-40, '#b0462a'], [-30, '#c9a23a'], [-20, '#4a6a8a']].forEach(([x, color]) => {
    c.fillStyle = color;
    c.fillRect(x, -44, 8, 10);
    c.fillStyle = 'rgba(255, 255, 255, .25)';
    c.fillRect(x + 1, -44, 2, 10);
    c.strokeStyle = 'rgba(0, 0, 0, .6)';
    c.strokeRect(x + .5, -43.5, 7, 9);
  });
  c.fillStyle = '#d8d2c0';
  c.fillRect(36, -46, 18, 12);
  c.fillStyle = '#b52b24';
  c.fillRect(43, -44, 4, 8);
  c.fillRect(40, -41, 10, 2);
  c.strokeStyle = 'rgba(0, 0, 0, .6)';
  c.strokeRect(36.5, -45.5, 17, 11);
  c.fillStyle = '#2a2a2a';
  c.fillRect(58, -39, 24, 4);
  c.fillRect(58, -43, 5, 8);
  c.fillStyle = '#6a4a2a';
  c.fillRect(70, -41, 12, 3);
  // Placa de perigo pintada a mao, presa no poste da direita.
  c.save();
  c.translate(96, -76);
  c.rotate(.08);
  c.fillStyle = '#e8c53a';
  c.beginPath();
  c.moveTo(0, -20);
  c.lineTo(17, 8);
  c.lineTo(-17, 8);
  c.closePath();
  c.fill();
  c.strokeStyle = '#1a1408';
  c.lineWidth = 2;
  c.stroke();
  c.fillStyle = '#1a1408';
  c.beginPath();
  c.arc(0, -2, 2.4, 0, Math.PI * 2);
  c.fill();
  for (let blade = 0; blade < 3; blade++) {
    const a = blade * Math.PI * 2 / 3 - Math.PI / 2;
    c.beginPath();
    c.moveTo(0, -2);
    c.arc(0, -2, 8, a - .5, a + .5);
    c.closePath();
    c.fill();
  }
  c.restore();
  // Placa MERCADO riscada nas tabuas, pendurada na lona.
  wood(c, -34, -80, 70, 14, 21);
  c.fillStyle = '#e4d0a0';
  c.font = 'bold 9px monospace';
  c.textAlign = 'center';
  c.fillText('MERCADO SOMBRIO', 1, -70);
  c.strokeStyle = '#2a1c10';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(-26, -92);
  c.lineTo(-26, -80);
  c.moveTo(28, -91);
  c.lineTo(28, -80);
  c.stroke();
}

function getCache() {
  if (cache || typeof document === 'undefined') return cache;
  const canvas = document.createElement('canvas');
  canvas.width = W * RES;
  canvas.height = H * RES;
  const c = canvas.getContext('2d');
  c.scale(RES, RES);
  c.translate(ORIGIN_X, ORIGIN_Y);
  drawStatic(c);
  cache = canvas;
  return cache;
}

// Mercador encapuzado de mascara de gas atras do balcao, respirando devagar, e a lanterna que pisca.
function drawMerchant(ctx, time) {
  const breath = Math.sin(time / 900) * .8;
  ctx.save();
  ctx.translate(-10, -34);
  ctx.fillStyle = linear(ctx, 0, -60, 0, 0, [[0, '#2b2620'], [1, '#14110d']]);
  ctx.beginPath();
  ctx.moveTo(-22, 0);
  ctx.quadraticCurveTo(-24, -36 + breath, -12, -52 + breath);
  ctx.quadraticCurveTo(0, -60 + breath, 12, -52 + breath);
  ctx.quadraticCurveTo(24, -36 + breath, 22, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, .7)';
  ctx.stroke();
  // Capuz e mascara.
  ctx.fillStyle = '#3a342a';
  ctx.beginPath();
  ctx.arc(0, -56 + breath, 13, Math.PI, 0);
  ctx.quadraticCurveTo(14, -44 + breath, 9, -41 + breath);
  ctx.lineTo(-9, -41 + breath);
  ctx.quadraticCurveTo(-14, -44 + breath, -13, -56 + breath);
  ctx.fill();
  ctx.fillStyle = '#1c1a16';
  ctx.beginPath();
  ctx.ellipse(0, -50 + breath, 8, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  const flicker = .75 + Math.sin(time / 90) * .12;
  for (const eyeX of [-3.6, 3.6]) {
    ctx.fillStyle = '#0c0b09';
    ctx.beginPath();
    ctx.arc(eyeX, -53 + breath, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 190, 90, ${flicker * .8})`;
    ctx.beginPath();
    ctx.arc(eyeX + .6, -53.6 + breath, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#4a4438';
  ctx.beginPath();
  ctx.ellipse(0, -45 + breath, 4, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLantern(ctx, time, night) {
  const x = -60;
  const y = -86;
  const flicker = .85 + Math.sin(time / 80) * .08 + Math.sin(time / 31) * .05;
  ctx.save();
  ctx.strokeStyle = '#1a1208';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - 8);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.fillStyle = '#2a2018';
  ctx.fillRect(x - 5, y, 10, 3);
  ctx.fillStyle = `rgba(255, 190, 90, ${.9 * flicker})`;
  ctx.fillRect(x - 3.5, y + 3, 7, 9);
  ctx.fillStyle = '#2a2018';
  ctx.fillRect(x - 5, y + 12, 10, 2);
  ctx.globalCompositeOperation = 'lighter';
  const radius = (night ? 110 : 70) * flicker;
  const glow = ctx.createRadialGradient(x, y + 8, 2, x, y + 8, radius);
  glow.addColorStop(0, `rgba(255, 170, 70, ${night ? .55 : .3})`);
  glow.addColorStop(1, 'rgba(255, 120, 40, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - radius, y + 8 - radius, radius * 2, radius * 2);
  // Brilho verde doentio dos potes.
  const jar = ctx.createRadialGradient(-62, -42, 1, -62, -42, 34);
  jar.addColorStop(0, `rgba(120, 255, 110, ${(night ? .4 : .2) * (.8 + Math.sin(time / 500) * .2)})`);
  jar.addColorStop(1, 'rgba(120, 255, 110, 0)');
  ctx.fillStyle = jar;
  ctx.fillRect(-100, -80, 76, 76);
  ctx.restore();
}

export function renderMarket(ctx, market, { time = 0, night = false } = {}) {
  if (!market?.open) return;
  ctx.save();
  ctx.translate(MARKET_X, GROUND_Y);
  ctx.scale(SCALE, SCALE);
  const sprite = getCache();
  if (sprite) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sprite, -ORIGIN_X, -ORIGIN_Y, W, H);
  } else {
    drawStatic(ctx);
  }
  drawMerchant(ctx, time);
  drawLantern(ctx, time, night);
  ctx.restore();
}

// Etiqueta flutuante com o nome do mercador, desenhada por cima da noite para continuar legivel.
export function renderMarketOverlay(ctx, market, { time = 0 } = {}) {
  if (!market?.open) return;
  const y = GROUND_Y - 124 * SCALE - 16 + Math.sin(time / 600) * 2;
  ctx.save();
  ctx.font = 'bold 11px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(10, 8, 4, .75)';
  const label = `🕯 ${market.merchant}`;
  const width = ctx.measureText(label).width + 16;
  ctx.fillRect(MARKET_X - width / 2, y - 12, width, 18);
  ctx.strokeStyle = 'rgba(244, 211, 110, .6)';
  ctx.strokeRect(MARKET_X - width / 2 + .5, y - 11.5, width - 1, 17);
  ctx.fillStyle = '#f4d36e';
  ctx.fillText(label, MARKET_X, y + 1);
  ctx.restore();
}
