// Express 服务：托管 public/，挂载 /api。
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { aiRouter } from './ai.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 读取 .env（不引入 dotenv，保持依赖只有 express）。密钥只放在 .env，不入库。
function loadEnv(file) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* 没有 .env 也能运行 */ }
}
loadEnv(path.join(root, '.env'));

const app = express();
app.use(express.json({ limit: '100kb' }));
app.get('/api/health', (req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(process.env.AI_API_KEY) });
});
app.use('/api/ai', aiRouter);
app.use(express.static(path.join(root, 'public')));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`智能迷宫已启动：http://localhost:${port}`);
});
