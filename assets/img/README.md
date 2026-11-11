# Bunker artwork

These PNGs are the first playable art pass. `src/core/sprite_engine.js` owns the
URL manifest; image objects are deliberately not serialized into `game-state`.

- `bg_sky.webp`, `bg_mountains.webp`, `fg_wasteland.webp`: horizontal parallax layers.
- `dirt_texture.webp`: repeating soil image.
- `room_atlas.webp`: three columns by three rows, ordered vault/elevator/dormitory,
  generator/greenhouse/arsenal, medical/radio/office. All cells have equal size.
  The greenhouse cell is superseded by the layered room below.
- `elevator_cabin.webp`: transparent moving cabin.
- `character_sheet.webp`: four columns by two rows. The top row has idle plus
  three walking frames for the President.
- `npc_walk_sheet.webp`: four columns by four rows. Each row (engineer,
  scientist, medic, guard) contains idle plus three walk frames. Residents
  use the engineer row until they have dedicated art.
- `room_base_empty.webp`, `plant_prop_1.webp`, `uv_light_prop.webp`: composited
  greenhouse scene. UV glow is added after actors, so it lights them too.
- `surface_fort.webp`: transparent, hand-painted exterior fortification. It is
  layered beneath the animated hazmat garrison, so the same art is reused by
  the surface, the fort preview, and raid reports without baking in soldiers.

To replace one room independently, add a PNG and pass an asset URL under
`room_<type>` (for example `room_greenhouse`) to `createRpgBunkerEngine`.
Missing images are rendered magenta so broken paths are immediately visible.

Initial bitmap art was generated with the built-in image generation tool from
prompts for a post-apocalyptic landscape, soil texture, nine-room bunker atlas,
transparent elevator cabin, side-view survivor spritesheets, empty bunker
room, hydroponic planter, and UV lamp.

## Optional painted art (drop-in)

These files are optional. When a file exists the game uses it; when it is missing the game keeps the
procedural drawing and does not report a missing texture. Names and layouts are fixed by the code.

- `layd_sheet.webp` (1280x1280): Layd, side view facing right, transparent, 4 columns x 4 rows of equal 320px
  cells with the feet on the same baseline. Row 1 walk (4 frames), row 2 run (4 frames), row 3 stand / sit /
  sit happy / lying sick, row 4 sick walk (4 frames). Scale comes from the standing frame, so all frames keep one size.
- `dark_market_stall.webp` (1774x887): the Dark Market stall without the merchant, transparent, about 2:1, resting
  on the ground with a straight lower edge.
- `dark_market_merchant.webp` (1024x1536): the hooded merchant, front view, transparent. Drawn over the stall with
  a slow breath; the sprite contains no counter so it can be layered cleanly.
- `room_radiation_clinic.webp`, `room_laboratory.webp`, `room_life_support.webp` (1688x932 each): rooms with the same
  proportion and lighting contract as one cell of `room_atlas.webp`.
- `cover_art.webp` (1920x1080): cover painting with a calm centre and bottom (logo and loading bar sit on top).
