// 网格上的 BFS，纯逻辑。四邻接，方向顺序固定（上、下、左、右）以保证确定性。

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

/**
 * 多源 BFS，返回每格到最近源点的步数（不可达为 -1）。
 * @param {number} w 宽
 * @param {number} h 高
 * @param {Array<[number,number]>} sources 起点列表 [x, y]
 * @param {(x:number,y:number)=>boolean} canEnter 该格能否进入
 * @param {(x:number,y:number)=>boolean} [canExpand] 到达该格后是否继续向外扩展（默认 true）
 */
export function bfsDistances(w, h, sources, canEnter, canExpand = () => true) {
  const dist = new Int32Array(w * h).fill(-1);
  const queue = [];
  for (const [x, y] of sources) {
    if (x < 0 || y < 0 || x >= w || y >= h || dist[y * w + x] >= 0) continue;
    dist[y * w + x] = 0;
    queue.push(y * w + x);
  }
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    const x = idx % w;
    const y = (idx - x) / w;
    if (!canExpand(x, y)) continue;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (dist[n] >= 0 || !canEnter(nx, ny)) continue;
      dist[n] = dist[idx] + 1;
      queue.push(n);
    }
  }
  return dist;
}

/** 沿距离场下降一步：返回 [nx, ny]，没有更近的邻格则返回 null。 */
export function stepDownhill(w, h, dist, x, y) {
  const here = dist[y * w + x];
  if (here <= 0) return null;
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    if (dist[ny * w + nx] === here - 1) return [nx, ny];
  }
  return null;
}
