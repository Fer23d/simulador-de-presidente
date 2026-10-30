# Bunker artwork

These PNGs are the first playable art pass. `src/core/sprite_engine.js` owns the
URL manifest; image objects are deliberately not serialized into `game-state`.

- `bg_sky.png`, `bg_mountains.png`, `fg_wasteland.png`: horizontal parallax layers.
- `dirt_texture.png`: repeating soil image.
- `room_atlas.png`: three columns by three rows, ordered vault/elevator/dormitory,
  generator/greenhouse/arsenal, medical/radio/office. All cells have equal size.
  The greenhouse cell is superseded by the layered room below.
- `elevator_cabin.png`: transparent moving cabin.
- `character_sheet.png`: four columns by two rows. The top row has idle plus
  three walking frames for the President.
- `npc_walk_sheet.png`: four columns by four rows. Each row (engineer,
  scientist, medic, guard) contains idle plus three walk frames. Residents
  use the engineer row until they have dedicated art.
- `room_base_empty.png`, `plant_prop_1.png`, `uv_light_prop.png`: composited
  greenhouse scene. UV glow is added after actors, so it lights them too.
- `surface_fort.png`: transparent, hand-painted exterior fortification. It is
  layered beneath the animated hazmat garrison, so the same art is reused by
  the surface, the fort preview, and raid reports without baking in soldiers.

To replace one room independently, add a PNG and pass an asset URL under
`room_<type>` (for example `room_greenhouse`) to `createRpgBunkerEngine`.
Missing images are rendered magenta so broken paths are immediately visible.

Initial bitmap art was generated with the built-in image generation tool from
prompts for a post-apocalyptic landscape, soil texture, nine-room bunker atlas,
transparent elevator cabin, side-view survivor spritesheets, empty bunker
room, hydroponic planter, and UV lamp.
