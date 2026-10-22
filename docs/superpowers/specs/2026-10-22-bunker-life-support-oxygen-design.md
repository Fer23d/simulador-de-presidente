# Bunker Life Support and Oxygen Economy

## Purpose

Add an oxygen economy to the Wasteland bunker that rewards life-support construction, makes deeper rooms more expensive and air-intensive, and gives the player readable, persistent consequences when monthly oxygen production cannot meet demand.

## Current State

- The authoritative bunker layout is `state.shelter_grid`, a six-floor, seven-column grid. `room.floor` is zero-based.
- Resources are stored in `state.shelter_supplies`; current bunker resources include food and energy. The dashboard HUD is rendered by `bunkerView()`.
- `advanceWastelandMonth()` in `wasteland.js` calculates room output, population, consumption, capped storage, and then calls `advanceMonthlyGameMechanics()`.
- Room definitions, output profiles, upgrade prices, and storage capacity are shared from `bunker_economy.js`; construction and upgrade actions are in `shelter_engine.js`.
- `sprite_engine.js` draws room sprites, and `rpg_bunker.js` owns movement and NPC animation. Existing Canvas overlays are applied in the scene renderer.
- Wasteland state is serialized and normalized by `hydrateGameState()`. Random game outcomes use the saved `randomSeed` mechanism.

## Design Decisions

### Oxygen Resource and Monthly Balance

Add `oxygen` to `shelter_supplies` and `oxygen_shortage_turns` to the top-level game state. Hydration clamps both to non-negative integers and defaults missing oxygen to zero for ordinary saves and 300 for legacy Wasteland saves. Wasteland transition initializes a one-time emergency reserve of 300 O2. Existing saves remain valid and receive the normalized defaults.

Life-support rooms provide oxygen output and matching maximum reserve capacity: 300 O2 per room level. A level-1 room therefore generates 300 O2 per month and contributes 300 O2 to the reserve limit. Levels 2-5 scale linearly. Production is independent of assigned workers. The Vault itself also holds a 300 O2 emergency reserve, so legacy and new bunkers retain a small buffer before any support room is built; total storage is that reserve plus installed support capacity.

Monthly oxygen demand has two components:

- Each inhabitant physically present in the bunker consumes 5 O2. Count the President once in addition to `state.inhabitants` because the player actor is stored separately. Exclude NPCs on expeditions; prisoners still breathe and consume oxygen.
- Each occupied room other than `vault`, `elevator`, and `life_support` drains 10 O2 multiplied by its human-readable floor depth. Convert the zero-based grid value using `depth = room.floor + 1`; a room on stored floor 0 is depth 1, and stored floor 3 is depth 4. This room drain is per room, not per room level.

The monthly balance is `nextOxygen = clamp(currentOxygen + production - consumption, 0, oxygenStorageCapacity)`. A zero-capacity bunker stores zero oxygen. `oxygenDeficit` is true whenever monthly oxygen production is less than monthly oxygen consumption, even if stored reserve remains; reserve buys time before the HUD reaches zero but does not remove the production-shortage warning or its systemic penalties.

### Life-Support Room

Register `life_support` in `SHELTER_TYPES`, with Portuguese display text `Suporte de Vida`, a dedicated accent, and a construction cost consistent with other critical modules (base 180 scrap before depth surcharge). It can be built on any valid build slot. It does not require a worker to produce oxygen.

The room consumes 5 energy per level each month for refrigeration and ventilation. This cost is included in monthly energy demand before energy stock is resolved. It can be upgraded through the existing room modal. Levels 1-5 produce 300, 600, 900, 1200, and 1500 O2 per month respectively.

### Depth Costs

The existing base upgrade table remains authoritative. Apply a depth multiplier to the scrap component for construction and upgrades:

`depthMultiplier = 1 + ((room.floor + 1) * 0.1)`

Round scrap costs upward to an integer after multiplication. Science costs are unchanged. `getRoomUpgradeCosts()` returns the effective costs, ensuring the room modal and the upgrade action use identical values. The same pure cost helper is used by construction so deeper life-support modules also cost more.

Expose a pure `getShelterBuildCost(type, floor)` quote for construction. The build-slot selector and its action button must show the price for the currently selected floor and disable the action when that effective price is unaffordable; do not show only a base price that differs from the amount charged.

### Suffocation Consequences

When `oxygenDeficit` is true for a month:

- Oxygen-deprived status is exposed in state for UI and rendering.
- All non-expedition inhabitants lose 25 loyalty, clamped to 0-100. Existing low-food/energy loyalty loss continues to apply independently.
- Player and NPC movement speed is multiplied by 0.5. This composes multiplicatively with the existing nighttime movement modifier.
- The Canvas draws a subtle, pulsing red-violet tint with `source-atop` over already-rendered world pixels. The HUD remains unaffected because it is DOM outside the Canvas.
- Increment `oxygen_shortage_turns` by one.

When monthly production meets or exceeds demand, reset the shortage counter to zero and clear the deprivation status. At the end of each deficient month beginning with the third consecutive month, roll a 30% seeded chance of one asphyxiation death. Select the victim with the same saved RNG among NPCs present in the bunker; remove at most one per month and never remove the player, prisoners, or explorers on expeditions. Update `randomSeed` and produce a concise critical notice when a death occurs. This cadence makes the event deterministic for a saved state and testable.

### UI and Rendering

- Add an oxygen HUD entry in `bunkerView()`: `O2 current / capacity`, with a shortage class/label when monthly production is below demand.
- Extend room-management statistics to display oxygen output, room depth drain, and life-support energy demand where relevant. Show effective depth-adjusted scrap upgrade cost.
- Add a dedicated `room_life_support` asset key. If the art asset is absent, preserve the existing room base fallback; draw a small number of blue-white pipes and animated industrial fans as a Canvas overlay inside this room only. Keep all room props clipped to its bounds and avoid rendering those props in other room types.
- Pass the current oxygen-deprived state to the Canvas scene. Do not apply the suffocation tint to DOM HUD or dialogs.
- Slow player movement at the `updatePlayer()` speed calculation and NPC movement at the existing NPC delta calculation. Do not mutate global speed constants.

## State and API Shape

- `state.shelter_supplies.oxygen`: integer current reserve.
- `state.oxygen_shortage_turns`: integer consecutive deficient months.
- `state.oxygen_deprived`: boolean derived from the most recently completed monthly balance.
- `getLifeSupportOxygenProduction(grid)`: pure sum of level-scaled room output.
- `getBunkerOxygenConsumption(state, grid, population)`: pure sum of inhabitant and room-depth demand.
- `getRoomStorageCapacity(grid, 'oxygen')`: 300 O2 emergency capacity from the Vault plus installed life-support reserve capacity.
- Extend `getRoomEconomyProfile()` with oxygen production/consumption fields for UI.

Keep all monthly state transitions immutable. Do not place functions in the serialized game state. The oxygen accounting must be calculated once per month and reused for the returned state, notices, and tests.

## Scope Exclusions

- No oxygen consumption during real-time movement frames; oxygen changes only on monthly advancement.
- No oxygen-specific NPC assignment requirement.
- No changes to global politics, surface expeditions, food production, or the existing day/night cycle beyond composing movement penalties.
- No replacement of the current room renderer or asset manager.

## Testing

Add focused tests for:

1. Life-support room registration, buildability, levels 1-5 output, and energy maintenance.
2. Oxygen consumption at stored floors 0 and 3, inhabitant presence/exclusions, and excluded structural rooms.
3. Depth multipliers for construction and upgrade scrap prices, including ceiling rounding, selected-slot UI quotes, and unchanged science costs.
4. Monthly oxygen stock clamping, zero-capacity behavior, deficit detection despite reserve, and capacity from multiple support rooms.
5. Deficit streak persistence/hydration, 50% movement penalty, loyalty loss, recovery reset, and deterministic death beginning on the third consecutive month.
6. HUD and room modal display, dedicated room artwork fallback/props, and Canvas-only suffocation overlay.
7. Existing food, energy, upgrades, saves, night behavior, bunker events, and expedition tests remain unchanged.

Run the full `npm test` suite before publishing. Verify the deployment after pushing the tested commit to the configured public branch.
