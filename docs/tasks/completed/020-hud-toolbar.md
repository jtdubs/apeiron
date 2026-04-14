---
status: closed
---

# Task 020: Integration of HUD Toolbar

## Objective

Bring over the main HUD bar from the legacy `frac` codebase to provide a great view of tunable parameters, coordinates, and zoom level in Apeiron without breaking the non-render loop architecture constraint.

## Relevant Design Docs

- `docs/requirements.md`

## Requirements

- **Design Parity:** Recreate the lens crossfader and coordinate scrubbing from the legacy codebase.
- **Zero React DOM in Hot Paths:** Leverage `viewportStore.ts` explicitly without causing the main WebGPU canvas loop to rerender via prop drilling.
- **Scrubbable Interaction:** Ensure mathematical `f32` parsing works on `ScrubbableNumber.tsx`.

## Implementation Plan

1. Migrate `HUD.css` styling into `ApeironHUD.css`.
2. Construct `ApeironHUD.tsx` using `useStore(viewportStore)` and `ScrubbableNumber`.
3. Integrate it atop the `ApeironViewport` inside `App.tsx`.

## Verification Steps

- [x] Does the HUD scrub properly update the view center dynamically?
- [x] Does changing the lens slice angle shift the render correctly?
- [x] **Documentation Sync:** Did this implementation drift from the original plan? No drifting.
