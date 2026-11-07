# 给 AI 编码工具的规则

本项目：智能迷宫 · 强化学习寻宝竞技场。基于 awjuliani/web-rl-playground（MIT）改造的课程项目。

## 开工前必读
1. `docs/DESIGN.md`：唯一设计依据。不要自行增删功能或改技术栈。
2. `docs/ITERATIONS.md`：了解当前做到哪个版本。

## 硬性约束
- 前端：原生 HTML/CSS/JS + ES Modules。**不引入** React/Vue、TypeScript、打包构建工具。
- `public/js/core/` 是纯逻辑：禁止使用 `document`、`window`、DOM API、`Math.random()`。随机数一律用 `core/rng.js`。
- 第三方库放 `public/vendor/`，不要使用 CDN 链接。
- 视图通过 `public/js/services/` 访问存储和 AI，不直接操作 localStorage 或 fetch 外部接口。
- 密钥只能出现在 `.env`（不入库）。不得把任何密钥写进代码、日志或提交记录。
- 界面文字一律中文；代码标识符用英文，注释可用中文。

## 每次改动后
- `core/` 有改动就运行 `npm test`，保证通过。
- 在 `docs/ITERATIONS.md` 当前版本下补一条记录：问题 → 修改 → 结果。
- 如果确实需要偏离设计，先在回复里说明理由，得到确认后再改 `docs/DESIGN.md`。

## 提交规范
- 提交信息用中文，格式：`v1: 简述`（版本号前缀 + 做了什么）。
- 每个版本完成后打标签：`v0`、`v1`……
