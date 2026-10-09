import * as router from "../app/router";
import * as store from "../app/store";
import * as variants from "../catalog/variants.js";
import { USER } from "../data/account";
import "./Drawer.css";

// Side menu: profile, shop categories and account links.
export function Drawer() {
  const open = store.menuOpen.value, n = store.bag.value.length;
  const go = (path: string) => {
    store.menuOpen.value = false;
    router.go(path);
  };
  return (
    <>
      <div class={open ? "scrim open" : "scrim"} onClick={() => (store.menuOpen.value = false)} />
      <nav class={open ? "drawer open" : "drawer"} aria-label="Menu">
        <button class="profile" onClick={() => go("profile")}>
          <span class="avatar">{USER.initials}</span>
          <span><b>{USER.name}</b><span>View profile ›</span></span>
        </button>
        <h5>SHOP</h5>
        {variants.CATEGORIES.map((c) => (
          <button key={c.key} class="item" onClick={() => go(c.key)}>{c.label}<em>{c.rails.map((r) => r.label).join(", ")}</em></button>
        ))}
        <h5>ACCOUNT</h5>
        <button class="item" onClick={() => go("orders")}>Orders<em>{store.orders.value.length}</em></button>
        <button class="item" onClick={() => go("bag")}>Bag{n ? <span class="count">{n}</span> : <em>Empty</em>}</button>
        <button class="item" onClick={() => go("wishlist")}>Wishlist<em>{store.wish.value.length || ""}</em></button>
        <button class="item" onClick={() => go("profile")}>Saved addresses</button>
        <h5>HELP</h5>
        <button class="item" onClick={() => go("help")}>Contact us</button>
      </nav>
    </>
  );
}
