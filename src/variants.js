// Wardrobe stock: each rail is a recipe (cut, colours, looks) that expands into
// a dozen products by stepping through colour × look. A look is a pattern from
// paint.js (in an accent colour) or one of the hand-painted arts.

const ARTS = new Set(["camo", "heather", "denim", "polka", "zari", "sequin", "fleck"]);
const BRANDS = ["Northline", "Kora", "Bluebird", "Indigo Row", "Hanger Club", "Saffron & Co", "Urban Loom"];
const ADULT = ["S", "M", "L", "XL"], KIDS = ["2-3Y", "4-5Y", "6-7Y", "8-9Y"];

// [name, hex] pairs.
const C = {
  black: ["Jet Black", "#1d1d20"], white: ["Off White", "#f2f1ec"], navy: ["Navy", "#24304f"],
  olive: ["Olive", "#5b6040"], maroon: ["Maroon", "#6b1f2a"], mustard: ["Mustard", "#d1a23a"],
  sky: ["Sky Blue", "#9cc3e0"], sage: ["Sage", "#9fb39a"], rust: ["Rust", "#b5603c"],
  grey: ["Charcoal", "#45464c"], beige: ["Beige", "#d9c8a8"], teal: ["Teal", "#2f6f73"],
  pink: ["Blush Pink", "#e3a9b9"], lilac: ["Lilac", "#b9a6d6"], coral: ["Coral", "#e87a64"],
  yellow: ["Lemon", "#f2d65c"], red: ["Red", "#b8232f"], green: ["Bottle Green", "#24523a"],
  indigo: ["Indigo", "#2c3d62"], midblue: ["Mid Blue", "#4d6e9c"], lightblue: ["Light Wash", "#8aa6c8"],
  sand: ["Sand", "#c8b48e"], khaki: ["Khaki", "#9a8b62"], magenta: ["Magenta", "#a3245e"],
  peacock: ["Peacock Blue", "#1f5d7a"], mint: ["Mint", "#a8d8c2"], cream: ["Cream", "#efe6d2"],
};

const LOOK = {
  solid: "Solid", stripe: "Striped", pinstripe: "Pinstriped", check: "Checked", tartan: "Tartan",
  dots: "Polka Dot", floral: "Floral", butta: "Paisley Print", colorblock: "Colourblock",
  camo: "Camo", heather: "Heathered", denim: "Washed", polka: "Polka Dot", zari: "Zari Silk",
  sequin: "Sequinned Chiffon", fleck: "Linen",
};

const rail = (label, o) => ({ label, sizes: ADULT, scale: 1, looks: ["solid"], ...o });
const kids = (label, o) => rail(label, { sizes: KIDS, scale: 0.72, ...o });
// Table rows: kinds are [model, product type, extra fields]; colours are [name, hex].
const shelf = (label, o) => ({ label, sizes: ["One Size"], ...o });

export const CATEGORIES = [
  {
    key: "men", label: "Men", rails: [
      rail("T-Shirts", { cut: "tee", type: "T-Shirt", price: [399, 1299], colors: ["black", "white", "navy", "olive", "maroon", "mustard", "sky", "grey"], looks: ["solid", "stripe", "colorblock", "camo", "heather"], desc: "Combed cotton jersey, regular fit." , fits: [{}, { sleeve: "none" }, { sleeve: "full" }, { width: "wide", length: "long" }, { width: "slim" }], focus: 3 }),
      rail("Jeans", { cut: "pants", type: "Jeans", price: [1199, 2999], colors: ["indigo", "midblue", "lightblue", "black", "grey"], looks: ["denim"], desc: "Stretch denim, slim tapered leg." , fits: [{ width: "slim" }, {}, { width: "wide" }, { length: "short" }], height: 280 }),
      rail("Shirts", { cut: "shirt", type: "Shirt", price: [899, 2199], colors: ["white", "sky", "navy", "beige", "sage", "grey", "pink", "black"], looks: ["solid", "check", "pinstripe", "tartan"], desc: "Cotton poplin, spread collar, curved hem." , fits: [{}, { sleeve: "half" }, { width: "slim" }, { length: "long" }] }),
      rail("Shorts", { cut: "shorts", type: "Shorts", price: [599, 1499], colors: ["sand", "khaki", "navy", "olive", "black", "sage", "midblue"], looks: ["solid", "denim", "check"], desc: "Cotton twill, above-knee length." , fits: [{}, { width: "wide" }, { length: "short" }] }),
    ],
  },
  {
    key: "women", label: "Women", rails: [
      rail("T-Shirts", { cut: "tee", type: "T-Shirt", price: [349, 999], colors: ["white", "pink", "lilac", "black", "mint", "coral", "yellow", "sky"], looks: ["solid", "stripe", "floral", "dots"], scale: 0.92, desc: "Soft jersey, relaxed fit." , fits: [{ length: "short" }, {}, { width: "wide", length: "long" }, { sleeve: "none" }, { sleeve: "full", width: "slim" }] }),
      rail("Kurtis", { cut: "kurtiSet", type: "Kurta Set", price: [999, 3499], colors: ["mustard", "teal", "magenta", "cream", "peacock", "rust", "green", "pink"], looks: ["butta", "floral", "solid", "stripe"], desc: "Cotton kurti with an embroidered yoke, paired with matching bottoms.",
        pairs: [["palazzo", "with Palazzos", "#efe6d2"], ["straight", "with Pants", null], ["palazzo", "with Palazzos", null], ["straight", "with Pants", "#f2f1ec"]], height: 310,
        fits: [{ length: "short", sleeve: "half" }, { length: "long", sleeve: "full" }, { sleeve: "none", width: "wide" }, { width: "slim" }, { length: "long", sleeve: "half", width: "wide" }, { length: "short", sleeve: "full", width: "slim" }, { sleeve: "none", length: "long" }] }),
      rail("Dresses", { cut: "dress", type: "Dress", price: [999, 3499], colors: ["rust", "black", "sage", "pink", "navy", "yellow", "lilac", "coral"], looks: ["fleck", "polka", "floral", "stripe", "check"], desc: "Washed linen, wide straps, flared skirt." , fits: [{ length: "short" }, {}, { length: "long" }, { width: "slim", length: "long" }, { width: "wide" }], height: 288 }),
      rail("Sarees", { cut: "saree", type: "Saree", price: [1499, 8999], colors: ["maroon", "peacock", "magenta", "green", "mustard", "sky", "lilac", "red"], looks: ["zari", "sequin"], desc: "Woven border with a decorated pallu." }),
    ],
  },
  {
    key: "kids", label: "Kids", rails: [
      kids("Frocks", { cut: "frock", type: "Frock", price: [499, 1499], colors: ["pink", "yellow", "lilac", "mint", "red", "sky", "coral"], looks: ["polka", "floral", "check", "solid"], desc: "Twirly party frock with a tie waist." , fits: [{}, { length: "short" }, { length: "long" }] }),
      kids("T-Shirts", { cut: "tee", type: "T-Shirt", price: [299, 799], colors: ["yellow", "sky", "coral", "mint", "navy", "white", "red"], looks: ["solid", "stripe", "dots", "colorblock"], desc: "Soft cotton tee for play days." , fits: [{}, { sleeve: "none" }, { sleeve: "full" }] }),
      kids("Shorts", { cut: "shorts", type: "Shorts", price: [349, 899], colors: ["sand", "navy", "midblue", "olive", "coral", "sky"], looks: ["solid", "denim", "check"], desc: "Pull-on cotton shorts with an elastic waist." , fits: [{}, { width: "wide" }, { length: "short" }] }),
    ],
  },
  {
    key: "accessories", label: "Accessories", fixture: "table", rails: [
      shelf("Lipsticks", {
        kinds: [["lipstick", "Rouge Couture Satin", { style: "couture" }], ["lipstick", "Pro Matte Lipstick", { style: "pro" }], ["lipstick", "Velvet Lip Colour", { style: "silver" }], ["lipstick", "Allure Satin", { style: "lacquer" }], ["lipstick", "Matte Revolution", { style: "fluted" }]],
        colors: [["Ruby Woo", "#a3172c"], ["Nude Rose", "#c98a7d"], ["Berry Crush", "#6e1d48"], ["Coral Kiss", "#e2685a"], ["Mauve Muse", "#9a6178"], ["Brick", "#8e3b2a"], ["Pink Punch", "#d64d82"]],
        price: [599, 3499], desc: "Long-wear colour, comfortable on the lips.", volume: "3.5 g",
      }),
      shelf("Nail Polish", {
        kinds: [["polish", "Nail Lacquer", { style: "classic", cap: "lacquer" }], ["polish", "Gel Couture", { style: "square", cap: "white" }], ["polish", "Le Vernis", { style: "square", cap: "lacquer" }], ["polish", "Vernis Gloss", { style: "dome", cap: "gold" }]],
        colors: [["Cherry", "#b3122e"], ["Ballet Pink", "#efbcc6"], ["Lilac", "#b9a6d6"], ["Midnight", "#1f2a4a"], ["Mint", "#a8d8c2"], ["Sunset", "#f08a4b"], ["Nude", "#d9b29c"]],
        price: [249, 1999], desc: "Glossy, chip-resistant, quick dry.", sizes: ["9ml", "15ml"],
      }),
      shelf("Creams", {
        kinds: [["jar", "Crème Riche", { size: 1, lid: "gold", volume: "50 ml" }], ["tube", "Hand Cream", { size: 0.9, volume: "75 ml" }], ["pump", "Moisturising Lotion", { size: 1.15, volume: "473 ml" }], ["dropper", "Niacinamide 10% Serum", { size: 0.85, volume: "30 ml" }], ["jar", "Eye Cream", { size: 0.62, lid: "silver", volume: "15 ml" }], ["tube", "Sunscreen SPF 50", { size: 1, volume: "50 ml" }], ["dropper", "Retinol Night Serum", { size: 0.85, amber: true, volume: "30 ml" }]],
        colors: [["White", "#f4f2ee"], ["Blush", "#efc9c4"], ["Sage", "#b9c7b0"], ["Sky", "#b8d0e3"], ["Cream", "#efe3cc"], ["Charcoal", "#3b3c40"], ["Lavender", "#cdbfe0"]],
        price: [349, 5999], desc: "Lightweight, fast absorbing, dermatologist tested.", sizes: ["30ml", "50ml", "100ml"],
      }),
    ],
  },
];

// Shop words for a fit, per cut where the trade has its own (a short dress is
// a mini, wide jeans are wide-leg); "_" is the general word.
const FIT_WORDS = {
  length: {
    short: { tee: "Cropped", pants: "Cropped", dress: "Mini", _: "Short" },
    regular: { dress: "Midi", _: "" },
    long: { tee: "Longline", shirt: "Longline", dress: "Maxi", _: "Long" },
  },
  width: {
    wide: { tee: "Oversized", pants: "Wide-Leg", shorts: "Relaxed", dress: "Flared", _: "A-Line" },
    slim: { pants: "Slim-Fit", shirt: "Slim-Fit", tee: "Slim", dress: "Bodycon", _: "Straight" },
  },
  sleeve: { none: "Sleeveless", cap: "", half: "Half-Sleeve", full: "Full-Sleeve" },
};

function fitWords(fit, cut) {
  if (!fit) return "";
  const pick = (t) => (t ? t[cut] ?? t[cut.replace("Set", "")] ?? t._ : "");
  return [pick(FIT_WORDS.length[fit.length ?? "regular"]), pick(FIT_WORDS.width[fit.width]), FIT_WORDS.sleeve[fit.sleeve] ?? ""].filter(Boolean).join(" ");
}

function rng(seed) {
  let s = (seed % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

function deepen(hex) {
  const n = parseInt(hex.slice(1), 16), k = 0.62;
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k).toString(16).padStart(2, "0"));
  return `#${c.join("")}`;
}

// A print colour that reads on the base: white on dark, the darkest other
// colour of the rail on light.
function accent(base, colors) {
  if (lum(base) < 0.45) return "#ece8de";
  return colors.map((k) => C[k][1]).filter((h) => h !== base).sort((a, b) => lum(a) - lum(b))[0];
}

function items(r, n) {
  const rand = rng(r.label.length * 6151 + r.price[1]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const [kind, type, extra] = r.kinds[i % r.kinds.length];
    const [cname, base] = r.colors[(i + Math.floor(i / r.kinds.length)) % r.colors.length];
    const brand = BRANDS[Math.floor(rand() * BRANDS.length)];
    const price = Math.round((r.price[0] + rand() * (r.price[1] - r.price[0])) / 50) * 50 - 1;
    out.push({
      name: `${brand} ${type} — ${cname}`, brand, kind, type, base, volume: r.volume, ...extra,
      price, mrp: Math.round(price / (0.4 + rand() * 0.4) / 10) * 10 - 1, desc: r.desc, sizes: r.sizes,
    });
  }
  return out;
}

export function products(r, n = 12) {
  if (r.kinds) return items(r, n);
  const rand = rng(r.label.length * 7919 + r.cut.length * 104729 + r.price[0]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const [cname, base] = C[r.colors[i % r.colors.length]];
    // Offset the look by the colour cycle so repeats of a colour get a new look.
    const look = r.looks[(i + Math.floor(i / r.colors.length)) % r.looks.length];
    const brand = BRANDS[Math.floor(rand() * BRANDS.length)];
    const price = Math.round((r.price[0] + rand() * (r.price[1] - r.price[0])) / 50) * 50 - 1;
    const fit = r.fits?.[i % r.fits.length];
    const p = {
      name: `${brand} ${fitWords(fit, r.cut)} ${LOOK[look] === "Solid" ? "" : LOOK[look] + " "}${r.type} — ${cname}`.replace(/\s+/g, " "),
      fit,
      price, mrp: Math.round(price / (0.4 + rand() * 0.4) / 10) * 10 - 1,
      desc: r.desc, cut: r.cut, base, scale: r.scale, sizes: r.sizes, art: "none",
    };
    if (ARTS.has(look)) p.art = look;
    else p.pattern = look;
    p.accent = accent(base, r.colors);
    if (look === "sequin") p.fabric = "chiffon";
    // Kurta sets: bottoms in cream/white, or the kurti's colour deepened.
    if (r.pairs) {
      const [bottom, with_, col] = r.pairs[i % r.pairs.length];
      Object.assign(p, { bottom, bottomColor: col ?? deepen(base), name: `${p.name.split(" — ")[0]} ${with_} — ${cname}` });
    }
    out.push(p);
  }
  return out;
}
