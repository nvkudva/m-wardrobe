export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export const pad2 = (n: number) => String(n).padStart(2, "0");
