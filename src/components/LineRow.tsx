import type { ComponentChildren } from "preact";
import type { Line } from "../data/account";
import { rupees } from "../lib/format";

// One product line in the bag, an order or the wishlist.
export function LineRow({ item, i = 0, children }: { item: Line; i?: number; children?: ComponentChildren }) {
  return (
    <div class="row" style={{ "--i": i }}>
      {item.thumb && <img class="thumb" src={item.thumb} alt="" />}
      <span class="what"><b>{item.name}</b><small>Size {item.size} · {rupees(item.price)}</small></span>
      {children}
    </div>
  );
}
