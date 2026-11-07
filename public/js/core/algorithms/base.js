// 算法基类：表格型强化学习。状态是整数下标，动作 0–3（上、下、左、右）。
// 去掉了原项目的全局单例：每个实例自带表和随机数，可同时存在多个。
import { Rng } from '../rng.js';

export const NUM_ACTIONS = 4;

export const DEFAULT_CONFIG = {
  learningRate: 0.1,
  discountFactor: 0.9,
  explorationRate: 0.2,
  softmaxBeta: 1.0,
  explorationStrategy: 'epsilon-greedy', // 'epsilon-greedy' | 'softmax' | 'random' | 'greedy'
  actorLearningRate: 0.1,
  criticLearningRate: 0.1,
  srMWeightLearningRate: 0.1,
  srWWeightLearningRate: 0.1,
};

export class Algorithm {
  /**
   * @param {{numStates:number, rng?:Rng, config?:object, model?:(s:number,a:number)=>number}} opts
   *   model：已知的确定性转移（只有后继表示算法需要，用于一步前瞻）
   */
  constructor({ numStates, rng = new Rng(0), config = {}, model = null }) {
    this.numStates = numStates;
    this.rng = rng;
    this.model = model;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.init();
  }

  // ---- 子类实现 ----
  init() { throw new Error('init 未实现'); }
  /** 状态 s 下四个动作的"价值"（Q 值；Actor-Critic 为偏好 h；SR 为前瞻得到的 Q） */
  actionValues(s) { throw new Error('actionValues 未实现'); }
  /** 状态价值 V(s) */
  stateValue(s) { throw new Error('stateValue 未实现'); }
  /**
   * 学一步。a2 是智能体在 s2 实际会选的动作（SARSA 需要；终止时为 -1）。
   * done 只表示真正终止，超时截断时为 false（仍可从 s2 估值）。
   */
  learn(s, a, r, s2, done, a2) { throw new Error('learn 未实现'); }
  /** 回合结束（蒙特卡洛在这里批量更新） */
  endEpisode() {}

  // ---- 通用 ----
  updateConfig(patch) {
    this.config = { ...this.config, ...patch };
  }

  bestActions(s) {
    const v = this.actionValues(s);
    let max = -Infinity;
    for (let a = 0; a < NUM_ACTIONS; a++) if (v[a] > max) max = v[a];
    const best = [];
    for (let a = 0; a < NUM_ACTIONS; a++) if (v[a] === max) best.push(a);
    return best;
  }

  /** 确定性贪婪动作：平局取编号最小（评估用，保证可复现） */
  greedyAction(s) {
    return this.bestActions(s)[0];
  }

  /** 按探索策略给出 π(a|s)（长度 4 的数组） */
  actionProbs(s) {
    const strategy = this.config.explorationStrategy;
    const probs = new Array(NUM_ACTIONS).fill(1 / NUM_ACTIONS);
    if (strategy === 'random') return probs;
    if (strategy === 'softmax') return softmax(this.actionValues(s), this.config.softmaxBeta);
    const best = this.bestActions(s);
    const eps = strategy === 'greedy' ? 0 : this.config.explorationRate;
    for (let a = 0; a < NUM_ACTIONS; a++) {
      probs[a] = eps / NUM_ACTIONS + (best.includes(a) ? (1 - eps) / best.length : 0);
    }
    return probs;
  }

  /** 训练时选动作（带探索，随机数来自 this.rng） */
  chooseAction(s) {
    return sample(this.actionProbs(s), this.rng);
  }
}

export function softmax(values, beta = 1) {
  const n = values.length;
  let max = -Infinity;
  for (let i = 0; i < n; i++) if (values[i] > max) max = values[i];
  const out = new Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    out[i] = Math.exp(beta * (values[i] - max));
    sum += out[i];
  }
  if (!(sum > 0) || !Number.isFinite(sum)) return out.fill(1 / n);
  for (let i = 0; i < n; i++) out[i] /= sum;
  return out;
}

export function sample(probs, rng) {
  const u = rng.next();
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (u < acc) return i;
  }
  return probs.length - 1;
}

/** 基于 Q 表的算法共用部分 */
export class QTableAlgorithm extends Algorithm {
  init() {
    this.q = new Float64Array(this.numStates * NUM_ACTIONS);
  }

  actionValues(s) {
    const o = s * NUM_ACTIONS;
    return [this.q[o], this.q[o + 1], this.q[o + 2], this.q[o + 3]];
  }

  stateValue(s) {
    const v = this.actionValues(s);
    return Math.max(v[0], v[1], v[2], v[3]);
  }
}
