import test from 'node:test';
import assert from 'node:assert/strict';
import { MazeEnv, DX, DY } from '../public/js/core/env.js';
import { Rng } from '../public/js/core/rng.js';
import { mk, OPEN, NOVICE } from './helpers.js';

const UP = 0, DOWN = 1, LEFT = 2, RIGHT = 3;
const run = (env, acts) => acts.map((a) => env.step(a));

test('非法地图直接抛错并说明原因', () => {
  assert.throws(() => new MazeEnv(mk(['S.....', '......', '..T...', '......', '......'])), /出口/);
});

test('状态编码：encode / decode 互逆，且覆盖 [0, numStates) 无重复', () => {
  for (const rows of [OPEN, NOVICE.rows, ['S.TTT.', '..T...', '......', '......', '.....E'].map((r, i) => (i === 0 ? 'S.T.T.' : r))]) {
    const env = new MazeEnv(mk(rows));
    const seen = new Set();
    for (let y = 0; y < env.H; y++) {
      for (let x = 0; x < env.W; x++) {
        for (let m = 0; m <= env.fullMask; m++) {
          const s = env.encode(x, y, m);
          assert.ok(s >= 0 && s < env.numStates);
          assert.deepEqual(env.decode(s), { x, y, mask: m });
          seen.add(s);
        }
      }
    }
    assert.equal(seen.size, env.numStates);
  }
});

test('状态数 = 宽 × 高 × 2^宝箱数；最大 16×10×8 = 1280', () => {
  assert.equal(new MazeEnv(mk(OPEN)).numStates, 6 * 5 * 2);
  const big = Array.from({ length: 10 }, (_, y) => '.'.repeat(16));
  big[0] = 'S.T..T..T' + '.'.repeat(7);
  big[9] = '.'.repeat(15) + 'E';
  assert.equal(new MazeEnv(mk(big)).numStates, 1280);
});

test('同一格、不同收集情况是不同状态', () => {
  const env = new MazeEnv(mk(OPEN));
  assert.notEqual(env.encode(2, 2, 0), env.encode(2, 2, 1));
});

test('拿宝箱：+10 并记入掩码，之后再踩不重复得分', () => {
  const env = new MazeEnv(mk(OPEN));
  env.reset();
  const r = run(env, [DOWN, DOWN, RIGHT, RIGHT]);
  assert.equal(r[3].event, 'treasure');
  assert.ok(Math.abs(r[3].reward - 9.9) < 1e-9);
  assert.equal(r[3].mask, 1);
  assert.equal(r[3].done, false);
  const [away, back] = run(env, [RIGHT, LEFT]);
  assert.ok(Math.abs(away.reward + 0.1) < 1e-9);
  assert.ok(Math.abs(back.reward + 0.1) < 1e-9);
  assert.equal(back.event, null);
  assert.equal(back.state, env.encode(2, 2, 1));
});

test('撞墙原地不动但照常扣步数惩罚；越界同理', () => {
  const env = new MazeEnv(mk(['S#....', '......', '..T...', '......', '.....E']));
  env.reset();
  const [a, b] = run(env, [RIGHT, UP]);
  assert.deepEqual([a.x, a.y, b.x, b.y], [0, 0, 0, 0]);
  assert.ok(Math.abs(a.reward + 0.1) < 1e-9);
});

test('出口：+10 并结束；陷阱：−10 并结束', () => {
  const env = new MazeEnv(mk(['S.....', '......', '..T...', '...X..', '....XE']));
  env.reset();
  run(env, [DOWN, DOWN, DOWN]); // (0,3)
  const t = run(env, [RIGHT, RIGHT, RIGHT]).pop(); // 踩到 (3,3) 的陷阱
  assert.equal(t.event, 'trap');
  assert.equal(t.done, true);
  assert.ok(Math.abs(t.reward + 10.1) < 1e-9);

  env.reset();
  const e = run(env, [RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, DOWN, DOWN, DOWN, DOWN]).pop();
  assert.equal(e.event, 'exit');
  assert.equal(e.done, true);
  assert.ok(Math.abs(e.reward - 9.9) < 1e-9);
});

test('"出口需集齐宝箱"：未集齐时出口是普通地板', () => {
  const env = new MazeEnv(mk(OPEN, { exitRequiresAllTreasures: true }));
  env.reset();
  run(env, [RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, DOWN, DOWN, DOWN]);
  const onExit = env.step(DOWN);
  assert.equal(onExit.done, false);
  assert.equal(onExit.event, null);
  env.reset();
  const seq = [DOWN, DOWN, RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, DOWN, DOWN];
  const last = run(env, seq).pop();
  assert.equal(last.event, 'exit');
});

test('超时：达到最大步数时 truncated=true 而 done=false（不是真终止）', () => {
  const env = new MazeEnv(mk(OPEN, { maxSteps: 5 }));
  env.reset();
  const rs = run(env, [UP, UP, UP, UP, UP]);
  assert.equal(rs[3].truncated, false);
  assert.equal(rs[4].truncated, true);
  assert.equal(rs[4].done, false);
});

test('nextState（模型）与真实 step 的状态一致（无怪物）', () => {
  const env = new MazeEnv(mk(['S.....', '.#T...', '..#...', '...X..', '....XE']));
  const rng = new Rng(9);
  env.reset();
  for (let i = 0; i < 3000; i++) {
    const s = env.state;
    const a = rng.int(4);
    const predicted = env.nextState(s, a);
    const res = env.step(a);
    assert.equal(res.state, predicted);
    if (res.done || res.truncated) env.reset();
  }
});

test('怪物：与怪物同格一定算被抓（−10 并结束）；随机游走中不变量成立', () => {
  const m = mk(['S.....', '......', '..T...', '......', '.....E'], {
    monsters: [{ type: 'patrol', x: 3, y: 3, radius: 3 }, { type: 'guard', x: 4, y: 1 }],
  });
  const env = new MazeEnv(m, { seed: 5 });
  const rng = new Rng(11);
  let caughtCount = 0;
  for (let ep = 0; ep < 300; ep++) {
    env.reset();
    for (;;) {
      const res = env.step(rng.int(4));
      const overlap = env.monsters.list.some((mm) => mm.x === env.x && mm.y === env.y);
      if (overlap && !res.done) assert.fail('与怪物同格却没有结束');
      if (res.caught) {
        caughtCount++;
        assert.equal(res.event, 'caught');
        assert.equal(res.done, true);
        assert.ok(res.reward <= -10 + 1e-9);
      }
      if (res.done || res.truncated) break;
    }
  }
  assert.ok(caughtCount > 5, `被抓次数 ${caughtCount}`);
});

test('同种子的环境（含怪物）轨迹完全一致', () => {
  const m = mk(OPEN, { monsters: [{ type: 'patrol', x: 3, y: 3, radius: 3 }] });
  const trace = (seed) => {
    const env = new MazeEnv(m, { seed });
    const rng = new Rng(3);
    const out = [];
    env.reset();
    for (let i = 0; i < 200; i++) {
      const r = env.step(rng.int(4));
      out.push([r.state, r.reward, ...env.monsters.list.map((mm) => mm.x * 10 + mm.y)].join());
      if (r.done || r.truncated) env.reset();
    }
    return out.join('|');
  };
  assert.equal(trace(1), trace(1));
  assert.notEqual(trace(1), trace(2));
});

test('方向向量与动作编号一致：上下左右', () => {
  assert.deepEqual([...DX], [0, 0, -1, 1]);
  assert.deepEqual([...DY], [-1, 1, 0, 0]);
});
