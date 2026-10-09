import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import * as effects from "../effects";
import * as router from "../app/router";
import * as store from "../app/store";
import * as paint from "../catalog/paint.js";
import * as variants from "../catalog/variants.js";
import "./CategoryTiles.css";

// Flat lipstick for the Accessories tile.
function lipstickIcon() {
  const c = document.createElement("canvas"), g = c.getContext("2d")!;
  c.width = 120; c.height = 160;
  g.fillStyle = "#a3172c";
  g.beginPath(); g.moveTo(44, 70); g.lineTo(44, 34); g.lineTo(76, 18); g.lineTo(76, 70); g.fill();
  const metal = g.createLinearGradient(36, 0, 84, 0);
  metal.addColorStop(0, "#a8844a"); metal.addColorStop(0.45, "#ecd29a"); metal.addColorStop(1, "#a8844a");
  g.fillStyle = metal;
  g.fillRect(38, 68, 44, 18);
  g.fillStyle = "#1a1a1d";
  g.beginPath(); g.roundRect(34, 86, 52, 66, 4); g.fill();
  return c;
}

// A tile's picture: the category's first garment, painted flat.
function art(cat: store.Category): HTMLCanvasElement {
  const p = variants.products(cat.rails[cat.key === "women" ? 1 : 0], 1)[0];
  return p.kind ? lipstickIcon() : paint.garment(p).front;
}

function Tile({ cat, on }: { cat: store.Category; on: boolean }) {
  const ref = useRef<HTMLButtonElement>(null), pic = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => pic.current!.replaceChildren(art(cat)), [cat]);
  return (
    <button
      ref={ref}
      class={on ? "cat on" : "cat"}
      data-key={cat.key}
      onClick={(e) => {
        effects.ripple(ref.current!, e);
        router.go(cat.key);
      }}
    >
      <span ref={pic} class="art" />
      {cat.label}
    </button>
  );
}

export function CategoryTiles() {
  const current = store.category.value, tick = store.homeTick.value;
  const nav = useRef<HTMLElement>(null);

  // Centre the chosen tile; scrollIntoView would also shift the clipped screen.
  useEffect(() => {
    const el = nav.current!, b = el.querySelector<HTMLElement>(".cat.on");
    if (b) el.scrollTo({ left: b.offsetLeft - (el.clientWidth - b.offsetWidth) / 2, behavior: "smooth" });
  }, [current, tick]);

  return (
    <nav ref={nav} class="cats">
      {variants.CATEGORIES.map((c) => <Tile key={c.key} cat={c} on={c === current} />)}
    </nav>
  );
}
