// App chrome around the wardrobe: the menu drawer (profile, shop categories,
// account links) and the pages it opens (profile, orders, bag, wishlist).
// Owns the bag; placing an order moves the bag into the orders list.

const $ = (id) => document.getElementById(id);
const rupees = (n) => `₹${n.toLocaleString("en-IN")}`;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const USER = { name: "Vijay Krishna", email: "vijay.krishna@example.com", phone: "+91 98xxxx 2041", initials: "VK", city: "Bengaluru" };

const state = {
  bag: [],
  wish: [],
  orders: [
    { id: "MY-48213", date: "2 Oct 2026", status: ["done", "Delivered"], items: [{ name: "Northline Striped T-Shirt — Navy", price: 799, size: "M" }, { name: "Urban Loom Washed Jeans — Mid Blue", price: 1899, size: "32" }] },
    { id: "MY-47790", date: "21 Sep 2026", status: ["done", "Delivered"], items: [{ name: "Kora Matte Lipstick — Ruby Woo", price: 899, size: "One Size" }] },
    { id: "MY-49102", date: "8 Oct 2026", status: ["ship", "Out for delivery"], items: [{ name: "Saffron & Co Kurti — Teal", price: 1499, size: "L" }] },
  ],
};

let ui, onCategory;

function openMenu() {
  render();
  ui.screen.dataset.menu = "";
}

function closeMenu() {
  delete ui.screen.dataset.menu;
}

function openSheet(name) {
  closeMenu();
  ui.sheet.innerHTML = PAGES[name]();
  ui.screen.dataset.sheet = name;
}

function closeSheet() {
  delete ui.screen.dataset.sheet;
}

function render() {
  const n = state.bag.length;
  ui.drawer.innerHTML = `
    <button class="profile" data-go="profile">
      <span class="avatar">${USER.initials}</span>
      <span><b>${USER.name}</b><span>View profile ›</span></span>
    </button>
    <h5>SHOP</h5>
    ${ui.categories.map((c) => `<button class="item" data-cat="${c.key}">${c.label}<em>${c.rails.map((r) => r.label).join(", ")}</em></button>`).join("")}
    <h5>ACCOUNT</h5>
    <button class="item" data-go="orders">Orders<em>${state.orders.length}</em></button>
    <button class="item" data-go="bag">Bag${n ? `<span class="count">${n}</span>` : "<em>Empty</em>"}</button>
    <button class="item" data-go="wishlist">Wishlist<em>${state.wish.length || ""}</em></button>
    <button class="item" data-go="profile">Saved addresses</button>
    <h5>HELP</h5>
    <button class="item" data-go="help">Contact us</button>`;
}

const back = (title) => `<header><button class="icon" data-back aria-label="Back"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></button><h2>${title}</h2></header>`;
const line = (it, right, k = 0) => `<div class="row" style="--i:${k}">${it.thumb ? `<img class="thumb" src="${it.thumb}" alt="">` : ""}<span class="what"><b>${esc(it.name)}</b><small>Size ${esc(it.size)} · ${rupees(it.price)}</small></span>${right}</div>`;

const PAGES = {
  profile: () => `${back("Profile")}
    <section><div class="profile" style="padding:0;border:0"><span class="avatar">${USER.initials}</span><span><b>${USER.name}</b><span>Member since 2021</span></span></div></section>
    <section>
      <div class="row"><span class="muted">Email</span><b>${USER.email}</b></div>
      <div class="row"><span class="muted">Phone</span><b>${USER.phone}</b></div>
      <div class="row"><span class="muted">Insider</span><b>Gold · 2,340 pts</b></div>
    </section>
    <section>
      <div class="row"><span><b>Home</b><small>14, 5th Cross, Indiranagar, ${USER.city} 560038</small></span><span class="status new">Default</span></div>
      <div class="row"><span><b>Work</b><small>Prestige Tech Park, Marathahalli, ${USER.city} 560103</small></span></div>
    </section>`,
  orders: () => `${back("Orders")}
    ${state.orders.map((o) => `<section>
      <div class="row"><span><b>${o.id}</b><small>${o.date} · ${rupees(o.items.reduce((a, i) => a + i.price, 0))}</small></span><span class="status ${o.status[0]}">${o.status[1]}</span></div>
      ${o.items.map((i) => line(i, "")).join("")}
    </section>`).join("")}`,
  // still: re-rendered after a removal, so the rows don't play their entrance again.
  bag: (still = false) => {
    const total = state.bag.reduce((a, i) => a + i.price, 0);
    return `${back(`Bag (${state.bag.length})`)}
      <section class="bag-list${still ? " still" : ""}">${state.bag.length ? state.bag.map((i, k) => line(i, `<button class="remove" data-remove="${k}">Remove</button>`, k)).join("") : `<p class="muted">Your bag is empty. Tap a piece on a rail, then Add to bag.</p>`}</section>
      ${state.bag.length ? `<section><div class="row"><span class="muted">Total</span><b>${rupees(total)}</b></div></section>` : ""}
      <button class="cta" data-place ${state.bag.length ? "" : "disabled"}>PLACE ORDER</button>`;
  },
  wishlist: () => `${back("Wishlist")}<section>${state.wish.length ? state.wish.map((i) => line(i, "")).join("") : `<p class="muted">Tap ♡ in a product's detail view to save it here.</p>`}</section>`,
  help: () => `${back("Contact us")}<section><div class="row"><span class="muted">Chat</span><b>24×7 in app</b></div><div class="row"><span class="muted">Call</span><b>1800 000 0000</b></div></section>`,
};

function badge() {
  ui.badge.hidden = state.bag.length === 0;
  ui.badge.textContent = state.bag.length;
}

export function init(opts) {
  ui = { ...opts, screen: $("screen"), drawer: $("drawer"), sheet: $("sheet"), badge: $("bagCount") };
  onCategory = opts.onCategory;
  $("menuBtn").onclick = openMenu;
  $("bagBtn").onclick = () => openSheet("bag");
  $("wishBtn").onclick = (e) => {
    const item = ui.current();
    if (!item) return openSheet("wishlist");
    wish(item);
    const h = e.currentTarget;
    h.classList.remove("shake");
    void h.offsetWidth;
    h.classList.add("shake");
    h.querySelector("path").setAttribute("fill", "#f6763c");
  };
  $("scrim").onclick = closeMenu;
  ui.drawer.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.go) openSheet(b.dataset.go);
    else if (b.dataset.cat) {
      closeMenu();
      onCategory(b.dataset.cat);
    }
  });
  ui.sheet.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if ("back" in b.dataset) closeSheet();
    else if (b.dataset.remove) {
      const row = b.closest(".row");
      row.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(-40px)" }], { duration: 260, easing: "ease-in", fill: "forwards" }).finished.then(() => {
        state.bag.splice(+b.dataset.remove, 1);
        badge();
        ui.sheet.innerHTML = PAGES.bag(true);
      });
    } else if ("place" in b.dataset) {
      const id = `MY-${49200 + state.orders.length * 7}`;
      state.orders.unshift({ id, date: "Today", status: ["new", "Confirmed"], items: state.bag.splice(0) });
      badge();
      ui.sheet.innerHTML = PAGES.orders();
    }
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") dismiss();
  });
}

// Adds a line to the bag; returns the new count.
export function add(item) {
  state.bag.push(item);
  badge();
  return state.bag.length;
}

export function dismiss() {
  closeMenu();
  closeSheet();
}

export function wish(item) {
  if (!state.wish.some((w) => w.name === item.name)) state.wish.push(item);
}
