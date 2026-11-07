// 竞技场：第 2 天（v2）实现。v1 只放占位页。
export function mount(container) {
  container.innerHTML = `
    <div class="view single">
      <section class="card placeholder">
        <h2>竞技场</h2>
        <p>多算法 × 多随机种子的公平比赛、排行榜、学习曲线和路线回放将在 v2 加入。</p>
        <p class="muted">现在可以先到「训练场」单独观察每种算法。</p>
      </section>
    </div>`;
  return { unmount() {} };
}
