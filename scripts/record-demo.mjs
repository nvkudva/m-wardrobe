// Records a walkthrough of every feature to m-wardrobe-demo.mp4.
// Needs the dev server (`bun run dev`) and ffmpeg. Run: node scripts/record-demo.mjs
// Warms every category and page first, then records the flow through Chrome's
// screencast at device resolution, frame by frame with real timings.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const URL = process.env.URL ?? "http://localhost:5173";
const OUT = process.argv[2] ?? "m-wardrobe-demo.mp4";
const W = 402, H = 874, DPR = 3;
const OUT_W = 1080, OUT_H = Math.round((OUT_W * H) / W / 2) * 2; // 1080 × 2348

const dir = mkdtempSync(join(tmpdir(), "m-wardrobe-demo-"));
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
// A soft dot where the finger is, so taps and drags read on video.
await context.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const dot = document.createElement("div");
    Object.assign(dot.style, {
      position: "fixed", zIndex: 99, width: "34px", height: "34px", margin: "-17px", borderRadius: "50%",
      background: "rgba(40, 44, 63, 0.18)", border: "2px solid rgba(255, 255, 255, 0.85)",
      boxShadow: "0 2px 10px rgba(0,0,0,0.18)", pointerEvents: "none", opacity: "0",
      transition: "opacity 0.18s, transform 0.18s", transform: "scale(0.6)", left: "0", top: "0",
    });
    document.body.append(dot);
    const at = (e) => { dot.style.left = `${e.clientX}px`; dot.style.top = `${e.clientY}px`; };
    addEventListener("pointermove", at, true);
    addEventListener("pointerdown", (e) => { at(e); dot.style.opacity = "1"; dot.style.transform = "scale(1)"; }, true);
    addEventListener("pointerup", () => { dot.style.opacity = "0"; dot.style.transform = "scale(0.6)"; }, true);
  });
});

const page = await context.newPage();
const wait = (ms) => page.waitForTimeout(ms);
const box = async (sel, i = 0) => (await page.locator(sel).nth(i).boundingBox());
const centre = async (sel, i = 0) => { const b = await box(sel, i); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

async function tap(x, y, hold = 90) {
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.down();
  await wait(hold);
  await page.mouse.up();
}
async function tapEl(sel, i = 0) { const c = await centre(sel, i); await tap(c.x, c.y); }
async function drag(path, ms = 900) {
  await page.mouse.move(path[0][0], path[0][1], { steps: 6 });
  await page.mouse.down();
  for (let k = 1; k < path.length; k++) await page.mouse.move(path[k][0], path[k][1], { steps: Math.round(ms / path.length / 16) });
  await page.mouse.up();
}
// Smooth vertical scroll of the rack.
async function scrollTo(y, ms = 1200) {
  await page.evaluate(([y, ms]) => new Promise((done) => {
    const el = document.getElementById("scroll"), y0 = el.scrollTop, t0 = performance.now();
    const f = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      el.scrollTop = y0 + (y - y0) * e;
      k < 1 ? requestAnimationFrame(f) : done();
    };
    requestAnimationFrame(f);
  }), [y, ms]);
}
const railTop = (i) => page.evaluate((i) => {
  const s = document.getElementById("scroll"), r = s.querySelectorAll(".rail")[i];
  return r.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop - 8;
}, i);
// Opens the focused piece of rail i by tapping it.
async function openRail(i) {
  const v = await centre(".rail .view", i);
  await tap(v.x, v.y);
  await wait(1300);
}
async function spinDetail() {
  await drag([[W / 2, 360], [W / 2 + 90, 340], [W / 2 + 40, 420], [W / 2 - 80, 380], [W / 2 - 20, 330]], 2200);
  await wait(1100);
}
const category = async (key) => { await tapEl(`.cat[data-key="${key}"]`); await wait(2400); };

// ---- Warm-up (trimmed) -----------------------------------------------------------
await page.goto(`${URL}/#/men`);
await wait(2500);
for (const key of ["women", "kids", "accessories"]) {
  await page.evaluate((k) => (location.hash = `#/${k}`), key);
  await wait(2200);
  await openRail(0);
  await page.keyboard.press("Escape");
  await wait(600);
}
for (const p of ["bag", "orders", "profile", "wishlist", "help"]) {
  await page.evaluate((p) => (location.hash = `#/${p}`), p);
  await wait(500);
}
await page.evaluate(() => (location.hash = "#/men"));
await wait(3000);

// Screencast frames arrive only when the page repaints; each one is kept with
// its timestamp so idle stretches hold the last frame for the right time.
const cdp = await context.newCDPSession(page), frames = [];
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  const file = join(dir, `${String(frames.length).padStart(5, "0")}.jpg`);
  writeFileSync(file, Buffer.from(data, "base64"));
  frames.push({ file, t: metadata.timestamp });
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 100, maxWidth: W * DPR, maxHeight: H * DPR });
// Section start times, written next to the video for editors (captions etc).
const marks = [];
const mark = (label) => marks.push({ label, t: Date.now() / 1000 });

// ---- Recorded flow ---------------------------------------------------------------
await wait(1500);
// Browse the tee rail: drag through it, then let it settle.
mark("rack");
let v = await box(".rail .view", 0);
await drag([[v.x + 300, v.y + 120], [v.x + 120, v.y + 125]], 1100);
await wait(900);
await drag([[v.x + 120, v.y + 120], [v.x + 300, v.y + 118]], 1100);
await wait(1200);
// Scroll through the men's rails and back.
await scrollTo(await railTop(1), 1400); await wait(1100);
v = await box(".rail .view", 1);
await drag([[v.x + 300, v.y + 140], [v.x + 140, v.y + 140]], 1000); await wait(900);
await scrollTo(await railTop(2), 1200); await wait(1000);
await scrollTo(0, 1400); await wait(800);

// Detail: open, turn it in 3D, step through, pick a size, add to bag.
mark("detail");
await openRail(0);
await spinDetail();
await tapEl(".arrow.right"); await wait(1000);
await tapEl(".arrow.right"); await wait(1000);
await drag([[W - 60, 380], [60, 385]], 450); await wait(1100); // swipe to the next piece
await tapEl(".arrow.left"); await wait(1100);
await tapEl(".sizes button", 2); await wait(600);
mark("add");
await tapEl(".add"); await wait(2000);
await tapEl(".bar button[aria-label=Wishlist]"); await wait(900);
await tapEl(".close"); await wait(1300);

// Women: kurtis, dresses, sarees; add a dress.
mark("women");
await category("women");
await scrollTo(await railTop(1), 1300); await wait(1100);
await openRail(1);
await spinDetail();
await tapEl(".add"); await wait(2000);
await tapEl(".close"); await wait(1100);
await scrollTo(await railTop(3), 1400); await wait(1400);

// Kids.
mark("kids");
await scrollTo(0, 900);
await category("kids");
v = await box(".rail .view", 0);
await drag([[v.x + 300, v.y + 130], [v.x + 150, v.y + 130]], 1000); await wait(1200);

// Accessories on the table: lipstick in detail, into the bag.
mark("accessories");
await category("accessories");
await openRail(0);
await spinDetail();
await tapEl(".arrow.right"); await wait(1000);
await tapEl(".add"); await wait(1800);
await tapEl(".close"); await wait(1100);
await scrollTo(await railTop(2), 1400); await wait(1400);
await scrollTo(0, 1000); await wait(500);

// Bag: rows glide in with turning thumbnails; remove one, place the order.
mark("bag");
await tapEl(".bar .bag"); await wait(2600);
await tapEl(".sheet .remove", 1); await wait(1400);
await tapEl(".sheet .cta"); await wait(2200);
await tapEl(".sheet [aria-label=Back]"); await wait(1000);

// Menu: profile, wishlist, then a category from the drawer.
mark("menu");
await tapEl(".bar button[aria-label=Menu]"); await wait(1300);
await tapEl(".drawer .profile"); await wait(1800);
await tapEl(".sheet [aria-label=Back]"); await wait(900);
await tapEl(".bar button[aria-label=Menu]"); await wait(1000);
await page.locator(".drawer .item", { hasText: "Wishlist" }).click(); await wait(1800);
await tapEl(".sheet [aria-label=Back]"); await wait(900);
await tapEl(".bar button[aria-label=Menu]"); await wait(1000);
await page.locator(".drawer .item", { hasText: "Women" }).click(); await wait(2200);

// Logo: home to the top of Men.
mark("home");
await tapEl(".bar .home"); await wait(3000);
const end = Date.now() / 1000;
await cdp.send("Page.stopScreencast");
await browser.close();

const list = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.t ?? end) - f.t).toFixed(4)}`);
writeFileSync(join(dir, "frames.txt"), `${list.join("\n")}\nfile '${frames.at(-1).file}'\n`);
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(dir, "frames.txt"),
  "-vf", `fps=60,scale=${OUT_W}:${OUT_H}:flags=lanczos,format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-movflags", "+faststart", OUT,
]);
rmSync(dir, { recursive: true, force: true });
const t0 = frames[0].t;
writeFileSync(OUT.replace(/\.mp4$/, ".json"), JSON.stringify(marks.map((m) => ({ label: m.label, t: +(m.t - t0).toFixed(2) })), null, 1));
console.log(`${OUT}: ${(end - frames[0].t).toFixed(1)}s, ${frames.length} frames`);
