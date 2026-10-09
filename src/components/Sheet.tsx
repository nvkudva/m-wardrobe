import { useRef } from "preact/hooks";
import * as router from "../app/router";
import { BagPage } from "../pages/BagPage";
import { HelpPage } from "../pages/HelpPage";
import { OrdersPage } from "../pages/OrdersPage";
import { ProfilePage } from "../pages/ProfilePage";
import { WishlistPage } from "../pages/WishlistPage";
import * as icons from "./icons";
import "./Sheet.css";

const PAGES: Record<router.Page, { title: () => string; body: () => preact.JSX.Element }> = {
  bag: BagPage,
  orders: OrdersPage,
  profile: ProfilePage,
  wishlist: WishlistPage,
  help: HelpPage,
};

// Full-screen panel that slides over the wardrobe with the routed page. The
// last page stays rendered while the panel slides away.
export function Sheet() {
  const page = router.page.value;
  // Each arrival is a new visit, which remounts the page so its entrance
  // animations play again; on the way out the last visit stays put.
  const prev = useRef<router.Page | null>(null), shown = useRef<{ page: router.Page; visit: number } | null>(null);
  if (page && page !== prev.current) shown.current = { page, visit: (shown.current?.visit ?? 0) + 1 };
  prev.current = page;
  const visit = shown.current, P = visit && PAGES[visit.page];
  return (
    <div class={page ? "sheet open" : "sheet"} role="dialog" data-page={visit?.page}>
      {P && (
        <div key={visit.visit}>
          <header>
            <button class="icon" aria-label="Back" onClick={router.back}><icons.Back /></button>
            <h2>{P.title()}</h2>
          </header>
          <P.body />
        </div>
      )}
    </div>
  );
}
