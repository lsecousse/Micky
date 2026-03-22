const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const ACCENT = '#FF6B00';
const BG_ICON = '#1a1a1a';
const BG_SPLASH = '#0f0f0f';

// ── Directories ──────────────────────────────────────────
const iconsDir = path.join(__dirname, 'icons');
const splashDir = path.join(iconsDir, 'splash');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);
if (!fs.existsSync(splashDir)) fs.mkdirSync(splashDir, { recursive: true });

// ── Draw barbell ─────────────────────────────────────────
function drawBarbell(ctx, cx, cy, size) {
  const barW = size * 0.72;
  const barH = size * 0.09;
  const plateW = size * 0.13;
  const plateH = size * 0.42;
  const collarW = size * 0.06;
  const collarH = size * 0.30;

  ctx.fillStyle = ACCENT;

  // Center bar
  ctx.fillRect(cx - barW / 2, cy - barH / 2, barW, barH);

  // Left plate
  ctx.fillRect(cx - barW / 2, cy - plateH / 2, plateW, plateH);
  // Left collar
  ctx.fillRect(cx - barW / 2 + plateW, cy - collarH / 2, collarW, collarH);

  // Right plate
  ctx.fillRect(cx + barW / 2 - plateW, cy - plateH / 2, plateW, plateH);
  // Right collar
  ctx.fillRect(cx + barW / 2 - plateW - collarW, cy - collarH / 2, collarW, collarH);
}

// ── Generate icon ─────────────────────────────────────────
function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG_ICON;
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const barbellSize = size * 0.60;
  const barbellY = size * 0.44;

  drawBarbell(ctx, cx, barbellY, barbellSize);

  // "GT" text below
  ctx.fillStyle = ACCENT;
  ctx.font = `bold ${Math.round(size * 0.20)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('GT', cx, barbellY + barbellSize * 0.26);

  return canvas.toBuffer('image/png');
}

// ── Generate splash ───────────────────────────────────────
function generateSplash(w, h) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BG_SPLASH;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const barbellSize = Math.min(w, h) * 0.40;
  const cy = h * 0.44;

  drawBarbell(ctx, cx, cy, barbellSize);

  // "Gym Tracker"
  ctx.fillStyle = ACCENT;
  ctx.font = `bold ${Math.round(Math.min(w, h) * 0.065)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Gym Tracker', cx, cy + barbellSize * 0.36);

  // "Coach Mike"
  ctx.fillStyle = '#888';
  ctx.font = `${Math.round(Math.min(w, h) * 0.035)}px "Courier New", monospace`;
  ctx.fillText('Coach Mike', cx, cy + barbellSize * 0.36 + Math.min(w, h) * 0.082);

  return canvas.toBuffer('image/png');
}

// ── Icons ─────────────────────────────────────────────────
[192, 512].forEach(size => {
  const dest = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(dest, generateIcon(size));
  console.log(`✓ icons/icon-${size}.png`);
});

// ── Splash screens ────────────────────────────────────────
const splashes = [
  // iPhone 16 Pro Max
  [1320, 2868],
  // iPhone 16 Pro
  [1206, 2622],
  // iPhone 16 Plus / 15 Plus / 14 Plus / 14 Pro Max / 15 Pro Max / 16 Plus
  [1290, 2796],
  // iPhone 16 / 15 / 14
  [1170, 2532],
  // iPhone 15 Pro / 14 Pro
  [1179, 2556],
  // iPhone 13 mini / 12 mini
  [1125, 2436],
  // iPhone 11 Pro Max / XS Max
  [1242, 2688],
  // iPhone 11 / XR
  [828,  1792],
  // iPhone SE 3rd / 8 / 7 / 6s
  [750,  1334],
  // iPhone SE 1st / 5s
  [640,  1136],
  // iPad Pro 12.9"
  [2048, 2732],
  // iPad Pro 11" / Air 10.9"
  [1668, 2388],
  // iPad 10th gen
  [1640, 2360],
  // iPad mini 6
  [1488, 2266],
  // iPad 9th gen
  [1536, 2048],
];

splashes.forEach(([w, h]) => {
  const dest = path.join(splashDir, `splash-${w}x${h}.png`);
  fs.writeFileSync(dest, generateSplash(w, h));
  console.log(`✓ icons/splash/splash-${w}x${h}.png`);
});
