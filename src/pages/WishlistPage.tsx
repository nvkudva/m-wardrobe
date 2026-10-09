import * as store from "../app/store";
import { LineRow } from "../components/LineRow";

export const WishlistPage = {
  title: () => "Wishlist",
  body: () => (
    <section>
      {store.wish.value.length
        ? store.wish.value.map((i) => <LineRow key={i.id} item={i} />)
        : <p class="muted">Tap ♡ in a product's detail view to save it here.</p>}
    </section>
  ),
};
