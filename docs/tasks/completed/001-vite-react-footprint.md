---
status: closed
---

# Task 001: Initialize Vite/React project footprint

## Objective

Set up the baseline Vite and React monorepo footprint to serve as the Apeiron structural foundation, enforcing directory boundaries for UI, Core Engineering, and Rust WASM logic.

## Relevant Design Docs

- [Code Layout & Nomenclature](../../process/code-layout.md)
- [Frontend Design](../../design/frontend.md)
- [Development Guide](../../process/development.md)

## Requirements

- **Vite & React Foundation:** Project is initialized with Vite and React (TypeScript) and relies strictly on `npm` for orchestration.
- **Strict Directory Strategy:** Root directory adheres strictly to boundaries defined in `process/code-layout.md` separating `ui`, `engine`, and `math` domains.
- **State Management Boilerplate:** Include `zustand` to prepare for Zero-React-DOM-in-Hot-Paths requirements.
- **Husky & Linting Hookups:** Include baseline linting/prettier setups and pre-commit hooks.

## Implementation Plan

1. Use `npx create-vite` with typescript-react template in the project root.
2. Reorganize directory structure to align with `process/code-layout.md`.
3. Modify `package.json` with baseline orchestration scripts.
4. Set up `tsconfig.json` paths for aliases if needed.

## Verification Steps

- [ ] Project successfully installs via `npm install`.
- [ ] `npm run dev` boots the server without warnings.
- [ ] Directory structure strictly matches the documentation intent.
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/process/code-layout.md` before closing this task.
