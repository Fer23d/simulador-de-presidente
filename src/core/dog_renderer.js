import { gradeStructure, hash } from './art.js';

// Layd: cadela pastor-alema mestica, magra e marcada pelo Ermo. De lado, virada para +x, chao em y = 0.
// ~52 de altura na cernelha. Cada parte (patas, corpo, cabeca, cauda) e uma silhueta de volumes macios
// pintada em camadas (manto escuro, barriga clara, sombras borradas, pelos) como nos sprites pintados do jogo.
export const DOG_HEIGHT = 58;

const RES = 2;
const BOX = { x: 70, y: 118, w: 190, h: 128 };
let scratch = null;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function getScratch() {
  if (typeof document === 'undefined') return null;
  if (!scratch) {
    scratch = document.createElement('canvas');
    scratch.width = BOX.w * RES;
    scratch.height = BOX.h * RES;
  }
  return scratch;
}

function twoBone(a, target, upper, lower, bend) {
  const dx = target.x - a.x;
  const dy = target.y - a.y;
  const reach = clamp(Math.hypot(dx, dy), Math.abs(upper - lower) + .5, upper + lower - .5);
  const base = Math.atan2(dy, dx);
  const angle = Math.acos(clamp((upper * upper + reach * reach - lower * lower) / (2 * upper * reach), -1, 1));
  return { knee: { x: a.x + Math.cos(base + bend * angle) * upper, y: a.y + Math.sin(base + bend * angle) * upper },
    end: { x: a.x + Math.cos(base) * reach, y: a.y + Math.sin(base) * reach } };
}

// Curva suave (Catmull-Rom) por pontos com raios, usada para todos os volumes.
function smooth(points, radii, steps = 9) {
  const outP = [];
  const outR = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a, b, c, d) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      outP.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y) });
      outR.push(radii[i] + (radii[i + 1] - radii[i]) * (t * t * (3 - 2 * t)));
    }
  }
  outP.push(points.at(-1));
  outR.push(radii.at(-1));
  return { points: outP, radii: outR };
}

function stamps(c, chain, grow = 0) {
  const { points, radii } = smooth(chain.map(([x, y]) => ({ x, y })), chain.map(([, , r]) => r));
  c.beginPath();
  points.forEach((p, i) => {
    const r = radii[i] + grow;
    c.moveTo(p.x + r, p.y);
    c.arc?.(p.x, p.y, r, 0, Math.PI * 2);
  });
  c.fill();
}

function soft(c, blur, draw) {
  c.save();
  c.filter = `blur(${blur * RES}px)`;
  draw();
  c.restore();
}

function ellipse(c, x, y, rx, ry, rot = 0) {
  c.beginPath();
  c.ellipse?.(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fill();
}

function polygon(c, pts) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
}

// Pelos curtos: tracos finos claros e escuros na direcao do crescimento (da cabeca para a cauda).
function fur(c, area, count, seed, angle = Math.PI - .12, length = 4) {
  c.lineWidth = .5;
  for (let i = 0; i < count; i++) {
    const x = area[0] + hash(i, 1, seed) * (area[2] - area[0]);
    const y = area[1] + hash(i, 2, seed) * (area[3] - area[1]);
    const a = angle + (hash(i, 3, seed) - .5) * .7;
    const l = length * (.6 + hash(i, 4, seed) * .8);
    const tone = hash(i, 5, seed);
    c.strokeStyle = tone > .62 ? 'rgba(255, 218, 150, .32)' : tone > .25 ? 'rgba(35, 20, 8, .3)' : 'rgba(120, 76, 30, .35)';
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(a) * l * .5, y + Math.sin(a) * l * .5 - .5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    c.stroke();
  }
}

// Pinta uma camada: silhueta -> pintura por dentro (source-atop) -> contorno escuro por tras -> cola no desenho final.
function layer(ctx, xf, shape, paint) {
  const sc = getScratch();
  if (!sc) {
    ctx.save();
    ctx.fillStyle = '#9a6a30';
    xf?.(ctx);
    shape(ctx, 0);
    ctx.restore();
    return;
  }
  const c = sc.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, sc.width, sc.height);
  c.save();
  c.scale(RES, RES);
  c.translate(BOX.x, BOX.y);
  xf?.(c);
  c.fillStyle = '#000';
  shape(c, 0);
  c.globalCompositeOperation = 'source-atop';
  paint(c);
  c.globalCompositeOperation = 'destination-over';
  c.fillStyle = 'rgba(27, 16, 8, .5)';
  shape(c, .6);
  c.restore();
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sc, -BOX.x, -BOX.y, BOX.w, BOX.h);
  ctx.restore();
}

const PAW_STAMP = (foot) => [[foot.x - 1, foot.y - 4.2, 3.6], [foot.x + 3.4, foot.y - 2.2, 3.4], [foot.x + 6.6, foot.y - 1.7, 2.5]];

function legShape(chain, foot) {
  return (c, grow) => { stamps(c, chain, grow); stamps(c, PAW_STAMP(foot), grow); };
}

function paintLeg(c, far, seed, topY) {
  const grad = c.createLinearGradient(0, topY, 0, 0);
  grad.addColorStop(0, '#a56f31');
  grad.addColorStop(.45, '#c78f4c');
  grad.addColorStop(.8, '#dcc088');
  grad.addColorStop(1, '#eadbb4');
  c.fillStyle = grad;
  c.fillRect(-70, topY - 10, 190, -topY + 14);
  soft(c, 1.2, () => {
    c.fillStyle = 'rgba(40, 22, 8, .5)';
    ellipse(c, -20, topY + 10, 20, 6);
    c.fillStyle = 'rgba(30, 16, 6, .4)';
    ellipse(c, 10, topY + 12, 14, 5);
  });
  fur(c, [-60, topY - 5, 80, 0], 180, seed, Math.PI / 2 + .2, 3);
  if (far) {
    c.fillStyle = 'rgba(18, 9, 3, .46)';
    c.fillRect(-70, topY - 10, 190, 40);
  }
}

function frontLeg(ctx, shoulder, target, far, seed) {
  const { knee, end } = twoBone(shoulder, { x: target.x, y: target.y - 6 }, 21, 19, 1);
  const chain = [[shoulder.x, shoulder.y, 5.8], [knee.x, knee.y, 3.8], [end.x, end.y, 2.7], [end.x + 1.4, target.y - 2, 2.5]];
  layer(ctx, null, legShape(chain, { x: target.x - 1.6, y: target.y }), (c) => paintLeg(c, far, seed, shoulder.y - 8));
}

function hindLeg(ctx, hip, target, far, seed) {
  const { knee, end } = twoBone(hip, { x: target.x - 5, y: target.y - 17 }, 20, 20, -1);
  const chain = [[hip.x, hip.y, 8.4], [knee.x, knee.y, 5.4], [end.x, end.y, 3], [target.x - 1.4, target.y - 2, 2.5]];
  layer(ctx, null, legShape(chain, { x: target.x - 1.6, y: target.y }), (c) => paintLeg(c, far, seed, hip.y - 12));
}

const TORSO = [[-36, -38, 12.4], [-22, -43, 11.4], [-6, -42, 10.8], [10, -41, 12.8], [26, -38, 15.4], [34, -36, 13.6]];
const NECK = [[28, -46, 13], [36, -58, 11], [44, -69, 9.4]];

function bodyShape(c, grow) {
  stamps(c, TORSO, grow);
  stamps(c, NECK, grow);
}

function paintBody(c, seed) {
  c.fillStyle = '#b57c39';
  c.fillRect(-70, -110, 200, 130);
  soft(c, 3, () => {
    c.fillStyle = 'rgba(222, 164, 88, .7)';
    ellipse(c, 6, -37, 30, 7);
    c.fillStyle = 'rgba(232, 178, 100, .55)';
    ellipse(c, -24, -40, 10, 8);
  });
  // Manto escuro das costas, descendo pelo flanco e afinando para a garupa; continua pelo alto do pescoco.
  soft(c, 2.4, () => {
    c.fillStyle = 'rgba(20, 13, 8, .96)';
    polygon(c, [[-50, -56], [30, -62], [42, -80], [70, -90], [70, -30], [60, -62], [44, -60], [36, -52], [30, -45], [18, -37], [0, -34], [-20, -37], [-44, -42], [-50, -44]]);
  });
  // Peito, garganta e barriga claros.
  soft(c, 3, () => {
    c.fillStyle = 'rgba(236, 218, 172, .92)';
    ellipse(c, 6, -19, 42, 8.5);
    ellipse(c, 38, -29, 8, 14);
    c.strokeStyle = 'rgba(232, 212, 164, .8)';
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(36, -50);
    c.lineTo(46, -64);
    c.stroke();
  });
  // Sombras: debaixo do corpo, atras do cotovelo, na dobra da coxa e embaixo do queixo.
  const under = c.createLinearGradient(0, -34, 0, -16);
  under.addColorStop(0, 'rgba(40, 20, 6, 0)');
  under.addColorStop(1, 'rgba(40, 20, 6, .5)');
  c.fillStyle = under;
  c.fillRect(-70, -34, 200, 30);
  soft(c, 2, () => {
    c.fillStyle = 'rgba(30, 16, 6, .45)';
    ellipse(c, 14, -29, 4.5, 8, .1);
    ellipse(c, -27, -32, 5, 8, -.2);
    c.fillStyle = 'rgba(30, 16, 6, .3)';
    ellipse(c, 30, -49, 4, 6);
  });
  // Luz quente na linha do dorso.
  soft(c, 1.2, () => {
    c.strokeStyle = 'rgba(240, 190, 118, .5)';
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(-42, -50);
    c.bezierCurveTo(-24, -55.5, -4, -54, 12, -54.4);
    c.bezierCurveTo(22, -54.6, 30, -58, 38, -68);
    c.stroke();
  });
  fur(c, [-48, -64, 50, -16], 520, seed);
  fur(c, [30, -70, 50, -40], 70, seed + 7, Math.PI * .72, 5);
  // Pelos mais longos no peito.
  c.strokeStyle = 'rgba(240, 224, 184, .8)';
  c.lineWidth = .6;
  for (let i = 0; i < 8; i++) {
    const y = -36 + i * 2.2;
    c.beginPath();
    c.moveTo(42 - hash(i, 9, seed) * 3, y);
    c.lineTo(43.2, y + 2);
    c.stroke();
  }
}

function tailChain(root, base, wag, time) {
  const chain = [];
  let angle = base;
  let { x, y } = root;
  const radii = [3, 4.3, 4.9, 4.8, 4.2, 3.4, 2.2, 1];
  for (let i = 0; i < radii.length; i++) {
    chain.push([x, y, radii[i]]);
    angle += Math.sin(time / 1000 * wag.speed - i * .55) * wag.amount / 4 + (i > 3 ? .09 : 0);
    x += Math.cos(angle) * 5.8;
    y += Math.sin(angle) * 5.8;
  }
  return chain;
}

function drawTail(ctx, root, base, wag, time, seed) {
  const chain = tailChain(root, base, wag, time);
  layer(ctx, null, (c, grow) => stamps(c, chain, grow), (c) => {
    c.fillStyle = '#9a6430';
    c.fillRect(-70, -110, 200, 130);
    soft(c, 1.4, () => {
      c.fillStyle = 'rgba(18, 11, 6, .9)';
      const tip = chain.at(-1);
      c.beginPath();
      c.moveTo(chain[2][0], chain[2][1] - 8);
      c.lineTo(tip[0] + 6, tip[1] - 8);
      c.lineTo(tip[0] + 6, tip[1] + 8);
      c.lineTo(tip[0] - 14, tip[1] + 6);
      c.fill();
      c.fillStyle = 'rgba(224, 180, 112, .5)';
      ellipse(c, chain[1][0], chain[1][1] + 3, 7, 3);
    });
    fur(c, [-70, -60, 40, 10], 160, seed, Math.PI + .15, 5);
  });
}

const HEAD_SKULL = [[0, 0, 7.2], [4, .2, 6.6]];
const HEAD_MUZZLE = [[6, 1.6, 5.6], [11, 2.6, 4.5], [16, 3.1, 3.7]];
const HEAD_JAW = [[6, 4.6, 4], [11, 5.4, 3], [15, 5.2, 2.2]];

function headShape(c, grow) {
  stamps(c, HEAD_SKULL, grow);
  stamps(c, HEAD_MUZZLE, grow);
  stamps(c, HEAD_JAW, grow);
}

function drawEar(ctx, xf, dark, flick) {
  layer(ctx, (c) => { xf(c); c.translate(dark ? -3.4 : 0, 0); c.rotate(flick); }, (c, grow) => {
    c.beginPath();
    c.moveTo(-6 - grow, -3);
    c.quadraticCurveTo(-8.4 - grow, -13, -2.6, -22 - grow);
    c.quadraticCurveTo(2.4 + grow, -13, 4.6 + grow, -3);
    c.closePath();
    c.fill();
  }, (c) => {
    const g = c.createLinearGradient(0, -22, 0, -2);
    g.addColorStop(0, dark ? '#1c120a' : '#2a1b0e');
    g.addColorStop(.55, dark ? '#4a2f17' : '#6a4521');
    g.addColorStop(1, '#a66f33');
    c.fillStyle = g;
    c.fillRect(-12, -26, 24, 28);
    if (!dark) {
      soft(c, .8, () => { c.fillStyle = 'rgba(206, 140, 128, .6)'; ellipse(c, -.6, -9.5, 2.1, 7.5, .1); });
      c.strokeStyle = 'rgba(236, 206, 160, .7)';
      c.lineWidth = .5;
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(-2 + i * 1.5, -5);
        c.lineTo(-1.6 + i * 1.3, -13 - i);
        c.stroke();
      }
    }
  });
}

function drawHead(ctx, bodyXf, origin, tilt, mouthOpen, time, happy, seed) {
  const xf = (c) => {
    bodyXf?.(c);
    c.translate(origin.x, origin.y);
    c.rotate(tilt);
    c.scale(.9, .9);
  };
  drawEar(ctx, xf, true, -.16 + Math.sin(time / 1700) * .03);
  layer(ctx, xf, headShape, (c) => {
    c.fillStyle = '#b57c39';
    c.fillRect(-20, -20, 60, 40);
    soft(c, 1.6, () => {
      c.fillStyle = 'rgba(26, 17, 9, .85)';
      polygon(c, [[-14, -14], [8, -9], [14, -3], [30, -3], [30, -20], [-14, -20]]);
      c.fillStyle = 'rgba(10, 6, 3, .96)';
      ellipse(c, 13, 1.8, 8.8, 4.4, .12);
      ellipse(c, 4.4, -1.8, 3.4, 2.4);
      c.fillStyle = 'rgba(238, 220, 176, .9)';
      ellipse(c, 9.5, 7.2, 8, 2.6, .05);
      c.fillStyle = 'rgba(228, 170, 94, .65)';
      ellipse(c, 3.6, -4.2, 1.5, 1);
      ellipse(c, -1.4, 3.8, 4, 3);
    });
    fur(c, [-10, -12, 16, 8], 60, seed + 3, Math.PI - .2, 2.6);
  });
  // Detalhes finos por cima: olho, nariz, boca, lingua e bigodes.
  const c = ctx;
  c.save();
  xf(c);
  const open = mouthOpen;
  if (open > .12) {
    c.fillStyle = '#3a0d12';
    c.beginPath();
    c.moveTo(14.4, 4.4);
    c.quadraticCurveTo(10, 5 + open * 2, 5.4, 4.4);
    c.quadraticCurveTo(10, 7 + open * 5, 14.4, 6.4);
    c.fill();
    c.fillStyle = '#d8737c';
    c.beginPath();
    c.ellipse?.(9.4, 6.9 + open * 3.6, 4.2, 1.8 + open * 1.6, .15, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255, 255, 255, .28)';
    c.fillRect(7.6, 6.2 + open * 3, 3, .5);
  }
  c.strokeStyle = 'rgba(8, 5, 3, .85)';
  c.lineWidth = .6;
  c.beginPath();
  c.moveTo(15.4, 3.6);
  c.quadraticCurveTo(10, 4.4 + open, 5.6, 3.9);
  c.stroke();
  c.fillStyle = '#060403';
  c.beginPath();
  c.ellipse?.(18.5, -.7, 2.7, 2.3, .2, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(255, 255, 255, .55)';
  c.beginPath();
  c.ellipse?.(19.4, -1.7, 1, .6, -.4, 0, Math.PI * 2);
  c.fill();
  const blink = Math.sin(time / 2300) > .985 ? .15 : 1;
  c.fillStyle = '#0a0603';
  c.beginPath();
  c.ellipse?.(4.4, -1.8, 2.5, 1.55 * blink, .12, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#9a6420';
  c.beginPath();
  c.ellipse?.(4.7, -1.8, 1.6, 1.3 * blink, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#050302';
  c.beginPath();
  c.ellipse?.(4.9, -1.8, .75, .95 * blink, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(255, 255, 255, .9)';
  c.beginPath();
  c.arc?.(4.1, -2.5, .42, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(235, 220, 190, .45)';
  c.lineWidth = .3;
  c.beginPath();
  c.moveTo(14, 2.6);
  c.lineTo(20.5, 4.6);
  c.moveTo(13.4, 1.8);
  c.lineTo(20.8, 2.6);
  c.stroke();
  c.restore();
  drawEar(ctx, xf, false, .02 + Math.sin(time / 1900 + 1) * .03);
}

function collar(ctx, bodyXf, head) {
  ctx.save();
  bodyXf?.(ctx);
  const cx = 37 + head.x * .3;
  const cy = -57 + head.y * .3;
  const nx = .84;
  const ny = .54;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1d0d06';
  ctx.lineWidth = 5.2;
  ctx.beginPath();
  ctx.moveTo(cx - nx * 10.6, cy - ny * 10.6);
  ctx.quadraticCurveTo(cx + 1.4, cy + 1.2, cx + nx * 10.8, cy + ny * 10.8);
  ctx.stroke();
  ctx.strokeStyle = '#7a3519';
  ctx.lineWidth = 3.8;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(232, 160, 110, .45)';
  ctx.lineWidth = .8;
  ctx.beginPath();
  ctx.moveTo(cx - nx * 9, cy - ny * 9 - 1);
  ctx.quadraticCurveTo(cx + .6, cy - .6, cx + nx * 9, cy + ny * 9 - 1);
  ctx.stroke();
  const tagX = cx + nx * 10.6;
  const tagY = cy + ny * 10.6 + 3.2;
  ctx.fillStyle = '#6a4408';
  ctx.beginPath();
  ctx.arc?.(tagX, tagY, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e0aa45';
  ctx.beginPath();
  ctx.arc?.(tagX, tagY, 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 245, 190, .8)';
  ctx.beginPath();
  ctx.arc?.(tagX - .6, tagY - .7, .7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Arte pintada: layd_sheet.webp tem 4 colunas x 4 linhas, virada para a direita, pes na base de cada celula.
// Linha 1 anda, linha 2 corre, linha 3 parada (em pe, sentada, sentada feliz, deitada doente), linha 4 anda doente.
const SHEET_COLS = 4;
const SHEET_ROWS = 4;
const sheetBounds = new WeakMap();

function cellBounds(sheet, col, row) {
  const cw = sheet.width / SHEET_COLS;
  const ch = sheet.height / SHEET_ROWS;
  const full = { x: 0, y: 0, w: cw, h: ch };
  if (typeof document === 'undefined') return full;
  let cache = sheetBounds.get(sheet);
  if (!cache) { cache = new Map(); sheetBounds.set(sheet, cache); }
  const key = row * SHEET_COLS + col;
  if (cache.has(key)) return cache.get(key);
  let bounds = full;
  try {
    const probe = document.createElement('canvas');
    probe.width = Math.max(1, Math.floor(cw));
    probe.height = Math.max(1, Math.floor(ch));
    const p = probe.getContext('2d');
    p.drawImage(sheet, col * cw, row * ch, cw, ch, 0, 0, probe.width, probe.height);
    const data = p.getImageData(0, 0, probe.width, probe.height).data;
    let minX = probe.width, minY = probe.height, maxX = -1, maxY = -1;
    for (let y = 0; y < probe.height; y++) {
      for (let x = 0; x < probe.width; x++) {
        if (data[(y * probe.width + x) * 4 + 3] > 24) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= minX && maxY >= minY) bounds = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  } catch { /* arte sem leitura de pixels: usa a celula inteira */ }
  cache.set(key, bounds);
  return bounds;
}

function rowBottom(sheet, row) {
  let bottom = 0;
  for (let col = 0; col < SHEET_COLS; col++) {
    const bounds = cellBounds(sheet, col, row);
    bottom = Math.max(bottom, bounds.y + bounds.h);
  }
  return bottom;
}

function sheetFrame(pose, gait, happy, sick) {
  if (pose === 'walk' || pose === 'run') {
    const frame = Math.floor((((gait / (Math.PI * 2)) % 1) + 1) % 1 * SHEET_COLS) % SHEET_COLS;
    const row = sick ? 3 : pose === 'run' ? 1 : 0;
    return { col: frame, row };
  }
  if (pose === 'sit') return { col: sick ? 3 : happy ? 2 : 1, row: 2 };
  return { col: sick ? 3 : 0, row: 2 };
}

function drawDogSheet(ctx, sheet, { x, y, facing, scale, pose, gait, happy, sick, shadow }) {
  const { col, row } = sheetFrame(pose, gait, happy, sick);
  const cw = sheet.width / SHEET_COLS;
  const ch = sheet.height / SHEET_ROWS;
  const bounds = cellBounds(sheet, col, row);
  // A cadela em pe define a escala: todos os quadros usam a mesma proporcao de pixels por unidade.
  const reference = cellBounds(sheet, 0, 2);
  const k = DOG_HEIGHT * 1.5 * scale / reference.h;
  ctx.save();
  ctx.translate(x, y);
  if (shadow) {
    ctx.fillStyle = 'rgba(0, 0, 0, .34)';
    ctx.beginPath();
    ctx.ellipse?.(0, 1.5 * scale, Math.max(24, bounds.w * k * .42), 4.4 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.scale(facing, 1);
  ctx.imageSmoothingEnabled = true;
  // Os pes ficam na linha mais baixa da propria fileira (nao na borda da celula) e o corpo na coluna do centro da celula.
  const base = rowBottom(sheet, row);
  ctx.drawImage(sheet, col * cw + bounds.x, row * ch + bounds.y, bounds.w, bounds.h,
    (bounds.x - cw / 2) * k, (bounds.y - base) * k, bounds.w * k, bounds.h * k);
  ctx.restore();
}

// pose: 'stand' | 'walk' | 'run' | 'sit'. gait avanca com a distancia andada.
// Cada quadro e pintado uma vez (camadas pesadas) e guardado; o jogo so cola a imagem pronta.
const frameCache = new Map();
const FRAME_LIMIT = 220;

export function drawDog(ctx, { x = 0, y = 0, facing = 1, scale = 1, pose = 'stand', gait = 0, time = 0, happy = false, shadow = true, sheet = null, sick = false } = {}) {
  if (sheet?.width > 0 && sheet?.height > 0) { drawDogSheet(ctx, sheet, { x, y, facing, scale, pose, gait, happy, sick, shadow }); return; }
  if (typeof document === 'undefined') { paintDog(ctx, { x, y, facing, scale, pose, gait, time, happy, shadow }); return; }
  const moving = pose === 'walk' || pose === 'run';
  const step = moving ? Math.round(((gait / (Math.PI * 2)) % 1 + 1) % 1 * 10) % 10 : 0;
  const tick = Math.floor(time / (moving ? 160 : 220)) % (moving ? 2 : 10);
  const quality = frameQuality(scale);
  const frame = getFrame(pose, happy, step, tick, quality);
  ctx.save();
  ctx.translate(x, y);
  if (shadow) {
    ctx.fillStyle = 'rgba(0, 0, 0, .34)';
    ctx.beginPath();
    ctx.ellipse?.(0, 1.5 * scale, (pose === 'sit' ? 30 : 48) * scale, 4.4 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.scale(facing, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const ratio = scale / frame.k;
  ctx.drawImage(frame.canvas, -BOX.x * scale, -BOX.y * scale, frame.canvas.width * ratio, frame.canvas.height * ratio);
  ctx.restore();
}

function frameQuality(scale) {
  return Math.max(1, Math.round(scale * 2 * (globalThis.devicePixelRatio || 1) * 2) / 2);
}

function getFrame(pose, happy, step, tick, quality) {
  const moving = pose === 'walk' || pose === 'run';
  const key = [pose, happy ? 1 : 0, step, tick, quality].join('|');
  let frame = frameCache.get(key);
  if (!frame) {
    if (frameCache.size >= FRAME_LIMIT) frameCache.delete(frameCache.keys().next().value);
    const k = quality / 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(BOX.w * k);
    canvas.height = Math.ceil(BOX.h * k);
    const c = canvas.getContext('2d');
    c.translate(BOX.x * k, BOX.y * k);
    paintDog(c, { scale: k, pose, gait: step / 10 * Math.PI * 2, time: tick * (moving ? 160 : 220), happy, shadow: false });
    gradeStructure(canvas, 3);
    frame = { canvas, k };
    frameCache.set(key, frame);
  }
  return frame;
}

// Pinta os quadros de andar/correr/ficar parada aos poucos, antes de precisar deles, para o jogo nao engasgar.
const warmed = new Set();
export function warmDogFrames(scale) {
  if (typeof document === 'undefined') return;
  const quality = frameQuality(scale);
  if (warmed.has(quality)) return;
  warmed.add(quality);
  const jobs = [];
  for (let step = 0; step < 10; step++) for (let tick = 0; tick < 2; tick++) { jobs.push(['walk', step, tick]); jobs.push(['run', step, tick]); }
  for (let tick = 0; tick < 10; tick++) { jobs.push(['stand', 0, tick]); jobs.push(['sit', 0, tick]); }
  const next = () => {
    const job = jobs.shift();
    if (!job) return;
    getFrame(job[0], false, job[1], job[2], quality);
    setTimeout(next, 30);
  };
  setTimeout(next, 200);
}

function paintDog(ctx, { x = 0, y = 0, facing = 1, scale = 1, pose = 'stand', gait = 0, time = 0, happy = false, shadow = true } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const moving = pose === 'walk' || pose === 'run';
  const running = pose === 'run';
  const sit = pose === 'sit';
  const seed = 5;
  if (shadow) {
    ctx.fillStyle = 'rgba(0, 0, 0, .34)';
    ctx.beginPath();
    ctx.ellipse?.(sit ? -8 : 0, 1.5, sit ? 30 : 48, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const wag = { amount: happy ? 1.5 : moving ? .35 : .4, speed: happy ? 15 : moving ? 6 : 3 };
  if (sit) {
    drawSitting(ctx, time, happy, seed);
    ctx.restore();
    return;
  }
  const bob = moving ? -Math.abs(Math.sin(gait)) * (running ? 2.4 : 1.1) : Math.sin(time / 640) * .4;
  const stride = running ? 15 : 9;
  const lift = running ? 9 : 5.5;
  const phases = { hindNear: gait, frontNear: gait + Math.PI * .5, hindFar: gait + Math.PI, frontFar: gait + Math.PI * 1.5 };
  const base = { frontNear: { x: 25, y: 0 }, frontFar: { x: 32, y: 0 }, hindNear: { x: -26, y: 0 }, hindFar: { x: -33, y: 0 } };
  const target = (name) => moving
    ? { x: base[name].x + stride * Math.cos(phases[name]), y: base[name].y - Math.max(0, -Math.sin(phases[name])) * lift } : base[name];
  const shoulder = { x: 21, y: -39 + bob };
  const hip = { x: -31, y: -42 + bob };
  const bodyXf = (c) => c.translate(0, bob - 6);
  const head = { x: running ? 6 : 0, y: running ? 5 : Math.sin(time / 1400) * 1.1 };
  hindLeg(ctx, { x: hip.x + 3, y: hip.y }, target('hindFar'), true, seed + 1);
  frontLeg(ctx, { x: shoulder.x + 2, y: shoulder.y }, target('frontFar'), true, seed + 2);
  drawTail(ctx, { x: -44, y: -47 + bob }, happy ? Math.PI + .95 : running ? Math.PI + .4 : Math.PI - .55, wag, time, seed);
  layer(ctx, bodyXf, bodyShape, (c) => paintBody(c, seed));
  hindLeg(ctx, hip, target('hindNear'), false, seed + 3);
  frontLeg(ctx, shoulder, target('frontNear'), false, seed + 4);
  collar(ctx, bodyXf, head);
  const mouth = running || happy ? .6 + Math.sin(time / 130) * .25 : moving ? .25 : 0;
  drawHead(ctx, bodyXf, { x: 49 + head.x, y: -74 + head.y }, running ? .22 : happy ? -.14 : Math.sin(time / 1700) * .04, mouth, time, happy, seed);
  ctx.restore();
}

// Sentada: o corpo gira em torno do quadril apoiado no chao e as patas da frente ficam retas.
function drawSitting(ctx, time, happy, seed) {
  const ang = -.95;
  const hip = { x: -30, y: -15 + Math.sin(time / 650) * .4 };
  const bodyXf = (c) => { c.translate(hip.x, hip.y); c.rotate(ang); c.translate(30, 30); };
  const place = (p) => {
    const dx = p.x + 30;
    const dy = p.y + 30;
    return { x: hip.x + dx * Math.cos(ang) - dy * Math.sin(ang), y: hip.y + dx * Math.sin(ang) + dy * Math.cos(ang) };
  };
  const shoulder = place({ x: 21, y: -33 });
  const frontFoot = { x: shoulder.x + 4, y: 0 };
  const haunch = (far) => {
    const o = far ? 5 : 0;
    const chain = [[-27 + o * .3, -14, 10.5], [-16 + o * .3, -7, 6], [-8 + o, -3.5, 3.2]];
    layer(ctx, null, (c, grow) => { stamps(c, chain, grow); stamps(c, PAW_STAMP({ x: -4 + o, y: 0 }), grow); }, (c) => paintLeg(c, far, seed + 8, -26));
  };
  frontLeg(ctx, { x: shoulder.x + 3, y: shoulder.y }, { x: frontFoot.x + 5, y: 0 }, true, seed + 2);
  haunch(true);
  drawTail(ctx, { x: -42, y: -7 }, Math.PI - .08, { amount: happy ? 1.2 : .25, speed: happy ? 14 : 3 }, time, seed);
  layer(ctx, bodyXf, bodyShape, (c) => paintBody(c, seed));
  haunch(false);
  frontLeg(ctx, shoulder, frontFoot, false, seed + 4);
  collar(ctx, bodyXf, { x: 0, y: 0 });
  drawHead(ctx, bodyXf, { x: 49, y: -74 }, -ang * .9 + (happy ? -.1 : Math.sin(time / 1700) * .04), happy ? .5 : 0, time, happy, seed);
}
