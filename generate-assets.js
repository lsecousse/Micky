// Generates the app identity in the Carnet look: icons, favicon, wordmark and splashscreens.
// "M&K" in Newsreader (ink on paper) with a highlighter band behind the bottom of the letters,
// like the `.mark` stroke of the app. Fonts are static Newsreader instances in ./fonts/ (OFL).

const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

// ── Carnet tokens ────────────────────────────────────────
const PAPER = '#EEEDE8';
const INK   = '#1B1C1F';
const HL    = '#FFE45C';

// ── Fonts ────────────────────────────────────────────────
const fontsDir = path.join(__dirname, 'fonts');
registerFont(path.join(fontsDir, 'Newsreader-Display-Bold.ttf'),         { family: 'Newsreader Display', weight: '700', style: 'normal' });
registerFont(path.join(fontsDir, 'Newsreader-Display-MediumItalic.ttf'), { family: 'Newsreader Display', weight: '500', style: 'italic' });

const MONOGRAM = 'M&K';
const SIGNATURE = 'Mike Coach.';
// Highlighter band: from 30 % of the cap height above the baseline to 8 % below it.
const BAND_TOP = 0.30;
const BAND_BOTTOM = 0.08;

const iconsDir  = path.join(__dirname, 'icons');
const splashDir = path.join(iconsDir, 'splash');
fs.mkdirSync(splashDir, { recursive: true });

function monogramFont(px)  { return `normal 700 ${px}px "Newsreader Display"`; }
function signatureFont(px) { return `italic 500 ${px}px "Newsreader Display"`; }

function paperCanvas(w, h) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  return { canvas, ctx };
}

// Width and cap height of the monogram at a given font size.
function measureMonogram(ctx, px) {
  ctx.font = monogramFont(px);
  const m = ctx.measureText(MONOGRAM);
  return { width: m.width, capH: ctx.measureText('M').actualBoundingBoxAscent };
}

// Largest font size whose monogram fits in maxWidth.
function fitMonogram(ctx, maxWidth) {
  const ref = 100;
  return Math.floor(ref * maxWidth / measureMonogram(ctx, ref).width);
}

// Draws the monogram with its caps vertically centred on cy; returns its geometry.
function drawMonogram(ctx, cx, cy, px) {
  const { width, capH } = measureMonogram(ctx, px);
  const baseline = Math.round(cy + capH / 2);
  const pad = capH * 0.08;
  ctx.fillStyle = HL;
  ctx.fillRect(Math.round(cx - width / 2 - pad), Math.round(baseline - capH * BAND_TOP),
    Math.round(width + 2 * pad), Math.round(capH * (BAND_TOP + BAND_BOTTOM)));
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(MONOGRAM, cx, baseline);
  return { width, capH, baseline };
}

function drawSignature(ctx, cx, top, px) {
  ctx.font = signatureFont(px);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(SIGNATURE, cx, top);
}

// Monogram + signature, centred as a block on (cx, cy), monogram width = width.
function drawLockup(ctx, cx, cy, width) {
  const px = fitMonogram(ctx, width);
  const { capH } = measureMonogram(ctx, px);
  const sigPx = Math.round(capH * 0.42);
  const gap = capH * 0.55;
  const blockH = capH + gap + sigPx;
  const m = drawMonogram(ctx, cx, cy - blockH / 2 + capH / 2, px);
  drawSignature(ctx, cx, m.baseline + gap, sigPx);
}

// Maskable icon: full paper square, monogram inside the central safe circle (80 % of the side).
function generateIcon(size) {
  const { canvas, ctx } = paperCanvas(size, size);
  drawMonogram(ctx, size / 2, size / 2, fitMonogram(ctx, size * 0.70));
  return canvas.toBuffer('image/png');
}

function generateFavicon() {
  const size = 64;
  const { canvas, ctx } = paperCanvas(size, size);
  drawMonogram(ctx, size / 2, size / 2, fitMonogram(ctx, size * 0.92));
  return canvas.toBuffer('image/png');
}

// Pre-rendered lockup for #loading-screen (no dependency on web font loading).
function generateWordmark() {
  const W = 1200, H = 800;
  const { canvas, ctx } = paperCanvas(W, H);
  drawLockup(ctx, W / 2, H / 2, W * 0.62);
  return canvas.toBuffer('image/png');
}

function generateSplash(w, h) {
  const { canvas, ctx } = paperCanvas(w, h);
  drawLockup(ctx, w / 2, h / 2, Math.min(w, h) * 0.46);
  return canvas.toBuffer('image/png');
}

function write(relPath, buffer) {
  fs.writeFileSync(path.join(__dirname, relPath), buffer);
  console.log(`✓ ${relPath}`);
}

const SPLASHES = [
  [1320, 2868], [1206, 2622], [1290, 2796], [1170, 2532], [1179, 2556],
  [1125, 2436], [1242, 2688], [828, 1792], [750, 1334], [640, 1136],
  [2048, 2732], [1668, 2388], [1640, 2360], [1488, 2266], [1536, 2048],
];

for (const size of [192, 512]) write(`icons/icon-${size}.png`, generateIcon(size));
write('icons/favicon.png', generateFavicon());
write('icons/wordmark.png', generateWordmark());
for (const [w, h] of SPLASHES) write(`icons/splash/splash-${w}x${h}.png`, generateSplash(w, h));
