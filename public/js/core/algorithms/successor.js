import { Algorithm, NUM_ACTIONS } from './base.js';

/**
 * 后继表示（SR）：学后继占有矩阵 M(s,j)（从 s 出发，未来对状态 j 的折扣访问量，含 s 自身），
 * 再把它和奖励结合：V(s) = Σ_j M(s,j)·r̄(j)，Q(s,a) = w(s,a) + γ·V(s')。
 *
 * 与原项目的差别（v1 改造）：原项目把奖励 w 挂在"到达的状态"上。本项目奖励取决于转移——
 * 第一次走上宝箱 +10，之后再走回宝箱格只有每步惩罚——挂在状态上会被平均抹掉，学不会拿宝箱。
 * 所以改成：w(s,a) 记录"在 s 执行 a 的即时奖励"，r̄(s) 记录行为策略下离开 s 的平均即时奖励。
 *
 * 选动作要知道"走一步会到哪"，所以需要 model(s,a)（环境的确定性转移）。
 * M 是 N×N，状态数多时占内存和时间，只在训练场提供。
 */
export class SuccessorRepresentation extends Algorithm {
  init() {
    if (!this.model) throw new Error('后继表示需要 model(s, a)');
    const n = this.numStates;
    this.m = new Float64Array(n * n);
    this.w = new Float64Array(n * NUM_ACTIONS); // w(s,a)
    this.rbar = new Float64Array(n); // r̄(s)
  }

  stateValue(s) {
    const n = this.numStates;
    const o = s * n;
    let v = 0;
    for (let j = 0; j < n; j++) v += this.m[o + j] * this.rbar[j];
    return v;
  }

  actionValues(s) {
    const out = new Array(NUM_ACTIONS);
    for (let a = 0; a < NUM_ACTIONS; a++) {
      const s2 = this.model(s, a);
      out[a] = this.w[s * NUM_ACTIONS + a] + this.config.discountFactor * this.stateValue(s2);
    }
    return out;
  }

  learn(s, a, r, s2, done) {
    const n = this.numStates;
    const { discountFactor: gamma, srWWeightLearningRate: aw, srMWeightLearningRate: am } = this.config;
    const i = s * NUM_ACTIONS + a;
    this.w[i] += aw * (r - this.w[i]);
    this.rbar[s] += aw * (r - this.rbar[s]);
    // 占有量：M(s,·) 朝 onehot(s) + γ·M(s',·) 靠拢；终止时没有后续
    const o = s * n;
    const o2 = s2 * n;
    for (let j = 0; j < n; j++) {
      const target = (j === s ? 1 : 0) + (done ? 0 : gamma * this.m[o2 + j]);
      this.m[o + j] += am * (target - this.m[o + j]);
    }
  }
}
