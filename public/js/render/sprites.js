// 图集加载与帧动画。素材：0x72 Dungeon Tileset II v1.7（CC0），坐标来自 tiles.json。

export const HEROES = [
  { id: 'knight_m', name: '骑士（男）' }, { id: 'knight_f', name: '骑士（女）' },
  { id: 'elf_m', name: '精灵（男）' }, { id: 'elf_f', name: '精灵（女）' },
  { id: 'wizzard_m', name: '巫师（男）' }, { id: 'wizzard_f', name: '巫师（女）' },
  { id: 'dwarf_m', name: '矮人（男）' }, { id: 'dwarf_f', name: '矮人（女）' },
  { id: 'lizard_m', name: '蜥蜴人（男）' }, { id: 'lizard_f', name: '蜥蜴人（女）' },
];

export const MONSTER_SKINS = [
  { id: 'orc_warrior', name: '兽人' }, { id: 'skelet', name: '骷髅' }, { id: 'imp', name: '小恶魔' },
  { id: 'big_demon', name: '大恶魔' }, { id: 'goblin', name: '哥布林' },
];

/** 默认外观：Q-learning 骑士、SARSA 精灵、Expected SARSA 巫师、蒙特卡洛 矮人、Actor-Critic 蜥蜴人 */
export const DEFAULT_HERO = {
  'q-learning': 'knight_m', sarsa: 'elf_f', 'expected-sarsa': 'wizzard_m',
  'monte-carlo': 'dwarf_m', 'actor-critic': 'lizard_m', sr: 'knight_f',
};

/** 确定性的格子哈希（用于选地板变体、岩体纹理，避免每帧闪变） */
export function cellHash(x, y, salt = 0) {
  let h = (Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263) + Math.imul(salt + 1, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Sprites {
  constructor(img, tiles) {
    this.img = img;
    this.tiles = tiles;
    this.anims = new Map();
  }

  static async load(base = 'assets/tiles/') {
    const [tiles, img] = await Promise.all([
      fetch(`${base}tiles.json`).then((r) => r.json()),
      new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('素材图加载失败'));
        im.src = `${base}tileset.png`;
      }),
    ]);
    return new Sprites(img, tiles);
  }

  has(name) {
    return name in this.tiles;
  }

  size(name) {
    const t = this.tiles[name];
    return t ? [t[2], t[3]] : [16, 16];
  }

  /** 画图块，(dx, dy) 为左上角像素坐标；scale 为整数倍 */
  draw(ctx, name, dx, dy, scale, flip = false) {
    const t = this.tiles[name];
    if (!t) return;
    const [sx, sy, w, h] = t;
    if (flip) {
      ctx.save();
      ctx.translate(Math.round(dx + w * scale), Math.round(dy));
      ctx.scale(-1, 1);
      ctx.drawImage(this.img, sx, sy, w, h, 0, 0, w * scale, h * scale);
      ctx.restore();
    } else {
      ctx.drawImage(this.img, sx, sy, w, h, Math.round(dx), Math.round(dy), w * scale, h * scale);
    }
  }

  /** 动画帧名列表，如 frames('knight_m_run_anim') → [..._f0, ..._f1, ...] */
  frames(prefix) {
    let list = this.anims.get(prefix);
    if (!list) {
      list = [];
      while (this.has(`${prefix}_f${list.length}`)) list.push(`${prefix}_f${list.length}`);
      this.anims.set(prefix, list);
    }
    return list;
  }

  /** 按时间取当前帧名 */
  frame(prefix, timeMs, fps = 8) {
    const list = this.frames(prefix);
    if (!list.length) return null;
    return list[Math.floor((timeMs / 1000) * fps) % list.length];
  }
}

let loading = null;
export function getSprites() {
  if (!loading) loading = Sprites.load();
  return loading;
}
