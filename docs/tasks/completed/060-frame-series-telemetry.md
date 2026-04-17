---
status: closed
---

# Task 060: Frame-Series Telemetry Refactoring

## Description

Migrate the asynchronous, event-stream telemetry model to a deeply coupled Lockstep Frame-Series architecture using statically allocated Typed Arrays.

## Steps

1. Create `telemetry-frame-series-proposal.md` establishing the architectural path forward.
2. Update `docs/design/telemetry.md` with lockstep behavior.
3. Decouple Map lookups from hot execution paths using `Float64Array` closures and `Uint8Array` masks.
4. Replace pushing closures with globally synced `reg.beginFrame()` and `reg.commitFrame()`.
5. Eliminate the `setInterval` tracing loops inside `.activeJobId` worker events.
6. Verify unit tests maintain bit-perfect telemetry outputs.
