import * as snapshot from "../engine/snapshot.js";
import "./effects.css";

export interface Shot {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
  thumb: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Rect of el relative to the layer element (both in CSS px).
export function rectIn(layer: Element, el: Element): Rect {
  const s = layer.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
}

// Flies a picture of the piece into the bag icon. A garment folds like a
// shop-folded tee (sleeves in, then the bottom up) on the way; accessories
// just arc in. Resolves when it lands; sparks fly from the bag.
export async function flyToBag(layer: HTMLElement, shot: Shot, bag: Rect, fold: boolean): Promise<void> {
  const ghost = fold ? folded(shot) : shot.canvas;
  ghost.classList.add("ghost");
  Object.assign(ghost.style, { left: `${shot.x}px`, top: `${shot.y}px`, width: `${shot.w}px`, height: `${shot.h}px` });
  layer.append(ghost);
  // The folded stack is the top of the middle third; that point flies to the bag.
  const oy = fold ? 0.25 : 0.5;
  const tx = bag.x + bag.w / 2 - (shot.x + shot.w / 2), ty = bag.y + bag.h / 2 - (shot.y + shot.h * oy);
  ghost.style.transformOrigin = `50% ${oy * 100}%`;
  await ghost.animate([
    { transform: "none", easing: "cubic-bezier(0.3, 0, 0.3, 1)" },
    { transform: `translate(${tx * 0.32}px, ${ty * 0.3 - 46}px) scale(0.6) rotate(-6deg)`, opacity: 1, offset: 0.5, easing: "cubic-bezier(0.5, 0, 0.75, 0.4)" },
    { opacity: 1, offset: 0.9 },
    { transform: `translate(${tx}px, ${ty}px) scale(0.07) rotate(10deg)`, opacity: 0 },
  ], { duration: 900, fill: "forwards" }).finished;
  ghost.remove();
  sparks(layer, bag.x + bag.w / 2, bag.y + bag.h / 2);
}

// Six panels (two rows of thirds) that fold on hinges: the side thirds swing
// over the middle, then the bottom row flips up onto the top.
function folded(shot: Shot): HTMLElement {
  const el = document.createElement("div"), pw = shot.canvas.width / 3, ph = shot.canvas.height / 2;
  el.className = "fold";
  const rows = [0, 1].map((row) => {
    const half = document.createElement("div");
    half.className = `half ${row ? "bot" : "top"}`;
    for (let col = 0; col < 3; col++) half.append(snapshot.copy(shot.canvas, col * pw, row * ph, pw, ph));
    el.append(half);
    return half;
  });
  const ease = "cubic-bezier(0.55, 0, 0.25, 1)";
  const shade = (t: string): Keyframe[] => [
    { transform: "none", filter: "brightness(1)" },
    { filter: "brightness(0.72)", offset: 0.55 },
    { transform: t, filter: "brightness(0.9)" },
  ];
  for (const half of rows) {
    half.children[0].animate(shade("translateZ(1px) rotateY(176deg)"), { duration: 200, easing: ease, fill: "forwards" });
    half.children[2].animate(shade("translateZ(2px) rotateY(-176deg)"), { duration: 200, delay: 40, easing: ease, fill: "forwards" });
  }
  rows[1].animate([{ transform: "none" }, { transform: "translateZ(4px) rotateX(176deg)" }], { duration: 220, delay: 220, easing: ease, fill: "forwards" });
  return el;
}

function sparks(layer: HTMLElement, x: number, y: number) {
  for (let i = 0; i < 9; i++) {
    const d = document.createElement("span"), a = (i / 9) * Math.PI * 2 + Math.random() * 0.4, len = 22 + Math.random() * 14;
    d.className = "spark";
    Object.assign(d.style, { left: `${x}px`, top: `${y}px`, background: i % 2 ? "#f9a03f" : "#fb6548" });
    layer.append(d);
    d.animate([
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${Math.cos(a) * len}px, ${Math.sin(a) * len}px) scale(0.2)`, opacity: 0 },
    ], { duration: 520, easing: "cubic-bezier(0.2, 0.8, 0.4, 1)" }).finished.then(() => d.remove());
  }
}

// Ink drop spreading from the tap point inside el.
export function ripple(el: HTMLElement, e: MouseEvent) {
  const r = el.getBoundingClientRect(), d = document.createElement("span");
  d.className = "ripple";
  d.style.left = `${e.clientX - r.left}px`;
  d.style.top = `${e.clientY - r.top}px`;
  el.append(d);
  d.addEventListener("animationend", () => d.remove());
}

// Restarts a CSS animation class on an element.
export function replay(el: Element, cls: string) {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}
