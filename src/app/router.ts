import { signal } from "@preact/signals";
import * as variants from "../catalog/variants.js";
import * as store from "./store";

// Hash routes: #/<category> shows that category's rails; #/<page> slides a
// page (bag, orders, …) over the wardrobe, which keeps its category.

export const PAGES = ["bag", "orders", "profile", "wishlist", "help"] as const;
export type Page = (typeof PAGES)[number];

export const page = signal<Page | null>(null);
let inApp = false; // a back step stays in the app

function sync() {
  const key = location.hash.replace(/^#\/?/, "");
  if ((PAGES as readonly string[]).includes(key)) {
    page.value = key as Page;
    return;
  }
  page.value = null;
  const cat = variants.CATEGORIES.find((c) => c.key === key) ?? variants.CATEGORIES[0];
  if (cat !== store.category.value) store.category.value = cat;
}

export function go(path: string) {
  inApp = true;
  location.hash = `#/${path}`;
}

// Swaps the current page for another, so back skips it (bag → orders).
export function replace(path: string) {
  location.replace(`#/${path}`);
}

export function back() {
  if (inApp) history.back();
  else go(store.category.value.key);
}

export function start() {
  addEventListener("hashchange", sync);
  sync();
}
