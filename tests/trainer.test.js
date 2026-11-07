import test from 'node:test';
import assert from 'node:assert/strict';
import { Trainer } from '../public/js/core/trainer.js';
import { NOVICE, mk, OPEN } from './helpers.js';

const withMonster = mk(OPEN, { monsters: [{ type: 'patrol', x: 3, y: 3, radius: 3 }] });

function snapshot(t) {
  const table = t.algo.q ?? t.algo.h ?? t.algo.m;
  return { returns: t.returns.join(','), table: Array.from(table).join(',') };
}

for (const type of ['q-learning', 'sarsa', 'expected-sarsa', 'monte-carlo', 'actor-critic', 'sr']) {
  test(`同种子可复现：${type}（含怪物环境）训练 150 回合后回报和表完全一致`, () => {
    const run = (seed) => {
      const t = new Trainer({ maze: withMonster, algorithm: type, seed });
      t.runEpisodes(150);
      return t;
    };
    const a = run(7);
    const b = run(7);
    const c = run(8);
    assert.deepEqual(snapshot(a), snapshot(b));
    assert.notDeepEqual(snapshot(a).returns, snapshot(c).returns);
    assert.deepEqual(a.evaluate().route, b.evaluate().route);
  });
}

test('逐步 step() 与 runEpisode() 结果一致', () => {
  const a = new Trainer({ maze: NOVICE, seed: 3 });
  const b = new Trainer({ maze: NOVICE, seed: 3 });
  for (let i = 0; i < 20; i++) a.runEpisode();
  let ended = 0;
  while (ended < 20) if (b.step().episodeEnded) ended++;
  assert.deepEqual(a.returns, b.returns);
  assert.deepEqual(Array.from(a.algo.q), Array.from(b.algo.q));
});

test('回合记录：回报、步数、结局、最近轨迹', () => {
  const t = new Trainer({ maze: NOVICE, seed: 1 });
  t.runEpisodes(30);
  assert.equal(t.episodes, 30);
  assert.equal(t.lengths.length, 30);
  assert.ok(t.outcomes.every((o) => ['exit', 'trap', 'caught', 'timeout'].includes(o)));
  assert.deepEqual(t.lastPath[0], { x: 0, y: 2, mask: 0 });
  assert.ok(t.lastPath.length >= 2);
});

test('runEpisodes 可被 shouldStop 打断（用于时间预算和中断）', () => {
  const t = new Trainer({ maze: NOVICE, seed: 1 });
  let calls = 0;
  const done = t.runEpisodes(1000, () => ++calls > 5);
  assert.equal(done, 5);
  assert.equal(t.episodes, 5);
});

test('评估：无怪物 1 回合（确定），有怪物 20 回合；评估不改变训练状态', () => {
  const t = new Trainer({ maze: NOVICE, seed: 1 });
  t.runEpisodes(200);
  const before = snapshot(t);
  const e1 = t.evaluate();
  const e2 = t.evaluate();
  assert.deepEqual(e1, e2);
  assert.deepEqual(snapshot(t), before);
  const tm = new Trainer({ maze: withMonster, seed: 1 });
  tm.runEpisodes(50);
  const em = tm.evaluate();
  assert.ok(em.successRate >= 0 && em.successRate <= 1);
  assert.deepEqual(em, tm.evaluate());
});

test('超时回合：timeout 结局，学习时按"未终止"处理（仍可估值）', () => {
  const t = new Trainer({ maze: mk(OPEN, { maxSteps: 3 }), seed: 1 });
  t.runEpisodes(5);
  assert.ok(t.lengths.every((n) => n <= 3));
});

test('finishEpisode 把进行中的回合跑完并记录', () => {
  const t = new Trainer({ maze: NOVICE, algorithm: 'monte-carlo', seed: 2 });
  t.beginEpisode();
  t.step();
  t.step();
  assert.equal(t.active, true);
  t.finishEpisode();
  assert.equal(t.active, false);
  assert.equal(t.episodes, 1);
  assert.equal(t.algo.trajectory.length, 0);
});
