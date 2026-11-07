// 训练循环与贪婪评估。不依赖 DOM；时间预算由调用方通过 shouldStop 回调控制。
import { MazeEnv } from './env.js';
import { createAlgorithm } from './algorithms/index.js';
import { Rng, deriveSeed } from './rng.js';
import { normalizeMaze } from './maze.js';

const popcount = (m) => { let c = 0; for (; m; m &= m - 1) c++; return c; };

/** 用贪婪策略（平局取最小动作号）跑若干回合，返回汇总与第一回合的路线。 */
export function evaluateGreedy(mazeInput, algo, { seed = 777, episodes = null } = {}) {
  const maze = normalizeMaze(mazeInput);
  const env = new MazeEnv(maze, { seed, validate: false });
  const n = episodes ?? (maze.monsters.length > 0 ? 20 : 1);
  let sumReturn = 0;
  let success = 0;
  let sumTreasure = 0;
  let route = null;
  for (let e = 0; e < n; e++) {
    let s = env.reset();
    const path = [{ x: env.x, y: env.y, mask: 0 }];
    let total = 0;
    let outcome = 'timeout';
    for (;;) {
      const res = env.step(algo.greedyAction(s));
      total += res.reward;
      path.push({ x: res.x, y: res.y, mask: res.mask });
      s = res.state;
      if (res.done) { outcome = res.event; break; }
      if (res.truncated) break;
    }
    sumReturn += total;
    if (outcome === 'exit') success++;
    sumTreasure += popcount(env.mask);
    if (e === 0) route = { path, totalReturn: total, outcome, steps: env.steps, treasures: popcount(env.mask) };
  }
  return { meanReturn: sumReturn / n, successRate: success / n, meanTreasures: sumTreasure / n, route };
}

export class Trainer {
  /**
   * @param {{maze:object, algorithm?:string, config?:object, seed?:number}} opts
   * 环境与算法的随机数由同一个 seed 派生，互不干扰；相同 seed 的两次训练结果逐位一致。
   */
  constructor({ maze, algorithm = 'q-learning', config = {}, seed = 0 }) {
    this.maze = normalizeMaze(maze);
    this.algorithmType = algorithm;
    this.seed = seed;
    this.env = new MazeEnv(this.maze, { seed: deriveSeed(seed, 1) });
    this.algo = createAlgorithm(algorithm, {
      numStates: this.env.numStates,
      rng: new Rng(deriveSeed(seed, 2)),
      config,
      model: (s, a) => this.env.nextState(s, a),
    });
    this.returns = []; // 每回合总回报（训练回报，含探索噪声）
    this.lengths = [];
    this.outcomes = []; // 'exit' | 'trap' | 'caught' | 'timeout'
    this.lastPath = null; // 最近一回合的轨迹 [{x,y,mask}]
    this.active = false;
    this.curReturn = 0;
    this.curPath = [];
  }

  get episodes() {
    return this.returns.length;
  }

  /** 开始新回合 */
  beginEpisode() {
    this.cur = { s: this.env.reset() };
    this.cur.a = this.algo.chooseAction(this.cur.s);
    this.active = true;
    this.curReturn = 0;
    this.curPath = [{ x: this.env.x, y: this.env.y, mask: 0 }];
  }

  /**
   * 走一步并学习。回合结束时 episodeEnded 为 true，并已记入历史。
   * 返回 { from:{x,y}, to:{x,y}, action, reward, event, done, truncated, episodeEnded, mask }
   */
  step() {
    if (!this.active) this.beginEpisode();
    const { s, a } = this.cur;
    const from = { x: this.env.x, y: this.env.y };
    const res = this.env.step(a);
    const ended = res.done || res.truncated;
    // 下一步要选的动作：SARSA 需要它；超时截断时只用于估值，不会真正执行
    const a2 = res.done ? -1 : this.algo.chooseAction(res.state);
    this.algo.learn(s, a, res.reward, res.state, res.done, a2);
    this.curReturn += res.reward;
    this.curPath.push({ x: res.x, y: res.y, mask: res.mask });
    this.cur = { s: res.state, a: a2 };
    if (ended) {
      this.algo.endEpisode();
      this.returns.push(this.curReturn);
      this.lengths.push(this.env.steps);
      this.outcomes.push(res.done ? res.event : 'timeout');
      this.lastPath = this.curPath;
      this.active = false;
    }
    return {
      from, to: { x: res.x, y: res.y }, action: a, reward: res.reward, event: res.event,
      done: res.done, truncated: res.truncated, episodeEnded: ended, mask: res.mask,
    };
  }

  /** 把正在进行的回合跑完（切换档位、快进前用，避免半截回合污染蒙特卡洛的轨迹） */
  finishEpisode() {
    while (this.active) this.step();
  }

  runEpisode() {
    this.beginEpisode();
    let r;
    do { r = this.step(); } while (!r.episodeEnded);
    return r;
  }

  /** 连续跑 n 个回合；shouldStop() 返回 true 时提前停（用于时间预算 / 中断）。返回实际跑的回合数。 */
  runEpisodes(n, shouldStop = () => false) {
    let done = 0;
    while (done < n && !shouldStop()) {
      this.runEpisode();
      done++;
    }
    return done;
  }

  evaluate(opts) {
    return evaluateGreedy(this.maze, this.algo, opts);
  }

  /** 最近 n 回合到达出口的比例 */
  recentSuccessRate(n = 100) {
    const tail = this.outcomes.slice(-n);
    return tail.length ? tail.filter((o) => o === 'exit').length / tail.length : 0;
  }

  /** 滑动平均回报 */
  recentMeanReturn(n = 20) {
    const tail = this.returns.slice(-n);
    return tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : 0;
  }
}
