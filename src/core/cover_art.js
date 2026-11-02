import { hash, linear } from './art.js';
import { drawDog } from './dog_renderer.js';

// Capa do jogo: o Vault aberto ao entardecer radioativo, o presidente e Layd de costas, olhando o Ermo.
// A cena parada e pintada uma vez; so o brilho da porta, a lua e Layd se mexem.
const staticCache = new Map();

function skyline(c, width, horizon, seed, height, color, step) {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(0, horizon);
  for (let x = 0; x <= width + step; x += step) {
    const tall = hash(Math.floor(x / step), 1, seed);
    const broken = hash(Math.floor(x / step), 2, seed) > .62;
    const h = height * (.25 + tall * .75) * (broken ? .55 : 1);
    c.lineTo(x, horizon - h);
    c.lineTo(x + step * .8, horizon - h - (broken ? 6 + tall * 12 : 0));
    c.lineTo(x + step * .8, horizon);
  }
  c.lineTo(width + step, horizon);
  c.closePath();
  c.fill();
  // Janelas apagadas e uma ou outra ainda acesa.
  for (let x = step; x < width; x += step) {
    if (hash(Math.floor(x / step), 3, seed) > .86) {
      c.fillStyle = 'rgba(255, 170, 70, .55)';
      c.fillRect(x + 3, horizon - height * .4 * hash(Math.floor(x / step), 4, seed) - 8, 3, 4);
    }
  }
}

function paintStatic(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d');
  const horizon = height * .66;
  c.fillStyle = linear(c, 0, 0, 0, horizon, [[0, '#09040f'], [.45, '#2a1030'], [.8, '#8a3a22'], [1, '#e08a38']]);
  c.fillRect(0, 0, width, height);
  // Estrelas.
  for (let i = 0; i < 90; i++) {
    c.fillStyle = `rgba(255, 240, 220, ${.2 + hash(i, 1, 7) * .5})`;
    c.fillRect(hash(i, 2, 7) * width, hash(i, 3, 7) * horizon * .7, 1, 1);
  }
  skyline(c, width, horizon, 11, height * .3, '#1a0c14', 38);
  skyline(c, width, horizon + 10, 23, height * .2, '#0c0609', 26);
  // Chao rachado.
  c.fillStyle = linear(c, 0, horizon, 0, height, [[0, '#1a0c08'], [1, '#050203']]);
  c.fillRect(0, horizon + 6, width, height - horizon);
  c.strokeStyle = 'rgba(0, 0, 0, .55)';
  c.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const x = hash(i, 5, 9) * width;
    c.beginPath();
    c.moveTo(x, horizon + 20);
    c.lineTo(x + (hash(i, 6, 9) - .5) * 120, height);
    c.stroke();
  }
  return canvas;
}

// Porta de vault de verdade: parede de concreto, aro de aco com parafusos, travas, disco com sulcos, roda central
// com raios e a fresta aberta deixando a luz ambar vazar para o chao.
function metal(c, x0, y0, x1, y1, dark = false) {
  return linear(c, x0, y0, x1, y1, dark
    ? [[0, '#2a2723'], [.35, '#4a4640'], [.55, '#1d1b18'], [1, '#0e0d0b']]
    : [[0, '#8e8a80'], [.3, '#5c5850'], [.6, '#3a3732'], [1, '#1a1815']]);
}

function bolt(c, x, y, r) {
  c.fillStyle = '#16140f';
  c.beginPath();
  c.arc(x + r * .25, y + r * .3, r * 1.05, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = linear(c, x - r, y - r, x + r, y + r, [[0, '#b4aea0'], [.5, '#6a665c'], [1, '#2c2a25']]);
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(255, 255, 255, .35)';
  c.beginPath();
  c.arc(x - r * .3, y - r * .35, r * .3, 0, Math.PI * 2);
  c.fill();
}

function drawVaultDoor(c, cx, cy, radius, time) {
  c.save();
  const pulse = .8 + Math.sin(time / 650) * .1 + Math.sin(time / 170) * .03;
  // Parede de concreto com faixa de perigo no alto e rachaduras.
  const wallW = radius * 3.3;
  const wallH = radius * 2.9;
  const wx = cx - wallW / 2;
  const wy = cy - wallH * .52;
  c.fillStyle = linear(c, wx, wy, wx, wy + wallH, [[0, '#2c2824'], [.5, '#1b1815'], [1, '#0c0a09']]);
  c.fillRect(wx, wy, wallW, wallH);
  c.strokeStyle = 'rgba(0, 0, 0, .55)';
  c.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    const x = wx + hash(i, 1, 41) * wallW;
    c.beginPath();
    c.moveTo(x, wy + hash(i, 2, 41) * wallH * .3);
    c.lineTo(x + (hash(i, 3, 41) - .5) * 40, wy + wallH * (.4 + hash(i, 4, 41) * .6));
    c.stroke();
  }
  c.save();
  c.beginPath();
  c.rect(wx, wy, wallW, radius * .2);
  c.clip();
  for (let x = wx - radius; x < wx + wallW + radius; x += radius * .32) {
    c.fillStyle = '#d8a820';
    c.beginPath();
    c.moveTo(x, wy + radius * .2);
    c.lineTo(x + radius * .16, wy + radius * .2);
    c.lineTo(x + radius * .32, wy);
    c.lineTo(x + radius * .16, wy);
    c.fill();
  }
  c.restore();
  c.fillStyle = 'rgba(0, 0, 0, .4)';
  c.fillRect(wx, wy + radius * .2, wallW, 3);
  // Luz ambar saindo pela fresta: vaza para a frente e espalha no chao.
  c.globalCompositeOperation = 'lighter';
  const spill = c.createRadialGradient(cx, cy, radius * .3, cx, cy, radius * 2.8);
  spill.addColorStop(0, `rgba(255, 160, 60, ${.55 * pulse})`);
  spill.addColorStop(.5, `rgba(255, 110, 30, ${.16 * pulse})`);
  spill.addColorStop(1, 'rgba(255, 90, 20, 0)');
  c.fillStyle = spill;
  c.fillRect(cx - radius * 3, cy - radius * 3, radius * 6, radius * 6);
  const beam = c.createLinearGradient(cx - radius * .8, 0, cx - radius * 3.4, 0);
  beam.addColorStop(0, `rgba(255, 170, 70, ${.28 * pulse})`);
  beam.addColorStop(1, 'rgba(255, 140, 40, 0)');
  c.fillStyle = beam;
  c.beginPath();
  c.moveTo(cx - radius * .8, cy - radius * .55);
  c.lineTo(cx - radius * 3.4, cy + radius * 1.7);
  c.lineTo(cx - radius * .8, cy + radius * 1.3);
  c.closePath();
  c.fill();
  c.globalCompositeOperation = 'source-over';
  // Aro de aco com parafusos e sombra interna.
  c.fillStyle = metal(c, cx - radius * 1.25, cy - radius * 1.25, cx + radius * 1.25, cy + radius * 1.25);
  c.beginPath();
  c.arc(cx, cy, radius * 1.22, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(0, 0, 0, .7)';
  c.lineWidth = 2;
  c.stroke();
  c.strokeStyle = 'rgba(255, 235, 200, .18)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(cx, cy, radius * 1.19, Math.PI * .9, Math.PI * 1.7);
  c.stroke();
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    bolt(c, cx + Math.cos(a) * radius * 1.12, cy + Math.sin(a) * radius * 1.12, Math.max(2.2, radius * .035));
  }
  // Abertura interna: o interior iluminado onde a porta ja deslizou para o lado.
  const hole = radius * 1.02;
  c.fillStyle = linear(c, cx, cy - hole, cx, cy + hole, [[0, '#ffd890'], [.5, '#ff9a3c'], [1, '#8a3a12']]);
  c.beginPath();
  c.arc(cx, cy, hole, 0, Math.PI * 2);
  c.fill();
  // Travas cilindricas projetadas do disco para dentro do aro.
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + Math.PI / 12;
    c.save();
    c.translate(cx, cy);
    c.rotate(a);
    c.fillStyle = linear(c, 0, -radius * .07, 0, radius * .07, [[0, '#9a968a'], [.5, '#55524a'], [1, '#1d1b17']]);
    c.fillRect(radius * .86, -radius * .07, radius * .2, radius * .14);
    c.restore();
  }
  // O disco, deslocado para a esquerda: a fresta mostra a luz do lado direito.
  const shift = radius * .16;
  const dx = cx - shift;
  c.save();
  c.beginPath();
  c.arc(cx, cy, hole, 0, Math.PI * 2);
  c.clip();
  const disc = c.createRadialGradient(dx - radius * .3, cy - radius * .35, radius * .1, dx, cy, radius * .98);
  disc.addColorStop(0, '#8a867c');
  disc.addColorStop(.55, '#55524a');
  disc.addColorStop(1, '#25231f');
  c.fillStyle = disc;
  c.beginPath();
  c.arc(dx, cy, radius * .96, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(0, 0, 0, .8)';
  c.lineWidth = 2.5;
  c.stroke();
  // Sulcos concentricos com chanfro claro por baixo.
  for (const ring of [.84, .66, .48]) {
    c.strokeStyle = 'rgba(0, 0, 0, .65)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(dx, cy, radius * ring, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = 'rgba(255, 240, 210, .16)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(dx, cy + 1.5, radius * ring, 0.15, Math.PI - .15);
    c.stroke();
  }
  // Ferrugem escorrendo dos parafusos do disco.
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    const sx = dx + Math.cos(a) * radius * .9;
    const sy = cy + Math.sin(a) * radius * .9;
    const len = radius * (.12 + hash(i, 7, 51) * .22);
    c.fillStyle = linear(c, sx, sy, sx, sy + len, [[0, 'rgba(120, 60, 24, .6)'], [1, 'rgba(120, 60, 24, 0)']]);
    c.fillRect(sx - 1.5, sy, 3, len);
    bolt(c, sx, sy, Math.max(2, radius * .03));
  }
  // Numero estampado e a roda central.
  c.fillStyle = 'rgba(225, 215, 190, .78)';
  c.font = `bold ${Math.round(radius * .2)}px "Share Tech Mono", monospace`;
  c.textAlign = 'center';
  c.fillText('101', dx, cy - radius * .55);
  c.translate(dx, cy + radius * .08);
  c.fillStyle = 'rgba(0, 0, 0, .45)';
  c.beginPath();
  c.arc(radius * .03, radius * .04, radius * .3, 0, Math.PI * 2);
  c.fill();
  for (let spoke = 0; spoke < 6; spoke++) {
    const a = spoke / 6 * Math.PI * 2 + .2;
    c.save();
    c.rotate(a);
    c.fillStyle = linear(c, 0, -radius * .04, 0, radius * .04, [[0, '#b8b2a2'], [.5, '#6a665c'], [1, '#2a2824']]);
    c.fillRect(radius * .06, -radius * .035, radius * .22, radius * .07);
    c.restore();
  }
  c.strokeStyle = linear(c, -radius * .3, -radius * .3, radius * .3, radius * .3, [[0, '#c4bfae'], [.5, '#6a665c'], [1, '#26241f']]);
  c.lineWidth = radius * .05;
  c.beginPath();
  c.arc(0, 0, radius * .3, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = linear(c, -radius * .1, -radius * .1, radius * .1, radius * .1, [[0, '#d0cab8'], [1, '#3a3832']]);
  c.beginPath();
  c.arc(0, 0, radius * .1, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // Sombra do disco sobre a luz e reflexo do metal na borda.
  c.strokeStyle = 'rgba(255, 190, 110, .35)';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(cx, cy, hole, -Math.PI * .45, Math.PI * .45);
  c.stroke();
  c.restore();
}

// Presidente de costas, de casaco longo, uma sombra contra o brilho da porta.
function drawPresident(c, x, y, scale) {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  c.fillStyle = '#07040a';
  c.beginPath();
  c.moveTo(-14, 0);
  c.quadraticCurveTo(-18, -50, -8, -78);
  c.quadraticCurveTo(0, -84, 8, -78);
  c.quadraticCurveTo(18, -50, 14, 0);
  c.closePath();
  c.fill();
  c.beginPath();
  c.arc(0, -90, 9, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(255, 170, 80, .55)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(12, -80);
  c.quadraticCurveTo(17, -50, 13, -4);
  c.stroke();
  c.restore();
}

// Layd em pe, de perfil, olhando a porta: recebe a luz ambar do lado dela e fica escura do outro.
let dogLayer = null;
function drawLitDog(ctx, width, height, { x, y, scale, time, doorX }) {
  if (!dogLayer) dogLayer = document.createElement('canvas');
  if (dogLayer.width !== width || dogLayer.height !== height) { dogLayer.width = width; dogLayer.height = height; }
  const c = dogLayer.getContext('2d');
  c.clearRect(0, 0, width, height);
  drawDog(c, { x, y, facing: 1, scale, pose: 'stand', time, shadow: true });
  c.globalCompositeOperation = 'source-atop';
  const light = c.createLinearGradient(x - 110 * scale, 0, doorX, 0);
  light.addColorStop(0, 'rgba(8, 4, 12, .58)');
  light.addColorStop(.35, 'rgba(40, 14, 8, .25)');
  light.addColorStop(1, 'rgba(255, 150, 60, .22)');
  c.fillStyle = light;
  c.fillRect(0, 0, width, height);
  // Contorno de luz quente nas costas e na cabeca.
  c.globalCompositeOperation = 'source-over';
  ctx.drawImage(dogLayer, 0, 0);
}

export function drawCoverArt(ctx, width, height, time = 0) {
  if (typeof document === 'undefined' || !width || !height) return;
  const key = `${width}x${height}`;
  let base = staticCache.get(key);
  if (!base) {
    staticCache.clear();
    base = paintStatic(width, height);
    staticCache.set(key, base);
  }
  ctx.drawImage(base, 0, 0);
  const horizon = height * .66;
  // Lua verde de cinzas.
  const moonX = width * .78;
  const moonY = height * .2;
  const halo = ctx.createRadialGradient(moonX, moonY, 8, moonX, moonY, 150);
  halo.addColorStop(0, 'rgba(190, 255, 170, .4)');
  halo.addColorStop(1, 'rgba(190, 255, 170, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(moonX - 150, moonY - 150, 300, 300);
  ctx.fillStyle = '#dff5c8';
  ctx.beginPath();
  ctx.arc(moonX, moonY, 26, 0, Math.PI * 2);
  ctx.fill();
  const radius = Math.min(width, height) * .18;
  drawVaultDoor(ctx, width * .86, horizon - radius * .15, radius, time);
  // Os dois, de costas para nos, olhando para a porta.
  const unit = Math.max(.5, Math.min(width, height) / 560);
  drawPresident(ctx, width * .11, height * .84, 1.15 * unit);
  drawLitDog(ctx, width, height, { x: width * .19, y: height * .84, scale: 1.3 * unit, time, doorX: width * .85 });
  // Neblina rente ao chao.
  ctx.fillStyle = linear(ctx, 0, height * .8, 0, height, [[0, 'rgba(0, 0, 0, 0)'], [1, 'rgba(0, 0, 0, .55)']]);
  ctx.fillRect(0, height * .8, width, height * .2);
}
