# Wardrobe page performance

Measured in desktop Chrome (hidden tab, frames driven by hand, `readPixels` to
sync the GPU), 4 rails × 12 items, pixel ratio 2. Phones are ~4–8× slower.

| # | Bottleneck | Cost | Fix |
|---|---|---|---|
| 1 | Category switch stocks a whole rail per frame: painting 12 garments (lazy canvas raster, forced by `getImageData` for the alpha mask) + cloth setup | ~70 ms long task per garment rail | Build items under a per-frame time budget, add the finished rail in one go |
| 2 | Accessory products rebuild identical lathe/box/tube geometry for every item | ~110 ms long task per table rail (9 ms/item) | Memoise geometry per kind/style |
| 3 | First draw of a freshly stocked rail uploads 24 × 512×~700 textures + mipmaps in one frame | ~35 ms spike per rail | Upload each garment's maps with `renderer.initTexture` inside the budgeted build |
| 4 | Every redraw re-renders each rail's shadow map, even when only the viewport moved (scroll) | ~45% of draw calls on scroll frames (245 draws / 2 rails) | `shadowMap.autoUpdate = false`; refresh only when the rail's contents changed |
| 5 | Per-frame `getBoundingClientRect` for the scroller and every rail | <0.05 ms (layout already clean) | Not worth changing |
| 6 | `.bar` `backdrop-filter: blur(8px)` over the WebGL canvas | GPU re-blur whenever canvas under it changes | Skipped: would alter the look (8% of blurred content shows through) |

## Results (same harness)

- Category switch, worst frame: men 97 → 22 ms, kids 75 → 25 ms, women 82 → 21 ms (now ~22 frames of ≤15 ms work instead of 4 frames of 60–90 ms).
- Accessories rail rebuild: 110 ms → 2–3 ms per rail once geometry is cached (first visit still pays it once per style).
- Scroll redraw: 3.1 → 1.6 ms/frame median; shadow passes gone from scroll frames.
- Also seen, not changed: the Creams rail's frosted glass (`transmission`) adds a full transmission pass, 0.8 → 2.1 ms per draw. Lowering `transmissionResolutionScale` would soften the glass.

Already good: off-screen rails neither simulate nor draw, settled cloth sleeps
(rigid carry, no per-vertex work), pixel ratio capped at 2, shadow maps 1024²,
idle rack frames draw nothing.
