import { hash, linear } from './art.js';
import { CITY_BUILDINGS, CITY_GATE, CITY_HEIGHT, CITY_WIDTH } from './city.js';

export const CITY_TILE = 40;
export const CITY_CANVAS_WIDTH = CITY_WIDTH * CITY_TILE;
export const CITY_CANVAS_HEIGHT = CITY_HEIGHT * CITY_TILE;

const center = (tile) => tile * CITY_TILE + CITY_TILE / 2;

// A textura é um asset de apoio, não a fonte da simulação. Se ela falhar, o
// material procedural continua a desenhar o mapa e a cidade não fica vazia.
let cityGroundImage = null;
let cityGroundImageRequested = false;
function getCityGroundImage() {
  if (typeof document === 'undefined') return null;
  if (cityGroundImageRequested) return cityGroundImage;
  cityGroundImageRequested = true;
  const image = document.createElement('img');
  image.decoding = 'async';
  image.alt = '';
  image.src = 'assets/img/city_wasteland_ground.png';
  image.addEventListener('load', () => { cityGroundImage = image; groundCache = null; });
  return null;
}

// ---------- Terreno (pre-renderizado, so refeito quando a limpeza muda o chao) ----------

let groundCache = null;
function getGroundCanvas(ground) {
  if (groundCache?.key === ground) return groundCache.canvas;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = CITY_CANVAS_WIDTH;
  canvas.height = CITY_CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  const material = getCityGroundImage();
  if (material?.complete && material.naturalWidth) {
    // A textura cobre o mapa inteiro; a escala grande evita o efeito de
    // azulejo e deixa os marcadores de terreno para as camadas seguintes.
    ctx.drawImage(material, 0, 0, CITY_CANVAS_WIDTH, CITY_CANVAS_HEIGHT);
    ctx.fillStyle = linear(ctx, 0, 0, CITY_CANVAS_WIDTH, CITY_CANVAS_HEIGHT, [
      [0, 'rgba(46, 35, 24, .22)'], [.5, 'rgba(42, 38, 25, .05)'], [1, 'rgba(18, 12, 8, .38)'],
    ]);
    ctx.fillRect(0, 0, CITY_CANVAS_WIDTH, CITY_CANVAS_HEIGHT);
  }
  for (let y = 0; y < CITY_HEIGHT; y++) {
    for (let x = 0; x < CITY_WIDTH; x++) {
      const tile = ground[y * CITY_WIDTH + x];
      const px = x * CITY_TILE;
      const py = y * CITY_TILE;
      // Variacao suave em ondas mais um pouco de ruido, para o chao nao parecer um tabuleiro de quadradinhos.
      const low = Math.sin(x * .55 + 1.3) * Math.cos(y * .62 + .4) + Math.sin((x + y) * .31);
      const tint = Math.max(0, Math.min(1, .5 + low * .18 + (hash(x, y, 3) - .5) * .12));
      if (!material) {
        if (tile === 'x') ctx.fillStyle = `rgb(${58 + tint * 14},${54 + tint * 12},${50 + tint * 10})`;
        else if (tile === 'r') ctx.fillStyle = `rgb(${112 + tint * 18},${100 + tint * 14},${84 + tint * 12})`;
        else ctx.fillStyle = `rgb(${150 + tint * 22},${118 + tint * 18},${80 + tint * 14})`;
        ctx.fillRect(px, py, CITY_TILE, CITY_TILE);
      } else if (tile === 'c') {
        ctx.fillStyle = 'rgba(207, 171, 112, .18)';
        ctx.fillRect(px, py, CITY_TILE, CITY_TILE);
      }
      for (let speck = 0; speck < 26; speck++) {
        const sx = px + hash(x, y, speck + 10) * CITY_TILE;
        const sy = py + hash(y, x, speck + 40) * CITY_TILE;
        ctx.fillStyle = hash(sx, sy, 5) > .5 ? 'rgba(255, 235, 190, .13)' : 'rgba(30, 18, 8, .2)';
        ctx.fillRect(sx, sy, 1.6, 1.6);
      }
      if (tile === 'r') {
        for (let chunk = 0; chunk < 5; chunk++) {
          const cx = px + 4 + hash(x, y, chunk + 70) * 30;
          const cy = py + 4 + hash(y, x, chunk + 90) * 30;
          ctx.fillStyle = linear(ctx, cx, cy, cx + 8, cy + 6, [[0, '#8d8b84'], [1, '#4a4843']]);
          ctx.fillRect(cx, cy, 5 + hash(cx, cy, 1) * 8, 3 + hash(cy, cx, 2) * 6);
        }
        ctx.strokeStyle = 'rgba(40, 36, 30, .8)';
        ctx.beginPath(); ctx.moveTo(px + 8, py + 30); ctx.lineTo(px + 26, py + 12); ctx.stroke();
      }
      if (tile === 'x') {
        // Marca de perigo e manchas escuras de residuo.
        ctx.strokeStyle = 'rgba(224, 190, 40, .55)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(px + 6, py + 6); ctx.lineTo(px + 14, py + 14); ctx.moveTo(px + 14, py + 6); ctx.lineTo(px + 6, py + 14); ctx.stroke();
        ctx.lineWidth = 1;
        for (let stain = 0; stain < 3; stain++) {
          ctx.fillStyle = 'rgba(20, 24, 8, .3)';
          ctx.beginPath(); ctx.ellipse(px + 8 + hash(x, y, stain + 120) * 26, py + 14 + hash(y, x, stain + 130) * 22, 5 + hash(x, y, stain + 140) * 5, 3 + hash(y, x, stain + 150) * 3, hash(x, y, stain) * 3, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (tile === 'c') {
        ctx.strokeStyle = 'rgba(247, 209, 145, .12)';
        ctx.beginPath();
        ctx.moveTo(px + 3, py + CITY_TILE - 5); ctx.lineTo(px + CITY_TILE - 4, py + 3);
        ctx.stroke();
      }
    }
  }
  // Cantos escurecidos e uma película de poeira vendem a escala do terreno
  // sem transformar cada quadrado num bloco de grelha visível.
  ctx.fillStyle = linear(ctx, 0, 0, 0, CITY_CANVAS_HEIGHT, [
    [0, 'rgba(10, 8, 5, .18)'], [.5, 'rgba(10, 8, 5, 0)'], [1, 'rgba(5, 4, 3, .42)'],
  ]);
  ctx.fillRect(0, 0, CITY_CANVAS_WIDTH, CITY_CANVAS_HEIGHT);
  groundCache = { key: ground, canvas };
  return canvas;
}

// ---------- Estradas e Porta ----------

function drawRoad(ctx, x, y, roadSet, connected) {
  const px = x * CITY_TILE;
  const py = y * CITY_TILE;
  ctx.fillStyle = 'rgba(0, 0, 0, .32)';
  ctx.fillRect(px + 1, py + 5, CITY_TILE - 2, CITY_TILE - 2);
  ctx.fillStyle = linear(ctx, px, py, px, py + CITY_TILE, connected
    ? [[0, '#404448'], [.55, '#252a2e'], [1, '#171a1c']]
    : [[0, '#5e5b57'], [.55, '#3a3837'], [1, '#252525']]);
  ctx.fillRect(px + 2, py + 2, CITY_TILE - 4, CITY_TILE - 4);
  const link = (dx, dy) => roadSet.has(`${x + dx},${y + dy}`) || (x + dx === CITY_GATE.x && y + dy === CITY_GATE.y);
  ctx.fillStyle = connected ? '#3b3b3e' : '#5a5650';
  if (link(1, 0)) ctx.fillRect(px + CITY_TILE - 4, py + 2, 6, CITY_TILE - 4);
  if (link(-1, 0)) ctx.fillRect(px - 2, py + 2, 6, CITY_TILE - 4);
  if (link(0, 1)) ctx.fillRect(px + 2, py + CITY_TILE - 4, CITY_TILE - 4, 6);
  if (link(0, -1)) ctx.fillRect(px + 2, py - 2, CITY_TILE - 4, 6);
  ctx.strokeStyle = 'rgba(214, 206, 188, .2)';
  ctx.strokeRect(px + 2.5, py + 2.5, CITY_TILE - 5, CITY_TILE - 5);
  ctx.strokeStyle = 'rgba(5, 6, 7, .45)';
  ctx.beginPath(); ctx.moveTo(px + 4, py + 5); ctx.lineTo(px + 34, py + 5); ctx.stroke();
  ctx.strokeStyle = connected ? 'rgba(235, 190, 70, .75)' : 'rgba(200, 190, 160, .35)';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  const cx = px + CITY_TILE / 2;
  const cy = py + CITY_TILE / 2;
  if (link(1, 0)) { ctx.moveTo(cx, cy); ctx.lineTo(px + CITY_TILE, cy); }
  if (link(-1, 0)) { ctx.moveTo(cx, cy); ctx.lineTo(px, cy); }
  if (link(0, 1)) { ctx.moveTo(cx, cy); ctx.lineTo(cx, py + CITY_TILE); }
  if (link(0, -1)) { ctx.moveTo(cx, cy); ctx.lineTo(cx, py); }
  ctx.stroke();
  ctx.setLineDash([]);
  // Fissuras curtas, deterministicas: detalhe de material sem custo de
  // layout e sem alterar a posição lógica das estradas.
  ctx.strokeStyle = 'rgba(0, 0, 0, .3)';
  ctx.beginPath(); ctx.moveTo(px + 8, py + 27); ctx.lineTo(px + 13, py + 24); ctx.lineTo(px + 16, py + 28); ctx.stroke();
  ctx.lineWidth = 1;
}

function drawGate(ctx, time) {
  const px = CITY_GATE.x * CITY_TILE;
  const py = CITY_GATE.y * CITY_TILE;
  ctx.fillStyle = linear(ctx, px, py, px, py + CITY_TILE, [[0, '#6e7378'], [1, '#2a2d30']]);
  ctx.fillRect(px - 6, py - 2, CITY_TILE + 12, CITY_TILE + 2);
  ctx.fillStyle = '#16181a';
  ctx.fillRect(px + 4, py + 6, CITY_TILE - 8, CITY_TILE - 6);
  for (let stripe = 0; stripe < 6; stripe++) {
    ctx.fillStyle = stripe % 2 ? '#e0b020' : '#17140c';
    ctx.fillRect(px - 6 + stripe * 8, py - 2, 8, 5);
  }
  ctx.fillStyle = `rgba(255, 176, 0, ${.5 + Math.sin(time / 500) * .3})`;
  ctx.fillRect(px + CITY_TILE / 2 - 7, py + 16, 14, 4);
  ctx.fillStyle = '#ffcf7a';
  ctx.font = 'bold 8px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('VAULT', px + CITY_TILE / 2, py + 33);
}

// ---------- Predios ----------

function shadow(ctx, px, py) {
  ctx.fillStyle = 'rgba(0, 0, 0, .38)';
  ctx.beginPath(); ctx.ellipse(px + 20, py + 36, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
}

function buildingBase(ctx, px, py, type, connected) {
  const accent = CITY_BUILDINGS[type]?.accent ?? '#b98b50';
  ctx.fillStyle = 'rgba(0, 0, 0, .24)';
  ctx.fillRect(px + 2, py + 4, CITY_TILE - 4, CITY_TILE - 5);
  ctx.fillStyle = connected ? 'rgba(30, 27, 23, .78)' : 'rgba(35, 24, 21, .65)';
  ctx.fillRect(px + 2, py + 1, CITY_TILE - 4, CITY_TILE - 5);
  ctx.strokeStyle = `${accent}99`;
  ctx.strokeRect(px + 2.5, py + 1.5, CITY_TILE - 5, CITY_TILE - 6);
  ctx.fillStyle = `${accent}66`;
  ctx.fillRect(px + 4, py + 3, CITY_TILE - 8, 2);
}

function smoke(ctx, x, y, time, seed) {
  for (let puff = 0; puff < 3; puff++) {
    const age = (time / 1_300 + puff / 3 + seed) % 1;
    ctx.fillStyle = `rgba(70, 66, 60, ${(1 - age) * .45})`;
    ctx.beginPath(); ctx.arc(x + age * 6 + Math.sin(time / 500 + puff) * 2, y - age * 18, 2 + age * 4, 0, Math.PI * 2); ctx.fill();
  }
}

const DRAWERS = {
  house(ctx, px, py, s, time) {
    ctx.fillStyle = linear(ctx, px, py + 8, px, py + 36, [[0, '#9ca1a5'], [1, '#585d62']]);
    ctx.fillRect(px + 4, py + 12, 32, 22);
    ctx.fillStyle = linear(ctx, px, py + 4, px, py + 14, [[0, '#7a5f48'], [1, '#4a3a2c']]);
    ctx.beginPath(); ctx.moveTo(px + 2, py + 14); ctx.lineTo(px + 20, py + 4); ctx.lineTo(px + 38, py + 14); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.28)';
    for (let rib = 8; rib < 34; rib += 5) { ctx.beginPath(); ctx.moveTo(px + rib, py + 14); ctx.lineTo(px + rib, py + 33); ctx.stroke(); }
    ctx.fillStyle = s.efficiency > .5 ? `rgba(255, 214, 120, ${.8 + Math.sin(time / 700 + px) * .1})` : '#23262a';
    ctx.fillRect(px + 9, py + 18, 7, 6); ctx.fillRect(px + 24, py + 18, 7, 6);
    ctx.fillStyle = '#2a2420'; ctx.fillRect(px + 17, py + 24, 6, 10);
  },
  farm(ctx, px, py, s, time) {
    ctx.fillStyle = '#2c2218'; ctx.fillRect(px + 3, py + 5, 34, 30);
    for (let row = 0; row < 4; row++) {
      ctx.fillStyle = s.efficiency > .3 ? `rgb(${70 + row * 8},${150 + Math.sin(time / 900 + row) * 10},${78})` : '#4f5a3d';
      ctx.fillRect(px + 6, py + 8 + row * 7, 28, 4);
    }
    ctx.fillStyle = 'rgba(210, 240, 255, .18)'; ctx.fillRect(px + 3, py + 5, 34, 14);
    ctx.fillStyle = s.efficiency > .3 ? '#d6a8ff' : '#444'; ctx.fillRect(px + 17, py + 3, 6, 3);
  },
  well(ctx, px, py, s, time) {
    const gradient = ctx.createRadialGradient(px + 17, py + 17, 2, px + 20, py + 20, 17);
    gradient.addColorStop(0, '#9fc9e0'); gradient.addColorStop(.7, '#4e7a92'); gradient.addColorStop(1, '#223844');
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(px + 20, py + 20, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2b3a42'; ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = `rgba(255,255,255,${.25 + Math.sin(time / 400) * .1})`; ctx.fillRect(px + 12, py + 12, 8, 2);
    ctx.fillStyle = '#6a7378'; ctx.fillRect(px + 27, py + 28, 10, 5);
  },
  generator(ctx, px, py, s, time) {
    ctx.fillStyle = linear(ctx, px, py + 8, px, py + 36, [[0, '#d98a2c'], [1, '#6b3f10']]);
    ctx.fillRect(px + 4, py + 12, 32, 22);
    ctx.fillStyle = '#26282b'; ctx.fillRect(px + 8, py + 17, 14, 12);
    for (let fin = 0; fin < 4; fin++) { ctx.fillStyle = '#5a5e62'; ctx.fillRect(px + 9 + fin * 3.4, py + 18, 1.6, 10); }
    ctx.fillStyle = '#2a2c2e'; ctx.fillRect(px + 28, py + 4, 5, 12);
    if (s.efficiency > 0) smoke(ctx, px + 30, py + 4, time, px / 97);
    ctx.fillStyle = s.efficiency > 0 ? '#7cf29a' : '#f26c5c'; ctx.fillRect(px + 27, py + 28, 5, 3);
  },
  solar(ctx, px, py, s, time) {
    ctx.fillStyle = '#1d2b44'; ctx.fillRect(px + 3, py + 8, 34, 24);
    ctx.strokeStyle = '#4a6288'; ctx.lineWidth = 1;
    for (let line = 1; line < 4; line++) { ctx.beginPath(); ctx.moveTo(px + 3 + line * 8.5, py + 8); ctx.lineTo(px + 3 + line * 8.5, py + 32); ctx.stroke(); }
    for (let line = 1; line < 3; line++) { ctx.beginPath(); ctx.moveTo(px + 3, py + 8 + line * 8); ctx.lineTo(px + 37, py + 8 + line * 8); ctx.stroke(); }
    ctx.fillStyle = `rgba(255, 255, 255, ${.1 + Math.max(0, Math.sin(time / 1_800 + px)) * .25})`; ctx.fillRect(px + 4, py + 9, 12, 8);
  },
  derrick(ctx, px, py, s, time) {
    ctx.fillStyle = '#4b4640'; ctx.fillRect(px + 3, py + 30, 34, 5);
    ctx.strokeStyle = '#7a3b24'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(px + 12, py + 30); ctx.lineTo(px + 20, py + 12); ctx.lineTo(px + 26, py + 30); ctx.stroke();
    const tilt = s.efficiency > 0 ? Math.sin(time / 420) * .22 : .1;
    ctx.save(); ctx.translate(px + 20, py + 12); ctx.rotate(tilt);
    ctx.fillStyle = '#b8714a'; ctx.fillRect(-16, -2.5, 30, 5);
    ctx.fillStyle = '#7d4325'; ctx.beginPath(); ctx.arc(-16, 2, 5, Math.PI, 0); ctx.fill();
    ctx.restore(); ctx.lineWidth = 1;
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(px + 8, py + 34, 7, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  },
  workshop(ctx, px, py, s, time) {
    ctx.fillStyle = linear(ctx, px, py + 10, px, py + 36, [[0, '#8a8f93'], [1, '#4a4f53']]);
    ctx.fillRect(px + 3, py + 14, 34, 21);
    ctx.fillStyle = '#5c4a3a';
    for (let tooth = 0; tooth < 3; tooth++) { ctx.beginPath(); ctx.moveTo(px + 3 + tooth * 11.3, py + 14); ctx.lineTo(px + 3 + tooth * 11.3, py + 6); ctx.lineTo(px + 14.3 + tooth * 11.3, py + 14); ctx.fill(); }
    ctx.fillStyle = '#2a2c2e'; ctx.fillRect(px + 30, py + 2, 5, 12);
    if (s.efficiency > 0) smoke(ctx, px + 32, py + 2, time, px / 53);
    ctx.fillStyle = '#23262a'; ctx.fillRect(px + 8, py + 22, 12, 13);
    ctx.fillStyle = s.efficiency > .3 ? '#ffb347' : '#555'; ctx.fillRect(px + 25, py + 20, 8, 5);
  },
  market(ctx, px, py) {
    ctx.fillStyle = '#5a4630'; ctx.fillRect(px + 4, py + 18, 32, 17);
    for (let stripe = 0; stripe < 6; stripe++) { ctx.fillStyle = stripe % 2 ? '#e8e0cf' : '#b8352a'; ctx.fillRect(px + 3 + stripe * 5.7, py + 8, 5.7, 12); }
    ctx.fillStyle = '#3a2c1c'; ctx.fillRect(px + 8, py + 24, 8, 8); ctx.fillStyle = '#c9a050'; ctx.fillRect(px + 22, py + 25, 9, 7);
  },
  clinic(ctx, px, py, s, time) {
    ctx.fillStyle = linear(ctx, px, py + 8, px, py + 36, [[0, '#f0f1ee'], [1, '#a9aca8']]);
    ctx.fillRect(px + 4, py + 8, 32, 27);
    ctx.fillStyle = '#c4281c'; ctx.fillRect(px + 17, py + 12, 6, 18); ctx.fillRect(px + 11, py + 18, 18, 6);
    ctx.fillStyle = s.efficiency > .3 ? `rgba(120, 255, 190, ${.6 + Math.sin(time / 600) * .3})` : '#555'; ctx.fillRect(px + 17, py + 4, 6, 3);
  },
  guard(ctx, px, py, s, time) {
    ctx.fillStyle = '#7d6a48';
    for (let bag = 0; bag < 5; bag++) { ctx.beginPath(); ctx.ellipse(px + 7 + bag * 6.5, py + 33, 4.5, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = linear(ctx, px, py + 6, px, py + 30, [[0, '#6e7a5a'], [1, '#353d2b']]); ctx.fillRect(px + 9, py + 10, 22, 22);
    ctx.fillStyle = '#242a1c'; ctx.fillRect(px + 7, py + 6, 26, 5);
    ctx.strokeStyle = '#cfcfcf'; ctx.beginPath(); ctx.moveTo(px + 31, py + 6); ctx.lineTo(px + 31, py - 2); ctx.stroke();
    ctx.fillStyle = '#b8452e'; ctx.beginPath(); ctx.moveTo(px + 31, py - 2); ctx.lineTo(px + 38, py + Math.sin(time / 300) * 1.5 + 1); ctx.lineTo(px + 31, py + 3); ctx.fill();
  },
  plaza(ctx, px, py, s, time) {
    ctx.fillStyle = '#9b9588'; ctx.fillRect(px + 3, py + 3, 34, 34);
    ctx.strokeStyle = 'rgba(60,55,45,.5)'; for (let line = 1; line < 3; line++) { ctx.strokeRect(px + 3, py + 3 + line * 11, 34, 0); ctx.strokeRect(px + 3 + line * 11, py + 3, 0, 34); }
    ctx.fillStyle = '#4a3624'; ctx.fillRect(px + 18, py + 18, 4, 10);
    ctx.fillStyle = '#4f7a3c'; ctx.beginPath(); ctx.arc(px + 20, py + 16, 9 + Math.sin(time / 1_200) * .5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(px + 17, py + 13, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a3c20'; ctx.fillRect(px + 6, py + 30, 10, 3); ctx.fillRect(px + 25, py + 30, 10, 3);
  },
  purifier(ctx, px, py, s, time) {
    const gradient = ctx.createLinearGradient(px + 6, 0, px + 34, 0);
    gradient.addColorStop(0, '#5b6368'); gradient.addColorStop(.4, '#c4cacd'); gradient.addColorStop(1, '#383e42');
    ctx.fillStyle = gradient; ctx.fillRect(px + 8, py + 8, 24, 27);
    ctx.beginPath(); ctx.ellipse(px + 20, py + 8, 12, 4, 0, 0, Math.PI * 2); ctx.fillStyle = '#d6dbde'; ctx.fill();
    const spin = s.efficiency > .5 ? time / 300 : 0;
    ctx.strokeStyle = s.efficiency > .5 ? 'rgba(110, 255, 200, .9)' : 'rgba(110, 120, 120, .6)'; ctx.lineWidth = 2;
    for (let ring = 0; ring < 2; ring++) { ctx.beginPath(); ctx.ellipse(px + 20, py + 18 + ring * 9, 12, 3.5, 0, spin, spin + Math.PI * 1.4); ctx.stroke(); }
    ctx.lineWidth = 1;
    ctx.fillStyle = '#e0b020'; ctx.beginPath(); ctx.arc(px + 20, py + 28, 3, 0, Math.PI * 2); ctx.fill();
  },
};

function drawBuilding(ctx, building, status, time) {
  const px = building.x * CITY_TILE;
  const py = building.y * CITY_TILE;
  shadow(ctx, px, py);
  buildingBase(ctx, px, py, building.type, status.connected);
  ctx.save();
  if (!status.connected) ctx.globalAlpha = .55;
  DRAWERS[building.type]?.(ctx, px, py, status, time);
  ctx.restore();
  // Pequenos marcadores arquitetônicos: cobertura, placa e ponto de acesso.
  ctx.fillStyle = status.connected ? 'rgba(229, 184, 91, .8)' : 'rgba(255, 94, 70, .7)';
  ctx.fillRect(px + 6, py + 34, 9, 2);
  ctx.fillStyle = 'rgba(236, 227, 201, .78)';
  ctx.font = '7px "Share Tech Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(String(building.id).split('-')[0].toUpperCase().slice(0, 4), px + 34, py + 8);
  if (!status.connected) {
    ctx.setLineDash([4, 3]); ctx.strokeStyle = '#ff5a48'; ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 2, py + 2, CITY_TILE - 4, CITY_TILE - 4);
    ctx.setLineDash([]); ctx.lineWidth = 1;
    ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(px + 33, py + 7, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', px + 33, py + 10.5);
  } else if (status.efficiency < .5 && CITY_BUILDINGS[building.type].power) {
    ctx.fillStyle = '#ffb000'; ctx.beginPath(); ctx.arc(px + 33, py + 7, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a1a00'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⚡', px + 33, py + 10);
  }
}

// ---------- Cena ----------

function drawCitizens(ctx, city, analysis, time) {
  const roads = [...analysis.roads].map((index) => ({ x: index % CITY_WIDTH, y: Math.floor(index / CITY_WIDTH) }));
  const pairs = [];
  for (const road of roads) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) if (analysis.roads.has((road.y + dy) * CITY_WIDTH + road.x + dx)) pairs.push([road, { x: road.x + dx, y: road.y + dy }]);
  }
  const gateLinks = [[CITY_GATE.x, CITY_GATE.y - 1]].filter(([x, y]) => analysis.roads.has(y * CITY_WIDTH + x));
  gateLinks.forEach(([x, y]) => pairs.push([{ x, y }, { x: CITY_GATE.x, y: CITY_GATE.y }]));
  if (!pairs.length) return;
  const walkers = Math.min(46, Math.floor(city.population / 3));
  for (let index = 0; index < walkers; index++) {
    const [a, b] = pairs[(index * 13 + 5) % pairs.length];
    const t = (Math.sin(time / (900 + hash(index, 1, 9) * 600) + index * 1.7) + 1) / 2;
    const lane = (index % 2 ? 1 : -1) * 5;
    const horizontal = a.y === b.y;
    const x = center(a.x) + (center(b.x) - center(a.x)) * t + (horizontal ? 0 : lane);
    const y = center(a.y) + (center(b.y) - center(a.y)) * t + (horizontal ? lane : 0);
    const walking = Math.sin(time / (240 + hash(index, 2, 7) * 180) + index) * 1.4;
    ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.beginPath(); ctx.ellipse(x, y + 3, 4.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ['#d8c27a', '#9ac0d8', '#d88a6a', '#a0d89a'][index % 4];
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x - 2.1, y + 2 + walking); ctx.moveTo(x, y - 2); ctx.lineTo(x + 2.1, y + 2 - walking); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = ['#64747f', '#75634a', '#7d4e3d', '#4c6b52'][index % 4];
    ctx.beginPath(); ctx.ellipse(x, y - 3.5, 2.2, 3.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e6c9a0'; ctx.beginPath(); ctx.arc(x, y - 7, 1.8, 0, Math.PI * 2); ctx.fill();
    if (index % 5 === 0) {
      ctx.fillStyle = 'rgba(236, 192, 90, .75)';
      ctx.fillRect(x + 3, y - 5, 2, 2);
    }
  }
}

function drawWorldFrame(ctx, time) {
  const pulse = .55 + Math.sin(time / 1_600) * .12;
  // Moldura de mapa: separa o terreno jogável do terminal e dá uma leitura
  // de "mesa de operações" em vez de uma folha de tiles.
  ctx.strokeStyle = 'rgba(247, 178, 63, .35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, CITY_CANVAS_WIDTH - 12, CITY_CANVAS_HEIGHT - 12);
  ctx.strokeStyle = 'rgba(255, 215, 130, .12)';
  ctx.strokeRect(12, 12, CITY_CANVAS_WIDTH - 24, CITY_CANVAS_HEIGHT - 24);
  ctx.fillStyle = `rgba(255, 177, 66, ${pulse * .32})`;
  ctx.fillRect(18, 18, 100, 2);
  ctx.fillRect(CITY_CANVAS_WIDTH - 118, CITY_CANVAS_HEIGHT - 20, 100, 2);
  ctx.fillStyle = 'rgba(255, 235, 190, .55)';
  ctx.font = '10px "Share Tech Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('SETOR DE RECONSTRUÇÃO / MAPA TÁTICO', 22, 31);
  ctx.textAlign = 'right';
  ctx.fillText('ESCALA 1 : 40', CITY_CANVAS_WIDTH - 22, CITY_CANVAS_HEIGHT - 24);
  ctx.textAlign = 'left';
  ctx.lineWidth = 1;
}

function drawAtmosphere(ctx, time) {
  const fog = ctx.createLinearGradient(0, 0, 0, CITY_CANVAS_HEIGHT);
  fog.addColorStop(0, 'rgba(255, 172, 83, .06)');
  fog.addColorStop(.45, 'rgba(80, 95, 67, .03)');
  fog.addColorStop(1, 'rgba(7, 5, 4, .18)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, CITY_CANVAS_WIDTH, CITY_CANVAS_HEIGHT);
  // Poeira lenta, pré-calculada por índice para não criar partículas novas em
  // cada frame. O movimento é discreto e dá vida ao mapa sem poluir a leitura.
  for (let index = 0; index < 18; index++) {
    const x = (hash(index, 3, 11) * CITY_CANVAS_WIDTH + (time / (42 + index * 3))) % CITY_CANVAS_WIDTH;
    const y = 42 + hash(index, 8, 13) * (CITY_CANVAS_HEIGHT - 80);
    ctx.fillStyle = `rgba(228, 193, 137, ${.035 + hash(index, 9, 14) * .045})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

export function renderCity(ctx, city, analysis, { time = 0, hover = null, tool = null, canPlace = true } = {}) {
  ctx.clearRect(0, 0, CITY_CANVAS_WIDTH, CITY_CANVAS_HEIGHT);
  const ground = getGroundCanvas(city.ground);
  if (ground) ctx.drawImage(ground, 0, 0);
  // Contaminacao pulsando por cima do chao.
  const pulse = .035 + (Math.sin(time / 650) + 1) * .03;
  for (let y = 0; y < CITY_HEIGHT; y++) for (let x = 0; x < CITY_WIDTH; x++) {
    if (city.ground[y * CITY_WIDTH + x] !== 'x') continue;
      const px = x * CITY_TILE;
      const py = y * CITY_TILE;
      const stain = ctx.createRadialGradient(px + 20, py + 20, 2, px + 20, py + 20, 22);
      stain.addColorStop(0, `rgba(200, 236, 80, ${pulse + hash(x, y, 2) * .04})`);
      stain.addColorStop(1, 'rgba(80, 115, 25, 0)');
      ctx.fillStyle = stain; ctx.fillRect(px, py, CITY_TILE, CITY_TILE);
  }
  // Raio de cobertura do servico escolhido, a partir do ponto sob o mouse.
  const def = CITY_BUILDINGS[tool];
  if (hover && def?.radius) {
    for (let y = 0; y < CITY_HEIGHT; y++) for (let x = 0; x < CITY_WIDTH; x++) {
      if (Math.abs(x - hover.x) + Math.abs(y - hover.y) > def.radius) continue;
      ctx.fillStyle = 'rgba(120, 230, 255, .14)'; ctx.fillRect(x * CITY_TILE, y * CITY_TILE, CITY_TILE, CITY_TILE);
    }
  }
  if (hover && tool === 'purifier') {
    for (let y = hover.y - 4; y <= hover.y + 4; y++) for (let x = hover.x - 4; x <= hover.x + 4; x++) {
      if (x < 0 || y < 0 || x >= CITY_WIDTH || y >= CITY_HEIGHT || Math.abs(x - hover.x) + Math.abs(y - hover.y) > 4) continue;
      ctx.fillStyle = 'rgba(110, 255, 200, .16)'; ctx.fillRect(x * CITY_TILE, y * CITY_TILE, CITY_TILE, CITY_TILE);
    }
  }
  const roadSet = new Set(city.buildings.filter((building) => building.type === 'road').map((building) => `${building.x},${building.y}`));
  for (const building of city.buildings) if (building.type === 'road') drawRoad(ctx, building.x, building.y, roadSet, analysis.roads.has(building.y * CITY_WIDTH + building.x));
  drawGate(ctx, time);
  for (const building of [...city.buildings].filter((candidate) => candidate.type !== 'road').sort((a, b) => a.y - b.y)) {
    drawBuilding(ctx, building, analysis.status.get(building.id) ?? { connected: false, efficiency: 0 }, time);
  }
  drawCitizens(ctx, city, analysis, time);
  if (hover) {
    ctx.strokeStyle = tool && !canPlace ? '#ff5a48' : '#9bffb0';
    ctx.lineWidth = 2;
    const hoverGradient = ctx.createLinearGradient(hover.x * CITY_TILE, hover.y * CITY_TILE, (hover.x + 1) * CITY_TILE, (hover.y + 1) * CITY_TILE);
    hoverGradient.addColorStop(0, tool && !canPlace ? 'rgba(255, 82, 64, .24)' : 'rgba(168, 255, 174, .22)');
    hoverGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = hoverGradient;
    ctx.fillRect(hover.x * CITY_TILE, hover.y * CITY_TILE, CITY_TILE, CITY_TILE);
    ctx.strokeRect(hover.x * CITY_TILE + 1, hover.y * CITY_TILE + 1, CITY_TILE - 2, CITY_TILE - 2);
    ctx.lineWidth = 1;
    if (tool && tool !== 'demolish' && canPlace && DRAWERS[tool]) {
      ctx.globalAlpha = .6;
      DRAWERS[tool](ctx, hover.x * CITY_TILE, hover.y * CITY_TILE, { efficiency: 1 }, time);
      ctx.globalAlpha = 1;
    }
  }
  drawAtmosphere(ctx, time);
  drawWorldFrame(ctx, time);
  // Escurece o entorno para o jogador sentir o horizonte da cidade.
  const vignette = ctx.createRadialGradient(CITY_CANVAS_WIDTH / 2, CITY_CANVAS_HEIGHT / 2, 260, CITY_CANVAS_WIDTH / 2, CITY_CANVAS_HEIGHT / 2, 640);
  vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(20, 8, 0, .42)');
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, CITY_CANVAS_WIDTH, CITY_CANVAS_HEIGHT);
}
