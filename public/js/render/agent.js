// 角色位置补间：在格子之间平滑移动，朝向随左右移动翻转。

export class Mover {
  constructor(x = 0, y = 0) {
    this.reset(x, y);
  }

  reset(x, y) {
    this.fx = this.tx = x;
    this.fy = this.ty = y;
    this.t0 = 0;
    this.dur = 0;
    this.flip = false;
  }

  /** 从当前位置移到 (x, y)，用时 dur 毫秒；dur=0 直接跳过去（快速档） */
  moveTo(x, y, now, dur) {
    const cur = this.pos(now);
    if (x < this.tx) this.flip = true;
    else if (x > this.tx) this.flip = false;
    this.fx = dur > 0 ? cur.x : x;
    this.fy = dur > 0 ? cur.y : y;
    this.tx = x;
    this.ty = y;
    this.t0 = now;
    this.dur = dur;
  }

  pos(now) {
    if (this.dur <= 0 || now >= this.t0 + this.dur) return { x: this.tx, y: this.ty, moving: false };
    const k = (now - this.t0) / this.dur;
    return { x: this.fx + (this.tx - this.fx) * k, y: this.fy + (this.ty - this.fy) * k, moving: true };
  }
}
