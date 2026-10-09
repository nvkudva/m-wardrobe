import * as store from "../app/store";
import { LineRow } from "../components/LineRow";
import { rupees } from "../lib/format";

export const OrdersPage = {
  title: () => "Orders",
  body: () => (
    <>
      {store.orders.value.map((o) => (
        <section key={o.id}>
          <div class="row">
            <span><b>{o.id}</b><small>{o.date} · {rupees(o.items.reduce((a, i) => a + i.price, 0))}</small></span>
            <span class={`status ${o.status[0]}`}>{o.status[1]}</span>
          </div>
          {o.items.map((i) => <LineRow key={i.id} item={i} />)}
        </section>
      ))}
    </>
  ),
};
