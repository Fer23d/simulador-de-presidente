import { gradeStructure, hash, linear } from './art.js';
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
  skyline(c, width, horizon - 8, 5, height * .38, '#3a1a2c', 46);
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
  gradeStructure(canvas, 9);
  return canvas;
}

// Porta de vault de verdade, embutida numa cupula de concreto (os predios continuam visiveis atras dela):
// aro de aco com parafusos, corredor aceso na fresta, disco escovado com sulcos, pistoes hidraulicos,
// roda central e uma lampada de alerta piscando.
function metal(c, x0, y0, x1, y1) {
  return linear(c, x0, y0, x1, y1, [[0, '#8e8a80'], [.3, '#5c5850'], [.6, '#3a3732'], [1, '#1a1815']]);
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

function piston(c, x0, y0, x1, y1, width) {
  const length = Math.hypot(x1 - x0, y1 - y0);
  c.save();
  c.translate(x0, y0);
  c.rotate(Math.atan2(y1 - y0, x1 - x0));
  c.fillStyle = 'rgba(0, 0, 0, .5)';
  c.fillRect(2, width * .15, length * .7, width);
  c.fillStyle = linear(c, 0, -width / 2, 0, width / 2, [[0, '#9a968a'], [.45, '#55524a'], [1, '#1f1d19']]);
  c.fillRect(0, -width / 2, length * .6, width);
  c.fillStyle = linear(c, 0, -width * .3, 0, width * .3, [[0, '#d4cfc0'], [1, '#6a665c']]);
  c.fillRect(length * .55, -width * .28, length * .45, width * .56);
  c.restore();
  bolt(c, x0, y0, width * .55);
  bolt(c, x1, y1, width * .5);
}

function concreteDome(c, cx, cy, radius) {
  const dome = radius * 1.62;
  c.save();
  c.beginPath();
  c.arc(cx, cy + radius * .25, dome, 0, Math.PI * 2);
  c.clip();
  c.fillStyle = linear(c, cx - dome, cy - dome, cx + dome * .6, cy + dome, [[0, '#46403a'], [.45, '#2a2622'], [1, '#0d0b0a']]);
  c.fillRect(cx - dome, cy - dome, dome * 2, dome * 2.4);
  // Marcas de forma do concreto, manchas de agua e musgo.
  c.strokeStyle = 'rgba(0, 0, 0, .35)';
  c.lineWidth = 1.5;
  for (let i = -4; i <= 4; i++) {
    c.beginPath();
    c.arc(cx, cy + radius * .25, dome * (.55 + i * .06 + .3), Math.PI, Math.PI * 2);
    c.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const x = cx - dome + hash(i, 1, 61) * dome * 2;
    const y = cy - dome * .95 + hash(i, 2, 61) * dome * .6;
    const len = radius * (.25 + hash(i, 3, 61) * .6);
    c.fillStyle = linear(c, x, y, x, y + len, [[0, 'rgba(10, 8, 6, .5)'], [1, 'rgba(10, 8, 6, 0)']]);
    c.fillRect(x, y, 2 + hash(i, 4, 61) * 5, len);
  }
  for (let i = 0; i < 18; i++) {
    c.fillStyle = `rgba(60, 86, 40, ${.12 + hash(i, 5, 61) * .18})`;
    c.beginPath();
    c.ellipse(cx - dome * .9 + hash(i, 6, 61) * dome * 1.8, cy - dome * .8 + hash(i, 7, 61) * dome * .5, radius * (.06 + hash(i, 8, 61) * .12), radius * .04, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = 'rgba(0, 0, 0, .6)';
  c.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (.1 + hash(i, 9, 61) * .8) * Math.PI;
    const x = cx + Math.cos(a) * dome * .95;
    const y = cy + radius * .25 + Math.sin(a) * dome * .95;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x - Math.cos(a) * radius * (.3 + hash(i, 10, 61) * .5) + (hash(i, 11, 61) - .5) * 14, y - Math.sin(a) * radius * (.3 + hash(i, 10, 61) * .5));
    c.stroke();
  }
  c.restore();
  // Faixa de perigo ao longo do arco superior da cupula.
  c.save();
  c.lineWidth = radius * .12;
  const segments = 30;
  for (let i = 0; i < segments; i++) {
    c.strokeStyle = i % 2 ? '#d8a820' : '#1a1408';
    c.beginPath();
    c.arc(cx, cy + radius * .25, dome * .94, Math.PI * (1 + i / segments), Math.PI * (1 + (i + 1) / segments));
    c.stroke();
  }
  c.strokeStyle = 'rgba(0, 0, 0, .65)';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(cx, cy + radius * .25, dome, Math.PI, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.arc(cx, cy + radius * .25, dome * .94 - radius * .06, Math.PI, Math.PI * 2);
  c.stroke();
  c.restore();
}

function drawVaultDoor(c, cx, cy, radius, time) {
  c.save();
  const pulse = .8 + Math.sin(time / 650) * .1 + Math.sin(time / 170) * .03;
  concreteDome(c, cx, cy, radius);
  // Luz ambar vazando pela fresta: banha o chao e a cupula.
  c.globalCompositeOperation = 'lighter';
  const spill = c.createRadialGradient(cx, cy, radius * .3, cx, cy, radius * 2.8);
  spill.addColorStop(0, `rgba(255, 160, 60, ${.5 * pulse})`);
  spill.addColorStop(.5, `rgba(255, 110, 30, ${.14 * pulse})`);
  spill.addColorStop(1, 'rgba(255, 90, 20, 0)');
  c.fillStyle = spill;
  c.fillRect(cx - radius * 3, cy - radius * 3, radius * 6, radius * 6);
  const beam = c.createLinearGradient(cx - radius * .8, 0, cx - radius * 3.6, 0);
  beam.addColorStop(0, `rgba(255, 170, 70, ${.3 * pulse})`);
  beam.addColorStop(1, 'rgba(255, 140, 40, 0)');
  c.fillStyle = beam;
  c.beginPath();
  c.moveTo(cx - radius * .8, cy - radius * .5);
  c.lineTo(cx - radius * 3.6, cy + radius * 1.7);
  c.lineTo(cx - radius * .8, cy + radius * 1.3);
  c.closePath();
  c.fill();
  c.globalCompositeOperation = 'source-over';
  // Aro de aco com sombra projetada na cupula e parafusos.
  c.fillStyle = 'rgba(0, 0, 0, .45)';
  c.beginPath();
  c.arc(cx + radius * .05, cy + radius * .07, radius * 1.27, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = metal(c, cx - radius * 1.25, cy - radius * 1.25, cx + radius * 1.25, cy + radius * 1.25);
  c.beginPath();
  c.arc(cx, cy, radius * 1.22, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(0, 0, 0, .7)';
  c.lineWidth = 2;
  c.stroke();
  c.strokeStyle = 'rgba(255, 235, 200, .22)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(cx, cy, radius * 1.19, Math.PI * .9, Math.PI * 1.7);
  c.stroke();
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    bolt(c, cx + Math.cos(a) * radius * 1.12, cy + Math.sin(a) * radius * 1.12, Math.max(2.2, radius * .035));
  }
  // Abertura: um corredor aceso, com as linhas das paredes fugindo para o fundo.
  const hole = radius * 1.02;
  c.save();
  c.beginPath();
  c.arc(cx, cy, hole, 0, Math.PI * 2);
  c.clip();
  c.fillStyle = linear(c, cx, cy - hole, cx, cy + hole, [[0, '#ffe2a0'], [.5, '#ff9a3c'], [1, '#7a3010']]);
  c.fillRect(cx - hole, cy - hole, hole * 2, hole * 2);
  const vx = cx + radius * .2;
  c.strokeStyle = 'rgba(120, 50, 10, .6)';
  c.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2;
    c.beginPath();
    c.moveTo(vx, cy);
    c.lineTo(cx + Math.cos(a) * hole * 1.3, cy + Math.sin(a) * hole * 1.3);
    c.stroke();
  }
  for (let i = 1; i <= 4; i++) {
    c.strokeStyle = `rgba(90, 36, 8, ${.55 - i * .08})`;
    c.lineWidth = 2.2;
    c.beginPath();
    c.arc(vx, cy, hole * (1 - i * .2), 0, Math.PI * 2);
    c.stroke();
  }
  c.fillStyle = 'rgba(255, 235, 190, .8)';
  c.beginPath();
  c.arc(vx, cy, radius * .09, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(40, 14, 4, .65)';
  c.fillRect(vx - radius * .03, cy - radius * .2, radius * .06, radius * .4);
  c.restore();
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
  // O disco, deslocado para a esquerda.
  const shift = radius * .16;
  const dx = cx - shift;
  c.save();
  c.beginPath();
  c.arc(cx, cy, hole, 0, Math.PI * 2);
  c.clip();
  c.fillStyle = 'rgba(0, 0, 0, .5)';
  c.beginPath();
  c.arc(dx + radius * .06, cy + radius * .05, radius * .97, 0, Math.PI * 2);
  c.fill();
  const disc = c.createRadialGradient(dx - radius * .3, cy - radius * .35, radius * .1, dx, cy, radius * .98);
  disc.addColorStop(0, '#9a968c');
  disc.addColorStop(.55, '#5a574e');
  disc.addColorStop(1, '#25231f');
  c.fillStyle = disc;
  c.beginPath();
  c.arc(dx, cy, radius * .96, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.beginPath();
  c.arc(dx, cy, radius * .96, 0, Math.PI * 2);
  c.clip();
  // Metal escovado: riscos radiais finos e um brilho diagonal.
  c.lineWidth = .8;
  for (let i = 0; i < 90; i++) {
    const a = i / 90 * Math.PI * 2;
    c.strokeStyle = i % 2 ? 'rgba(255, 245, 225, .06)' : 'rgba(0, 0, 0, .1)';
    c.beginPath();
    c.moveTo(dx + Math.cos(a) * radius * .12, cy + Math.sin(a) * radius * .12);
    c.lineTo(dx + Math.cos(a) * radius * .96, cy + Math.sin(a) * radius * .96);
    c.stroke();
  }
  const shine = c.createLinearGradient(dx - radius, cy - radius, dx + radius * .6, cy + radius * .6);
  shine.addColorStop(0, 'rgba(255, 255, 255, 0)');
  shine.addColorStop(.35, 'rgba(255, 245, 225, .2)');
  shine.addColorStop(.5, 'rgba(255, 245, 225, 0)');
  shine.addColorStop(1, 'rgba(255, 150, 60, .16)');
  c.fillStyle = shine;
  c.fillRect(dx - radius, cy - radius, radius * 2, radius * 2);
  // Reflexo laranja da luz do corredor no lado direito do disco.
  const rim = c.createLinearGradient(dx + radius * .5, 0, dx + radius, 0);
  rim.addColorStop(0, 'rgba(255, 150, 60, 0)');
  rim.addColorStop(1, 'rgba(255, 150, 60, .35)');
  c.fillStyle = rim;
  c.fillRect(dx, cy - radius, radius, radius * 2);
  c.restore();
  c.strokeStyle = 'rgba(0, 0, 0, .8)';
  c.lineWidth = 2.5;
  c.beginPath();
  c.arc(dx, cy, radius * .96, 0, Math.PI * 2);
  c.stroke();
  for (const ring of [.84, .66, .48]) {
    c.strokeStyle = 'rgba(0, 0, 0, .65)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(dx, cy, radius * ring, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = 'rgba(255, 240, 210, .18)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(dx, cy + 1.5, radius * ring, 0.15, Math.PI - .15);
    c.stroke();
  }
  // Painel amarelo desgastado no alto do disco e ferrugem escorrendo dos parafusos.
  c.save();
  c.beginPath();
  c.arc(dx, cy, radius * .9, Math.PI * 1.12, Math.PI * 1.88);
  c.arc(dx, cy, radius * .8, Math.PI * 1.88, Math.PI * 1.12, true);
  c.closePath();
  c.fillStyle = 'rgba(200, 160, 30, .55)';
  c.fill();
  c.restore();
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    const sx = dx + Math.cos(a) * radius * .9;
    const sy = cy + Math.sin(a) * radius * .9;
    const len = radius * (.12 + hash(i, 7, 51) * .22);
    c.fillStyle = linear(c, sx, sy, sx, sy + len, [[0, 'rgba(120, 60, 24, .6)'], [1, 'rgba(120, 60, 24, 0)']]);
    c.fillRect(sx - 1.5, sy, 3, len);
    bolt(c, sx, sy, Math.max(2, radius * .03));
  }
  // Dentes de engrenagem que engatam nas travas, arranhoes de uso e sujeira acumulada na borda.
  for (let i = 0; i < 40; i++) {
    c.save();
    c.translate(dx, cy);
    c.rotate(i / 40 * Math.PI * 2);
    c.fillStyle = linear(c, radius * .9, 0, radius * .98, 0, [[0, '#6a665c'], [1, '#2a2824']]);
    c.fillRect(radius * .9, -radius * .026, radius * .08, radius * .052);
    c.fillStyle = 'rgba(255, 245, 225, .22)';
    c.fillRect(radius * .9, -radius * .026, radius * .08, 1);
    c.restore();
  }
  c.lineWidth = .8;
  for (let i = 0; i < 34; i++) {
    const a = hash(i, 1, 71) * Math.PI * 2;
    const d = radius * (.2 + hash(i, 2, 71) * .6);
    const sx = dx + Math.cos(a) * d;
    const sy = cy + Math.sin(a) * d;
    c.strokeStyle = i % 3 ? 'rgba(255, 245, 225, .14)' : 'rgba(0, 0, 0, .3)';
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(sx + (hash(i, 3, 71) - .5) * radius * .3, sy + (hash(i, 4, 71) - .5) * radius * .16);
    c.stroke();
  }
  const dirt = c.createRadialGradient(dx, cy, radius * .55, dx, cy, radius * .97);
  dirt.addColorStop(0, 'rgba(0, 0, 0, 0)');
  dirt.addColorStop(1, 'rgba(18, 10, 4, .5)');
  c.fillStyle = dirt;
  c.beginPath();
  c.arc(dx, cy, radius * .96, 0, Math.PI * 2);
  c.fill();
  // Roda central de vedacao.
  c.translate(dx, cy + radius * .08);
  c.fillStyle = 'rgba(0, 0, 0, .45)';
  c.beginPath();
  c.arc(radius * .03, radius * .04, radius * .3, 0, Math.PI * 2);
  c.fill();
  for (let spoke = 0; spoke < 6; spoke++) {
    c.save();
    c.rotate(spoke / 6 * Math.PI * 2 + .2);
    c.fillStyle = linear(c, 0, -radius * .04, 0, radius * .04, [[0, '#c4beae'], [.5, '#6a665c'], [1, '#2a2824']]);
    c.fillRect(radius * .06, -radius * .035, radius * .22, radius * .07);
    c.restore();
  }
  c.strokeStyle = linear(c, -radius * .3, -radius * .3, radius * .3, radius * .3, [[0, '#d0cab8'], [.5, '#6a665c'], [1, '#26241f']]);
  c.lineWidth = radius * .05;
  c.beginPath();
  c.arc(0, 0, radius * .3, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = linear(c, -radius * .1, -radius * .1, radius * .1, radius * .1, [[0, '#d8d2c0'], [1, '#3a3832']]);
  c.beginPath();
  c.arc(0, 0, radius * .1, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.strokeStyle = 'rgba(255, 190, 110, .4)';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(cx, cy, hole, -Math.PI * .45, Math.PI * .45);
  c.stroke();
  // Pistoes hidraulicos ligando o aro ao disco.
  piston(c, cx - radius * 1.17, cy - radius * .5, dx - radius * .82, cy - radius * .36, radius * .085);
  piston(c, cx - radius * 1.17, cy + radius * .5, dx - radius * .82, cy + radius * .36, radius * .085);
  // Vapor saindo dos pistoes, subindo e se desfazendo.
  c.save();
  for (const py of [-.5, .5]) {
    for (let i = 0; i < 5; i++) {
      const t = ((time / 1800) + i / 5 + (py > 0 ? .37 : 0)) % 1;
      c.fillStyle = `rgba(210, 205, 195, ${.2 * (1 - t)})`;
      c.beginPath();
      c.arc(cx - radius * 1.3 + Math.sin(t * 6 + i) * radius * .05, cy + py * radius - t * radius * .5, radius * (.04 + t * .1), 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
  // Painel de status na cupula: tres luzes.
  const panelX = cx + radius * 1.5;
  const panelY = cy - radius * .55;
  c.fillStyle = '#1a1815';
  c.fillRect(panelX - radius * .09, panelY - radius * .1, radius * .18, radius * .32);
  c.strokeStyle = '#4a463e';
  c.lineWidth = 1.5;
  c.strokeRect(panelX - radius * .09, panelY - radius * .1, radius * .18, radius * .32);
  [['#3aff6a', 0], ['#ffb02a', 1], ['#ff3a2a', 2]].forEach(([color, index]) => {
    const on = index === 1 || (index === 0 && Math.sin(time / 900) > 0);
    c.fillStyle = on ? color : '#2a2824';
    c.beginPath();
    c.arc(panelX, panelY + index * radius * .1, radius * .03, 0, Math.PI * 2);
    c.fill();
  });
  // Lampada de alerta no alto da cupula.
  const lampX = cx;
  const lampY = cy - radius * 1.42;
  c.fillStyle = '#25221d';
  c.fillRect(lampX - radius * .1, lampY, radius * .2, radius * .09);
  c.fillStyle = `rgba(255, 50, 30, ${.55 + .45 * Math.max(0, Math.sin(time / 380))})`;
  c.beginPath();
  c.arc(lampX, lampY, radius * .08, Math.PI, Math.PI * 2);
  c.fill();
  c.globalCompositeOperation = 'lighter';
  const lamp = c.createRadialGradient(lampX, lampY, 1, lampX, lampY, radius * .7);
  lamp.addColorStop(0, `rgba(255, 60, 30, ${.5 * Math.max(0, Math.sin(time / 380))})`);
  lamp.addColorStop(1, 'rgba(255, 60, 30, 0)');
  c.fillStyle = lamp;
  c.fillRect(lampX - radius * .7, lampY - radius * .7, radius * 1.4, radius * 1.4);
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
  light.addColorStop(0, 'rgba(8, 4, 12, .36)');
  light.addColorStop(.35, 'rgba(40, 14, 8, .16)');
  light.addColorStop(1, 'rgba(255, 150, 60, .22)');
  c.fillStyle = light;
  c.fillRect(0, 0, width, height);
  // Contorno de luz quente nas costas e na cabeca.
  c.globalCompositeOperation = 'source-over';
  ctx.drawImage(dogLayer, 0, 0);
}

let grainPattern = null;

// Granulado de filme e vinheta: unem o desenho a mesma textura dos cenarios pintados do jogo.
function filmFinish(ctx, width, height) {
  if (!grainPattern) {
    const tile = document.createElement('canvas');
    tile.width = 192;
    tile.height = 192;
    const t = tile.getContext('2d');
    const image = t.createImageData(192, 192);
    for (let index = 0; index < image.data.length; index += 4) {
      const value = 128 + (hash(index / 4 % 192, Math.floor(index / 4 / 192), 3) - .5) * 120;
      image.data[index] = image.data[index + 1] = image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
    t.putImageData(image, 0, 0);
    grainPattern = ctx.createPattern(tile, 'repeat');
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = .42;
  ctx.fillStyle = grainPattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  const vignette = ctx.createRadialGradient(width / 2, height * .55, Math.min(width, height) * .25, width / 2, height * .55, Math.max(width, height) * .75);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, .5)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

// Capa pintada opcional (assets/img/cover_art.png): se existir, ela substitui o cenario desenhado em codigo.
let coverImage = null;
function getCoverImage() {
  if (coverImage === null && typeof Image === 'function') {
    coverImage = new Image();
    coverImage.src = './assets/img/cover_art.png';
  }
  return coverImage && coverImage.complete && coverImage.naturalWidth > 0 ? coverImage : null;
}

export function drawCoverArt(ctx, width, height, time = 0) {
  if (typeof document === 'undefined' || !width || !height) return;
  const painted = getCoverImage();
  if (painted) {
    const scale = Math.max(width / painted.naturalWidth, height / painted.naturalHeight);
    const w = painted.naturalWidth * scale;
    const h = painted.naturalHeight * scale;
    ctx.drawImage(painted, (width - w) / 2, (height - h) / 2, w, h);
    const glow = ctx.createRadialGradient(width * .5, height * .6, 10, width * .5, height * .6, Math.max(width, height) * .7);
    glow.addColorStop(0, `rgba(255, 150, 60, ${.05 + Math.sin(time / 700) * .02})`);
    glow.addColorStop(1, 'rgba(0, 0, 0, .45)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    return;
  }
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
  const radius = Math.min(width, height) * .17;
  drawVaultDoor(ctx, width * .81, horizon - radius * .15, radius, time);
  // Os dois, de costas para nos, olhando para a porta.
  const unit = Math.max(.5, Math.min(width, height) / 560);
  drawPresident(ctx, width * .11, height * .84, 1.15 * unit);
  drawLitDog(ctx, width, height, { x: width * .19, y: height * .84, scale: 1.3 * unit, time, doorX: width * .85 });
  // Neblina rente ao chao.
  ctx.fillStyle = linear(ctx, 0, height * .8, 0, height, [[0, 'rgba(0, 0, 0, 0)'], [1, 'rgba(0, 0, 0, .55)']]);
  ctx.fillRect(0, height * .8, width, height * .2);
  filmFinish(ctx, width, height);
}
