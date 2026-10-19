import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadImage, createCanvas } = require('canvas');

const root = new URL('../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');
const pathOf = (file) => fileURLToPath(new URL(file, root));

const PAPER = '#EEEDE8';
const CARNET_HEX = ['#EEEDE8', '#1B1C1F', '#FFE45C'];
const DIRECTION_A_HEX = ['#0A0A0A', '#F5F4F0', '#84CC16', '#888888'];

async function imageOf(file) {
  return loadImage(pathOf(file));
}

// Hex colour of the top-left pixel.
async function cornerHex(file) {
  const img = await imageOf(file);
  const ctx = createCanvas(img.width, img.height).getContext('2d');
  ctx.drawImage(img, 0, 0);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('');
}

describe('pwaIdentityShould', () => {
  it('manifest uses the paper colour for theme and background', () => {
    const manifest = JSON.parse(read('manifest.json'));
    expect([manifest.theme_color, manifest.background_color]).toEqual([PAPER, PAPER]);
  });

  it('generator declares the Carnet paper, ink and highlighter hex', () => {
    const src = read('generate-assets.js').toUpperCase();
    expect(CARNET_HEX.filter((hex) => !src.includes(hex))).toEqual([]);
  });

  it('generator has no Direction A hex nor Fraunces', () => {
    const src = read('generate-assets.js');
    const leftovers = [...DIRECTION_A_HEX, 'Fraunces'].filter((s) => src.toUpperCase().includes(s.toUpperCase()));
    expect(leftovers).toEqual([]);
  });

  it.each([192, 512])('icon %i has the right size', async (size) => {
    const img = await imageOf(`icons/icon-${size}.png`);
    expect([img.width, img.height]).toEqual([size, size]);
  });

  it.each([192, 512])('icon %i corner is paper', async (size) => {
    expect(await cornerHex(`icons/icon-${size}.png`)).toBe(PAPER);
  });

  it('splash corner is paper', async () => {
    expect(await cornerHex('icons/splash/splash-1170x2532.png')).toBe(PAPER);
  });
});
