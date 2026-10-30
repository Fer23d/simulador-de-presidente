// Ferramentas de arte procedural compartilhadas pelos desenhos realistas da superficie (Forte e pocos de petroleo).

// Ruido deterministico: a textura nao "ferve" entre quadros e e igual em toda partida.
export function hash(x, y, seed = 0) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

export function linear(ctx, x0, y0, x1, y1, stops) {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([at, color]) => gradient.addColorStop(at, color));
  return gradient;
}

// Mesma gradacao que gradeStructure aplica nos pixels, para pecas animadas combinarem com as pre-renderizadas.
export function tone(hex) {
  const value = parseInt(hex.slice(1), 16);
  const mix = (channel, multiplier, offset) => Math.max(0, Math.min(255, Math.round(channel * multiplier + offset)));
  return `rgb(${mix(value >> 16 & 255, 1.06, 10)},${mix(value >> 8 & 255, .97, 0)},${mix(value & 255, .86, -6)})`;
}

// Granulado e gradacao quente para casar a estrutura desenhada com o cenario pintado do Ermo.
export function gradeStructure(canvas, seed = 0) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    if (!data[index + 3]) continue;
    const pixel = index / 4;
    const grain = (hash(pixel % canvas.width, Math.floor(pixel / canvas.width), seed) - .5) * 22;
    data[index] = Math.min(255, data[index] * 1.06 + grain + 10);
    data[index + 1] = Math.min(255, data[index + 1] * .97 + grain);
    data[index + 2] = Math.min(255, data[index + 2] * .86 + grain - 6);
  }
  ctx.putImageData(image, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = linear(ctx, 0, 0, 0, canvas.height, [[0, 'rgba(255, 150, 70, .16)'], [1, 'rgba(20, 8, 2, .3)']]);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

// Cenario do Ermo: usa as imagens reais do jogo quando carregadas, e um degrade com ruinas como reserva.
export function paintBackdrop(ctx, width, height, groundY, scenery = null) {
  if (scenery?.sky && scenery.mountains && scenery.ground) {
    ctx.drawImage(scenery.sky, -260, groundY - 520, 1400, 540);
    ctx.drawImage(scenery.mountains, -340, groundY - 230, 1400, 260);
    ctx.drawImage(scenery.ground, -420, groundY - 180, 1600, 210);
    ctx.fillStyle = linear(ctx, 0, groundY + 10, 0, height, [[0, 'rgba(40, 26, 14, .2)'], [1, 'rgba(14, 8, 4, .9)']]);
    ctx.fillRect(0, groundY + 10, width, height - groundY - 10);
    return;
  }
  ctx.fillStyle = linear(ctx, 0, 0, 0, groundY, [[0, '#5a2a12'], [.6, '#a85a22'], [1, '#d88a3a']]);
  ctx.fillRect(0, 0, width, groundY);
  ctx.fillStyle = 'rgba(60, 30, 15, .75)';
  for (let x = 0; x < width; x += 24) {
    const h = 10 + hash(x, 1) * 34;
    ctx.fillRect(x, groundY - h, 20, h);
  }
  ctx.fillStyle = linear(ctx, 0, groundY, 0, height, [[0, '#4a3420'], [1, '#1c120a']]);
  ctx.fillRect(0, groundY, width, height - groundY);
  for (let index = 0; index < width * 2; index++) {
    ctx.fillStyle = hash(index, 5) > .5 ? 'rgba(255, 220, 170, .08)' : 'rgba(0, 0, 0, .25)';
    ctx.fillRect(hash(index, 2) * width, groundY + hash(index, 3) * (height - groundY), 2, 2);
  }
}
