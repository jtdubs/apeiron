# Apeiron Development Guide

## 1. Local Development

To start working on Apeiron locally, utilize our unified orchestration scripts.

- **Installation:** `npm install`
- **Development Server:** `npm run dev` launches the primary Vite server for the frontend application.

## 2. NPM Orchestration (Singular Orchestrator)

As we build out complex, disjointed architecture layers (Rust `math-core`, Headless WebGPU testing arrays, and the React UI frontend), we explicitly require **NPM to be the single source of truth for orchestration**.

We will not rely on disparate bash execution or executing cargo scripts manually in sub-directories.

- All Rust/WASM builds must be abstracted into an `npm run build:deps` or equivalent script via toolchains like `wasm-pack`.
- All Node/Deno headless tests must be abstracted into `npm run test` or `npm run test:headless`.
- The `package.json` file is the master index of our operational capability.

_(Detailed architecture-specific development guides (e.g. testing structures, rust commands) are TBD and will be fleshed out as the foundation is established in Phase 1)._

## 3. Automated Enforcement (Husky)

To programmatically enforce the architectural boundaries (such as the "Zero React DOM in Hot Paths" rule) without relying entirely on manual agent review, Apeiron relies heavily on **Husky Git hooks**.

- **Pre-Commit Linting:** We port the aggressive ESLint and formatting bounds from the legacy `frac/` project. Commits that violate core boundary rules (e.g. importing `useState` into a WebGPU engine file) will instantly fail the hook.
- **Workflow:** Agents and developers MUST NOT bypass these hooks (e.g. using `git commit --no-verify`). If Husky rejects a commit, the architectural code—not the hook—must be rewritten.

## 4. Release Protocol

Releases are fully automated via GitHub Actions, but they require a specific Git tagging structure to trigger the Continuous Delivery pipeline.

To cut a new release:

1. Ensure all tests and hooks are passing and the workspace is clean.
2. Update the `version` field in `package.json` to the next logical version (e.g., `0.0.5`).
3. Create a chore commit: `git commit -am "chore: release version 0.0.5"`
4. Tag the commit exactly matching the version: `git tag v0.0.5`
5. Push the commit and the tags: `git push && git push --tags`
6. Monitor the GitHub Actions console to ensure the release artifact builds and deploys correctly.
