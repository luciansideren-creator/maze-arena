import { QLearning } from './qlearning.js';
import { Sarsa } from './sarsa.js';
import { ExpectedSarsa } from './expected-sarsa.js';
import { MonteCarlo } from './monte-carlo.js';
import { ActorCritic } from './actor-critic.js';
import { SuccessorRepresentation } from './successor.js';

export { DEFAULT_CONFIG, NUM_ACTIONS } from './base.js';

export const ALGORITHMS = {
  'q-learning': { name: 'Q-learning', cls: QLearning, inArena: true },
  sarsa: { name: 'SARSA', cls: Sarsa, inArena: true },
  'expected-sarsa': { name: 'Expected SARSA', cls: ExpectedSarsa, inArena: true },
  'monte-carlo': { name: '蒙特卡洛控制', cls: MonteCarlo, inArena: true },
  'actor-critic': { name: 'Actor-Critic', cls: ActorCritic, inArena: true },
  sr: { name: '后继表示（SR）', cls: SuccessorRepresentation, inArena: false },
};

export function createAlgorithm(type, opts) {
  const entry = ALGORITHMS[type];
  if (!entry) throw new Error(`未知算法：${type}`);
  return new entry.cls(opts);
}
