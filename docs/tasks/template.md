---
status: open
---

# Task [ID]: [Task Name]

## Objective

[A 1-2 sentence description of the primary goal of this task]

## Relevant Design Docs

- [Link out to math-backend-design.md, architecture.md, etc. if applicable]
- [Apeiron Best Practices](../process/best-practices.md) (Standard boundary/testing rules apply)

## Requirements

- **[Requirement 1 Name]:** [Specific technical description and acceptance criteria for requirement 1]
- **[Requirement 2 Name]:** [Specific technical description and acceptance criteria for requirement 2]

## Implementation Plan

1. [If Bug Fix: Write a failing, isolated test case to deterministically reproduce the issue without modifying application code]
2. [Step 1 of how this will be executed technically]
3. [Step 2...]

## Verification Steps

- [ ] [Verification Step 1: Specifically how we test this (preferably data/headless tests)]
- [ ] [Verification Step 2]
- [ ] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/[relevant-design].md` and `docs/product/requirements.md` before closing this task.
