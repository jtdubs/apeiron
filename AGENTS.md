# Apeiron Agent Directives

You are working on **Apeiron**, a web-based fractal explorer prioritizing high-performance GPU
mathematics, headless determinism, and deep zoom capabilities.

## 1. Primary Mandate

Before making architectural decisions, modifying the core rendering loop, adding new UI components,
or altering the execution context, you **MUST** review the master index:

- `docs/README.md`: The central hub containing links to all technical requirements, architectural
  boundaries, core math designs, and product use-cases. **You MUST consult this index and read the
  relevant deep-dive documents before proceeding.**
- `docs/best-practices.md`: The primary coding standards guide. It contains strict rules on data boundaries, FSM execution, shader modularization, and headless WGSL unit testing. You must adhere to these practices in all implementations.

If you are modifying the mathematical algorithms, rendering pathways, or debugging deep-zoom
glitches, you are explicitly required to review the `docs/math-backend-design.md`, `docs/rendering-engine-design.md`, and
`docs/test-plan.md` documents.

## 2. Technical Boundaries (CRITICAL)

- **Zero React DOM in Hot Paths**: Completely avoid using React state (`useState` or `useEffect`
  dependency arrays) to manage per-frame render logic or WebGPU synchronization. Rely strictly on
  `useRef` and standalone rendering loops like `requestAnimationFrame`. React is for UI control
  panels only; the core canvas and rendering engine must run independently of the React component
  lifecycle.
- **Strict Execution Domains**: Mathematical calculations for fractal structures are **strictly limited to Rust (WASM) and the GPU**. JavaScript/TypeScript must never calculate orbits or perturbation logic. JS is purely the orchestration layer for routing inputs, handling state, and managing WebWorker bounds.
- **Precision Limits**: Be constantly aware of `f32` precision limits in WebGPU shaders. When
  zooming beyond `~10^5`, we must pivot to perturbation theory or `f64` emulation.
- **Data-First Testing**: Any new pipeline feature must be verifiable without rendering a visual pixel. Core math in WebGPU and Rust must be tested by comparing raw output buffers (Compute Shaders or ArrayBuffers) deterministically, rather than relying solely on image perceptual diffing.
- **Single Source of Truth (SSOT)**: Hardcoded magic numbers for buffer offsets/sizes are strictly forbidden. All layout constants must securely cross from the TS schema into Rust and WGSL automatically.
- **Shader Modularization**: Monolithic WGSL entry points are disallowed. Extract complex math and looping logic into standalone, testable WGSL `fn` components.
- **State Machine UI Separation**: Decouple explicit intent (`MathContext`) from imperative logic (`ExecutionCommand`) using headless Finite State Machines. DO NOT put logic inside the UI loop.

## 3. Operations

- **Commits**: Follow Conventional Commits (`feat:`, `fix:`, `docs:`, `build:`). Provide technical
  specifics, particularly for shader or math adjustments. When making minor corrections to a recent change (like fixing typos or quick renames), you MUST use `git commit --amend --no-edit` rather than creating a new polluting commit.
- **Integrity**: Verify file states with `git status` / `git diff` before issuing destructive
  commands or commits.
- **Documentation**: If architectural paradigms are changed, immediately update the relevant docs.
- **NPM Orchestration**: `npm` is our singular orchestrator for the entire workspace. All workflows across the frontend, headless Deno/Node tests, and Rust/WASM compilations MUST be safely abstracted behind simple `npm run <script>` commands within the root `package.json`. Node and NPM are natively available via `nvm`.
- **Agent Environment (CRITICAL)**: Because CLI commands run in a non-interactive shell that bypasses standard dotfiles, you **MUST** prefix all terminal commands that require Node, Deno, or Cargo with `source ~/.agentrc &&`. Example: `source ~/.agentrc && npm run test`.

## 4. Task Lifecycle Protocol

For complex features, adhere to a strict progression: **Proposal -> Design -> Task Definition -> Verification Setup -> Implementation -> Synthesis & Completion**.

- **Proposal**: If the goal is not definitively clear, outline a brief proposal for the feature. If the goal is clear, this step can be skipped.
- **Design Docs**: Refer to existing architectural documents or write/amend a design document in `docs/`. Never implement complex systems without a formalized design.
- **Task Definition**: Create a new task markdown file in `docs/tasks/` matching `docs/tasks/template.md`. Include clearly defined Objectives, Links to Design Docs, Requirements, and an Implementation Plan.
- **Verification Setup (TDD)**: Before writing application logic, establish quantifiable tests, headless verification scripts, or visual check hooks. Provide the agent with an objective compiler/tester loop.
- **Implementation**: Write the core functionality, iterating against the Verification Setup to ensure deterministic success.
- **Synthesis & Completion**: When implementation is verified, extract any newly discovered architectural constraints or learnings, and update the central `docs/` index or relevant architecture guides. Then:
  1. Change `status: open` to `status: closed` in `docs/tasks/*.md`.
  2. Mark `[x]` in `docs/roadmap.md`.
  3. Move the completed task file to `docs/tasks/completed/`.
  4. Create a task-scoped `git commit` incorporating all pertinent files.

## 5. Debugging Protocol

When resolving rendering glitches, logic flaws, or any application bugs, you MUST adhere to the following Test-Driven Bug Resolution process:

1. **Document:** Ensure the bug is clearly documented in a task file within `docs/tasks/`.
2. **Research:** Analyze the technical design docs and current implementation to determine likely mathematical, architectural, or state-driven causes of the bug.
3. **Reproduce via Test:** Add a test case that definitively detects and fails due to the bug. **CRITICAL:** Do not modify the application code during this step. The test must be isolated from the system's runtime behavior to ensure it accurately reproduces the flaw in the current implementation.
4. **Fix and Validate:** Only after a failing test case is committed, attempt to fix the application code. Use the newly created test case to verify that the fix resolves the issue deterministically.

## 6. Behavioral Directives

- **Deliberate Pacing Over Rushing**: Do not rush into code implementation, especially for complex features. Stop and think. Proceed through the Proposal -> Design -> Task Definition -> Verification Setup -> Implementation -> Synthesis workflow. Avoid digging into architectural holes by ensuring a sound design and test criteria exist before writing code.
- **Critical Analysis Over Flattery**: Avoid deferential flattery or immediately agreeing with user suggestions. Instead, default to objective, rigorous engineering scrutiny. Evaluate all proposed ideas, architectures, and implementations strictly against performance requirements, established best practices, and the technical boundaries defined in the documentation.
- **Provide Alternatives**: If a user proposal has flaws, edge cases, or negative performance implications, proactively highlight them and suggest architecturally sound alternatives rather than blindly agreeing to implement it.
