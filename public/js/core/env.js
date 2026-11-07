// MazeEnv：多宝箱 + 出口的寻宝环境（§4）。状态编码 s = (y·W + x)·2^K + mask。
import { Rng, deriveSeed } from './rng.js';
import { normalizeMaze, validateMaze, scanMaze, CELL } from './maze.js';
import { MonsterSystem } from './monsters.js';

export const ACTIONS = ['up', 'down', 'left', 'right'];
export const NUM_ACTIONS = 4;
export const DX = [0, 0, -1, 1];
export const DY = [-1, 1, 0, 0];

export class MazeEnv {
  /**
   * @param {object} mazeInput 地图（会被规范化并校验，非法则抛错）
   * @param {{seed?: number, validate?: boolean}} [opts]
   */
  constructor(mazeInput, { seed = 0, validate = true } = {}) {
    const maze = normalizeMaze(mazeInput);
    if (validate) {
      const v = validateMaze(maze);
      if (!v.ok) throw new Error(`地图不合法：${v.errors.map((e) => e.message).join('；')}`);
    }
    this.maze = maze;
    this.W = maze.width;
    this.H = maze.height;
    const { starts, exits, treasures } = scanMaze(maze);
    this.start = starts[0];
    this.exit = exits[0];
    this.treasures = treasures;
    this.K = treasures.length;
    this.fullMask = (1 << this.K) - 1;
    this.numStates = this.W * this.H * (1 << this.K);
    this.numActions = NUM_ACTIONS;
    this.rewards = maze.rewards;
    this.maxSteps = maze.maxSteps;
    this.treasureBit = new Int8Array(this.W * this.H).fill(-1);
    treasures.forEach((t, i) => { this.treasureBit[t.y * this.W + t.x] = i; });
    this.rng = new Rng(deriveSeed(seed, 0xe17));
    this.monsters = new MonsterSystem(maze, this.rng);
    this.x = this.start.x;
    this.y = this.start.y;
    this.mask = 0;
    this.steps = 0;
  }

  encode(x, y, mask) {
    return ((y * this.W + x) << this.K) | mask;
  }

  decode(s) {
    const idx = s >> this.K;
    const x = idx % this.W;
    return { x, y: (idx - x) / this.W, mask: s & this.fullMask };
  }

  get state() {
    return this.encode(this.x, this.y, this.mask);
  }

  reset() {
    this.x = this.start.x;
    this.y = this.start.y;
    this.mask = 0;
    this.steps = 0;
    this.monsters.reset();
    return this.state;
  }

  /** 墙或越界不可进入（撞墙原地不动） */
  isBlocked(x, y) {
    return x < 0 || y < 0 || x >= this.W || y >= this.H || this.maze.rows[y][x] === CELL.WALL;
  }

  /**
   * 不含怪物的确定性转移：给定状态和动作，返回下一个状态（后继表示算法用它做一步前瞻）。
   * 终止格（陷阱、出口）也只是普通的下一个状态，终止之后的价值由算法按 done 处理。
   */
  nextState(s, a) {
    const { x, y, mask } = this.decode(s);
    const nx = x + DX[a];
    const ny = y + DY[a];
    if (this.isBlocked(nx, ny)) return s;
    const bit = this.treasureBit[ny * this.W + nx];
    return this.encode(nx, ny, bit >= 0 ? mask | (1 << bit) : mask);
  }

  /**
   * 走一步。返回 { state, reward, done, truncated, event, caught, x, y, mask }
   * done：到达出口 / 踩陷阱 / 被抓（真正的终止）；truncated：步数用完（超时，不算终止）。
   * event：'treasure' | 'exit' | 'trap' | 'caught' | null
   */
  step(a) {
    const px = this.x;
    const py = this.y;
    const nx = px + DX[a];
    const ny = py + DY[a];
    if (!this.isBlocked(nx, ny)) {
      this.x = nx;
      this.y = ny;
    }
    this.steps++;
    const r = this.rewards;
    let reward = r.step;
    let done = false;
    let event = null;
    let caught = false;
    const ch = this.maze.rows[this.y][this.x];
    const bit = this.treasureBit[this.y * this.W + this.x];

    if (ch === CELL.TRAP) {
      reward += r.trap;
      done = true;
      event = 'trap';
    } else if (ch === CELL.EXIT && (!this.maze.exitRequiresAllTreasures || this.mask === this.fullMask)) {
      reward += r.exit;
      done = true;
      event = 'exit';
    } else if (bit >= 0 && !(this.mask & (1 << bit))) {
      this.mask |= 1 << bit;
      reward += r.treasure;
      event = 'treasure';
    }

    if (!done) {
      // 抓捕判定：智能体走到怪物所在格 → 怪物移动后同格 → 同一步互换位置（擦肩而过）
      const here = (m) => m.x === this.x && m.y === this.y;
      if (this.monsters.list.some(here)) caught = true;
      else {
        this.monsters.step(this.steps);
        caught = this.monsters.list.some((m) => here(m) || (m.x === px && m.y === py && m.px === this.x && m.py === this.y));
      }
      if (caught) {
        reward += r.monster;
        done = true;
        event = 'caught';
      }
    }
    const truncated = !done && this.steps >= this.maxSteps;
    return { state: this.state, reward, done, truncated, event, caught, x: this.x, y: this.y, mask: this.mask };
  }
}
