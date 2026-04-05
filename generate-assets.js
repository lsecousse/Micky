const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const GOLD   = '#9A7A30';
const WHITE  = '#F0F0F0';
const BG_ICON = '#131313';
const BG_SPLASH = '#131313';

// ── Directories ──────────────────────────────────────────
const iconsDir = path.join(__dirname, 'icons');
const splashDir = path.join(iconsDir, 'splash');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);
if (!fs.existsSync(splashDir)) fs.mkdirSync(splashDir, { recursive: true });

// ── Generate icon depuis logo.jpg ─────────────────────────
async function generateIcon(size, logo) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = BG_ICON;
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(logo, 0, 0, size, size);
  return canvas.toBuffer('image/png');
}

// ── Generate splash ───────────────────────────────────────
function generateSplash(w, h) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BG_SPLASH;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const logoSize = Math.min(w, h) * 0.55;
  const cy = h * 0.46;

  drawMK(ctx, cx, cy, logoSize);

  // "Coach Mike"
  ctx.fillStyle = WHITE;
  ctx.font = `bold ${Math.round(Math.min(w, h) * 0.055)}px "Arial", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Coach Mike', cx, cy + logoSize * 0.46);

  // sous-titre
  ctx.fillStyle = '#666';
  ctx.font = `${Math.round(Math.min(w, h) * 0.030)}px "Arial", sans-serif`;
  ctx.fillText('Suivi d\'entraînement', cx, cy + logoSize * 0.46 + Math.min(w, h) * 0.072);

  return canvas.toBuffer('image/png');
}

// ── Icons ─────────────────────────────────────────────────
(async () => {
  const logo = await loadImage(path.join(iconsDir, 'logo.jpg'));
  for (const size of [192, 512]) {
    const dest = path.join(iconsDir, `icon-${size}.png`);
    fs.writeFileSync(dest, await generateIcon(size, logo));
    console.log(`✓ icons/icon-${size}.png`);
  }
})();

// ── Splash screens (ne pas régénérer — déjà en place) ─────
/*
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
*/
