import { PRESETS } from '../public/js/data/presets.js';

export const NOVICE = PRESETS[0];

/** 造一张测试用地图（6×5，合法）。rows 里可以直接写 P/G。 */
export function mk(rows, extra = {}) {
  return { name: 'test', width: rows[0].length, height: rows.length, rows, ...extra };
}

export const OPEN = [
  'S.....',
  '......',
  '..T...',
  '......',
  '.....E',
];
