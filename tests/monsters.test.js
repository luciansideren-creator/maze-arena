import test from 'node:test';
import assert from 'node:assert/strict';
import { MonsterSystem } from '../public/js/core/monsters.js';
import { normalizeMaze, scanMaze, patrolTerritory, guardRing, isMonsterWalkable } from '../public/js/core/maze.js';
import { Rng } from '../public/js/core/rng.js';
import { mk } from './helpers.js';

const BIG = [
  'S..#....#.....',
  '.#.#.##.#.###.',
  '.#...#T.....#.',
  '.####.#####.#.',
  '......T....#..',
  '.####.###.#...',
  '...#T.....#..E',
];
const bigMaze = (monsters) => normalizeMaze(mk(BIG, { monsters }));

function simulate(maze, steps, seed = 1) {
  const sys = new MonsterSystem(maze, new Rng(seed));
  sys.reset();
  const trace = [sys.positions().map((p) => [p.x, p.y])];
  for (let t = 1; t <= steps; t++) {
    sys.step(t);
    trace.push(sys.positions().map((p) => [p.x, p.y]));
  }
  return { sys, trace };
}

test('不卡墙：巡逻怪和守卫怪连走 2 万步，始终在怪物可走格上，且每步最多移动 1 格', () => {
  const maze = bigMaze([
    { type: 'patrol', x: 4, y: 4, radius: 4 },
    { type: 'patrol', x: 9, y: 2, radius: 3, speed: 'slow' },
    { type: 'guard', x: 10, y: 4 },
  ]);
  const { trace } = simulate(maze, 20000, 7);
  for (let t = 0; t < trace.length; t++) {
    trace[t].forEach(([x, y], i) => {
      assert.ok(isMonsterWalkable(maze, x, y), `t=${t} 怪物${i} 在 (${x},${y}) 不可走`);
      if (t > 0) {
        const [px, py] = trace[t - 1][i];
        assert.ok(Math.abs(x - px) + Math.abs(y - py) <= 1, `t=${t} 怪物${i} 瞬移`);
      }
    });
  }
});

test('巡逻怪只在地盘内活动，并且会真的走动、不总是原地', () => {
  const maze = bigMaze([{ type: 'patrol', x: 4, y: 4, radius: 3 }]);
  const territory = patrolTerritory(maze, maze.monsters[0]);
  const { trace } = simulate(maze, 5000, 3);
  const visited = new Set();
  for (const [[x, y]] of trace) {
    assert.ok(territory.has(y * maze.width + x));
    visited.add(y * maze.width + x);
  }
  assert.ok(visited.size >= Math.min(8, territory.size), `只访问了 ${visited.size} 格`);
});

test('巡逻怪在有其他选择时不立刻走回上一格', () => {
  const maze = normalizeMaze(mk(['S.....', '......', '......', '......', '.....E'], { monsters: [{ type: 'patrol', x: 3, y: 2, radius: 3 }] }));
  const { trace } = simulate(maze, 3000, 5);
  const territory = patrolTerritory(maze, maze.monsters[0]);
  const neighborsInTerritory = (x, y) => [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dx, dy]) => x + dx >= 0 && x + dx < 6 && territory.has((y + dy) * 6 + x + dx)).length;
  for (let t = 2; t < trace.length; t++) {
    const [x, y] = trace[t][0];
    const [px, py] = trace[t - 1][0];
    const [ppx, ppy] = trace[t - 2][0];
    if (x === ppx && y === ppy && (px !== x || py !== y)) {
      assert.ok(neighborsInTerritory(px, py) <= 1, '有其他选择时却立刻折返');
    }
  }
});

test('守卫怪：走到宝箱旁的守卫环上，之后绝不离开环', () => {
  const maze = bigMaze([{ type: 'guard', x: 10, y: 4 }]);
  const ring = guardRing(maze, scanMaze(maze).treasures[1]); // 宝箱 (6,4)
  const { trace } = simulate(maze, 3000, 2);
  const idx = ([x, y]) => y * maze.width + x;
  const firstOn = trace.findIndex((p) => ring.has(idx(p[0])));
  assert.ok(firstOn >= 0 && firstOn < 20, `用了 ${firstOn} 步才到环上`);
  for (let t = firstOn; t < trace.length; t++) assert.ok(ring.has(idx(trace[t][0])), `t=${t} 离开了守卫环`);
});

test('守卫怪：环完整时围着宝箱转，绕遍整个环', () => {
  const maze = normalizeMaze(mk(['S.....', '......', '..T...', '......', '.....E'], { monsters: [{ type: 'guard', x: 5, y: 0 }] }));
  const ring = guardRing(maze, scanMaze(maze).treasures[0]);
  assert.equal(ring.size, 8);
  const { trace } = simulate(maze, 3000, 3);
  const idx = ([x, y]) => y * maze.width + x;
  const firstOn = trace.findIndex((p) => ring.has(idx(p[0])));
  const visited = new Set();
  for (let t = firstOn; t < trace.length; t++) {
    assert.ok(ring.has(idx(trace[t][0])));
    visited.add(idx(trace[t][0]));
  }
  assert.equal(visited.size, 8);
});

test('守卫默认绑定最近的宝箱，也可手动改绑', () => {
  const near = bigMaze([{ type: 'guard', x: 10, y: 4 }]);
  const sysNear = new MonsterSystem(near, new Rng(1));
  assert.equal(sysNear.list[0].treasureIndex, 1);
  const rebound = bigMaze([{ type: 'guard', x: 10, y: 4, treasure: 0 }]);
  assert.equal(new MonsterSystem(rebound, new Rng(1)).list[0].treasureIndex, 0);
});

test('慢速怪每两步才动一次（只在偶数步行动）', () => {
  const maze = bigMaze([{ type: 'patrol', x: 4, y: 4, radius: 3, speed: 'slow' }]);
  const { trace } = simulate(maze, 400, 4);
  for (let t = 1; t < trace.length; t++) {
    if (t % 2 === 1) assert.deepEqual(trace[t][0], trace[t - 1][0], `奇数步 ${t} 不应移动`);
  }
  assert.ok(trace.some((p, t) => t > 0 && (p[0][0] !== trace[t - 1][0][0] || p[0][1] !== trace[t - 1][0][1])));
});

test('reset 让怪物回到出生点', () => {
  const maze = bigMaze([{ type: 'patrol', x: 4, y: 4, radius: 3 }]);
  const { sys } = simulate(maze, 50, 1);
  sys.reset();
  assert.deepEqual([sys.list[0].x, sys.list[0].y], [4, 4]);
});

test('同种子轨迹一致，不同种子不同', () => {
  const maze = bigMaze([{ type: 'patrol', x: 4, y: 4, radius: 4 }]);
  assert.deepEqual(simulate(maze, 500, 9).trace, simulate(maze, 500, 9).trace);
  assert.notDeepEqual(simulate(maze, 500, 9).trace, simulate(maze, 500, 10).trace);
});

test('无路可走时原地不动（地盘只有出生点）', () => {
  // 绕过校验直接构造：出生点四周都是墙
  const maze = normalizeMaze(mk(['S.....', '..#...', '.#P#..', '..#...', '.....E'], { monsters: [{ type: 'patrol', x: 2, y: 2, radius: 3 }] }));
  const { trace } = simulate(maze, 50, 1);
  trace.forEach((p) => assert.deepEqual(p[0], [2, 2]));
});
