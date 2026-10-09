import type { Ref } from "preact";
import { useEffect, useState } from "preact/hooks";
import * as store from "../app/store";
import { PER_RAIL } from "../engine/wardrobe.js";
import { rupees } from "../lib/format";
import "./RailSection.css";

type Recipe = store.Category["rails"][number] & { height?: number };

// Name and price of the rail's focused piece; cross-fades when focus moves.
function Caption({ product, onOpen }: { product: store.Product | null; onOpen: () => void }) {
  const [shown, setShown] = useState(product), [out, setOut] = useState(false);
  useEffect(() => {
    if (product === shown) return;
    setOut(true);
    const t = setTimeout(() => {
      setShown(product);
      setOut(false);
    }, 140);
    return () => clearTimeout(t);
  }, [product]);
  return (
    <p class={out ? "caption out" : "caption"} onClick={onOpen}>
      {shown && <><b>{shown.name}</b><span>{rupees(shown.price)}</span></>}
    </p>
  );
}

// One rail: its heading, the strip the engine draws into, and its caption.
export function RailSection({ recipe, index, viewRef }: { recipe: Recipe; index: number; viewRef: Ref<HTMLDivElement> }) {
  return (
    <section class="rail">
      <h3>{recipe.label} <span>· {PER_RAIL} styles</span></h3>
      <div ref={viewRef} class="view" style={recipe.height ? { height: `${recipe.height}px` } : undefined} />
      <Caption product={store.captions.value[index] ?? null} onOpen={() => store.engine.current?.open(index)} />
    </section>
  );
}
