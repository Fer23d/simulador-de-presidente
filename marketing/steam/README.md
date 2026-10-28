# Kit de divulgação — Steam · LAST OFFICE

Nome do jogo na Steam: **LAST OFFICE** — frase: *Após a guerra, tudo muda*.

Imagens geradas a partir do próprio jogo (motor de renderização e interface reais). Nada no código do jogo foi alterado.

## Capsules (Steamworks → Store Assets / Library Assets)

| Arquivo | Slot na Steam |
|---|---|
| `capsules/header_capsule_920x430.png` | Header Capsule (e Library Header) |
| `capsules/small_capsule_462x174.png` | Small Capsule |
| `capsules/main_capsule_1232x706.png` | Main Capsule |
| `capsules/vertical_capsule_748x896.png` | Vertical Capsule |
| `capsules/library_capsule_600x900.png` | Library Capsule |
| `capsules/library_logo_1280x720.png` | Library Logo (PNG transparente) |
| `capsules/page_background_1438x810.png` | Page Background |

Pendente: **Library Hero 3840×1240** (`preset=hero`), não gerado.

## Screenshots (1920×1080)

`screenshots/01` a `06` são cenas renderizadas pelo motor do jogo; `07` a `11` são capturas da interface real.

## Redes sociais

`social/key_art_1920x1080.png`, `social/twitter_header_1500x500.png`, `social/instagram_1080x1080.png`.

## Como regerar

Com o jogo servido em `http://localhost:4173` (`npx --yes serve . -l 4173`):

```bash
node marketing/steam/tools/capture.mjs <saida.png> "http://localhost:4173/marketing/steam/tools/capsule_classic?preset=header&w=920&h=430" 920 430 1
node marketing/steam/tools/capture.mjs <saida.png> "http://localhost:4173/marketing/steam/tools/scene?scale=1&cx=980&cy=600&skin=golden" 1920 1080 1
node marketing/steam/tools/capture.mjs <saida.png> "http://localhost:4173/marketing/steam/tools/ui?shot=wardrobe" 1600 900 1.2
```

Use as URLs sem `.html` (o `serve` descarta a query ao redirecionar). Para o logo transparente, defina `TRANSPARENT=1`.
Banners oficiais: `tools/capsule_classic.html` (LAST OFFICE, sem personagens). `tools/capsule.html` guarda a versão alternativa com silhueta e cogumelo.
Presets de capsule: `header`, `small`, `main`, `vertical`, `library`, `hero`, `background`, `logo`, `keyart`, `twitter`, `square`.
