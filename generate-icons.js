const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, size, size);

  // Rounded rect clip (maskable safe zone)
  const r = size * 0.18;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();

  // Initials "GT"
  ctx.fillStyle = '#FF6200';
  ctx.font = `bold ${Math.round(size * 0.38)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GT', size / 2, size / 2);

  return canvas.toBuffer('image/png');
}

[192, 512].forEach(size => {
  const buffer = generateIcon(size);
  const dest = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(dest, buffer);
  console.log(`✓ icons/icon-${size}.png`);
});
