import { useEffect, useRef, useState } from "preact/hooks";
import * as effects from "../effects";
import * as store from "../app/store";
import { pad2, rupees } from "../lib/format";
import { bagButton } from "./Header";
import * as icons from "./icons";
import "./ProductDetail.css";

// Text and controls over the detail view; the piece itself is drawn by the
// engine on the canvas underneath.
export function ProductDetail({ layer }: { layer: () => HTMLElement | null }) {
  const d = store.detail.value, p = d?.product;
  const [adding, setAdding] = useState(false);
  const sizes = p?.sizes ?? [];

  // Pick the second size (usually M) whenever the size range changes.
  useEffect(() => {
    if (sizes.length) store.size.value = sizes[Math.min(1, sizes.length - 1)];
  }, [sizes.join()]);

  useEffect(() => {
    if (!d) return;
    const onKey = (e: KeyboardEvent) => {
      const w = store.engine.current;
      if (e.key === "ArrowRight") w?.step(1);
      else if (e.key === "ArrowLeft") w?.step(-1);
      else if (e.key === "Escape") w?.close();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [!!d]);

  // The piece leaves the stage, flies into the bag, then grows back.
  const busy = useRef(false);
  const addToBag = async () => {
    const w = store.engine.current, el = layer(), bag = bagButton.current;
    if (busy.current || !w || !el || !bag) return;
    const piece = w.takePiece();
    if (!piece) return;
    busy.current = true;
    setAdding(true);
    await effects.flyToBag(el, piece.shot, effects.rectIn(el, bag), !piece.product.kind);
    store.addToBag(store.line(piece.product, piece.shot.thumb));
    setTimeout(() => {
      piece.restore();
      setAdding(false);
      busy.current = false;
    }, 300);
  };

  const off = p ? Math.round((1 - p.price / p.mrp) * 100) : 0;
  const w = store.engine.current;
  return (
    <section class="pdp-ui">
      <button class="close" aria-label="Back to wardrobe" onClick={() => w?.close()}><icons.Close /></button>
      <button class="arrow left" aria-label="Previous piece" onClick={() => w?.step(-1)}><icons.Arrow dir="left" /></button>
      <button class="arrow right" aria-label="Next piece" onClick={() => w?.step(1)}><icons.Arrow dir="right" /></button>
      {d && p && (
        <>
          <div class="counter">{pad2(d.index + 1)} / {pad2(d.count)}</div>
          <h1 class="title">{p.name}</h1>
          <div class="price">{rupees(p.price)}<s>{rupees(p.mrp)}</s><em>({off}% OFF)</em></div>
          <p class="desc">{p.desc}</p>
          <div class="sizes">
            {sizes.map((z: string) => (
              <button key={z} class={z === store.size.value ? "on" : ""} onClick={() => (store.size.value = z)}>{z}</button>
            ))}
          </div>
        </>
      )}
      <button class="add" onClick={addToBag}>{adding ? "ADDED ✓" : "ADD TO BAG"}</button>
    </section>
  );
}
