// 存储接口。中期用 localStorage；期末换成 HTTP API，接口不变，所以所有方法都返回 Promise。
// 读写异常（隐私模式、存储满）时抛出带中文说明的 Error，由调用方提示，不让页面崩溃。

const PREFIX = 'maze-arena:';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    throw new Error('浏览器存储不可用或已满，改动没有保存');
  }
}

const newId = () => `${Date.now().toString(36)}-${Math.floor(performance.now() * 1000).toString(36)}`;

export const storage = {
  async listMaps() {
    return read('maps', []);
  },
  async getMap(id) {
    return read('maps', []).find((m) => m.id === id) ?? null;
  },
  async saveMap(map) {
    const maps = read('maps', []);
    const saved = { ...map, id: map.id ?? newId(), createdAt: map.createdAt ?? new Date().toISOString() };
    const i = maps.findIndex((m) => m.id === saved.id);
    if (i >= 0) maps[i] = saved;
    else maps.push(saved);
    write('maps', maps);
    return saved;
  },
  async deleteMap(id) {
    write('maps', read('maps', []).filter((m) => m.id !== id));
  },

  async listRuns(limit = 20) {
    return read('runs', []).slice(0, limit);
  },
  async getRun(id) {
    return read('runs', []).find((r) => r.id === id) ?? null;
  },
  async saveRun(run) {
    const runs = read('runs', []);
    const saved = { ...run, id: run.id ?? newId(), createdAt: run.createdAt ?? new Date().toISOString() };
    write('runs', [saved, ...runs.filter((r) => r.id !== saved.id)].slice(0, 20));
    return saved;
  },

  async getSettings() {
    return read('settings', {});
  },
  async saveSettings(obj) {
    write('settings', { ...read('settings', {}), ...obj });
  },
};
