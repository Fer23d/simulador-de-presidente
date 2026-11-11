
// Capa pintada (assets/img/cover_art.webp). Nao ha mais cenario desenhado em codigo: a capa so aparece quando o PNG carrega.
let coverImage = null;
function getCoverImage() {
  if (coverImage === null && typeof Image === 'function') {
    coverImage = new Image();
    coverImage.src = './assets/img/cover_art.webp';
  }
  return coverImage && coverImage.complete && coverImage.naturalWidth > 0 ? coverImage : null;
}

let paintedBackdrop = null;

// A pintura e 16:9. Em janelas largas ela cobre a tela; em janelas altas ela encaixa na largura e o resto
// fica com uma copia borrada e escura dela mesma, para a porta e os personagens nunca serem cortados.
function drawPaintedCover(ctx, image, width, height, time) {
  const imageAspect = image.naturalWidth / image.naturalHeight;
  const aspect = width / height;
  if (aspect >= imageAspect * .8) {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
  } else {
    const key = width + 'x' + height;
    if (!paintedBackdrop || paintedBackdrop.key !== key) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const c = canvas.getContext('2d');
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      c.filter = 'blur(24px) brightness(.55)';
      c.drawImage(image, (width - image.naturalWidth * scale) / 2, (height - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
      paintedBackdrop = { key, canvas };
    }
    ctx.drawImage(paintedBackdrop.canvas, 0, 0);
    const w = width;
    const h = image.naturalHeight * w / image.naturalWidth;
    ctx.drawImage(image, 0, (height - h) * .42, w, h);
  }
  const glow = ctx.createRadialGradient(width * .5, height * .6, 10, width * .5, height * .6, Math.max(width, height) * .7);
  glow.addColorStop(0, 'rgba(255, 150, 60, ' + (.05 + Math.sin(time / 700) * .02) + ')');
  glow.addColorStop(1, 'rgba(0, 0, 0, .4)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

export function drawCoverArt(ctx, width, height, time = 0) {
  if (typeof document === 'undefined' || !width || !height) return;
  const painted = getCoverImage();
  if (!painted) {
    // A capa é exclusivamente baseada no asset pintado. Nunca mostrar a
    // antiga arte procedural enquanto o PNG ainda está a carregar ou falha.
    ctx.clearRect(0, 0, width, height);
    return;
  }
  drawPaintedCover(ctx, painted, width, height, time);
}
