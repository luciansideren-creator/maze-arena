import { Algorithm, NUM_ACTIONS, softmax, sample } from './base.js';

/** Actor-Critic：Critic 学 V(s)，Actor 用 TD 误差调整动作偏好 h(s,a)，策略是 softmax(h) */
export class ActorCritic extends Algorithm {
  init() {
    this.v = new Float64Array(this.numStates);
    this.h = new Float64Array(this.numStates * NUM_ACTIONS);
  }

  actionValues(s) {
    const o = s * NUM_ACTIONS;
    return [this.h[o], this.h[o + 1], this.h[o + 2], this.h[o + 3]];
  }

  stateValue(s) {
    return this.v[s];
  }

  // 策略本身就是 softmax(h)，不使用 ε-greedy 等探索策略
  actionProbs(s) {
    return softmax(this.actionValues(s), 1);
  }

  chooseAction(s) {
    return sample(this.actionProbs(s), this.rng);
  }

  learn(s, a, r, s2, done) {
    const { discountFactor: gamma, criticLearningRate: ac, actorLearningRate: aa } = this.config;
    const tdError = r + (done ? 0 : gamma * this.v[s2]) - this.v[s];
    const probs = this.actionProbs(s);
    this.v[s] += ac * tdError;
    const o = s * NUM_ACTIONS;
    for (let k = 0; k < NUM_ACTIONS; k++) {
      this.h[o + k] += aa * tdError * ((k === a ? 1 : 0) - probs[k]);
    }
  }
}
