// 怪物行动规则（§4.6）。怪物按固定脚本行动，不学习、不感知智能体；随机数只来自传入的 rng。
import { scanMaze, isMonsterWalkable, patrolTerritory, guardRing, guardTreasureIndex } from './maze.js';
import { bfsDistances, stepDownhill } from './pathfinding.js';

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

export class MonsterSystem {
  /**
   * @param {object} maze 规范化后的地图
   * @param {import('./rng.js').Rng} rng 环境的随机数
   */
  constructor(maze, rng) {
    this.maze = maze;
    this.rng = rng;
    const { treasures } = scanMaze(maze);
    this.list = maze.monsters.map((def) => {
      const m = { def, x: def.x, y: def.y, px: def.x, py: def.y, lastIdx: -1 };
      if (def.type === 'patrol') {
        m.territory = patrolTerritory(maze, def);
      } else {
        const ti = guardTreasureIndex(maze, def, treasures);
        m.treasureIndex = ti;
        m.ring = guardRing(maze, treasures[ti]);
        const sources = [...m.ring].map((i) => [i % maze.width, Math.floor(i / maze.width)]);
        m.dist = bfsDistances(maze.width, maze.height, sources, (x, y) => isMonsterWalkable(maze, x, y));
      }
      return m;
    });
  }

  /** 每回合开始：回到出生点 */
  reset() {
    for (const m of this.list) {
      m.x = m.px = m.def.x;
      m.y = m.py = m.def.y;
      m.lastIdx = -1;
    }
  }

  /** 智能体每走一步后调用一次；tick 为本回合已走的步数（从 1 开始）。慢速怪只在偶数步行动。 */
  step(tick) {
    for (const m of this.list) {
      m.px = m.x;
      m.py = m.y;
      if (m.def.speed === 'slow' && tick % 2 !== 0) continue;
      const next = m.def.type === 'patrol' ? this.#patrolMove(m) : this.#guardMove(m);
      if (next) {
        m.lastIdx = m.py * this.maze.width + m.px;
        m.x = next[0];
        m.y = next[1];
      }
    }
  }

  // 巡逻：在地盘内的相邻格里随机选；有其他选择时不立刻走回上一格
  #patrolMove(m) {
    const w = this.maze.width;
    let cands = [];
    for (let d = 0; d < 4; d++) {
      const nx = m.x + DX[d];
      const ny = m.y + DY[d];
      if (m.territory.has(ny * w + nx) && nx >= 0 && nx < w) cands.push([nx, ny]);
    }
    if (cands.length > 1) {
      const back = cands.filter(([x, y]) => y * w + x !== m.lastIdx);
      if (back.length > 0) cands = back;
    }
    return cands.length ? this.rng.pick(cands) : null;
  }

  // 守卫：不在环上就沿最短路走向最近的环格；在环上则一半概率停留，一半概率换到相邻环格
  #guardMove(m) {
    const w = this.maze.width;
    if (!m.ring.has(m.y * w + m.x)) return stepDownhill(w, this.maze.height, m.dist, m.x, m.y);
    if (this.rng.chance(0.5)) return null;
    const cands = [];
    for (let d = 0; d < 4; d++) {
      const nx = m.x + DX[d];
      const ny = m.y + DY[d];
      if (nx >= 0 && nx < w && m.ring.has(ny * w + nx)) cands.push([nx, ny]);
    }
    return cands.length ? this.rng.pick(cands) : null;
  }

  /** 当前所有怪物位置快照（给渲染和判定用） */
  positions() {
    return this.list.map((m) => ({ x: m.x, y: m.y, px: m.px, py: m.py, def: m.def }));
  }
}
