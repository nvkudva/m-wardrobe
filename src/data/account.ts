// The demo's signed-in shopper and their order history.

export const USER = {
  name: "Vijay Krishna",
  email: "vijay.krishna@example.com",
  phone: "+91 98xxxx 2041",
  initials: "VK",
  city: "Bengaluru",
  since: 2021,
  points: "Gold · 2,340 pts",
};

export interface Line {
  id: number;
  name: string;
  price: number;
  size: string;
  thumb?: string;
}

export type OrderStatus = "done" | "ship" | "new";

export interface Order {
  id: string;
  date: string;
  status: [OrderStatus, string];
  items: Line[];
}

export const ORDERS: Order[] = [
  { id: "MY-48213", date: "2 Oct 2026", status: ["done", "Delivered"], items: [{ id: -1, name: "Northline Striped T-Shirt — Navy", price: 799, size: "M" }, { id: -2, name: "Urban Loom Washed Jeans — Mid Blue", price: 1899, size: "32" }] },
  { id: "MY-47790", date: "21 Sep 2026", status: ["done", "Delivered"], items: [{ id: -3, name: "Kora Matte Lipstick — Ruby Woo", price: 899, size: "One Size" }] },
  { id: "MY-49102", date: "8 Oct 2026", status: ["ship", "Out for delivery"], items: [{ id: -4, name: "Saffron & Co Kurti — Teal", price: 1499, size: "L" }] },
];
