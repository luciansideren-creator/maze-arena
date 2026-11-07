// 地图绘制（设计文档 §7.3.1）：俯视 3/4 视角，整数倍缩放，先画地面层，再按行从上到下画墙、宝箱、怪物、角色。
//
// 墙体规则：
//   · 地图边界外视为墙；渲染时在地图外圈补 1 格墙，让地牢有完整的围墙。
//   · 墙格只有"下方是可走格（非墙）"时才画砖墙正面（wall_mid）；并在它上一格的下沿叠一条墙顶石沿
//     （wall_top_mid：透明底、只有下沿一条石边，遮住上一格的脚，纯视觉）。
//   · 其余墙格（上下左右都被墙或边界包住，或只有侧面/上方露出）画成深色实心岩体，
//     大片墙连成黑色岩块，只在朝向通道的一面露出砖墙。
//   · 被墙围死、从起点到不了的空地照常画地板。
import { cellHash } from './sprites.js';

const TILE = 16;
export const MARGIN = 1; // 地图外圈补的墙格数（仅渲染）

export function layoutOf(maze, scale) {
  const cell = TILE * scale;
  return { cell, scale, width: (maze.width + MARGIN * 2) * cell, height: (maze.height + MARGIN * 2) * cell };
}

/** 格子左上角的像素坐标（cx, cy 为地图坐标，可为 -1 或 W/H 的外圈） */
export function cellOrigin(layout, cx, cy) {
  return { x: (cx + MARGIN) * layout.cell, y: (cy + MARGIN) * layout.cell };
}

const isWall = (maze, x, y) => x < 0 || y < 0 || x >= maze.width || y >= maze.height || maze.rows[y][x] === '#';

const ROCK = { base: '#14141c', dark: '#101018', light: '#1a1a24', rim: '#2c2c3e' };

function drawRock(ctx, layout, cx, cy, maze) {
  const { cell, scale } = layout;
  const { x, y } = cellOrigin(layout, cx, cy);
  ctx.fillStyle = ROCK.base;
  ctx.fillRect(x, y, cell, cell);
  // 细微纹理：按格子坐标确定性撒点，不会闪
  for (let i = 0; i < 6; i++) {
    const hx = cellHash(cx, cy, i * 2);
    const hy = cellHash(cx, cy, i * 2 + 1);
    ctx.fillStyle = i % 2 ? ROCK.dark : ROCK.light;
    ctx.fillRect(x + Math.floor(hx * 14) * scale, y + Math.floor(hy * 14) * scale, 2 * scale, scale);
  }
  // 与通道相邻的边画一条淡边，让岩体轮廓清楚
  ctx.fillStyle = ROCK.rim;
  const t = Math.max(1, scale);
  if (!isWall(maze, cx, cy - 1)) ctx.fillRect(x, y, cell, t);
  if (!isWall(maze, cx - 1, cy)) ctx.fillRect(x, y, t, cell);
  if (!isWall(maze, cx + 1, cy)) ctx.fillRect(x + cell - t, y, t, cell);
}

function drawFloor(ctx, sprites, layout, cx, cy) {
  const { x, y } = cellOrigin(layout, cx, cy);
  const h = cellHash(cx, cy);
  const n = h < 0.62 ? 1 : 2 + Math.floor(((h - 0.62) / 0.38) * 7); // floor_1 居多，其余少量点缀
  sprites.draw(ctx, `floor_${Math.min(n, 8)}`, x, y, layout.scale);
}

function drawWallFace(ctx, sprites, layout, cx, cy) {
  const { x, y } = cellOrigin(layout, cx, cy);
  sprites.draw(ctx, 'wall_mid', x, y, layout.scale);
  // 墙顶：画在上一格，只有下沿一条石边不透明
  sprites.draw(ctx, 'wall_top_mid', x, y - layout.cell, layout.scale);
}

/**
 * 画整个场景。
 * scene = {
 *   time,              // 毫秒，驱动动画
 *   mask,              // 当前已收集宝箱位掩码
 *   chestOpenAt,       // {宝箱编号: 开始开箱的时间}，用于开箱动画
 *   agent,             // {x, y, hero, moving, flip} | null（x、y 可为小数，补间中）
 *   monsters,          // [{x, y, def, moving, flip}]
 * }
 */
export function drawScene(ctx, sprites, maze, layout, scene) {
  const { cell, scale } = layout;
  const time = scene.time ?? 0;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, layout.width, layout.height);
  ctx.fillStyle = '#14141c';
  ctx.fillRect(0, 0, layout.width, layout.height);

  // 第一层：地面（地板、陷阱、出口、起点光圈）和岩体
  for (let cy = -MARGIN; cy < maze.height + MARGIN; cy++) {
    for (let cx = -MARGIN; cx < maze.width + MARGIN; cx++) {
      if (isWall(maze, cx, cy)) {
        drawRock(ctx, layout, cx, cy, maze);
        continue;
      }
      drawFloor(ctx, sprites, layout, cx, cy);
      const ch = maze.rows[cy][cx];
      const { x, y } = cellOrigin(layout, cx, cy);
      if (ch === 'X') sprites.draw(ctx, sprites.frame('floor_spikes_anim', time, 5), x, y, scale);
      else if (ch === 'E') sprites.draw(ctx, 'floor_ladder', x, y, scale);
      else if (ch === 'S') drawStartHalo(ctx, x, y, cell, time);
    }
  }

  // 第二层：按行从上到下，同一行内先墙面，再宝箱、怪物、角色（站在墙上方一格的角色会被后画的墙面自然遮住脚）
  let treasureIdx = 0;
  const treasureAt = new Map();
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) if (maze.rows[y][x] === 'T') treasureAt.set(y * maze.width + x, treasureIdx++);
  }
  const rowOf = (v) => Math.round(v);
  for (let cy = -MARGIN; cy <= maze.height; cy++) {
    // 墙面：只有下方是可走格才画砖墙正面
    for (let cx = -MARGIN; cx < maze.width + MARGIN; cx++) {
      if (isWall(maze, cx, cy) && !isWall(maze, cx, cy + 1)) drawWallFace(ctx, sprites, layout, cx, cy);
    }
    if (cy >= 0 && cy < maze.height) {
      for (let cx = 0; cx < maze.width; cx++) {
        if (maze.rows[cy][cx] !== 'T') continue;
        const i = treasureAt.get(cy * maze.width + cx);
        drawChest(ctx, sprites, layout, cx, cy, scene, i);
      }
    }
    for (const m of scene.monsters ?? []) {
      if (rowOf(m.y) === cy) drawCharacter(ctx, sprites, layout, m.x, m.y, m.def?.skin ?? 'orc_warrior', m.moving, m.flip, time);
    }
    if (scene.agent && rowOf(scene.agent.y) === cy) {
      const a = scene.agent;
      drawCharacter(ctx, sprites, layout, a.x, a.y, a.hero, a.moving, a.flip, time);
    }
  }
}

function drawStartHalo(ctx, x, y, cell, time) {
  const pulse = 0.5 + 0.5 * Math.sin(time / 400);
  ctx.save();
  ctx.strokeStyle = `rgba(78, 201, 212, ${0.35 + 0.35 * pulse})`;
  ctx.lineWidth = Math.max(2, cell / 16);
  ctx.beginPath();
  ctx.ellipse(x + cell / 2, y + cell * 0.72, cell * 0.36, cell * 0.17, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `rgba(78, 201, 212, ${0.08 + 0.1 * pulse})`;
  ctx.fill();
  ctx.restore();
}

function drawChest(ctx, sprites, layout, cx, cy, scene, index) {
  const frames = sprites.frames('chest_full_open_anim');
  const collected = (scene.mask ?? 0) & (1 << index);
  let f = 0;
  if (collected) {
    const t0 = scene.chestOpenAt?.[index];
    f = t0 === undefined ? frames.length - 1 : Math.min(frames.length - 1, Math.floor(((scene.time - t0) / 300) * frames.length));
  }
  const { x, y } = cellOrigin(layout, cx, cy);
  sprites.draw(ctx, frames[Math.max(0, f)], x, y, layout.scale);
}

/** 角色比格子高：底边对齐格子底边，水平居中 */
function drawCharacter(ctx, sprites, layout, cx, cy, skin, moving, flip, time) {
  const { cell, scale } = layout;
  const prefix = `${skin}_${moving ? 'run' : 'idle'}_anim`;
  const name = sprites.frame(prefix, time, moving ? 10 : 6);
  if (!name) return;
  const [w, h] = sprites.size(name);
  const o = cellOrigin(layout, cx, cy);
  sprites.draw(ctx, name, o.x + (cell - w * scale) / 2, o.y + cell - h * scale, scale, flip);
}

/** 飘字：金色 +10、红色 −10 等。effects = [{text, x, y, t0, color}] */
export function drawEffects(ctx, layout, effects, time) {
  const { cell } = layout;
  ctx.save();
  ctx.font = `bold ${Math.round(cell * 0.34)}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  for (const e of effects) {
    const k = (time - e.t0) / 1000;
    if (k < 0 || k > 1) continue;
    const o = cellOrigin(layout, e.x, e.y);
    ctx.globalAlpha = 1 - k * k;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#14141c';
    ctx.fillStyle = e.color;
    const px = o.x + cell / 2;
    const py = o.y - cell * 0.2 - k * cell * 0.7;
    ctx.strokeText(e.text, px, py);
    ctx.fillText(e.text, px, py);
  }
  ctx.restore();
}
