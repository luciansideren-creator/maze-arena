import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlgorithm, ALGORITHMS } from '../public/js/core/algorithms/index.js';
import { Rng } from '../public/js/core/rng.js';
import { Trainer } from '../public/js/core/trainer.js';
import { NOVICE } from './helpers.js';

const make = (type, config = {}, numStates = 6) =>
  createAlgorithm(type, { numStates, rng: new Rng(1), config, model: (s) => s });

test('Q-learning 更新：Q ← Q + α(r + γ·maxQ(s′) − Q)', () => {
  const a = make('q-learning');
  a.q[1 * 4 + 2] = 5; // Q(s'=1, a=2) = 5
  a.learn(0, 1, 1, 1, false, -1);
  assert.ok(Math.abs(a.q[0 * 4 + 1] - 0.1 * (1 + 0.9 * 5)) < 1e-12);
  a.q[0 * 4 + 1] = 0;
  a.learn(0, 1, 1, 1, true, -1); // 终止：不看下一状态
  assert.ok(Math.abs(a.q[1] - 0.1) < 1e-12);
});

test('SARSA 用实际选的下一动作 a2，而不是最大值', () => {
  const a = make('sarsa');
  a.q[1 * 4 + 0] = 8;
  a.q[1 * 4 + 3] = -2;
  a.learn(0, 0, 0, 1, false, 3);
  assert.ok(Math.abs(a.q[0] - 0.1 * (0.9 * -2)) < 1e-12);
});

test('Expected SARSA 用当前策略下的期望 Q', () => {
  const a = make('expected-sarsa', { explorationRate: 0.4 });
  a.q.set([4, 0, 0, 0], 1 * 4); // 状态 1 只有动作 0 价值 4，贪婪动作 = 0
  const probs = a.actionProbs(1); // ε=0.4 → [0.7, 0.1, 0.1, 0.1]
  assert.ok(Math.abs(probs[0] - 0.7) < 1e-12);
  a.learn(0, 2, 0, 1, false, -1);
  assert.ok(Math.abs(a.q[2] - 0.1 * (0.9 * 0.7 * 4)) < 1e-12);
});

test('蒙特卡洛：整回合结束后按回报回溯更新', () => {
  const a = make('monte-carlo', { learningRate: 0.5, discountFactor: 0.5 });
  a.learn(0, 0, 0, 1, false, -1);
  a.learn(1, 0, 4, 2, true, -1);
  assert.equal(a.q[0], 0); // 回合没结束，Q 不变
  a.endEpisode();
  assert.ok(Math.abs(a.q[1 * 4] - 2) < 1e-12); // G=4，Q=0.5·4
  assert.ok(Math.abs(a.q[0] - 0.5 * 2) < 1e-12); // G=0+0.5·4=2，Q=0.5·2
  assert.equal(a.trajectory.length, 0);
});

test('Actor-Critic：TD 误差为正时，提高所选动作的偏好、降低其他动作', () => {
  const a = make('actor-critic');
  a.learn(0, 1, 5, 1, false, -1);
  assert.ok(a.v[0] > 0);
  assert.ok(a.h[0 * 4 + 1] > 0);
  assert.ok(a.h[0 * 4 + 0] < 0 && a.h[0 * 4 + 2] < 0);
  const probs = a.actionProbs(0);
  assert.ok(Math.abs(probs.reduce((x, y) => x + y) - 1) < 1e-12);
});

test('SR 需要 model；奖励按（状态,动作）记录，宝箱奖励不会被后续的每步惩罚抹掉', () => {
  assert.throws(() => createAlgorithm('sr', { numStates: 4 }), /model/);
  const a = make('sr', {}, 4);
  for (let i = 0; i < 200; i++) {
    a.learn(0, 1, 10, 1, false, -1); // 首次到宝箱：+10
    a.learn(1, 0, -0.1, 0, false, -1); // 之后走回来：−0.1
  }
  assert.ok(a.w[0 * 4 + 1] > 9.9, `w(0,下)=${a.w[1]}`);
});

test('探索策略的概率：贪婪/随机/softmax 都是合法分布', () => {
  for (const strategy of ['epsilon-greedy', 'softmax', 'random', 'greedy']) {
    const a = make('q-learning', { explorationStrategy: strategy });
    a.q.set([1, 2, 3, 0], 0);
    const p = a.actionProbs(0);
    assert.ok(Math.abs(p.reduce((x, y) => x + y) - 1) < 1e-12, strategy);
    if (strategy === 'greedy') assert.deepEqual(p, [0, 0, 1, 0]);
    if (strategy === 'random') assert.deepEqual(p, [0.25, 0.25, 0.25, 0.25]);
  }
});

test('贪婪动作平局时取编号最小（评估可复现）', () => {
  const a = make('q-learning');
  assert.equal(a.greedyAction(0), 0);
  a.q.set([0, 1, 1, 0], 0);
  assert.equal(a.greedyAction(0), 1);
});

test('chooseAction 的随机性来自传入的 rng（同种子同选择）', () => {
  const pick = (seed) => {
    const a = createAlgorithm('q-learning', { numStates: 6, rng: new Rng(seed) });
    return Array.from({ length: 50 }, () => a.chooseAction(0)).join('');
  };
  assert.equal(pick(5), pick(5));
  assert.notEqual(pick(5), pick(6));
});

// 验收：6 种算法都能在"新手地牢"上学会 先拿宝箱、再去出口。
// 状态里带收集掩码才可能做到：最优回报 = 10 + 10 − 13 步 × 0.1 = 18.7；不拿宝箱只有 8.9。
const EPISODES = { 'q-learning': 800, sarsa: 800, 'expected-sarsa': 800, 'monte-carlo': 1500, 'actor-critic': 800, sr: 800 };
for (const type of Object.keys(ALGORITHMS)) {
  test(`${type} 在新手地牢上学会：先拿宝箱，再去出口`, () => {
    const t = new Trainer({ maze: NOVICE, algorithm: type, seed: 1 });
    t.runEpisodes(EPISODES[type]);
    const { route } = t.evaluate();
    assert.equal(route.outcome, 'exit');
    assert.equal(route.treasures, 1, '没有拿到宝箱');
    assert.ok(route.totalReturn > 18, `回报 ${route.totalReturn}`);
    // 路线上宝箱先于出口：掩码在到达出口前已变为 1
    const last = route.path[route.path.length - 1];
    assert.deepEqual([last.x, last.y, last.mask], [7, 4, 1]);
  });
}
