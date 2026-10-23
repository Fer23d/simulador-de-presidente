const BURST_COLORS = Object.freeze(['#ffd447', '#c87bff', '#f2f4ef', '#ff9f36']);

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function isLootboxCrateClick(point, width, height) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return false;
  const centerX = width / 2;
  const centerY = height / 2;
  return Math.abs(point.x - centerX) <= Math.min(155, width * .32)
    && Math.abs(point.y - centerY) <= Math.min(112, height * .3);
}

function renderBurst(ctx, width, height, time, revealedAt) {
  if (!Number.isFinite(revealedAt)) return;
  const elapsed = clamp((time - revealedAt) / 1000, 0, 1.5);
  if (elapsed >= 1.5) return;
  const centerX = width / 2;
  const centerY = height / 2;
  for (let index = 0; index < 44; index++) {
    const angle = index * 2.399963229728653;
    const speed = 65 + ((index * 47) % 175);
    const x = centerX + Math.cos(angle) * speed * elapsed;
    const y = centerY + Math.sin(angle) * speed * elapsed + 55 * elapsed * elapsed;
    const size = 3 + index % 5;
    ctx.globalAlpha = clamp(1 - elapsed / 1.5, 0, 1);
    ctx.fillStyle = BURST_COLORS[index % BURST_COLORS.length];
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;
}

export function renderLootboxOverlay(ctx, {
  opened = false,
  clickCount = 0,
  revealed = false,
  revealedAt = null,
  shakeStartedAt = null,
  time = 0,
  crateImage = null,
} = {}) {
  const width = ctx?.canvas?.width;
  const height = ctx?.canvas?.height;
  if (!opened || !(width > 0) || !(height > 0)) return;

  const count = clamp(Math.floor(Number(clickCount) || 0), 0, 3);
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, .85)';
  ctx.fillRect(0, 0, width, height);

  if (!revealed) {
    const shakeElapsed = Number.isFinite(shakeStartedAt) ? Math.max(0, time - shakeStartedAt) : Infinity;
    const amplitude = count >= 2 ? 15 : count === 1 ? 5 : 0;
    const shake = shakeElapsed < 500 ? Math.sin(time * .08) * amplitude * (1 - shakeElapsed / 500) : 0;
    const crateWidth = Math.min(240, width * .36);
    const crateHeight = crateWidth * .75;
    const x = (width - crateWidth) / 2 + shake;
    const y = (height - crateHeight) / 2;
    if (crateImage?.width > 0 && crateImage?.height > 0) {
      ctx.drawImage(crateImage, x, y, crateWidth, crateHeight);
    } else {
      ctx.fillStyle = '#ff00ff';
      ctx.fillRect(x, y, crateWidth, crateHeight);
    }
    if (count >= 2) {
      ctx.fillStyle = 'rgba(255, 244, 186, .92)';
      ctx.fillRect(width / 2 - 2, y + crateHeight * .24, 4, crateHeight * .48);
      ctx.fillStyle = 'rgba(255, 205, 82, .75)';
      ctx.fillRect(width / 2 - 9, y + crateHeight * .5, 18, 3);
    }
  } else {
    renderBurst(ctx, width, height, Number(time) || 0, revealedAt);
  }
  ctx.restore();
}

export function playLootboxSound(stage) {
  const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioContextClass) return false;
  try {
    const context = new AudioContextClass();
    const now = context.currentTime;
    const notes = stage >= 3 ? [523.25, 659.25, 783.99] : stage === 2 ? [280, 410] : [95];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = stage === 1 ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + index * .09);
      gain.gain.setValueAtTime(.0001, now + index * .09);
      gain.gain.exponentialRampToValueAtTime(stage >= 3 ? .035 : .025, now + index * .09 + .025);
      gain.gain.exponentialRampToValueAtTime(.0001, now + index * .09 + (stage >= 3 ? .42 : .18));
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + index * .09);
      oscillator.stop(now + index * .09 + (stage >= 3 ? .45 : .2));
    });
    window.setTimeout(() => { void context.close(); }, 900);
    return true;
  } catch {
    return false;
  }
}
