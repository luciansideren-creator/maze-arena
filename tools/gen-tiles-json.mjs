// 把 0x72 素材包的 tile_list_v1.7（名称 x y 宽 高）转成 public/assets/tiles/tiles.json
// 用法：node tools/gen-tiles-json.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const src = 'assets-src/0x72_DungeonTilesetII_v1.7/tile_list_v1.7';
const out = 'public/assets/tiles/tiles.json';
const tiles = {};
for (const line of readFileSync(src, 'utf8').split(/\r?\n/)) {
  const p = line.trim().split(/\s+/);
  if (p.length !== 5) continue;
  const [name, x, y, w, h] = p;
  tiles[name] = [Number(x), Number(y), Number(w), Number(h)];
}
writeFileSync(out, JSON.stringify(tiles));
console.log(`写入 ${Object.keys(tiles).length} 个图块 → ${out}`);
