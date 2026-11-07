// 预设关卡（只读）。v1 只有"新手地牢"，其余在 v3 加入。
export const PRESETS = [
  {
    id: 'preset-novice',
    name: '新手地牢',
    width: 8,
    height: 6,
    rows: [
      '........',
      '.###.#..',
      'S###.#..',
      '....#T..',
      '.##...#E',
      '........',
    ],
    rewards: { treasure: 10, exit: 10, trap: -10, monster: -10, step: -0.1 },
    monsters: [],
    maxSteps: 300,
    exitRequiresAllTreasures: false,
    source: 'preset',
  },
];
