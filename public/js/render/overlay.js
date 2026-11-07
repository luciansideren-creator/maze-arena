// 算法视图叠加层：压暗、V(s) 热力图、贪婪策略箭头、最近一回合轨迹、怪物地盘 / 守卫环。
import { cellOrigin } from './tilemap.js';
import { patrolTerritory, guardRing, guardTreasureIndex, scanMaze } from '../core/maze.js';

// 低 → 高：深紫 → 魔法青 → 宝藏金
const STOPS = [[0x3b, 0x2a, 0x6b], [0x4e, 0xc9, 0xd4], [0xf2, 0xc1, 0x4e]];

export function rampColor(k) {
  const t = Math.min(1, Math.max(0, k)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(t));
  const f = t - i;
  const c = STOPS[i].map((v, j) => Math.round(v + (STOPS[i + 1][j] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function dimMap(ctx, layout, alpha = 0.55) {
  ctx.save();
  ctx.fillStyle = `rgba(10, 10, 16, ${alpha})`;
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.restore();
}

/** 热力图：valueAt(x, y) 返回数值或 null（墙 / 不画）。vmin、vmax 为统一色阶。 */
export function drawHeatmap(ctx, layout, maze, valueAt, vmin, vmax, { numbers = true } = {}) {
  const { cell } = layout;
  const span = Math.max(1e-9, vmax - vmin);
  ctx.save();
  ctx.font = `${Math.round(cell * 0.24)}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      const v = valueAt(x, y);
      if (v === null) continue;
      const o = cellOrigin(layout, x, y);
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = rampColor((v - vmin) / span);
      ctx.fillRect(o.x + 1, o.y + 1, cell - 2, cell - 2);
      if (numbers) {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#0d0d14';
        ctx.fillText(v.toFixed(1), o.x + cell / 2, o.y + cell * 0.82);
      }
    }
  }
  ctx.restore();
}

const ARROW = [[0, -1], [0, 1], [-1, 0], [1, 0]];

/** 贪婪策略箭头：bestAt(x, y) 返回最优动作列表或 null（未学到 / 不画） */
export function drawPolicyArrows(ctx, layout, maze, bestAt) {
  const { cell } = layout;
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, cell / 16);
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.92;
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      const best = bestAt(x, y);
      if (!best) continue;
      const o = cellOrigin(layout, x, y);
      const cx = o.x + cell / 2;
      const cy = o.y + cell * 0.42;
      for (const a of best) {
        const [dx, dy] = ARROW[a];
        const len = cell * 0.26;
        const ex = cx + dx * len;
        const ey = cy + dy * len;
        ctx.beginPath();
        ctx.moveTo(cx - dx * len * 0.6, cy - dy * len * 0.6);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        const hs = cell * 0.1;
        ctx.beginPath();
        ctx.moveTo(ex + dx * hs, ey + dy * hs);
        ctx.lineTo(ex - dy * hs - dx * hs * 0.2, ey + dx * hs - dy * hs * 0.2);
        ctx.lineTo(ex + dy * hs - dx * hs * 0.2, ey - dx * hs - dy * hs * 0.2);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/** 最近一回合的轨迹（青色折线 + 圆点） */
export function drawPath(ctx, layout, path) {
  if (!path || path.length < 2) return;
  const { cell } = layout;
  ctx.save();
  ctx.strokeStyle = '#4ec9d4';
  ctx.fillStyle = '#4ec9d4';
  ctx.lineWidth = Math.max(2, cell / 12);
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  path.forEach((p, i) => {
    const o = cellOrigin(layout, p.x, p.y);
    const px = o.x + cell / 2 + (((i * 7) % 5) - 2) * (cell / 40);
    const py = o.y + cell / 2 + (((i * 3) % 5) - 2) * (cell / 40);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  const last = cellOrigin(layout, path[path.length - 1].x, path[path.length - 1].y);
  ctx.beginPath();
  ctx.arc(last.x + cell / 2, last.y + cell / 2, cell * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 巡逻怪地盘（淡色）与守卫环（金色边框） */
export function drawMonsterZones(ctx, layout, maze) {
  if (!maze.monsters?.length) return;
  const { cell } = layout;
  const { treasures } = scanMaze(maze);
  ctx.save();
  for (const m of maze.monsters) {
    if (m.type === 'patrol') {
      ctx.fillStyle = 'rgba(224, 93, 93, 0.16)';
      for (const idx of patrolTerritory(maze, m)) {
        const o = cellOrigin(layout, idx % maze.width, Math.floor(idx / maze.width));
        ctx.fillRect(o.x, o.y, cell, cell);
      }
    } else if (m.type === 'guard') {
      const ti = guardTreasureIndex(maze, m, treasures);
      if (ti < 0) continue;
      ctx.strokeStyle = 'rgba(242, 193, 78, 0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      for (const idx of guardRing(maze, treasures[ti])) {
        const o = cellOrigin(layout, idx % maze.width, Math.floor(idx / maze.width));
        ctx.strokeRect(o.x + 3, o.y + 3, cell - 6, cell - 6);
      }
    }
  }
  ctx.restore();
}
