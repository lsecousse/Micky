import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const isLocal = (url) => !/^(https?:)?\/\//.test(url);

function localAssetsOf(html) {
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
  const styles  = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m => m[1]);
  return [...scripts, ...styles].filter(isLocal);
}

function shellOf(source) {
  const block = source.match(/const SHELL = \[([\s\S]*?)\];/)[1];
  return [...block.matchAll(/'([^']+)'/g)].map(m => m[1]);
}

describe('service worker shell', () => {
  it('caches every local script and stylesheet index.html loads', () => {
    const assets = localAssetsOf(readFileSync('index.html', 'utf8'));
    const shell  = shellOf(readFileSync('service-worker.js', 'utf8'));

    expect(assets.length).toBeGreaterThan(0);
    expect(assets.map(a => '/' + a).filter(a => !shell.includes(a))).toEqual([]);
  });
});
