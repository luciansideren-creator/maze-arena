# 智能迷宫 · 强化学习寻宝竞技场

自己设计一座像素地牢迷宫，让不同的强化学习算法同场竞技，看谁更快、更稳地学会寻宝。
课程项目，基于 [awjuliani/web-rl-playground](https://github.com/awjuliani/web-rl-playground)（MIT）改造。

## 运行

需要 Node.js 18 或更高版本，浏览器用最新版 Chrome / Edge，窗口宽度至少 1280px。

```bash
npm install
npm start
```

然后打开 http://localhost:3000 。运行单元测试：

```bash
npm test
```

## 文档

- `docs/DESIGN.md`：设计文档（唯一设计依据）
- `docs/ITERATIONS.md`：迭代日志
- `docs/AI_USAGE.md`：AI 辅助开发说明
- `docs/REFERENCES.md`：参考来源与第三方许可
- `legacy/`：原项目文件，保留作对照

## 目录

`server/` Express 后端；`public/` 前端（`js/core/` 为纯逻辑，可在浏览器、Worker、Node 中运行）；`tests/` 单元测试。
