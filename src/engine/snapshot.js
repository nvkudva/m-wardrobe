// Pictures taken off the WebGL canvas for DOM effects (add to bag).

// A new canvas of size w × h holding region (x, y, sw, sh) of src.
export function copy(src, x, y, sw, sh, w = sw, h = sh, opts) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  c.getContext("2d", opts).drawImage(src, x, y, sw, sh, 0, 0, w, h);
  return c;
}

// Crops what the renderer just drew in region src (CSS px) to its opaque
// bounds. Returns the crop canvas, its CSS rect and a small PNG thumbnail.
export function take(renderer, src) {
  const pr = renderer.getPixelRatio(), sw = Math.round(src.w * pr), sh = Math.round(src.h * pr);
  const c = copy(renderer.domElement, src.x * pr, src.y * pr, sw, sh, sw, sh, { willReadFrequently: true });
  const cx = c.getContext("2d"), img = cx.getImageData(0, 0, sw, sh), a = img.data;
  // The cloth renders with soft alpha: make it solid so folds don't see
  // through, drop the faint floor shadow, and find the opaque bounds.
  let x0 = sw, y0 = sh, x1 = 0, y1 = 0;
  for (let y = 0, i = 3; y < sh; y++) for (let x = 0; x < sw; x++, i += 4) {
    if (a[i] < 70) { a[i] = 0; continue; }
    a[i] = 255;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  cx.putImageData(img, 0, 0);
  if (x1 <= x0) { x0 = 0; y0 = 0; x1 = sw - 1; y1 = sh - 1; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, out = copy(c, x0, y0, w, h), k = Math.min(1, 160 / Math.max(w, h));
  const thumb = copy(out, 0, 0, w, h, Math.round(w * k), Math.round(h * k)).toDataURL();
  return { canvas: out, x: src.x + x0 / pr, y: src.y + y0 / pr, w: w / pr, h: h / pr, thumb };
}
