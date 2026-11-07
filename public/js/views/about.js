// 关于：项目说明与参考来源。
export function mount(container) {
  container.innerHTML = `
    <div class="view single">
      <section class="card about">
        <h2>智能迷宫 · 强化学习寻宝竞技场</h2>
        <p>自己设计一座像素地牢迷宫，让不同的强化学习算法同场竞技，看谁更快、更稳地学会寻宝。</p>
        <h3>当前版本：v1</h3>
        <ul>
          <li>训练场：6 种表格型算法（Q-learning、SARSA、Expected SARSA、蒙特卡洛控制、Actor-Critic、后继表示）。</li>
          <li>寻宝规则：多个宝箱 + 出口，状态里包含“已收集的宝箱”。</li>
          <li>三档速度（观察 / 快速 / 极速）与一键快进。</li>
          <li>冒险视图与算法视图（价值热力图、策略箭头、轨迹）。</li>
        </ul>
        <h3>参考与致谢</h3>
        <ul>
          <li>基于 <a href="https://github.com/awjuliani/web-rl-playground" target="_blank" rel="noopener">awjuliani/web-rl-playground</a>（MIT）改造。</li>
          <li>像素素材：<a href="https://0x72.itch.io/dungeontileset-ii" target="_blank" rel="noopener">0x72 Dungeon Tileset II</a>（CC0）。</li>
          <li>图表：Chart.js（MIT）；公式：KaTeX（MIT）。</li>
        </ul>
        <p class="muted">完整列表见仓库 docs/REFERENCES.md。</p>
      </section>
    </div>`;
  return { unmount() {} };
}
