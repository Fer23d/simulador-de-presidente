# False Flag and Dead Hand Design

## Goal

Add two end-game systems to the client-side simulation: a covert false-flag operation that legitimizes one war, and a Dead Hand megaproject that turns a terminal regime defeat into mutual destruction.

## False Flag

`black_ops.js` exports `orquestrarFalsaBandeira(state, alvoId)`. The operation rejects invalid, destroyed, annexed, or wasteland targets. It charges a fixed treasury cost, removes 2 percent of the player's `populacao_base`, removes 1 percent of its `pib_base`, sets `just_war_target` to the target id, and raises `militares` and `trabalhadores` to 100.

`game-state.js` owns the diplomatic consequence. Declaring war against `just_war_target` does not reduce ONU reputation. A peace-treaty annexation of the same target also bypasses the normal annexation tension penalty. The marker is consumed when that war is resolved through annexation, looting, demilitarization, or reparations, so it cannot authorize unrelated future wars.

## Dead Hand Megaproject

`megaprojects.js` owns one project definition, `dead-hand-network`, with a high cash, research-point, and uranium cost. Starting it creates a 12-month entry in `state.megaprojects`. Monthly processing decrements remaining months. Completion sets `state.dead_hand_active` to true.

The monthly engine routes any newly-created `regime.gameOver` state through `interceptDeadHandGameOver(state)`. When active, it consumes one uranium per surviving foreign country, in deterministic contacts order, and marks each funded target as a wasteland with zero population, GDP, and military strength. The player is always converted to wasteland as well, regardless of remaining uranium, to preserve mutual destruction. The result records `dead_hand_triggered: true`, keeps `regime.gameOver: true`, and adds a terminal news item.

## UI

The Projects Internos tab displays the 12-month Mão Morta project, including requirements and completion progress. Diplomacy exposes Falsa Bandeira only for valid foreign contacts. A static `#modal-dead-hand` overlay is shown whenever `dead_hand_triggered` is true. It contains the specified terminal ASCII, blocks the rest of the interface, and only offers a reset action.

## Testing

Tests will first prove: false flag resource and faction effects; ONU penalty bypass for its specific target; project completion after twelve advances; and the game-over intercept that destroys the player plus uranium-funded foreign targets. Dashboard rendering tests will assert both action controls and the terminal modal hook.
