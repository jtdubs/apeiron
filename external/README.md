# Deep-Zoom Fractal Renderers Reference (External)

This directory contains clones of various high-performance, deep-zoom fractal renderers that utilize modern acceleration math like Perturbation Theory, Series Approximation (SA), and Bivariate Linear Approximation (BLA). These tools serve as architectural references and inspiration for Apeiron's rendering engine.

---

## [fraktaler-2](./fraktaler-2/)
* **Origin/Author:** Originally by Karl Runmo (2012), famously forked and maintained as **Kalles Fraktaler 2+** by Claude Heiland-Allen.
* **Tech Stack:** C++, GMP (GNU Multiple Precision).
* **Core Math:** Implements K.I. Martin's Perturbation and Series Approximation techniques, heavily relying on highly optimized arbitrary-precision CPU logic paired with hardware float rendering.
* **Relevance:** The gold standard application that established the foundation of deep zooming in the modern community. Analyzed for its robust implementation of glitch correction and reference calculation.

## [fraktaler-3](./fraktaler-3/)
* **Origin/Author:** Claude Heiland-Allen (Reference 3 in the BLA whitepaper).
* **Tech Stack:** C/C++, SDL2, OpenGL/OpenGLES, Dear ImGui.
* **Core Math:** Implements **Zhuoran's Bivariate Linear Approximation (BLA)** fully, extending past basic Perturbation math. Designed for hybrid escape-time 2D fractals.
* **Relevance:** The most direct, modern reference for a fully-featured C++ implementation of BLA. It compiles cross-platform and heavily informs the optimization of deep-zoom rendering architectures.

## [Fractalshades](./Fractalshades/)
* **Origin/Author:** G. Billotey.
* **Tech Stack:** Python, Numba (for JIT compilation / CPU and generic GPU acceleration).
* **Core Math:** Fully supports arbitrary-precision math, perturbation theory, series approximation, and has notably integrated BLA into a Python ecosystem. 
* **Relevance:** An excellent reference to study how BLA algorithms can be decoupled and orchestrated in a high-level language before dispatching to lower-level JIT execution logic.

## [mightymandel](./mightymandel/)
* **Origin/Author:** Claude Heiland-Allen.
* **Tech Stack:** C/C++, OpenGL.
* **Core Math:** Specifically noted for being a GPU-accelerated Mandelbrot explorer using Double-Single (DS) and Perturbation techniques.
* **Relevance:** Serves as a strong architectural reference for mapping perturbation math to GPU hardware contexts (shaders), dealing with precision limitations, split precision formats like Double-Single, and managing the CPU-GPU communication pipeline for reference orbits.

## [Imagina](./Imagina/)
* **Origin/Author:** Claude Heiland-Allen.
* **Relevance:** Highly recognized in the fractal forum space for adopting state-of-the-art acceleration techniques, representing another critical implementation of the algorithms formulated by Zhuoran and others.

## Modern Web/JS Implementations (SuperFractalThing Derivatives)

These projects offer a direct look at the trade-offs of using JavaScript/WebGL boundaries compared to Apeiron's architecture of WebGPU mixed with Rust/WASM.

### [deep-fractal](./deep-fractal/)
* **Origin/Author:** JMaio
* **Tech Stack:** JavaScript, WebGL
* **Core Math:** Leverages WebGL and JavaScript arbitrary precision math based on K.I. Martin's Perturbation theory.
* **Relevance:** Explores web-based perturbation logic.

### [deep-mandelbrot](./deep-mandelbrot/)
* **Origin/Author:** munrocket
* **Tech Stack:** JavaScript, WebGL
* **Core Math:** Another web-based implementation that leverages K.I. Martin's SuperFractalThing Maths to perform hardware-accelerated rendering in the browser context.
* **Relevance:** Additional reference for managing high-precision maths within browser constraints.

---

### Key Takeaways for Follow-up Work
As Apeiron evolves, **fraktaler-3** and **Fractalshades** will be critical targets for architectural study, particularly regarding how they manage reference rebasing, orbit caching, and BLA grid generation natively, and how those abstractions correlate to Apeiron's WebGPU (`f32p`) and WASM math boundaries.
