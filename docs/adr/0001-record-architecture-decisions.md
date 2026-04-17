# 1. Record Architecture Decisions

Date: 2026-04-17

## Status

Accepted

## Context

As Apeiron evolves, our architecture documentation runs the risk of drifting from the reality of the implementation. Historically, design documents (like `math-backend-design.md`) were overwritten directly as architectural pivots occurred, causing us to lose the context of _why_ choices were made.

For AI coding agents and human developers alike, understanding the constraints and historical rationale behind a system is just as important as understanding its current execution path. We need a mechanism to securely append historical knowledge without cluttering the active design specs.

## Decision

We will use Architecture Decision Records (ADRs) to capture major architectural shifts, API boundary definitions, and dependency approvals.

We will follow a subset of the Michael Nygard ADR template. Each record will contain:

- **Title**: A clear, sequential title (e.g., `0001-record-architecture-decisions`).
- **Status**: Proposed, Accepted, Rejected, or Deprecated.
- **Context**: The forces at play, technological constraints, and the problem being solved.
- **Decision**: The specific architectural choice we are committing to.
- **Consequences**: The positive and negative ramifications of the decision, and how it impacts the `docs/design/` specs.

ADRs are **immutable**. If a decision is overturned later, we do not edit the content of the old ADR, we simply mark it as "Deprecated" and write a new ADR.

## Consequences

- We now have an append-only historical log of critical architectural choices.
- `docs/design/` continues to represent the "current reality" but will lean on ADRs to explain the history.
- AI agents reading the repository constraints will have clear timelines of technological shifts, actively reducing hallucination around deprecated patterns.
