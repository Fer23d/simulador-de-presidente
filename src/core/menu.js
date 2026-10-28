import { DEFAULT_ASSETS, drawActorSprite } from './sprite_engine.js';
import { PRESIDENT_CLASSES } from './player_state.js';

const CARD_TOP = 142;
const CARD_WIDTH = 416;
const CARD_HEIGHT = 170;
const CARD_GAP_X = 16;
const CARD_GAP_Y = 14;

function cardPosition(index, width) {
  const columns = 2;
  const totalWidth = columns * CARD_WIDTH + (columns - 1) * CARD_GAP_X;
  const left = (width - totalWidth) / 2;
  return { x: left + (index % columns) * (CARD_WIDTH + CARD_GAP_X),
    y: CARD_TOP + Math.floor(index / columns) * (CARD_HEIGHT + CARD_GAP_Y) };
}

export function getPresidentSelectionAtPoint(point, width = 960, height = 600) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || height < CARD_TOP + CARD_HEIGHT) return null;
  const position = cardPosition(0, width);
  const localX = point.x - position.x;
  const localY = point.y - CARD_TOP;
  const column = Math.floor(localX / (CARD_WIDTH + CARD_GAP_X));
  const row = Math.floor(localY / (CARD_HEIGHT + CARD_GAP_Y));
  if (column < 0 || column > 1 || row < 0 || row > 1) return null;
  const xInCard = localX - column * (CARD_WIDTH + CARD_GAP_X);
  const yInCard = localY - row * (CARD_HEIGHT + CARD_GAP_Y);
  if (xInCard > CARD_WIDTH || yInCard > CARD_HEIGHT) return null;
  return PRESIDENT_CLASSES[row * 2 + column]?.id ?? null;
}

function drawWrappedText(ctx, text, x, y, maxCharacters, lineHeight, maxLines = 2) {
  const words = String(text).split(/\s+/);
  let line = '';
  let lines = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxCharacters && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      line = word;
      lines += 1;
      if (lines >= maxLines) return;
    } else line = candidate;
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
}

export function drawPresidentSelection(ctx, { width = ctx.canvas?.width ?? 960,
  height = ctx.canvas?.height ?? 600, time = 0, portraits = {} } = {}) {
  ctx.save();
  ctx.fillStyle = '#080e0c';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(76, 255, 144, .13)';
  ctx.lineWidth = 1;
  for (let y = 0; y < height; y += 5) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }
  ctx.fillStyle = '#e6bf58';
  ctx.font = '16px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('/// CADASTRO DO COMANDANTE DO VAULT ///', width / 2, 39);
  ctx.fillStyle = '#d7e9d8';
  ctx.font = 'bold 26px "Share Tech Mono", monospace';
  ctx.fillText('ESCOLHA SUA ORIGEM', width / 2, 76);
  ctx.fillStyle = '#8da69a';
  ctx.font = '13px "Share Tech Mono", monospace';
  ctx.fillText('Cada profissão altera sua forma de manter o Vault.', width / 2, 103);

  for (let index = 0; index < PRESIDENT_CLASSES.length; index++) {
    const profile = PRESIDENT_CLASSES[index];
    const { x, y } = cardPosition(index, width);
    const pulse = .35 + (Math.sin(time / 380 + index) + 1) * .12;
    ctx.fillStyle = '#111a16';
    ctx.fillRect(x, y, CARD_WIDTH, CARD_HEIGHT);
    ctx.strokeStyle = `rgba(57, 255, 20, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, CARD_WIDTH - 2, CARD_HEIGHT - 2);
    const sprite = portraits[profile.spriteSheet];
    if (sprite?.width && sprite?.height) {
      const walkPhase = Math.floor(time / 170) % 3;
      drawActorSprite(ctx, { x: x + 62, y: y + 148, facing: 1,
        currentState: time > 0 ? 'walking_right' : 'idle', role: profile.spriteRole }, sprite,
      time > 0 ? 170 + walkPhase * 170 : 0, { height: 112 });
    }
    const textX = x + 118;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#39ff14';
    ctx.font = 'bold 18px "Share Tech Mono", monospace';
    ctx.fillText(profile.name.toUpperCase(), textX, y + 26);
    ctx.fillStyle = '#e6bf58';
    ctx.font = '12px "Share Tech Mono", monospace';
    ctx.fillText(profile.leader, textX, y + 44);
    ctx.fillStyle = '#d8e4db';
    ctx.font = '13px "Share Tech Mono", monospace';
    drawWrappedText(ctx, `BÔNUS: ${profile.buff}`, textX, y + 65, 43, 17);
    ctx.fillStyle = '#e59c83';
    drawWrappedText(ctx, `CUSTO: ${profile.flaw}`, textX, y + 106, 43, 17);
    ctx.fillStyle = '#e6bf58';
    ctx.font = 'bold 13px "Share Tech Mono", monospace';
    ctx.fillText('[ ASSUMIR COMANDO ]', textX, y + 153);
  }
  ctx.restore();
}

export function createPresidentSelectionMenu(canvas, onSelect) {
  if (!canvas) return { destroy() {} };
  const ctx = canvas.getContext('2d');
  const portraits = {};
  const images = [];
  if (typeof globalThis.Image === 'function') {
    const spriteSheets = new Set(PRESIDENT_CLASSES.map(({ spriteSheet }) => spriteSheet));
    for (const key of spriteSheets) {
      const url = DEFAULT_ASSETS[key];
      if (!url) continue;
      const image = new globalThis.Image();
      image.onload = () => draw(0);
      image.src = url;
      portraits[key] = image;
      images.push(image);
    }
  }
  let frameId = null;
  let destroyed = false;
  function draw(time) {
    if (!destroyed) drawPresidentSelection(ctx, { time, portraits });
  }
  function frame(time) {
    if (destroyed) return;
    draw(time);
    if (typeof globalThis.requestAnimationFrame === 'function') frameId = globalThis.requestAnimationFrame(frame);
  }
  function click(event) {
    const bounds = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, bounds.width);
    const scaleY = canvas.height / Math.max(1, bounds.height);
    const classId = getPresidentSelectionAtPoint({ x: (event.clientX - bounds.left) * scaleX,
      y: (event.clientY - bounds.top) * scaleY }, canvas.width, canvas.height);
    if (classId) onSelect?.(classId);
  }
  canvas.addEventListener('click', click);
  frame(0);
  return {
    destroy() {
      destroyed = true;
      if (frameId !== null && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(frameId);
      canvas.removeEventListener('click', click);
      images.forEach((image) => { image.onload = null; });
    },
  };
}
