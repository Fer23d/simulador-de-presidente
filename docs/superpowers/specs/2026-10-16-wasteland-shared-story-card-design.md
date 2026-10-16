# Wasteland Events in the Shared Story Card

## Purpose

Continue the game's existing narrative experience after the nuclear transition. Wasteland dilemmas must use the exact story modal already used before the apocalypse, rather than introducing a second event dialog or a separate visual style. Choosing an option must affect bunker resources and resume play.

## Current State

- `index.html` already contains `#modal-historia` and `#modal-bunker-event`.
- `dashboard.js` renders pre-apocalypse story events through `renderStoryCard()` into `#modal-historia`, while Wasteland dilemmas currently render through `bunkerEventView()` into `#modal-bunker-event`.
- Wasteland dilemmas are represented by `pendingBunkerEvent: { id }`; `advanceWastelandMonth()` already blocks advancement while this field is set and schedules an event every three Wasteland months.
- `resolveWastelandEvent()` applies costs/effects to `scrap`, `shelter_supplies`, and inhabitant loyalty, then clears `pendingBunkerEvent`.
- The bunker renderer pauses its Canvas controller while a dilemma is pending.

## Design

### Shared Narrative Presentation

Keep `#modal-historia`, `.story-dialog`, the existing classification/title/body elements, and the current story typography and layout. Extend `renderStoryCard(state)` to select the existing narrative story when `pendingStory` is set, or the Wasteland event identified by `pendingBunkerEvent` when `is_wasteland` is true.

Normal story cards retain their existing single dismiss button and behavior. Wasteland cards use the same story card structure and existing button styles, but render the event's two choice buttons. No new modal element, CSS class, or styling system is introduced. Remove the Wasteland event modal from active rendering and interaction; remove its now-unused HTML element and event-listener path so there is one authoritative presentation surface.

### Event Data and Resolution

Keep event definitions in `game_mechanics.js`, with serializable option IDs, labels, costs, and effect descriptors. Do not store functions or callbacks in the saved game state. Route option clicks to `resolveWastelandEvent(state, optionId)`; ordinary story dismissals continue through `dismissStory()`.

Retain the existing three bunker dilemmas to avoid deleting working gameplay, and add these events to the same catalog. Event selection cycles through the catalog in a stable round-robin order, skipping events whose prerequisites are not present (for example, skip the greenhouse event until at least one greenhouse exists):

- **Sinal de Rádio Desconhecido:** Send scouts for 50 food. A deterministic 65% roll grants 100 scrap; failure returns no loot. Ignoring the signal costs nothing and yields no loot.
- **Fungo na Estufa:** Quarantining the first greenhouse disables its production for three Wasteland turns. Attempting a cure costs 80 energy and has a deterministic 60% success chance; success avoids the quarantine, while failure quarantines the greenhouse for three turns and reduces all inhabitants' loyalty by 10.

Event outcomes use the existing `randomSeed`/`nextRandom` mechanism so the result is deterministic for a saved state and replayable in tests. Costs are validated before resolution. An invalid event or unaffordable choice leaves the pending decision intact and reports the existing resource error rather than silently advancing.

The temporary greenhouse status is data on the affected room (remaining disabled turns). Disabled greenhouses do not produce food. The timer is decremented once per Wasteland month, with the three-month quarantine covering the next three production calculations.

### Turn Cadence, Blocking, and Saves

Use `wasteland_turn` as the canonical Wasteland month counter and maintain `wastelandMonthCounter` as a compatibility alias for existing saved games and callers. Hydration reads `wasteland_turn` first and falls back to `wastelandMonthCounter`; each advance writes the same incremented value to both fields.

Every third Wasteland month, queue the next eligible event from the catalog in `pendingBunkerEvent`. That field remains the serializable source of truth; it is not copied into `currentStory` and does not mark an event as a one-time story chapter. Existing saves with a pending event remain valid and render it in `#modal-historia`.

While `pendingBunkerEvent` or an expedition report exists, `advanceWastelandMonth()` does not advance the calendar, consume supplies, or process another event. The existing dashboard render lifecycle pauses the bunker controller while a decision is pending. Once the choice resolves and the modal hides, the controller resumes through its existing lifecycle; verify and explicitly resume it if reconstruction does not restart it.

### Effects and Error Handling

- Apply option costs and effects immutably to the current Wasteland state.
- Clamp numeric resources at zero and loyalty to its established 0-100 range.
- Update `randomSeed` only when an option outcome requires a roll.
- Clear `pendingBunkerEvent` only after a valid, affordable choice is resolved.
- Preserve normal story-card dismissal and its `seen_stories` behavior unchanged.

## Testing

Add or update focused tests for:

1. A Wasteland event appears on every third turn, and no turn advances while it is pending.
2. The dashboard renders Wasteland dilemmas through `renderStoryCard()` and the existing `#modal-historia`; the old bunker event modal is not used.
3. Choosing each option applies the correct costs, supplies, loyalty, quarantine, and pending-state cleanup.
4. Radio and cure outcomes are deterministic for a fixed `randomSeed`, including success and failure cases.
5. Greenhouse quarantine suppresses food production for exactly three production turns and then expires.
6. Existing pre-apocalypse story rendering/dismissal, prior Wasteland dilemmas, expedition blocking, and legacy saves containing `wastelandMonthCounter` continue to work.

Run the full `npm test` suite and the project build/check command, if configured, before publication.

## Scope Exclusions

- No new modal, overlay, CSS theme, or narrative UI framework.
- No changes to pre-apocalypse story text, story unlock conditions, or one-time chapter semantics.
- No changes to the general bunker economy beyond the new event effects and temporary greenhouse quarantine.
