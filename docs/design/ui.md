# Apeiron UI/UX Design

The application prioritizes the visual beauty and exploration of fractals through a sleek,
minimalist aesthetic. The interface should feel more like an unobstructed viewport than a
traditional application dashboard.

## 1. Visual Hierarchy

- **Full-Window Canvas:** The high-performance WebGPU canvas is the centerpiece, taking up 100% of
  the browser window (`100vw`, `100vh`).
- **Minimal Form Factor:** The surrounding UI elements must be compact and utilize subtle dark
  themes or translucency (glassmorphism) to avoid distracting from the mathematical visuals beneath.

## 2. Navigation & Interaction (Canvas)

Exploration must feel tactile, immediate, and firmly rooted in mouse/trackpad events:

- **Pan:** Click-and-drag anywhere on the canvas to laterally move the camera view seamlessly.
- **Zoom:** Use the mouse wheel or trackpad scroll to perform deep zoom operations. The zoom should
  dynamically center on the cursor's physical location, allowing the user to precisely target
  interesting regions.
- **Reset:** A floating, easily accessible "Home" or "Reset View" button to instantly snap the
  camera back to its default unzoomed rendering state.

## 3. Control Panel

A slim, horizontal floating Heads-Up Display (HUD) anchored to the top center of the window will
house the controls, preventing obstruction of the central action.

### Initial Essential Controls

1. **4D View Plane Crossfader:**
   - A clean visual crossfader horizontally blending the screen's mapping between the Mandelbrot
     (C-Plane) and Julia (Z-Plane) perspectives without exposing raw trigonometry.
2. **Coordinate Readouts (Rectangular / Polar):**
   - Consolidated panel for exploring 4D anchors/lock points.
   - A toggleable system allowing viewing of coordinates in standard Rectangular ($x + yi$) form or
     fluid Polar ($r, \theta$) vectors based on numerical preference.
3. **Exponent Operator ($n$):**
   - An input for the exponent $n$, potentially letting users morph between $z^2$, $z^3$, etc.
4. **Theming:**
   - A dropdown or palette selector for configurable color spectrums, exposing several highly
     attractive curated presets.
5. **Color Rendering Modes:**
   - A dropdown to alternate between Smooth (continuous gradients), Banded (stepped color bands),
     Histogram (pixel density coloring), and Stripe Average (Triangle Inequality Average) rendering
     strategies.
6. **Interior Shading:**
   - A dropdown controlling the coloring of bounded components (Black, Grayscale Periodicity, Themed
     Distance, or Stripe Average) driven by the distance estimation cycle multiplier.

## 4. Responsive Design & Mobile

- **Grid/Flexbox First:** UI components should preferentially leverage `display: grid` or
  `display: flex`. Avoid relying excessively on the `order` property or arbitrary React conditional
  renders for fundamental layout shifts.
- **Fluid Layouts:** Utilize modern CSS techniques like `clamp()`, `min()`, and `max()` to allow
  scaling cleanly down to restricted mobile viewports rather than brittle, rigid media queries.
- **Standardized State Reconciliation:** For mobile expanding menus, toggles, or slider components, utilize standard React state and `Zustand` selector subscriptions. By scoping the reactive subscriptions to the smallest possible leaf component, we leverage React's reconciliation safely for the UI layer without injecting overhead into the core WebGPU rendering cycle.
