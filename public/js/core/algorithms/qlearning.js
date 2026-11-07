import { QTableAlgorithm, NUM_ACTIONS } from './base.js';

/** Q-learning（off-policy）：目标用下一状态的最大 Q */
export class QLearning extends QTableAlgorithm {
  learn(s, a, r, s2, done) {
    const i = s * NUM_ACTIONS + a;
    const target = r + (done ? 0 : this.config.discountFactor * this.stateValue(s2));
    this.q[i] += this.config.learningRate * (target - this.q[i]);
  }
}
