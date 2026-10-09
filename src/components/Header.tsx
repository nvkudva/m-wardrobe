import { createRef } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import * as effects from "../effects";
import * as router from "../app/router";
import * as store from "../app/store";
import * as variants from "../catalog/variants.js";
import * as icons from "./icons";
import "./Header.css";

// Fly-to-bag aims here.
export const bagButton = createRef<HTMLButtonElement>();

// M: back to the top of the first category, closing whatever is open.
function home() {
  store.menuOpen.value = false;
  store.engine.current?.close();
  const first = variants.CATEGORIES[0];
  if (router.page.value || store.category.value !== first) return router.go(first.key);
  store.engine.current?.scroller.scrollTo({ top: 0, behavior: "smooth" });
  store.homeTick.value++;
}

export function Header() {
  const count = store.bag.value.length, pulse = store.bagPulse.value;
  const badge = useRef<HTMLSpanElement>(null), heart = useRef<HTMLButtonElement>(null);
  const [saved, setSaved] = useState(false);

  // A piece landed: the bag wiggles and the count pops.
  useEffect(() => {
    if (!pulse) return;
    if (bagButton.current) effects.replay(bagButton.current, "shake");
    if (badge.current) effects.replay(badge.current, "bump");
  }, [pulse]);

  // The heart fills for the piece in detail once it is saved.
  const d = store.detail.value;
  useEffect(() => setSaved(!!d && store.wish.value.some((w) => w.name === d.product.name)), [d]);

  // In a detail view the heart saves the piece; elsewhere it opens the list.
  const onWish = () => {
    if (!d) return router.go("wishlist");
    store.saveToWishlist(store.line(d.product));
    setSaved(true);
    if (heart.current) effects.replay(heart.current, "shake");
  };

  return (
    <header class="bar">
      <button class="icon" aria-label="Menu" onClick={() => (store.menuOpen.value = true)}><icons.Menu /></button>
      <button class="icon home" aria-label="Home" onClick={home}><icons.Logo /></button>
      <span class="name">Wardrobe</span>
      <button ref={heart} class="icon" aria-label="Wishlist" onClick={onWish}><icons.Heart filled={saved} /></button>
      <button ref={bagButton} class="icon bag" aria-label="Bag" onClick={() => router.go("bag")}>
        <icons.Bag />
        <span ref={badge} class="badge" hidden={!count}>{count}</span>
      </button>
    </header>
  );
}
