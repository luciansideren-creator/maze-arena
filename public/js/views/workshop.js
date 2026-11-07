// 迷宫工坊：第 3 天（v3）实现。v1 只放占位页。
export function mount(container) {
  container.innerHTML = `
    <div class="view single">
      <section class="card placeholder">
        <h2>迷宫工坊</h2>
        <p>编辑器、预设关卡、保存 / 导入 / 分享和 AI 生成迷宫将在 v3 加入。</p>
        <p class="muted">现在可以先到「训练场」看智能体学习。</p>
      </section>
    </div>`;
  return { unmount() {} };
}
