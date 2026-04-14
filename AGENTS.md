# Apeiron Agent Directives

You are working on **Apeiron**, a web-based fractal explorer prioritizing high-performance GPU
mathematics, headless determinism, and deep zoom capabilities.

## 1. Primary Mandate

Before making architectural decisions, modifying the core rendering loop, adding new UI components,
or altering the execution context, you **MUST** review the master index:

- `docs/README.md`: The central hub containing links to all technical requirements, architectural
  boundaries, core math designs, and product use-cases. **You MUST consult this index and read the
  relevant deep-dive documents before proceeding.**

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

## 3. Operations

- **Commits**: Follow Conventional Commits (`feat:`, `fix:`, `docs:`, `build:`). Provide technical
  specifics, particularly for shader or math adjustments. When making minor corrections to a recent change (like fixing typos or quick renames), you MUST use `git commit --amend --no-edit` rather than creating a new polluting commit.
- **Integrity**: Verify file states with `git status` / `git diff` before issuing destructive
  commands or commits.
- **Documentation**: If architectural paradigms are changed, immediately update the relevant docs.
- **NPM Orchestration**: `npm` is our singular orchestrator for the entire workspace. All workflows across the frontend, headless Deno/Node tests, and Rust/WASM compilations MUST be safely abstracted behind simple `npm run <script>` commands within the root `package.json`. Node and NPM are natively available via `nvm`.

## 4. Task Lifecycle Protocol

- **Creation**: When a new feature or task is defined, you MUST create a new task markdown file in `docs/tasks/` matching the format of `docs/tasks/template.md`. The task must include clearly defined Objectives, Links to Design Docs, Requirements, an Implementation Plan, and Verification Steps.
- **Execution**: To find the next available task, consult the active Phase in `docs/roadmap.md`. When beginning a task defined in `docs/tasks/`, always comprehensively review the `.md` file for acceptance criteria and related architectural documentation.
- **Completion**: When a task's implementation is finalized and verified, you MUST do four things:
  1. Change `status: open` to `status: closed` in the YAML frontmatter of the specific
     `docs/tasks/*.md` file.
  2. Change the empty bracket `[ ]` to a checked bracket `[x]` in the master `docs/roadmap.md` file
     to reflect progress.
  3. Move the completed task file into the `docs/tasks/completed/` directory to maintain a clean
     active workspace while preserving historical context.
  4. Create a task-scoped `git commit` incorporating all file changes pertinent to that specific task, keeping the repository history clean and incremental.

## 5. Debugging Protocol

When resolving rendering glitches, logic flaws, or any application bugs, you MUST adhere to the following Test-Driven Bug Resolution process:

1. **Document:** Ensure the bug is clearly documented in a task file within `docs/tasks/`.
2. **Research:** Analyze the technical design docs and current implementation to determine likely mathematical, architectural, or state-driven causes of the bug.
3. **Reproduce via Test:** Add a test case that definitively detects and fails due to the bug. **CRITICAL:** Do not modify the application code during this step. The test must be isolated from the system's runtime behavior to ensure it accurately reproduces the flaw in the current implementation.
4. **Fix and Validate:** Only after a failing test case is committed, attempt to fix the application code. Use the newly created test case to verify that the fix resolves the issue deterministically.
