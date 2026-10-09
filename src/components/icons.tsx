// Line icons used across the app chrome (24×24 viewBox unless noted).

type P = { size?: number };

export const Menu = ({ size = 22 }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size}><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
);

export const Heart = ({ size = 22, filled = false }: P & { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" width={size} height={size}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill={filled ? "#f6763c" : "none"} stroke="currentColor" stroke-width="1.5" /></svg>
);

export const Bag = ({ size = 22 }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size}><path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
);

export const Close = ({ size = 20 }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size}><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
);

export const Arrow = ({ size = 16, dir }: P & { dir: "left" | "right" }) => (
  <svg viewBox="0 0 24 24" width={size} height={size}>
    <path d={dir === "left" ? "M19 12H5m6-6-6 6 6 6" : "M5 12h14m-6-6 6 6-6 6"} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

export const Back = ({ size = 22 }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size}><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
);

// The M mark in the brand's pink-to-orange gradient.
export const Logo = () => (
  <svg class="logo" viewBox="0 0 64 44" width="34" height="24" aria-hidden="true">
    <defs>
      <linearGradient id="lg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#ff3f6c" /><stop offset="1" stop-color="#f9a03f" />
      </linearGradient>
    </defs>
    <path d="M4 40 16 4h8l8 22 8-22h8l12 36h-9L43 18l-7 22h-8l-7-22-8 22z" fill="url(#lg)" />
  </svg>
);
