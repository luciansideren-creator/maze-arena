// 地图数据结构、解析、序列化、校验（设计文档 §4.1、§4.4、§4.5、§4.6）。纯逻辑。
import { bfsDistances } from './pathfinding.js';

export const CELL = { FLOOR: '.', WALL: '#', TREASURE: 'T', TRAP: 'X', START: 'S', EXIT: 'E', PATROL: 'P', GUARD: 'G' };
const KNOWN = new Set(['.', '#', 'T', 'X', 'S', 'E']); // 规范化后 rows 里允许出现的字符

export const LIMITS = { minW: 6, maxW: 16, minH: 5, maxH: 10, maxTreasures: 3, maxMonsters: 3 };

export const DEFAULT_REWARDS = { treasure: 10, exit: 10, trap: -10, monster: -10, step: -0.1 };
export const DEFAULT_MAX_STEPS = 300;

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const CIRCLED = ['①', '②', '③'];

export function treasureLabel(i) {
  return CIRCLED[i] ?? String(i + 1);
}

/** 规范化：补默认值；rows 里的 P/G 转成地板并生成对应的怪物条目。不做合法性判断。 */
export function normalizeMaze(raw) {
  const rows = Array.isArray(raw.rows) ? raw.rows.map(String) : [];
  const monsters = (Array.isArray(raw.monsters) ? raw.monsters : []).map(normalizeMonster);
  const outRows = rows.map((row, y) => {
    let out = '';
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === CELL.PATROL || ch === CELL.GUARD) {
        if (!monsters.some((m) => m.x === x && m.y === y)) {
          monsters.push(normalizeMonster({ type: ch === CELL.PATROL ? 'patrol' : 'guard', x, y }));
        }
        out += CELL.FLOOR;
      } else out += ch;
    }
    return out;
  });
  return {
    version: 1,
    id: raw.id ?? null,
    name: raw.name ?? '未命名地图',
    width: raw.width ?? (outRows[0] ? outRows[0].length : 0),
    height: raw.height ?? outRows.length,
    rows: outRows,
    rewards: { ...DEFAULT_REWARDS, ...(raw.rewards ?? {}) },
    monsters,
    maxSteps: raw.maxSteps ?? DEFAULT_MAX_STEPS,
    exitRequiresAllTreasures: Boolean(raw.exitRequiresAllTreasures),
    createdAt: raw.createdAt ?? null,
    source: raw.source ?? 'user',
  };
}

function normalizeMonster(m) {
  const type = m.type === 'guard' ? 'guard' : m.type === 'patrol' ? 'patrol' : m.type;
  const out = {
    type,
    x: m.x,
    y: m.y,
    speed: m.speed === 'slow' ? 'slow' : 'normal',
    skin: m.skin ?? (type === 'guard' ? 'big_demon' : 'orc_warrior'),
  };
  if (type === 'patrol') out.radius = m.radius ?? 3;
  if (type === 'guard' && m.treasure !== undefined) out.treasure = m.treasure;
  return out;
}

export function createMaze(partial) {
  return normalizeMaze(partial);
}

export function serializeMaze(maze) {
  return JSON.stringify(maze);
}

export function parseMazeJSON(text) {
  return normalizeMaze(JSON.parse(text));
}

export function inBounds(maze, x, y) {
  return x >= 0 && y >= 0 && x < maze.width && y < maze.height;
}

/** 取格子字符；越界视为墙。 */
export function cellAt(maze, x, y) {
  return inBounds(maze, x, y) ? maze.rows[y][x] : CELL.WALL;
}

/** 玩家可通行：不是墙、不是陷阱（§4.4） */
export function isPassable(ch) {
  return ch !== CELL.WALL && ch !== CELL.TRAP;
}

/** 扫描地图，得到起点、出口、宝箱（按行优先编号，即宝箱 ①②③ 的顺序）、陷阱等。 */
export function scanMaze(maze) {
  const info = { starts: [], exits: [], treasures: [], traps: [], walls: [] };
  for (let y = 0; y < maze.rows.length; y++) {
    for (let x = 0; x < maze.rows[y].length; x++) {
      const p = { x, y };
      switch (maze.rows[y][x]) {
        case CELL.START: info.starts.push(p); break;
        case CELL.EXIT: info.exits.push(p); break;
        case CELL.TREASURE: info.treasures.push(p); break;
        case CELL.TRAP: info.traps.push(p); break;
        case CELL.WALL: info.walls.push(p); break;
        default:
      }
    }
  }
  return info;
}

/** 怪物可走：只有地板（出生点在规范化后就是地板）。不含墙、陷阱、宝箱、出口、起点。 */
export function isMonsterWalkable(maze, x, y) {
  return inBounds(maze, x, y) && maze.rows[y][x] === CELL.FLOOR;
}

const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** 巡逻怪地盘：从出生点出发，只走怪物可走格，且曼哈顿距离不超过 R（返回格子下标集合）。 */
export function patrolTerritory(maze, mon) {
  const { width: w, height: h } = maze;
  const r = mon.radius ?? 3;
  const dist = bfsDistances(
    w, h, [[mon.x, mon.y]],
    (x, y) => isMonsterWalkable(maze, x, y) && Math.abs(x - mon.x) + Math.abs(y - mon.y) <= r,
  );
  const set = new Set();
  dist.forEach((d, i) => { if (d >= 0) set.add(i); });
  return set;
}

/** 守卫怪绑定的宝箱编号：显式指定优先，否则取距离出生点最近的（曼哈顿，平局取编号小的）。 */
export function guardTreasureIndex(maze, mon, treasures = scanMaze(maze).treasures) {
  if (Number.isInteger(mon.treasure)) return mon.treasure;
  let best = -1;
  let bestD = Infinity;
  treasures.forEach((t, i) => {
    const d = manhattan(t, mon);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

/** 守卫环：宝箱周围 8 格里怪物可走的格子（返回格子下标集合，不含宝箱本身）。 */
export function guardRing(maze, treasure) {
  const set = new Set();
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = treasure.x + dx;
      const y = treasure.y + dy;
      if (isMonsterWalkable(maze, x, y)) set.add(y * maze.width + x);
    }
  }
  return set;
}

/**
 * 从起点出发的可达性距离场（§4.4）。只走"可通行"格；
 * 出口默认是终点：踩上就结束，所以不能穿过出口去别处（选"需集齐宝箱"时出口在集齐前是地板，可以穿过）。
 */
export function reachDistances(maze, start) {
  const through = maze.exitRequiresAllTreasures;
  return bfsDistances(
    maze.width, maze.height, [[start.x, start.y]],
    (x, y) => isPassable(maze.rows[y][x]),
    (x, y) => through || maze.rows[y][x] !== CELL.EXIT,
  );
}

const err = (code, message, cells = []) => ({ code, message, cells });

/**
 * 校验地图。返回 { ok, errors, warnings }，每条为 { code, message, cells:[{x,y}] }。
 * 错误：不能保存/使用；警告：可保存。
 */
export function validateMaze(input) {
  const maze = normalizeMaze(input);
  const errors = [];
  const warnings = [];
  const { width: w, height: h } = maze;

  // 1. 结构与尺寸
  if (!Number.isInteger(w) || w < LIMITS.minW || w > LIMITS.maxW) {
    errors.push(err('size', `地图宽度必须在 ${LIMITS.minW}–${LIMITS.maxW} 之间（当前 ${w}）`));
  }
  if (!Number.isInteger(h) || h < LIMITS.minH || h > LIMITS.maxH) {
    errors.push(err('size', `地图高度必须在 ${LIMITS.minH}–${LIMITS.maxH} 之间（当前 ${h}）`));
  }
  if (maze.rows.length !== h || maze.rows.some((r) => r.length !== w)) {
    errors.push(err('shape', '地图行数或每行长度与宽高不一致'));
  }
  if (errors.length) return { ok: false, errors, warnings };

  // 2. 未知字符
  const unknown = [];
  maze.rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) if (!KNOWN.has(row[x])) unknown.push({ x, y });
  });
  if (unknown.length) {
    errors.push(err('unknown_char', `地图含未知字符（共 ${unknown.length} 处）`, unknown));
    return { ok: false, errors, warnings };
  }

  // 3. 数量
  const { starts, exits, treasures } = scanMaze(maze);
  if (starts.length !== 1) errors.push(err('start_count', `起点必须恰好 1 个（当前 ${starts.length} 个）`, starts));
  if (exits.length !== 1) errors.push(err('exit_count', `出口必须恰好 1 个（当前 ${exits.length} 个）`, exits));
  if (treasures.length > LIMITS.maxTreasures) {
    errors.push(err('treasure_count', `宝箱最多 ${LIMITS.maxTreasures} 个（当前 ${treasures.length} 个）`, treasures));
  }
  if (maze.monsters.length > LIMITS.maxMonsters) {
    errors.push(err('monster_count', `怪物最多 ${LIMITS.maxMonsters} 只（当前 ${maze.monsters.length} 只）`));
  }

  // 4. 可达性：出口和每个宝箱都必须能从起点走到
  let dist = null;
  if (starts.length === 1) {
    dist = reachDistances(maze, starts[0]);
    exits.forEach((e) => {
      if (dist[e.y * w + e.x] < 0) errors.push(err('unreachable_exit', '出口无法从起点到达', [e]));
    });
    treasures.forEach((t, i) => {
      if (dist[t.y * w + t.x] < 0) {
        errors.push(err('unreachable_treasure', `宝箱${treasureLabel(i)}无法从起点到达`, [t]));
      }
    });
    if (starts.length === 1 && !errors.some((e) => e.code.startsWith('unreachable'))) {
      const lonely = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (isPassable(maze.rows[y][x]) && dist[y * w + x] < 0) lonely.push({ x, y });
        }
      }
      if (lonely.length) warnings.push(err('unreachable_floor', `有 ${lonely.length} 个空地从起点到不了（不影响训练）`, lonely));
    }
  }

  // 5. 怪物摆放（§4.6）
  maze.monsters.forEach((m, i) => errors.push(...validateMonster(maze, m, i, starts[0], treasures)));

  if (treasures.length === 0) warnings.push(err('no_treasure', '地图里没有宝箱（可以玩，但不是"寻宝"）'));
  return { ok: errors.length === 0, errors, warnings };
}

function validateMonster(maze, m, i, start, treasures) {
  const out = [];
  const name = `第 ${i + 1} 只怪物`;
  const cell = { x: m.x, y: m.y };
  if (m.type !== 'patrol' && m.type !== 'guard') return [err('monster_type', `${name}类型未知`)];
  if (!Number.isInteger(m.x) || !Number.isInteger(m.y) || !isMonsterWalkable(maze, m.x, m.y)) {
    return [err('monster_spawn', `${name}必须放在地板上`, [cell])];
  }
  if (start && manhattan(cell, start) < 3) {
    out.push(err('monster_near_start', `${name}离起点太近（至少隔 3 格）`, [cell]));
  }
  if (m.type === 'patrol') {
    const r = m.radius;
    if (!Number.isInteger(r) || r < 2 || r > 4) {
      out.push(err('monster_radius', `${name}的巡逻半径必须是 2–4`, [cell]));
    } else if (patrolTerritory(maze, m).size < 3) {
      out.push(err('monster_territory', `${name}的巡逻地盘太小（至少 3 格）`, [cell]));
    }
  } else {
    if (treasures.length === 0) {
      out.push(err('guard_no_treasure', `${name}是守卫怪，但地图里没有宝箱可守`, [cell]));
    } else {
      const ti = guardTreasureIndex(maze, m, treasures);
      if (ti < 0 || ti >= treasures.length) {
        out.push(err('guard_treasure', `${name}绑定的宝箱不存在`, [cell]));
      } else {
        const ring = guardRing(maze, treasures[ti]);
        if (ring.size < 2) {
          out.push(err('guard_ring', `宝箱${treasureLabel(ti)}周围能站的格子少于 2 个，守卫无法巡守`, [treasures[ti]]));
        } else {
          const dist = bfsDistances(maze.width, maze.height, [[m.x, m.y]], (x, y) => isMonsterWalkable(maze, x, y));
          if (![...ring].some((idx) => dist[idx] >= 0)) {
            out.push(err('guard_unreachable', `${name}走不到宝箱${treasureLabel(ti)}旁边`, [cell]));
          }
        }
      }
    }
  }
  return out;
}

export { DIRS };
