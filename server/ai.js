// AI 接口代理（v3 实现）。v1 只放占位，保证路由结构稳定。
import express from 'express';

export const aiRouter = express.Router();

function notReady(req, res) {
  res.status(501).json({ error: 'AI 功能将在 v3 提供' });
}

aiRouter.post('/commentary', notReady);
aiRouter.post('/maze', notReady);
