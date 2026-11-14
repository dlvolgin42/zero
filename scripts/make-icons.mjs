// Renders the "O" mark (two halves of a ring) into the PNG icons the browsers need.
// Run: node scripts/make-icons.mjs [dark|light]
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const variant = process.argv[2] === "light" ? "light" : "dark";
const colors = variant === "light"
  ? { bg: "#f6f6f8", left: "#a5b4fc", right: "#111827" }
  : { bg: "#111827", left: "#a5b4fc", right: "#ffffff" };

// 100x100 canvas, mark centred; the ring's outer edge stays within the central 60%,
// well inside the 80% circle that Android may leave visible.
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${colors.bg}"/>
  <path d="M46.2 26.3A24 24 0 0 0 46.2 73.7" fill="none" stroke="${colors.left}" stroke-width="12" stroke-linecap="round"/>
  <path d="M53.8 26.3A24 24 0 0 1 53.8 73.7" fill="none" stroke="${colors.right}" stroke-width="12" stroke-linecap="round"/>
</svg>`;

const out = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/icon-maskable-512.png", 512], // same artwork: it already sits inside the safe zone
  ["app/apple-icon.png", 180], // iOS rounds the corners itself, so the square must be opaque
];
mkdirSync("public/icons", { recursive: true });
for (const [file, size] of out) {
  await sharp(Buffer.from(svg(1024)), { density: 72 }).resize(size, size).flatten({ background: colors.bg }).png().toFile(file);
  console.log("wrote", file, size);
}
