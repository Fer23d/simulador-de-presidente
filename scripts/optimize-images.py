"""Converte as imagens do jogo (assets/img/*.png) para WebP, mantendo canal alfa e dimensoes.

Uso (na raiz do projeto):
    python scripts/optimize-images.py            # converte e mostra a economia, sem apagar nada
    python scripts/optimize-images.py --replace  # converte e apaga os PNG convertidos

O jogo carrega os .webp. Ao gerar uma arte nova em PNG, solte-a em assets/img e rode este script;
depois troque a extensao na referencia (ex.: 'assets/img/nova_arte.webp').
Requer Pillow (pip install pillow) com suporte a WebP.
"""
import glob
import os
import sys

from PIL import Image

QUALITY = 92  # pintura e texturas: diferenca invisivel a olho nu, ~85% menor que PNG
ALPHA_QUALITY = 100  # bordas de sprites continuam limpas

replace = "--replace" in sys.argv
before = after = 0
for path in sorted(glob.glob("assets/img/*.png")):
    target = os.path.splitext(path)[0] + ".webp"
    image = Image.open(path)
    image.load()
    image.save(target, "WEBP", quality=QUALITY, alpha_quality=ALPHA_QUALITY, method=6)
    before += os.path.getsize(path)
    after += os.path.getsize(target)
    if replace:
        os.remove(path)
    print(f"{os.path.basename(path):55s} {os.path.getsize(path) // 1024 if os.path.exists(path) else 0:6d} KB -> {os.path.getsize(target) // 1024:5d} KB")
print(f"\nTotal: {before / 1048576:.1f} MB -> {after / 1048576:.1f} MB")
