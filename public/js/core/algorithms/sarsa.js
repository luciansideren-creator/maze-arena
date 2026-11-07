import { QTableAlgorithm, NUM_ACTIONS } from './base.js';

/** SARSA（on-policy）：目标用下一步实际会选的动作的 Q（a2 由训练循环传入，与真正执行的一致） */
export class Sarsa extends QTableAlgorithm {
  learn(s, a, r, s2, done, a2) {
    const i = s * NUM_ACTIONS + a;
    const next = done || a2 < 0 ? 0 : this.q[s2 * NUM_ACTIONS + a2];
    const target = r + this.config.discountFactor * next;
    this.q[i] += this.config.learningRate * (target - this.q[i]);
  }
}
