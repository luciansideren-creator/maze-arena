import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng, deriveSeed } from '../public/js/core/rng.js';

test('同种子产生相同序列，不同种子不同', () => {
  const a = new Rng(42);
  const b = new Rng(42);
  const c = new Rng(43);
  const sa = Array.from({ length: 20 }, () => a.next());
  const sb = Array.from({ length: 20 }, () => b.next());
  const sc = Array.from({ length: 20 }, () => c.next());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
});

test('next 在 [0,1)，int 在 [0,n)，分布大致均匀', () => {
  const r = new Rng(1);
  const buckets = new Array(4).fill(0);
  for (let i = 0; i < 20000; i++) {
    const u = r.next();
    assert.ok(u >= 0 && u < 1);
  }
  for (let i = 0; i < 20000; i++) buckets[r.int(4)]++;
  buckets.forEach((c) => assert.ok(c > 4500 && c < 5500, `桶计数 ${c}`));
});

test('fork 出的生成器独立，且不影响父序列', () => {
  const a = new Rng(7);
  const b = new Rng(7);
  const child = a.fork(1);
  child.next();
  assert.equal(a.next(), b.next());
  assert.notEqual(new Rng(7).fork(1).next(), new Rng(7).fork(2).next());
});

test('deriveSeed 稳定且区分盐值', () => {
  assert.equal(deriveSeed(5, 1), deriveSeed(5, 1));
  assert.notEqual(deriveSeed(5, 1), deriveSeed(5, 2));
  assert.notEqual(deriveSeed(5, 1), deriveSeed(6, 1));
});

test('core/ 不使用 Math.random 和 DOM', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  for (const file of walk('public/js/core').filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/Math\.random|\bdocument\b|\bwindow\b|localStorage/.test(src), `${file} 含禁用 API`);
  }
});
