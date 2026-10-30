import { WORLD_TOP } from './shelter_engine.js';
import { formatDuration, getDerrickStatus } from './oil.js';

// Os tres pontos de perfuracao ficam na faixa de superficie que a camera mostra desde o inicio,
// logo acima do elevador e da porta do Vault.
export const OIL_SLOT_X = Object.freeze([200, 420, 640]);
const GROUND_Y = WORLD_TOP - 30;

// Cada nivel muda a pintura e acrescenta equipamento, para o upgrade ser visivel de longe.
const LEVEL_PAINT = Object.freeze([null,
  Object.freeze({ body: '#6e4528', dark: '#3e2614', trim: '#a0683a' }),
  Object.freeze({ body: '#86652f', dark: '#4a3716', trim: '#c49a4c' }),
  Object.freeze({ body: '#56653a', dark: '#2e3a1d', trim: '#e8c64a' }),
  Object.freeze({ body: '#365873', dark: '#1d3244', trim: '#f1d24a' }),
  Object.freeze({ body: '#a8791f', dark: '#5c3f0b', trim: '#ffe9a0' }),
]);

export function getOilDerrickRect(slot) {
  const centerX = OIL_SLOT_X[slot];
  if (centerX === undefined) return null;
  return { x: centerX - 78, y: GROUND_Y - 132, width: 156, height: 140, centerX, groundY: GROUND_Y };
}

export function findOilDerrickAt(worldX, worldY) {
  for (let slot = 0; slot < OIL_SLOT_X.length; slot++) {
    const rect = getOilDerrickRect(slot);
    // A bolha de coleta fica acima do poco, entao a area de toque sobe junto.
    if (worldX >= rect.x && worldX <= rect.x + rect.width && worldY >= rect.y - 60 && worldY <= rect.y + rect.height) return slot;
  }
  return null;
}

function drawEmptyPlot(ctx, centerX, groundY, time) {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 6, 4, .85)';
  ctx.beginPath();
  ctx.ellipse?.(centerX, groundY - 2, 34, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(160, 140, 255, .35)';
  ctx.fillRect(centerX - 14, groundY - 6, 10, 2);
  ctx.setLineDash?.([6, 5]);
  ctx.strokeStyle = `rgba(255, 190, 80, ${.45 + Math.sin(time / 300) * .25})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(centerX - 60, groundY - 64, 120, 62);
  ctx.setLineDash?.([]);
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(centerX + 30, groundY - 52, 5, 52);
  ctx.fillStyle = '#d8b46a';
  ctx.fillRect(centerX + 6, groundY - 60, 54, 22);
  ctx.strokeStyle = '#3a2410';
  ctx.strokeRect(centerX + 6, groundY - 60, 54, 22);
  ctx.fillStyle = '#2a1608';
  ctx.font = 'bold 9px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PERFURE', centerX + 33, groundY - 51);
  ctx.fillText('AQUI', centerX + 33, groundY - 41);
  ctx.restore();
}

function drawStorageTank(ctx, x, groundY, paint, height) {
  ctx.fillStyle = paint.dark;
  ctx.fillRect(x, groundY - height, 26, height);
  ctx.fillStyle = paint.body;
  ctx.fillRect(x + 3, groundY - height + 3, 20, height - 6);
  ctx.fillStyle = paint.trim;
  ctx.fillRect(x, groundY - height + 10, 26, 3);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('OIL', x + 13, groundY - height / 2 + 4);
}

// Cavalo-de-pau: viga oscilante sobre o tripe, cabeca de cavalo puxando a haste e contrapeso girando.
function drawPumpjack(ctx, centerX, groundY, level, time, pumping) {
  const paint = LEVEL_PAINT[level] ?? LEVEL_PAINT[1];
  const speed = .8 + level * .12;
  const phase = pumping ? time / 520 * speed : 0;
  const tilt = Math.sin(phase) * .2;
  const pivot = { x: centerX - 4, y: groundY - 74 };
  ctx.save();
  if (level >= 3) drawStorageTank(ctx, centerX + 52, groundY, paint, 40);
  if (level >= 5) drawStorageTank(ctx, centerX + 80, groundY, paint, 30);
  ctx.fillStyle = '#4b4640';
  ctx.fillRect(centerX - 66, groundY - 8, 128, 8);
  ctx.fillStyle = '#6a645c';
  ctx.fillRect(centerX - 66, groundY - 8, 128, 2);
  // Cabeca do poco e haste polida.
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(centerX - 58, groundY - 20, 14, 12);
  ctx.fillStyle = paint.trim;
  ctx.fillRect(centerX - 60, groundY - 22, 18, 3);
  // Tripe (samson post).
  ctx.strokeStyle = paint.dark;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(centerX - 24, groundY - 8); ctx.lineTo(pivot.x, pivot.y);
  ctx.moveTo(centerX + 16, groundY - 8); ctx.lineTo(pivot.x, pivot.y);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(centerX - 16, groundY - 34); ctx.lineTo(centerX + 8, groundY - 34);
  ctx.stroke();
  // Motor e manivela com contrapeso.
  const crank = { x: centerX + 32, y: groundY - 30 };
  ctx.fillStyle = paint.dark;
  ctx.fillRect(centerX + 40, groundY - 26, 22, 18);
  ctx.fillStyle = paint.trim;
  ctx.fillRect(centerX + 43, groundY - 23, 5, 3);
  const crankAngle = phase + Math.PI / 2;
  const pin = { x: crank.x + Math.cos(crankAngle) * 13, y: crank.y + Math.sin(crankAngle) * 13 };
  ctx.fillStyle = paint.body;
  ctx.beginPath();
  ctx.moveTo(crank.x, crank.y);
  ctx.arc?.(crank.x, crank.y, 18, crankAngle - .7, crankAngle + .7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc?.(crank.x, crank.y, 4, 0, Math.PI * 2);
  ctx.fill();
  // Viga e cabeca de cavalo, girando no pivo.
  ctx.save();
  ctx.translate(pivot.x, pivot.y);
  ctx.rotate(tilt);
  ctx.fillStyle = paint.body;
  ctx.fillRect(-52, -5, 92, 10);
  ctx.fillStyle = paint.trim;
  ctx.fillRect(-52, -5, 92, 2);
  if (level >= 4) {
    ctx.fillStyle = '#111';
    for (let stripe = -44; stripe < 36; stripe += 14) ctx.fillRect(stripe, -3, 6, 6);
  }
  ctx.fillStyle = paint.dark;
  ctx.beginPath();
  ctx.moveTo(-50, -10);
  ctx.quadraticCurveTo?.(-70, 0, -50, 22);
  ctx.lineTo(-44, 22);
  ctx.lineTo(-44, -10);
  ctx.closePath();
  ctx.fill();
  const beamEnd = { x: 38, y: 0 };
  ctx.restore();
  // Haste da cabeca ate o poco e biela da manivela ate a viga.
  const headTip = { x: pivot.x + Math.cos(tilt) * -57 - Math.sin(tilt) * 22, y: pivot.y + Math.sin(tilt) * -57 + Math.cos(tilt) * 22 };
  const beamTail = { x: pivot.x + Math.cos(tilt) * beamEnd.x, y: pivot.y + Math.sin(tilt) * beamEnd.x };
  ctx.strokeStyle = '#c9c9c9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(headTip.x, headTip.y); ctx.lineTo(centerX - 51, groundY - 20);
  ctx.stroke();
  ctx.strokeStyle = paint.dark;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(pin.x, pin.y); ctx.lineTo(beamTail.x, beamTail.y);
  ctx.stroke();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc?.(pivot.x, pivot.y, 4, 0, Math.PI * 2);
  ctx.fill();
  // Nivel 4+: luz de aviso piscando no topo; nivel 5: bandeira.
  if (level >= 4) {
    ctx.fillStyle = Math.sin(time / 250) > 0 ? '#ff3b30' : '#5a1410';
    ctx.fillRect(pivot.x - 3, pivot.y - 14, 6, 6);
  }
  if (level >= 5) {
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX + 96, groundY - 30); ctx.lineTo(centerX + 96, groundY - 66);
    ctx.stroke();
    ctx.fillStyle = '#ffb000';
    const wave = Math.sin(time / 260) * 3;
    ctx.beginPath();
    ctx.moveTo(centerX + 96, groundY - 66); ctx.lineTo(centerX + 116, groundY - 60 + wave); ctx.lineTo(centerX + 96, groundY - 54);
    ctx.fill();
  }
  // Plaquinha de nivel na base, como nos jogos de construcao.
  ctx.fillStyle = '#111';
  ctx.fillRect(centerX - 66, groundY - 4, 22, 14);
  ctx.fillStyle = paint.trim;
  ctx.font = 'bold 10px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`N${level}`, centerX - 55, groundY + 7);
  ctx.restore();
}

function drawScaffold(ctx, centerX, groundY, time) {
  ctx.save();
  ctx.strokeStyle = '#c99a3a';
  ctx.lineWidth = 2;
  for (const x of [centerX - 62, centerX - 20, centerX + 22, centerX + 62]) {
    ctx.beginPath(); ctx.moveTo(x, groundY - 8); ctx.lineTo(x, groundY - 96); ctx.stroke();
  }
  for (const y of [groundY - 36, groundY - 66, groundY - 96]) {
    ctx.beginPath(); ctx.moveTo(centerX - 62, y); ctx.lineTo(centerX + 62, y); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(201, 154, 58, .6)';
  ctx.beginPath();
  ctx.moveTo(centerX - 62, groundY - 8); ctx.lineTo(centerX - 20, groundY - 66);
  ctx.moveTo(centerX + 22, groundY - 8); ctx.lineTo(centerX + 62, groundY - 66);
  ctx.stroke();
  // Faiscas de solda.
  if (Math.sin(time / 90) > .3) {
    ctx.fillStyle = '#fff3a0';
    ctx.fillRect(centerX - 6 + Math.sin(time / 37) * 4, groundY - 70 + Math.cos(time / 53) * 3, 3, 3);
  }
  ctx.restore();
}

// Corpo dos pocos: desenhado no mundo, antes da noite escurecer a superficie.
export function renderOilField(ctx, derricks = [], { time = 0, now = Date.now() } = {}) {
  for (let slot = 0; slot < OIL_SLOT_X.length; slot++) {
    const { centerX, groundY } = getOilDerrickRect(slot);
    const status = getDerrickStatus(derricks[slot], now);
    if (!status) { drawEmptyPlot(ctx, centerX, groundY, time); continue; }
    drawPumpjack(ctx, centerX, groundY, Math.max(1, status.activeLevel), time, !status.upgrading && !status.full);
    if (status.upgrading) drawScaffold(ctx, centerX, groundY, time);
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
      const y = groundY - 112;
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
      const y = groundY - 116 + bob;
      ctx.fillStyle = status.full ? '#ffdddd' : '#fff6e0';
      ctx.strokeStyle = status.full ? '#ff3b30' : '#2a1a08';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc?.(centerX, y, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(centerX - 6, y + 22); ctx.lineTo(centerX, y + 30); ctx.lineTo(centerX + 6, y + 22);
      ctx.fill();
      // Gota de petroleo com brilho.
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.moveTo(centerX, y - 13);
      ctx.quadraticCurveTo?.(centerX + 11, y + 2, centerX, y + 10);
      ctx.quadraticCurveTo?.(centerX - 11, y + 2, centerX, y - 13);
      ctx.fill();
      ctx.fillStyle = 'rgba(170, 150, 255, .8)';
      ctx.fillRect(centerX - 4, y - 2, 2, 6);
      ctx.fillStyle = status.full ? '#ff6b5c' : '#ffe2a8';
      ctx.font = 'bold 12px "Share Tech Mono", monospace';
      ctx.fillText(status.full ? `CHEIO ${status.stored}` : String(status.stored), centerX, y + 44);
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

// Miniatura animada do poco para o painel de melhoria; mostra o nivel seguinte quando pedido.
export function drawOilDerrickPreview(ctx, { level = 1, time = 0, width = 220, height = 150, pumping = true } = {}) {
  ctx.clearRect(0, 0, width, height);
  const sky = ctx.createLinearGradient?.(0, 0, 0, height);
  if (sky) {
    sky.addColorStop(0, '#3a2412');
    sky.addColorStop(1, '#120a04');
    ctx.fillStyle = sky;
  } else ctx.fillStyle = '#1a0f06';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#3b2a1a';
  ctx.fillRect(0, height - 22, width, 22);
  ctx.save();
  const scale = Math.min(1.25, width / 210);
  ctx.translate(width / 2 - 14 * scale, height - 22);
  ctx.scale(scale, scale);
  drawPumpjack(ctx, 0, 0, Math.max(1, Math.min(5, level)), time, pumping);
  ctx.restore();
}
