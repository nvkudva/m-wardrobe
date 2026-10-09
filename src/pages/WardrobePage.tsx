import { useLayoutEffect, useRef } from "preact/hooks";
import * as store from "../app/store";
import { CategoryTiles } from "../components/CategoryTiles";
import { ProductDetail } from "../components/ProductDetail";
import { RailSection } from "../components/RailSection";
import { Wardrobe } from "../engine/wardrobe.js";
import "./WardrobePage.css";

// Category tiles over a stack of rails, one per sub-category. The engine
// draws every rail into its strip of the canvas; tapping the focused piece
// opens it full-screen with ProductDetail on top.
export function WardrobePage() {
  const cat = store.category.value;
  const scroller = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const views = useRef<HTMLDivElement[]>([]);

  // Runs before the category effect below (same phase, declaration order).
  useLayoutEffect(() => {
    const screen = scroller.current!.closest<HTMLElement>("#screen")!;
    const w = new Wardrobe({
      canvas: canvas.current!,
      screen,
      scroller: scroller.current!,
      events: {
        focus: (i: number, p: store.Product) => {
          const next = [...store.captions.value];
          next[i] = p;
          store.captions.value = next;
        },
        detail: (d: store.Detail | null) => (store.detail.value = d),
      },
    });
    store.engine.current = w;
    return () => {
      w.dispose();
      store.engine.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    store.captions.value = cat.rails.map(() => null);
    store.engine.current!.show(cat, views.current.slice(0, cat.rails.length));
  }, [cat]);

  return (
    <>
      <div ref={scroller} id="scroll">
        <CategoryTiles />
        <div class="rails" data-fixture={cat.fixture ?? "bar"}>
          {cat.rails.map((r, i) => (
            <RailSection key={i} recipe={r} index={i} viewRef={(el) => { if (el) views.current[i] = el; }} />
          ))}
        </div>
      </div>
      <div class="backdrop" />
      <canvas ref={canvas} id="gl" />
      <ProductDetail layer={() => scroller.current?.closest<HTMLElement>("#screen") ?? null} />
    </>
  );
}
