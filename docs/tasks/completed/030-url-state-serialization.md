---
status: closed
---

# Task 030: URL State Serialization (Deep Linking)

## Objective

Implement a two-way synchronization layer between the application's Zustand state and the URL hash using a compressed Base64 format, enabling users to deep-link and share exact fractal coordinates and UI configurations.

## Relevant Design Docs

- [User Journeys](../../product/user-journeys.md) (The Deep-Zoom Enthusiast)
- [Frontend Design](../../design/frontend.md) (State Management)

## Requirements

- **Two-Way Sync:** The URL hash must live-update to reflect the current Zustand state (`viewportStore` and `uiStore`), and loading the application with a valid hash must immediately initialize the app to that exact state.
- **Compression:** State parameters should be serialized into a compact, Base64-encoded string to avoid excessively long or unreadable URLs, given the lengthy arbitrary-precision numbers required for deep zoom.
- **Debounced Updates:** Updating the URL during active user-driven panning and zooming must be debounced to avoid browser history spam or performance drops (maintaining the zero-DOM-in-hot-path rule).

## Implementation Plan

1. Create a `urlSync` utility module responsible for encoding and decoding the essential viewport and UI states (coordinates, precision, formula modifiers, color palettes).
2. Write unit tests for the serialization/deserialization logic to ensure zero precision loss for arbitrary-precision floats and coordinates.
3. Hook the serializer into the Zustand store via a subscription pattern, adding a debounce threshold (e.g. 500ms) to update `window.location.hash`.
4. Modify the initial store hydration logic in the root application to check for and parse the URL hash before rendering.

## Verification Steps

- [ ] Verify that navigating to deep bounds, updating the color palette, and changing exponents successfully updates the base64 URL.
- [ ] Copy a generated URL, open it in a new tab, and verify that the exact visual and mathematical state is restored flawlessly.
- [ ] Ensure that active mouse-panning does not cause UI stutter due to URL history updates (validate debounce behavior).
- [ ] **Documentation Sync:** Update `docs/design/frontend.md` if the URL sync methodology impacts state boundaries.
