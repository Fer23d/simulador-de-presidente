// Gera src/data/world_map.js (contornos dos paises em SVG) a partir do Natural Earth 110m (dominio publico),
// no formato TopoJSON distribuido pelo pacote npm `world-atlas` (countries-110m.json). Sem dependencias:
// decodifica o TopoJSON e aplica a projecao Natural Earth direto aqui. O jogo so usa o arquivo gerado.
//   curl -L -o countries-110m.json https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json
//   node scripts/build-world-map.mjs countries-110m.json src/data/world_map.js
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [input = 'countries-110m.json', output = 'src/data/world_map.js'] = process.argv.slice(2);
const topology = JSON.parse(readFileSync(resolve(input), 'utf8'));
const coords = (await import(pathToFileURL(resolve('src/data/country_coords.js')).href)).COUNTRY_COORDS;

// id do jogo (ISO alpha-3 minusculo) -> codigo numerico ISO 3166-1 usado pelo Natural Earth.
const NUMERIC = {
  afg: 4, alb: 8, dza: 12, and: 20, ago: 24, atg: 28, arg: 32, arm: 51, aus: 36, aut: 40, aze: 31, bhs: 44, bhr: 48, bgd: 50,
  brb: 52, blr: 112, bel: 56, blz: 84, ben: 204, btn: 64, bol: 68, bih: 70, bwa: 72, bra: 76, brn: 96, bgr: 100, bfa: 854,
  bdi: 108, cpv: 132, khm: 116, cmr: 120, can: 124, caf: 140, tcd: 148, chl: 152, chn: 156, col: 170, com: 174, cog: 178,
  cod: 180, cri: 188, civ: 384, hrv: 191, cub: 192, cyp: 196, cze: 203, dnk: 208, dji: 262, dma: 212, dom: 214, ecu: 218,
  egy: 818, slv: 222, gnq: 226, eri: 232, est: 233, swz: 748, eth: 231, fji: 242, fin: 246, fra: 250, gab: 266, gmb: 270,
  geo: 268, deu: 276, gha: 288, grc: 300, grd: 308, gtm: 320, gin: 324, gnb: 624, guy: 328, hti: 332, hnd: 340, hun: 348,
  isl: 352, ind: 356, idn: 360, irn: 364, irq: 368, irl: 372, isr: 376, ita: 380, jam: 388, jpn: 392, jor: 400, kaz: 398,
  ken: 404, kir: 296, prk: 408, kor: 410, kwt: 414, kgz: 417, lao: 418, lva: 428, lbn: 422, lso: 426, lbr: 430, lby: 434,
  lie: 438, ltu: 440, lux: 442, mdg: 450, mwi: 454, mys: 458, mdv: 462, mli: 466, mlt: 470, mhl: 584, mrt: 478, mus: 480,
  mex: 484, fsm: 583, mda: 498, mco: 492, mng: 496, mne: 499, mar: 504, moz: 508, mmr: 104, nam: 516, nru: 520, npl: 524,
  nld: 528, nzl: 554, nic: 558, ner: 562, nga: 566, mkd: 807, nor: 578, omn: 512, pak: 586, plw: 585, pan: 591, png: 598,
  pry: 600, per: 604, phl: 608, pol: 616, prt: 620, qat: 634, rou: 642, rus: 643, rwa: 646, kna: 659, lca: 662, vct: 670,
  wsm: 882, smr: 674, stp: 678, sau: 682, sen: 686, srb: 688, syc: 690, sle: 694, sgp: 702, svk: 703, svn: 705, slb: 90,
  som: 706, zaf: 710, ssd: 728, esp: 724, lka: 144, sdn: 729, sur: 740, swe: 752, che: 756, syr: 760, tjk: 762, tza: 834,
  tha: 764, tls: 626, tgo: 768, ton: 776, tto: 780, tun: 788, tur: 792, tkm: 795, tuv: 798, uga: 800, ukr: 804, are: 784,
  gbr: 826, usa: 840, ury: 858, uzb: 860, vut: 548, ven: 862, vnm: 704, yem: 887, zmb: 894, zwe: 716, vat: 336, pse: 275,
  cok: 184, niu: 570, twn: 158, esh: 732,
};
const byNumeric = new Map(Object.entries(NUMERIC).map(([id, code]) => [code, id]));
const BY_NAME = { Kosovo: 'xkx' };

// ---- TopoJSON: arcos com delta-encoding + transformacao ----
const { scale, translate } = topology.transform;
const arcs = topology.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
});
function ringFromArcs(indexes) {
  const ring = [];
  for (const index of indexes) {
    const points = index >= 0 ? arcs[index] : [...arcs[~index]].reverse();
    ring.push(...(ring.length ? points.slice(1) : points));
  }
  return ring;
}
function polygonsOf(geometry) {
  if (geometry.type === 'Polygon') return [geometry.arcs.map(ringFromArcs)];
  if (geometry.type === 'MultiPolygon') return geometry.arcs.map((polygon) => polygon.map(ringFromArcs));
  return [];
}

// ---- Projecao Natural Earth (Savric et al., 2008) ----
function naturalEarth(lon, lat) {
  const l = (lon * Math.PI) / 180;
  const p = (lat * Math.PI) / 180;
  const p2 = p * p;
  const p4 = p2 * p2;
  return [
    l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
    p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))),
  ];
}

const width = 1000;
const height = 500;
const geometries = topology.objects.countries.geometries.filter((geometry) => geometry.properties?.name !== 'Antarctica');

// Aneis que cruzam o meridiano 180 (Russia, Fiji...) sao "desenrolados" (longitude continua) e desenhados duas vezes,
// uma delas deslocada 360 graus, para o contorno fechar nos dois lados do mapa sem riscar o mundo inteiro.
function unwrapRing(ring) {
  let offset = 0;
  let previous = ring[0][0];
  return ring.map(([lon, lat], index) => {
    if (index > 0) {
      if (lon - previous > 180) offset -= 360;
      else if (lon - previous < -180) offset += 360;
    }
    previous = lon;
    return [lon + offset, lat];
  });
}
const raw = geometries.map((geometry) => ({ geometry, rings: polygonsOf(geometry).flatMap((polygon) => polygon.map(unwrapRing)) }));
const all = raw.flatMap((item) => item.rings.flat()).map(([lon, lat]) => naturalEarth(Math.max(-180, Math.min(180, lon)), lat));
const minX = Math.min(...all.map((point) => point[0]));
const maxX = Math.max(...all.map((point) => point[0]));
const minY = Math.min(...all.map((point) => point[1]));
const maxY = Math.max(...all.map((point) => point[1]));
const pad = 6;
const factor = Math.min((width - pad * 2) / (maxX - minX), (height - pad * 2) / (maxY - minY));
const offsetX = (width - (maxX - minX) * factor) / 2 - minX * factor;
const offsetY = (height - (maxY - minY) * factor) / 2 + maxY * factor;
const project = (lon, lat) => {
  const [x, y] = naturalEarth(lon, lat);
  return [x * factor + offsetX, offsetY - y * factor];
};
const round = (value) => Math.round(value * 10) / 10;

function ringPath(ring, shift = 0) {
  const points = ring.map(([lon, lat]) => project(lon + shift, lat).map(round));
  const kept = points.filter((point, index) => index === 0 || Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]) >= 0.35);
  if (kept.length < 3) return '';
  return `M${kept.map(([x, y]) => `${x} ${y}`).join('L')}Z`;
}

function geometryPath(rings) {
  return rings.map((ring) => {
    const longitudes = ring.map(([lon]) => lon);
    let d = ringPath(ring);
    if (Math.max(...longitudes) > 180) d += ringPath(ring, -360);
    if (Math.min(...longitudes) < -180) d += ringPath(ring, 360);
    return d;
  }).join('');
}

const countryPaths = {};
const background = [];
for (const { geometry, rings } of raw) {
  const d = geometryPath(rings);
  if (!d) continue;
  const id = byNumeric.get(Number(geometry.id)) ?? BY_NAME[geometry.properties?.name];
  if (id) countryPaths[id] = d;
  else background.push(d);
}

// Paises pequenos demais para o 110m viram pontos na posicao aproximada.
const points = {};
for (const [id, [lat, lon]] of Object.entries(coords)) {
  if (countryPaths[id]) continue;
  const [x, y] = project(lon, lat);
  points[id] = [round(x), round(y)];
}

// Quadros de zoom por regiao (x, y, largura, altura no espaco projetado), mantendo a proporcao 2:1.
const REGION_BOXES = {
  americas: [-170, -56, -32, 75],
  europe: [-25, 33, 48, 72],
  africa: [-20, -36, 52, 38],
  asia: [25, -11, 150, 78],
  oceania: [105, -50, 180, 6],
};
const regions = { world: [0, 0, width, height] };
for (const [id, [west, south, east, north]] of Object.entries(REGION_BOXES)) {
  const samples = [];
  for (let step = 0; step <= 10; step++) {
    const lon = west + ((east - west) * step) / 10;
    const lat = south + ((north - south) * step) / 10;
    samples.push(project(lon, south), project(lon, north), project(west, lat), project(east, lat));
  }
  const xs = samples.map((point) => point[0]);
  const ys = samples.map((point) => point[1]);
  let boxWidth = Math.max(60, Math.max(...xs) - Math.min(...xs)) * 1.08;
  let boxHeight = Math.max(30, Math.max(...ys) - Math.min(...ys)) * 1.08;
  if (boxWidth / boxHeight > 2) boxHeight = boxWidth / 2; else boxWidth = boxHeight * 2;
  const centerX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const centerY = (Math.max(...ys) + Math.min(...ys)) / 2;
  regions[id] = [Math.round(centerX - boxWidth / 2), Math.round(centerY - boxHeight / 2), Math.round(boxWidth), Math.round(boxHeight)];
}

const body = `// GERADO por scripts/build-world-map.mjs a partir do Natural Earth 110m (dominio publico). Nao edite a mao.
export const WORLD_MAP_SIZE = Object.freeze({ width: ${width}, height: ${height} });
export const COUNTRY_PATHS = Object.freeze(${JSON.stringify(countryPaths)});
export const COUNTRY_POINTS = Object.freeze(${JSON.stringify(points)});
export const MAP_REGIONS = Object.freeze(${JSON.stringify(regions)});
export const LAND_BACKGROUND = ${JSON.stringify(background.join(''))};
`;
writeFileSync(resolve(output), body);
console.log(`paises com contorno: ${Object.keys(countryPaths).length}, pontos: ${Object.keys(points).length}, fundo: ${background.length}, bytes: ${body.length}`);
