import * as router from "../app/router";
import * as store from "../app/store";
import { LineRow } from "../components/LineRow";
import { rupees } from "../lib/format";

// Rows glide in one after another; a removed row slides out before it goes.
function remove(e: MouseEvent, id: number) {
  const row = (e.currentTarget as HTMLElement).closest(".row")!;
  row.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(-40px)" }], { duration: 260, easing: "ease-in", fill: "forwards" })
    .finished.then(() => store.removeFromBag(id));
}

export const BagPage = {
  title: () => `Bag (${store.bag.value.length})`,
  body: () => {
    const bag = store.bag.value, total = bag.reduce((a, i) => a + i.price, 0);
    return (
      <>
        <section class="bag-list">
          {bag.length
            ? bag.map((item, k) => (
                <LineRow key={item.id} item={item} i={k}>
                  <button class="remove" onClick={(e) => remove(e, item.id)}>Remove</button>
                </LineRow>
              ))
            : <p class="muted">Your bag is empty. Tap a piece on a rail, then Add to bag.</p>}
        </section>
        {bag.length > 0 && <section><div class="row"><span class="muted">Total</span><b>{rupees(total)}</b></div></section>}
        <button class="cta" disabled={!bag.length} onClick={() => { store.placeOrder(); router.replace("orders"); }}>PLACE ORDER</button>
      </>
    );
  },
};
