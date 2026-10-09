# ai-ecommerce

M Wardrobe — 3D cloth-sim shopping demo (Vite + Preact + Three.js).

- Dev server port: 5173
- Commands: `bun run dev`, `bun run build`, `bun run typecheck`, `bun run deploy` (Cloudflare Worker `m-wardrobe` → https://m-wardrobe.nvkudva.workers.dev)

## Layout

- `src/engine/` — framework-free Three.js: `wardrobe.js` (shared renderer, frame loop, rack ↔ detail, gestures), `rail.js`, `garment.js` + `cloth.js` (XPBD), `product.js` (accessories), `snapshot.js`.
- `src/catalog/` — product recipes and procedural art: `variants.js`, `shapes.js`, `fabric.js`, `paint.js`.
- `src/app/` — `store.ts` (signals), `router.ts` (hash routes `#/<category>`, `#/<page>`), `App.tsx`.
- `src/components/`, `src/pages/` — Preact UI; each has its own CSS. `src/effects/` — DOM animations (fold-and-fly, ripple).
- The engine never touches UI markup: the UI passes it elements and hears back through `events` (`focus`, `detail`).
