// Génère icônes + splashscreens Direction A
// Monogramme MK avec '&' acid mega italique entre les deux lettres.
// Fraunces Black (TTF local dans ./fonts/).

const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

// ── Tokens Direction A ───────────────────────────────────
const INK   = '#0A0A0A';
const PAPER = '#F5F4F0';
const ACID  = '#84CC16';
const MUTED = '#888888';

// ── Fonts (Fraunces Black + Fraunces Black Italic) ───────
const fontsDir = path.join(__dirname, 'fonts');
registerFont(path.join(fontsDir, 'Fraunces-Black.ttf'),        { family: 'Fraunces',    weight: '900', style: 'normal' });
registerFont(path.join(fontsDir, 'Fraunces-Black-Italic.ttf'), { family: 'Fraunces',    weight: '900', style: 'italic' });

const iconsDir  = path.join(__dirname, 'icons');
const splashDir = path.join(iconsDir, 'splash');
if (!fs.existsSync(iconsDir))  fs.mkdirSync(iconsDir);
if (!fs.existsSync(splashDir)) fs.mkdirSync(splashDir, { recursive: true });

// ── Mesure d'un texte avec une police donnée ──────────────
function setFont(ctx, sizePx, style = 'normal') {
  ctx.font = `${style} 900 ${sizePx}px "Fraunces"`;
}

// ── Compose le monogramme M & K ──────────────────────────
// Layout : [ M ] [ & ] [ K ]  avec & en italique acid, M+K paper.
// Le tout AUTO-FIT dans (maxWidth, maxHeight) pour ne jamais déborder.
function drawMonogram(ctx, cx, cy, maxHeight, maxWidth) {
  // Tailles initiales (recalculées si overflow horizontal)
  let letterPx = Math.round(maxHeight);
  const compose = (lp) => {
    const ampPx = Math.round(lp * 0.95);
    const gap   = Math.round(lp * 0.04);
    setFont(ctx, lp, 'normal');
    const wM = ctx.measureText('M').width;
    const wK = ctx.measureText('K').width;
    setFont(ctx, ampPx, 'italic');
    const wAmp = ctx.measureText('&').width;
    const total = wM + gap + wAmp + gap + wK;
    return { ampPx, gap, wM, wK, wAmp, total, letterPx: lp };
  };
  let m = compose(letterPx);
  if (m.total > maxWidth) {
    letterPx = Math.floor(letterPx * (maxWidth / m.total));
    m = compose(letterPx);
  }

  // Centre vertical : utilise la metric textBaseline=alphabetic et compense
  // (Fraunces Black a un ascender généreux, on positionne baseline à cy + 0.30·h)
  const baseline = cy + m.letterPx * 0.32;

  let x = cx - m.total / 2;

  // M paper
  ctx.fillStyle = PAPER;
  setFont(ctx, m.letterPx, 'normal');
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText('M', x, baseline);
  x += m.wM + m.gap;

  // & acid italique
  ctx.fillStyle = ACID;
  setFont(ctx, m.ampPx, 'italic');
  ctx.fillText('&', x, baseline);
  x += m.wAmp + m.gap;

  // K paper
  ctx.fillStyle = PAPER;
  setFont(ctx, m.letterPx, 'normal');
  ctx.fillText('K', x, baseline);

  return { totalWidth: m.total, letterPx: m.letterPx, baseline };
}

// ── Accent-line acid ─────────────────────────────────────
function drawAccentLine(ctx, cx, cy, refDim, scale = 1) {
  const w = Math.round(refDim * 0.12 * scale);
  const h = Math.max(2, Math.round(refDim * 0.008 * scale));
  ctx.fillStyle = ACID;
  ctx.fillRect(Math.round(cx - w / 2), Math.round(cy), w, h);
}

// ── Generate app icon (carré) ─────────────────────────────
function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, size, size);

  // Monogramme — fit dans 72% de la largeur, hauteur 30% du côté
  const monoH = size * 0.30;
  const m = drawMonogram(ctx, size / 2, size * 0.46, monoH, size * 0.78);

  // Accent-line acid sous le monogramme
  drawAccentLine(ctx, size / 2, m.baseline + size * 0.10, size, 1);

  return canvas.toBuffer('image/png');
}

// ── Generate splash (portrait/paysage) ────────────────────
// Layout : monogramme MK centré + accent-line + "Mike Coach." en eyebrow.
function generateSplash(w, h) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.46;
  const minDim = Math.min(w, h);
  const monoH  = minDim * 0.22;

  // Monogramme M & K (fit dans 70% de la largeur)
  const m = drawMonogram(ctx, cx, cy, monoH, w * 0.70);

  // Accent-line sous le monogramme
  drawAccentLine(ctx, cx, m.baseline + minDim * 0.06, minDim, 1);

  // Wordmark "Mike Coach." (Fraunces black italic, paper)
  ctx.fillStyle = PAPER;
  setFont(ctx, Math.round(minDim * 0.048), 'italic');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Mike Coach.', cx, m.baseline + minDim * 0.10);

  return canvas.toBuffer('image/png');
}

// ── Generate wordmark (monogramme + accent-line + "Mike Coach.") ──
// Asset large utilisé par #loading-screen (HTML splash) et tout endroit
// où la police Fraunces n'est pas garantie chargée.
function generateWordmark() {
  const W = 1200;
  const H = 800;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H * 0.45;

  // Monogramme M & K — large
  const m = drawMonogram(ctx, cx, cy, H * 0.45, W * 0.70);

  // Accent-line acid
  drawAccentLine(ctx, cx, m.baseline + H * 0.06, Math.min(W, H), 1.2);

  // Wordmark "Mike Coach." Fraunces black italic
  ctx.fillStyle = PAPER;
  setFont(ctx, Math.round(H * 0.10), 'italic');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Mike Coach.', cx, m.baseline + H * 0.12);

  return canvas.toBuffer('image/png');
}

// ── Generate favicon (32x32 robuste) ──────────────────────
function generateFavicon() {
  const size = 64;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, size, size);
  // Pour 32-64px, juste un grand "&" acid centré (lisible).
  ctx.fillStyle = ACID;
  setFont(ctx, Math.round(size * 0.85), 'italic');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('&', size / 2, size / 2 + size * 0.05);
  return canvas.toBuffer('image/png');
}

// ── Build ─────────────────────────────────────────────────
(() => {
  // Icons app (manifest PWA)
  for (const size of [192, 512]) {
    fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), generateIcon(size));
    console.log(`✓ icons/icon-${size}.png`);
  }

  // Favicon
  fs.writeFileSync(path.join(iconsDir, 'favicon.png'), generateFavicon());
  console.log('✓ icons/favicon.png');

  // Wordmark (loading screen HTML)
  fs.writeFileSync(path.join(iconsDir, 'wordmark.png'), generateWordmark());
  console.log('✓ icons/wordmark.png');

  // Splashscreens iOS
  const splashes = [
    [1320, 2868], [1206, 2622], [1290, 2796], [1170, 2532], [1179, 2556],
    [1125, 2436], [1242, 2688], [828, 1792], [750, 1334], [640, 1136],
    [2048, 2732], [1668, 2388], [1640, 2360], [1488, 2266], [1536, 2048],
  ];
  splashes.forEach(([w, h]) => {
    const dest = path.join(splashDir, `splash-${w}x${h}.png`);
    fs.writeFileSync(dest, generateSplash(w, h));
    console.log(`✓ icons/splash/splash-${w}x${h}.png`);
  });
})();
