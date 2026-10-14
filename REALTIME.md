# Paper Scene — realtime 3D

The default website renders the full V4 scene in WebGL2: the opening, six curved printed sheets, and the computer. Camera motion follows the authored Blender route. The paper geometry, light scattering, ground reflection and perspective are rendered in the browser; the journey uses no video frames.

Surface and volume lighting are sampled from the source Cycles scene. The two reading lights retain their authored energy curves. This keeps the approved appearance within a realtime budget. Volumetric shadows and reflections are approximations, and depth of field differs from the original Cycles render.

## Preview and controls

Published site: [Corden Portfolio](https://corden404.github.io/Corden-Portfolio/). Pushes to `main` run configuration and journey checks, build the site, and deploy `dist/` through GitHub Actions. Vite's `/Corden-Portfolio/` base applies to scene assets, rendered fallbacks and page links.

Run `npm ci`, then `npm run dev`. Open the URL printed by Vite.

- The bottom arrows travel through all eight stops. Click the scene to advance.
- The small chapter dots jump directly to a stop and can interrupt an ongoing flight. **End** jumps to the computer; the final dot offers the same shortcut.
- Arrow keys, Space and Enter advance; **Home** returns to the opening.
- The top eye icon switches quality. **CINEMA** uses subject-focused depth of field, a blurred 1024-pixel ground reflection, 40 volume steps and up to 1.25 device pixel ratio, targeting 60 fps. Focus follows the authored camera frames smoothly between the canopy, printed sheets and monitor.
- **LITE** uses 20 volume steps and up to 1 device pixel ratio, targeting 30 fps, with depth of field and planar reflections disabled. Narrow screens start in LITE. Both quality modes share the dark floor and a soft, narrow warm reflection from the monitor.
- Reduced motion switches directly between stops. Rendering pauses in hidden tabs and while viewing the HTML collection.
- Stationary views reuse the existing full-resolution HDR frame after anti-aliasing. Film grain keeps animating; pointer movement, camera travel, quality changes and resizing refresh the complete scene, including reflections and volume lighting. This saves idle GPU work without reducing geometry, texture, lighting or reflection quality.
- **作品集 / 查看作品集** opens the accessible project catalogue, including while the scene is still loading. Load failures retain the collection, retry and original-render fallback actions. **The scene** returns to the final featured sheet, loading the scene if needed.

Use `?chapter=paper-c` to open any chapter directly. Add `&view=scene` to hide the scene interface. Open `?view=collection` for the HTML catalogue without starting the 3D asset downloads. The original rendered version remains at `?render=video`; it also provides a fallback for devices without WebGL2.

Loading shows a quiet progress indicator; resource counts remain available to screen readers. Each attempt has a 25-second deadline. A failed attempt offers **Retry 3D**, **View collection**, and **Open original**. Retry refreshes failed or inconsistent resource caches; ordinary visits between the ready scene and the collection reuse the loaded scene.

## Responsive framing

Paper titles and project descriptions are printed directly on the six 3D sheets, with a hidden text equivalent for screen readers. Compact navigation leaves the scene unobstructed on desktop and mobile. The native authored aspect ratios keep their original projection, while intermediate viewports adjust the projection to contain the subject. The camera positions, orientation and travel route remain authored in Blender.

The regression suite projects the delivered paper geometry into representative portrait, short landscape, tablet and desktop viewports, and also checks loading cancellation, retry cache invalidation and instant navigation:

```powershell
node tools/realtime_journey_test.mjs
```

## Paper and screen content

The six featured papers use `editablePrint: true` in `src/config/portfolio.ts`. Edit the title, category, `works`, `achievements`, subtitle, keywords and optional website there. The browser prints the Chinese/English content onto each sheet with automatic wrapping, preserving its geometry and baked illumination. Surrounding sheets retain the V4 artwork. The HTML project catalogue uses the same content.

Featured sheets use warm cotton, dark printed text and subtle fiber shading while retaining their sampled surface lighting and curved geometry. Lettering emission is kept very low to preserve the printed appearance. Each work's `url` is printed below its description. Click that line on the 3D sheet to open the destination in a new tab. Dual-project sheets have separate links, and the last paper also links to the live application. Link clicks stay on the current chapter. Keyboard users can Tab to the same links; the otherwise hidden link list becomes visible on focus. Project details in the HTML collection include these destinations too.

The Starnet link uses the public source repository. Kaggle links to the public competition page. WebCodex links to the author's merged upstream pull requests.

The physical monitor uses `portfolio.monitorImage`. It currently displays a local capture of [Corden404's GitHub profile](https://github.com/Corden404). The capture is a texture, so it works without contacting GitHub while the scene loads. Clicking the monitor or **Open GitHub** opens the live profile. Changes on GitHub are visible through that link; refreshing the physical display requires replacing the local capture.

Changing printed text or a screen image does not require remodeling or rerendering a camera journey. Changing sheet shape, position or the room's main light rig requires reexporting the relevant geometry and lighting.

## Rebuild the delivery assets

The exporter and baking tools read `V4 — Reference Match/paper_portfolio_reference_match_v4.blend` without saving it. Blender with Cycles CUDA is required to rebuild lighting; visitors need only a WebGL2 browser.

```powershell
& 'G:\Blender\blender.exe' --background 'V4 — Reference Match\paper_portfolio_reference_match_v4.blend' --python-exit-code 1 --python tools/export_realtime_preview.py -- --geometry-only
& 'G:\Blender\blender.exe' --background 'V4 — Reference Match\paper_portfolio_reference_match_v4.blend' --python-exit-code 1 --python tools/bake_realtime_lighting.py -- --samples 64
& 'G:\Blender\blender.exe' --background 'V4 — Reference Match\paper_portfolio_reference_match_v4.blend' --python-exit-code 1 --python tools/bake_realtime_heroes.py -- --samples 128
& 'G:\Blender\blender.exe' --background 'V4 — Reference Match\paper_portfolio_reference_match_v4.blend' --python-exit-code 1 --python tools/bake_realtime_volume.py -- --samples 48
npm run verify:realtime
npm run test:config
npm run build
```

Scene assets live in `public/assets/realtime`. Screen captures used by the display are delivery assets; local comparison images, benchmarks and scratch scripts remain in ignored `.work/` folders.

Source shadowing is included in the baked surface and volume fields. The browser omits an unused realtime shadow map and its depth materials. Paper detail selection uses squared distances to avoid temporary arrays and square roots, with the same detail level for every sheet.
