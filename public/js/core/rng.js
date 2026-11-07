// 可设种子的伪随机数（mulberry32）。core/ 内所有随机性都必须走这里，禁止 Math.random()。

/** 把任意个整数混合成一个 32 位种子（用于派生子种子）。 */
export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h ^= (Number(p) | 0) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed = 0) {
    this.seed = hashSeed(seed);
    this.a = this.seed;
  }

  /** [0, 1) 的浮点数 */
  next() {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [0, n) 的整数 */
  int(n) {
    return Math.floor(this.next() * n);
  }

  /** 以概率 p 返回 true */
  chance(p) {
    return this.next() < p;
  }

  /** 从数组中等概率取一个 */
  pick(arr) {
    return arr[this.int(arr.length)];
  }

  /** 派生一个独立的新随机数生成器（不影响当前序列） */
  fork(salt = 0) {
    return new Rng(hashSeed(this.seed, salt));
  }
}

export function createRng(seed = 0) {
  return new Rng(seed);
}

/** 由基础种子和盐值得到子种子，如 deriveSeed(seed, 1) 给环境，deriveSeed(seed, 2) 给算法 */
export function deriveSeed(seed, salt) {
  return hashSeed(seed, salt);
}
