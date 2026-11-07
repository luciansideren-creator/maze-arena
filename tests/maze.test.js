import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMaze, normalizeMaze, scanMaze, parseMazeJSON, serializeMaze, patrolTerritory, guardRing } from '../public/js/core/maze.js';
import { NOVICE, mk, OPEN } from './helpers.js';

const codes = (v) => v.errors.map((e) => e.code);

test('预设地图和基础地图合法', () => {
  assert.equal(validateMaze(NOVICE).ok, true);
  assert.equal(validateMaze(mk(OPEN)).ok, true);
});

test('序列化往返不变', () => {
  const m = normalizeMaze(NOVICE);
  assert.deepEqual(parseMazeJSON(serializeMaze(m)), m);
});

test('尺寸越界、行长不一致', () => {
  assert.ok(codes(validateMaze({ rows: ['S.E'] })).includes('size'));
  const bad = mk(OPEN); bad.rows = [...OPEN]; bad.rows[1] = '.....';
  assert.ok(codes(validateMaze(bad)).includes('shape'));
});

test('起点、出口数量必须恰好为 1；未知字符', () => {
  assert.ok(codes(validateMaze(mk(['......', '......', '......', '......', '.....E']))).includes('start_count'));
  assert.ok(codes(validateMaze(mk(['S.....', '......', '......', '......', '.....E'].map((r, i) => (i === 1 ? 'S.....' : r))))).includes('start_count'));
  assert.ok(codes(validateMaze(mk(['S.....', '......', '......', '......', '......']))).includes('exit_count'));
  assert.ok(codes(validateMaze(mk(['S.....', '..?...', '......', '......', '.....E']))).includes('unknown_char'));
});

test('宝箱不能超过 3 个，怪物不能超过 3 只', () => {
  const four = mk(['S.TTT.', '..T...', '......', '......', '.....E']);
  assert.ok(codes(validateMaze(four)).includes('treasure_count'));
  const mons = mk(['S.....', '......', '......', '......', '.....E'], {
    monsters: [0, 1, 2, 3].map((i) => ({ type: 'patrol', x: 3 + (i % 3), y: 2 + (i > 2 ? 1 : 0), radius: 2 })),
  });
  assert.ok(codes(validateMaze(mons)).includes('monster_count'));
});

test('防封死：起点被围死 → 出口和宝箱都不可达', () => {
  const m = mk(['S#....', '##....', '..T...', '......', '.....E']);
  const v = validateMaze(m);
  assert.equal(v.ok, false);
  assert.ok(codes(v).includes('unreachable_exit'));
  assert.ok(codes(v).includes('unreachable_treasure'));
});

test('防封死：宝箱被墙围住，提示编号并给出格子', () => {
  const m = mk(['S.....', '.###..', '.#T#..', '.###..', '.....E']);
  const v = validateMaze(m);
  const e = v.errors.find((x) => x.code === 'unreachable_treasure');
  assert.ok(e);
  assert.match(e.message, /宝箱①/);
  assert.deepEqual(e.cells, [{ x: 2, y: 2 }]);
});

test('防封死：出口被陷阱围住（陷阱不可通行）', () => {
  const m = mk(['S.....', '......', '......', '....XX', '....XE']);
  assert.ok(codes(validateMaze(m)).includes('unreachable_exit'));
});

test('防封死：宝箱只能穿过出口才能到 → 不可达（出口踩上即结束）', () => {
  const m = mk(['SE.T..', '##....', '......', '......', '......']);
  assert.ok(codes(validateMaze(m)).includes('unreachable_treasure'));
  // 选"出口需集齐宝箱"后，出口在集齐前是地板，可以穿过
  assert.equal(validateMaze({ ...m, exitRequiresAllTreasures: true }).ok, true);
});

test('警告：无宝箱，但仍可保存', () => {
  const noChest = validateMaze(mk(['S.....', '......', '..#...', '.#.#..', '.....E']));
  assert.equal(noChest.ok, true);
  assert.ok(noChest.warnings.some((w) => w.code === 'no_treasure'));
});

test('被墙围死的空地只给警告，不算错误', () => {
  const m = mk(['S.....', '.###..', '.#.#T.', '.###..', '.....E']);
  const v = validateMaze(m);
  assert.equal(v.ok, true);
  const w = v.warnings.find((x) => x.code === 'unreachable_floor');
  assert.ok(w);
  assert.deepEqual(w.cells, [{ x: 2, y: 2 }]);
});

test('rows 里的 P/G 会转成怪物条目，格子变地板', () => {
  const m = normalizeMaze(mk(['S.....', '......', '..T...', '......', '..P..E']));
  assert.equal(m.monsters.length, 1);
  assert.deepEqual([m.monsters[0].type, m.monsters[0].x, m.monsters[0].y, m.monsters[0].radius], ['patrol', 2, 4, 3]);
  assert.equal(m.rows[4][2], '.');
});

test('怪物摆放：离起点太近、地盘太小、守卫无宝箱', () => {
  const base = ['S.....', '......', '..T...', '......', '.....E'];
  const near = mk(base, { monsters: [{ type: 'patrol', x: 1, y: 0, radius: 3 }] });
  assert.ok(codes(validateMaze(near)).includes('monster_near_start'));

  // (0,4) 被墙堵住，只有自己一格可站（地盘 < 3）
  const tiny = mk(['S.....', '......', '..T...', '#.....', '.#...E'], {
    monsters: [{ type: 'patrol', x: 0, y: 4, radius: 3 }],
  });
  assert.ok(codes(validateMaze(tiny)).includes('monster_territory'));

  const noChest = mk(['S.....', '......', '......', '......', '.....E'], { monsters: [{ type: 'guard', x: 3, y: 2 }] });
  assert.ok(codes(validateMaze(noChest)).includes('guard_no_treasure'));
});

test('守卫环太小：宝箱周围只有 1 个能站的格子', () => {
  const m = mk(['S...##', '.....T', '....##', '......', '.....E'], {
    monsters: [{ type: 'guard', x: 2, y: 2 }],
  });
  assert.deepEqual(codes(validateMaze(m)), ['guard_ring']);
});

test('守卫出生点被围死，走不到守卫环', () => {
  const m = mk(['S...#.', '....##', '..T...', '......', '.....E'], {
    monsters: [{ type: 'guard', x: 5, y: 0 }],
  });
  assert.deepEqual(codes(validateMaze(m)), ['guard_unreachable']);
});

test('怪物不能放在墙、陷阱、宝箱、出口、起点上', () => {
  const rows = ['S#X...', '......', '..T...', '......', '.....E'];
  for (const [x, y] of [[1, 0], [2, 0], [2, 2], [5, 4], [0, 0]]) {
    const v = validateMaze(mk(rows, { monsters: [{ type: 'patrol', x, y, radius: 3 }] }));
    assert.ok(codes(v).includes('monster_spawn'), `(${x},${y})`);
  }
});

test('巡逻半径必须 2–4', () => {
  const v = validateMaze(mk(OPEN, { monsters: [{ type: 'patrol', x: 4, y: 2, radius: 5 }] }));
  assert.ok(codes(v).includes('monster_radius'));
});

test('地盘与守卫环计算', () => {
  const m = normalizeMaze(mk(OPEN, { monsters: [{ type: 'patrol', x: 4, y: 3, radius: 2 }] }));
  const t = patrolTerritory(m, m.monsters[0]);
  assert.ok(t.has(3 * 6 + 4)); // 出生点自己
  for (const idx of t) {
    const x = idx % 6; const y = (idx - x) / 6;
    assert.ok(Math.abs(x - 4) + Math.abs(y - 3) <= 2);
  }
  const ring = guardRing(m, scanMaze(m).treasures[0]);
  assert.equal(ring.size, 8);
});
