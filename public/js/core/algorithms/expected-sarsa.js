import { QTableAlgorithm, NUM_ACTIONS } from './base.js';

/** 期望 SARSA：目标用下一状态在当前探索策略下的期望 Q */
export class ExpectedSarsa extends QTableAlgorithm {
  learn(s, a, r, s2, done) {
    const i = s * NUM_ACTIONS + a;
    let expected = 0;
    if (!done) {
      const probs = this.actionProbs(s2);
      const o = s2 * NUM_ACTIONS;
      for (let k = 0; k < NUM_ACTIONS; k++) expected += probs[k] * this.q[o + k];
    }
    const target = r + this.config.discountFactor * expected;
    this.q[i] += this.config.learningRate * (target - this.q[i]);
  }
}
