import { QTableAlgorithm, NUM_ACTIONS } from './base.js';

/** 蒙特卡洛控制（every-visit）：整回合结束后，用实际回报 G 回溯更新 */
export class MonteCarlo extends QTableAlgorithm {
  init() {
    super.init();
    this.trajectory = [];
  }

  learn(s, a, r) {
    this.trajectory.push({ s, a, r });
  }

  endEpisode() {
    let g = 0;
    for (let t = this.trajectory.length - 1; t >= 0; t--) {
      const { s, a, r } = this.trajectory[t];
      g = r + this.config.discountFactor * g;
      const i = s * NUM_ACTIONS + a;
      this.q[i] += this.config.learningRate * (g - this.q[i]);
    }
    this.trajectory = [];
  }
}
