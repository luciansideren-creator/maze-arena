# 参考来源与第三方许可

## 参考项目

| 项目 | 许可 | 用途 | 优点 | 不足（本项目的改进） |
|---|---|---|---|---|
| [awjuliani/web-rl-playground](https://github.com/awjuliani/web-rl-playground) | MIT | 本项目基于它改造：6 种表格型算法的思路、价值 / 策略可视化、算法讲解 | 算法齐全、可视化直观、纯前端 | 全局单例、一次只能跑一个算法；随机数不可复现；碰到宝石即结束，状态只含位置；每步刷新画面训练很慢；英文界面 |

原项目基线提交为 `4855420`（标签 `v0`），其文件保留在 `legacy/` 供对照。

## 第三方素材与库

| 名称 | 许可 | 位置 |
|---|---|---|
| [0x72 Dungeon Tileset II v1.7](https://0x72.itch.io/dungeontileset-ii)（作者 0x72） | CC0 | `assets-src/`（原始包）、`public/assets/tiles/`（运行时使用） |
| [Chart.js](https://www.chartjs.org/) 4.4.3 | MIT | `public/vendor/chart.umd.min.js` |
| [KaTeX](https://katex.org/) 0.16.22 | MIT | `public/vendor/katex/` |
| [Express](https://expressjs.com/) 4 | MIT | npm 依赖（仅后端） |

第三方库全部下载到 `public/vendor/`，运行时不依赖 CDN。

## 算法参考

- Sutton & Barto, *Reinforcement Learning: An Introduction*（第 2 版）：Q-learning、SARSA、Expected SARSA、蒙特卡洛控制、Actor-Critic。
- Dayan, *Improving Generalization for Temporal Difference Learning: The Successor Representation*, 1993：后继表示。
