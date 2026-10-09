import { signal } from "@preact/signals";
import * as variants from "../catalog/variants.js";
import * as account from "../data/account";
import type { Wardrobe } from "../engine/wardrobe.js";

// App state. Components read these signals; the 3D engine reports into
// `captions` and `detail` through its events.

export type Category = (typeof variants.CATEGORIES)[number];
export type Product = ReturnType<typeof variants.products>[number];

export interface Detail {
  rail: number;
  index: number;
  count: number;
  product: Product;
}

export const engine: { current: Wardrobe | null } = { current: null };

export const category = signal<Category>(variants.CATEGORIES[0]);
export const captions = signal<(Product | null)[]>([]); // focused product per rail
export const detail = signal<Detail | null>(null);
export const size = signal("M");
export const menuOpen = signal(false);

export const bag = signal<account.Line[]>([]);
export const wish = signal<account.Line[]>([]);
export const orders = signal<account.Order[]>(account.ORDERS);
export const bagPulse = signal(0); // bumps when a piece lands in the bag
export const homeTick = signal(0); // bumps when the logo asks for the top of the page

let nextId = 1;

export function line(p: Product, thumb?: string): account.Line {
  return { id: nextId++, name: p.name, price: p.price, size: size.value, thumb };
}

export function addToBag(item: account.Line) {
  bag.value = [...bag.value, item];
  bagPulse.value++;
}

export function removeFromBag(id: number) {
  bag.value = bag.value.filter((l) => l.id !== id);
}

export function placeOrder() {
  if (!bag.value.length) return;
  const id = `MY-${49200 + orders.value.length * 7}`;
  orders.value = [{ id, date: "Today", status: ["new", "Confirmed"], items: bag.value }, ...orders.value];
  bag.value = [];
}

export function saveToWishlist(item: account.Line) {
  if (!wish.value.some((w) => w.name === item.name)) wish.value = [...wish.value, item];
}
