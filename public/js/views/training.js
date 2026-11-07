// 训练场：单个算法实时训练。三档速度 + 快进，冒险 / 算法双视图，热力图按收集组合分层。
import { el, slider, segmented, toast } from '../ui/components.js';
import { PRESETS } from '../data/presets.js';
import { storage } from '../services/storage.js';
import { Trainer } from '../core/trainer.js';
import { ALGORITHMS, DEFAULT_CONFIG } from '../core/algorithms/index.js';
import { treasureLabel } from '../core/maze.js';
import { getSprites, HEROES, DEFAULT_HERO } from '../render/sprites.js';
import { layoutOf, drawScene, drawEffects, cellOrigin } from '../render/tilemap.js';
import { dimMap, drawHeatmap, drawPolicyArrows, drawPath, drawMonsterZones } from '../render/overlay.js';
import { Mover } from '../render/agent.js';

const STEP_MS = 150; // 观察档：每步用时
const END_PAUSE_MS = 600; // 观察档：回合结束后停顿
const TURBO_BUDGET_MS = 12; // 极速档：每帧的时间预算
const REFRESH_MS = 200; // 极速 / 快进：热力图与曲线的刷新间隔
const ACTION_NAMES = ['上 ↑', '下 ↓', '左 ←', '右 →'];
const OUTCOME_TEXT = { exit: '到达出口', trap: '踩中陷阱', caught: '被怪物抓住', timeout: '超时' };
const STRATEGIES = [
  { value: 'epsilon-greedy', label: 'ε-greedy（ε 概率随机）' },
  { value: 'softmax', label: 'Softmax（按价值加权）' },
  { value: 'random', label: '完全随机' },
  { value: 'greedy', label: '纯贪婪（不探索）' },
];

const popcount = (m) => { let c = 0; for (; m; m &= m - 1) c++; return c; };
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

export async function mount(container) {
  const sprites = await getSprites();
  const saved = await storage.getSettings().catch(() => ({}));
  const explanations = await fetch('js/data/explanations.zh.json').then((r) => r.json()).catch(() => ({}));
  const userMaps = await storage.listMaps().catch(() => []);
  const maps = [...PRESETS, ...userMaps];

  const S = {
    maps,
    mapId: maps.some((m) => m.id === saved.mapId) ? saved.mapId : maps[0].id,
    algorithm: ALGORITHMS[saved.algorithm] ? saved.algorithm : 'q-learning',
    config: { ...DEFAULT_CONFIG, ...(saved.config ?? {}) },
    heroes: { ...DEFAULT_HERO, ...(saved.heroes ?? {}) },
    speed: ['observe', 'fast', 'turbo'].includes(saved.speed) ? saved.speed : 'observe',
    fastSteps: saved.fastSteps ?? 10,
    view: saved.view === 'algorithm' ? 'algorithm' : 'adventure',
    seed: Number.isInteger(saved.seed) ? saved.seed : 1,
    running: false,
    ff: null, // { target, done, resume }
    layer: 0,
    trainer: null,
    agent: new Mover(),
    monsterMovers: [],
    displayMask: 0,
    chestOpenAt: {},
    effects: [],
    nextStepAt: 0,
    lastRefresh: 0,
    heat: null,
    greedy: null,
    chart: null,
    raf: 0,
    alive: true,
  };
  const currentMap = () => S.maps.find((m) => m.id === S.mapId) ?? S.maps[0];
  const hero = () => S.heroes[S.algorithm];

  // ---------- 页面骨架 ----------
  container.innerHTML = '';
  const root = el('div', { class: 'view training' });
  container.append(root);

  const canvas = el('canvas', { class: 'pixel-canvas', width: 480, height: 384 });
  const ctx = canvas.getContext('2d');
  const mapSelect = el('select', { 'aria-label': '选择地图' }, S.maps.map((m) => el('option', { value: m.id, text: `${m.name}（${m.width}×${m.height}）` })));
  mapSelect.value = S.mapId;
  const layerBox = el('div', { class: 'layer-chips' });
  const statsBox = el('div', { class: 'stats' });
  const greedyBox = el('div', { class: 'greedy-badge' });
  const progress = el('progress', { max: 1, value: 0, class: 'ff-progress' });
  const ffBar = el('div', { class: 'ff-bar hidden' }, el('span', { text: '快进中…' }), progress, el('button', { type: 'button', class: 'btn small', text: '中断', onclick: () => cancelFastForward() }));
  const playBtn = el('button', { type: 'button', class: 'btn primary', onclick: () => toggleRun() });
  const stepBtn = el('button', { type: 'button', class: 'btn', text: '单步', onclick: () => singleStep() });
  const resetBtn = el('button', { type: 'button', class: 'btn', text: '重置', onclick: () => resetTrainer() });
  const fastSlider = slider({ label: '每帧步数', min: 1, max: 50, step: 1, value: S.fastSteps, onInput: (v) => { S.fastSteps = v; persist(); } });
  const ffButtons = [100, 500, 1000].map((n) => el('button', { type: 'button', class: 'btn small', text: `快进 ${n} 回合`, onclick: () => startFastForward(n) }));

  const viewSeg = segmented({
    label: '视图', value: S.view,
    options: [{ value: 'adventure', label: '冒险视图', title: '完整像素画面' }, { value: 'algorithm', label: '算法视图', title: '压暗地图，叠加价值热力图与策略箭头' }],
    onChange: (v) => { S.view = v; persist(); computeAnalytics(); },
  });
  const speedSeg = segmented({
    label: '速度', value: S.speed,
    options: [
      { value: 'observe', label: '观察', title: '每步一帧，角色平滑移动，适合讲解' },
      { value: 'fast', label: '快速', title: '每帧执行多步，不做补间' },
      { value: 'turbo', label: '极速', title: '不画角色，每帧尽量多跑；每 200ms 刷新热力图和曲线' },
    ],
    onChange: (v) => setSpeed(v),
  });

  const leftCard = el('section', { class: 'card map-card' },
    el('div', { class: 'card-head' },
      el('label', { class: 'inline' }, el('span', { text: '地图' }), mapSelect),
      viewSeg.root,
    ),
    layerBox,
    el('div', { class: 'canvas-wrap' }, canvas),
    greedyBox,
    el('div', { class: 'controls' }, playBtn, stepBtn, resetBtn, el('span', { class: 'sep' }), speedSeg.root, fastSlider.root),
    el('div', { class: 'controls ff-row' }, el('span', { class: 'muted', text: '极速跑完：' }), ...ffButtons, ffBar),
    statsBox,
  );

  // 右侧：选手、当前状态、曲线、讲解
  const heroBtn = el('button', { type: 'button', class: 'hero-btn', title: '点击换装', 'aria-label': '选择外观' });
  const heroPop = el('div', { class: 'hero-pop hidden' });
  const algoSelect = el('select', { 'aria-label': '选择算法' }, Object.entries(ALGORITHMS).map(([k, v]) => el('option', { value: k, text: v.name })));
  algoSelect.value = S.algorithm;
  const strategySelect = el('select', { 'aria-label': '探索策略' }, STRATEGIES.map((s) => el('option', { value: s.value, text: s.label })));
  strategySelect.value = S.config.explorationStrategy;
  const strategyRow = el('label', { class: 'field' }, el('span', { text: '探索策略' }), strategySelect);
  const seedInput = el('input', { type: 'number', value: S.seed, min: 0, max: 99999, step: 1, class: 'mono' });
  const paramBox = el('div', { class: 'params' });
  const playerCard = el('section', { class: 'card' },
    el('h2', { text: '选手' }),
    el('div', { class: 'player-row' }, el('div', { class: 'hero-wrap' }, heroBtn, heroPop), el('label', { class: 'field grow' }, el('span', { text: '算法' }), algoSelect)),
    strategyRow,
    paramBox,
    el('label', { class: 'field' }, el('span', { text: '随机种子（重置后生效）' }), seedInput),
  );

  const qBody = el('tbody');
  const qCard = el('section', { class: 'card' },
    el('h2', { text: '当前状态' }),
    el('p', { class: 'muted small', id: 'q-state' }),
    el('table', { class: 'qtable' }, el('thead', {}, el('tr', {}, el('th', { text: '动作' }), el('th', { text: 'Q(s,a)' }), el('th', { text: 'π(a|s)' }))), qBody),
  );

  const chartCanvas = el('canvas', { id: 'return-chart', height: 190 });
  const chartCard = el('section', { class: 'card' }, el('h2', { text: '回合回报曲线' }), el('div', { class: 'chart-wrap' }, chartCanvas));
  const explainBody = el('div', { class: 'explain' });
  const explainCard = el('section', { class: 'card' }, el('h2', { text: '算法讲解' }), explainBody);

  root.append(leftCard, el('div', { class: 'side' }, playerCard, qCard, chartCard, explainCard));

  // ---------- 训练器 ----------
  function newTrainer() {
    const maze = currentMap();
    S.trainer = new Trainer({ maze, algorithm: S.algorithm, config: S.config, seed: S.seed });
    const { env } = S.trainer;
    S.agent.reset(env.start.x, env.start.y);
    S.monsterMovers = env.monsters.list.map((m) => new Mover(m.def.x, m.def.y));
    S.displayMask = 0;
    S.chestOpenAt = {};
    S.effects = [];
    S.layer = 0;
    S.nextStepAt = 0;
    S.heat = null;
    S.greedy = null;
  }

  function visualReset(now) {
    const { env } = S.trainer;
    S.agent.reset(env.start.x, env.start.y);
    env.monsters.list.forEach((m, i) => S.monsterMovers[i].reset(m.def.x, m.def.y));
    S.displayMask = 0;
    S.chestOpenAt = {};
    S.nextStepAt = now;
  }

  function setupCanvas() {
    const maze = S.trainer.maze;
    const avail = Math.max(480, (canvas.parentElement.clientWidth || 800) - 8);
    S.scale = layoutOf(maze, 3).width <= avail ? 3 : 2;
    S.layout = layoutOf(maze, S.scale);
    canvas.width = S.layout.width;
    canvas.height = S.layout.height;
    canvas.style.width = `${S.layout.width}px`;
    canvas.style.height = `${S.layout.height}px`;
  }

  function resetTrainer() {
    S.ff = null;
    ffBar.classList.add('hidden');
    S.running = false;
    S.seed = Math.max(0, Math.floor(Number(seedInput.value) || 0));
    newTrainer();
    setupCanvas();
    buildLayerChips();
    buildParams();
    buildExplain();
    updateChart(true);
    computeAnalytics();
    syncButtons();
    persist();
  }

  // ---------- 单步 / 各档位推进 ----------
  function observeStep(now) {
    const t = S.trainer;
    if (!t.active) visualReset(now);
    const prevMask = t.env.mask;
    const r = t.step();
    applyStepVisuals(r, prevMask, now, STEP_MS * 0.9, true);
    S.nextStepAt = now + (r.episodeEnded ? END_PAUSE_MS : STEP_MS);
    if (r.episodeEnded) updateChart();
  }

  function applyStepVisuals(r, prevMask, now, dur, withEffects) {
    const t = S.trainer;
    S.agent.moveTo(r.to.x, r.to.y, now, dur);
    t.env.monsters.list.forEach((m, i) => S.monsterMovers[i].moveTo(m.x, m.y, now, dur));
    S.displayMask = r.mask;
    const gained = r.mask & ~prevMask;
    if (gained) S.chestOpenAt[Math.log2(gained)] = now;
    if (!withEffects || !r.event) return;
    const fx = { treasure: ['+' + t.maze.rewards.treasure, '#f2c14e'], exit: ['+' + t.maze.rewards.exit, '#7ed38a'], trap: [String(t.maze.rewards.trap), '#e05d5d'], caught: [String(t.maze.rewards.monster), '#ffffff'] }[r.event];
    if (fx) S.effects.push({ text: fx[0], x: r.to.x, y: r.to.y, t0: now, color: fx[1] });
  }

  function singleStep() {
    if (S.ff) return;
    S.running = false;
    if (S.speed === 'turbo') setSpeed('observe');
    observeStep(performance.now());
    syncButtons();
    computeAnalytics();
  }

  function fastStep(now) {
    const t = S.trainer;
    for (let i = 0; i < S.fastSteps; i++) {
      if (!t.active) visualReset(now);
      const prevMask = t.env.mask;
      const r = t.step();
      applyStepVisuals(r, prevMask, now, 0, false);
    }
    // 回合边界时已经 reset 过视觉；这里不额外停顿
  }

  function turboStep(startedAt) {
    const t = S.trainer;
    t.finishEpisode();
    let n = 0;
    do {
      t.runEpisode();
      n++;
    } while (performance.now() - startedAt < TURBO_BUDGET_MS);
    S.agent.reset(t.env.start.x, t.env.start.y);
    S.displayMask = 0;
    return n;
  }

  // ---------- 快进 ----------
  function startFastForward(n) {
    if (S.ff) return;
    S.ff = { target: n, done: 0, resume: S.running };
    S.trainer.finishEpisode();
    progress.max = n;
    progress.value = 0;
    ffBar.classList.remove('hidden');
    S.running = false;
    syncButtons();
  }

  function cancelFastForward(finished = false) {
    if (!S.ff) return;
    S.running = S.ff.resume;
    S.ff = null;
    ffBar.classList.add('hidden');
    S.agent.reset(S.trainer.env.start.x, S.trainer.env.start.y);
    S.displayMask = 0;
    S.nextStepAt = performance.now();
    if (finished) toast(`快进完成：已训练 ${S.trainer.episodes} 回合`);
    updateChart(true);
    computeAnalytics();
    syncButtons();
  }

  function ffStep(startedAt) {
    const t = S.trainer;
    const f = S.ff;
    const ran = t.runEpisodes(f.target - f.done, () => performance.now() - startedAt >= TURBO_BUDGET_MS);
    f.done += ran;
    progress.value = f.done;
    if (f.done >= f.target) cancelFastForward(true);
  }

  // ---------- 控制 ----------
  function setSpeed(v) {
    if (S.speed === 'turbo' && v !== 'turbo') {
      S.agent.reset(S.trainer.env.start.x, S.trainer.env.start.y);
      S.displayMask = 0;
    }
    S.speed = v;
    speedSeg.set(v);
    S.nextStepAt = performance.now();
    fastSlider.root.classList.toggle('hidden', v !== 'fast');
    persist();
  }

  function toggleRun() {
    if (S.ff) return;
    S.running = !S.running;
    S.nextStepAt = performance.now();
    syncButtons();
  }

  function syncButtons() {
    playBtn.textContent = S.running ? '⏸ 暂停' : '▶ 开始';
    stepBtn.disabled = Boolean(S.ff);
    playBtn.disabled = Boolean(S.ff);
    ffButtons.forEach((b) => { b.disabled = Boolean(S.ff); });
    fastSlider.root.classList.toggle('hidden', S.speed !== 'fast');
  }

  // ---------- 面板 ----------
  function buildLayerChips() {
    layerBox.innerHTML = '';
    const { env } = S.trainer;
    if (env.K === 0) { layerBox.classList.add('hidden'); return; }
    layerBox.classList.remove('hidden');
    layerBox.append(el('span', { class: 'muted small', text: '热力图分层（已收集的宝箱）：' }));
    for (let m = 0; m <= env.fullMask; m++) {
      const label = m === 0 ? '未收集' : `已收集${[...Array(env.K).keys()].filter((i) => m & (1 << i)).map(treasureLabel).join('')}`;
      const chip = el('button', { type: 'button', class: `chip${m === S.layer ? ' active' : ''}`, text: label, onclick: () => { S.layer = m; buildLayerChips(); computeAnalytics(); } });
      layerBox.append(chip);
    }
  }

  const PARAM_DEFS = {
    learningRate: { label: '学习率 α', min: 0.01, max: 1, step: 0.01, hint: '每次更新朝目标前进多少' },
    discountFactor: { label: '折扣 γ', min: 0, max: 0.99, step: 0.01, hint: '越大越看重长远奖励' },
    explorationRate: { label: '探索率 ε', min: 0, max: 1, step: 0.01, hint: '随机选动作的概率' },
    softmaxBeta: { label: 'Softmax β', min: 0.1, max: 10, step: 0.1, hint: '越大越偏向价值高的动作' },
    actorLearningRate: { label: 'Actor 学习率', min: 0.01, max: 1, step: 0.01 },
    criticLearningRate: { label: 'Critic 学习率', min: 0.01, max: 1, step: 0.01 },
    srMWeightLearningRate: { label: 'SR 占有量学习率', min: 0.01, max: 1, step: 0.01 },
    srWWeightLearningRate: { label: 'SR 奖励学习率', min: 0.01, max: 1, step: 0.01 },
  };

  function paramKeys() {
    const strat = S.config.explorationStrategy;
    const explore = [...(strat === 'epsilon-greedy' ? ['explorationRate'] : []), ...(strat === 'softmax' ? ['softmaxBeta'] : [])];
    switch (S.algorithm) {
      case 'actor-critic': return ['actorLearningRate', 'criticLearningRate', 'discountFactor'];
      case 'sr': return ['srMWeightLearningRate', 'srWWeightLearningRate', 'discountFactor', ...explore];
      default: return ['learningRate', 'discountFactor', ...explore];
    }
  }

  function buildParams() {
    paramBox.innerHTML = '';
    strategyRow.classList.toggle('hidden', S.algorithm === 'actor-critic');
    strategySelect.value = S.config.explorationStrategy;
    for (const key of paramKeys()) {
      const d = PARAM_DEFS[key];
      const s = slider({
        label: d.label, min: d.min, max: d.max, step: d.step, value: S.config[key], hint: d.hint,
        format: (v) => v.toFixed(2),
        onInput: (v) => { S.config[key] = v; S.trainer.algo.updateConfig({ [key]: v }); persist(); },
      });
      paramBox.append(s.root);
    }
  }

  function buildExplain() {
    explainBody.innerHTML = '';
    const info = explanations[S.algorithm];
    if (!info) return;
    explainBody.append(el('h3', { text: info.name }), el('p', { class: 'tag', text: info.tag }), el('p', { text: info.summary }));
    for (const f of info.formulas ?? []) {
      const box = el('div', { class: 'formula' }, el('span', { class: 'muted small', text: f.label }));
      const m = el('div', { class: 'tex' });
      try { window.katex.render(f.tex, m, { throwOnError: false, displayMode: true }); } catch { m.textContent = f.tex; }
      box.append(m);
      explainBody.append(box);
    }
    if (info.tips) explainBody.append(el('p', { class: 'muted small', text: `提示：${info.tips}` }));
    const st = explanations.state;
    if (st) explainBody.append(el('details', {}, el('summary', { text: st.title }), el('p', { text: st.text }), el('p', { text: st.monster })));
  }

  function buildHeroPicker() {
    heroBtn.innerHTML = '';
    heroBtn.append(avatar(hero(), 3));
    heroPop.innerHTML = '';
    for (const h of HEROES) {
      heroPop.append(el('button', { type: 'button', class: `hero-opt${h.id === hero() ? ' active' : ''}`, title: h.name, onclick: () => { S.heroes[S.algorithm] = h.id; heroPop.classList.add('hidden'); buildHeroPicker(); persist(); } }, avatar(h.id, 3)));
    }
  }

  function avatar(id, scale) {
    const c = el('canvas', { width: 16 * scale, height: 28 * scale, class: 'avatar' });
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    sprites.draw(g, `${id}_idle_anim_f0`, 0, 0, scale);
    return c;
  }

  // ---------- 统计与分析（极速时 200ms 一次） ----------
  function computeAnalytics() {
    const t = S.trainer;
    const { env, algo } = t;
    // 热力图：所有分层用统一色阶，才能看出"拿到宝箱后的状态更值钱"
    const layers = [];
    let vmin = Infinity;
    let vmax = -Infinity;
    for (let m = 0; m <= env.fullMask; m++) {
      const grid = new Array(env.W * env.H).fill(null);
      for (let y = 0; y < env.H; y++) {
        for (let x = 0; x < env.W; x++) {
          const ch = t.maze.rows[y][x];
          if (ch === '#') continue;
          const v = algo.stateValue(env.encode(x, y, m));
          grid[y * env.W + x] = v;
          if (ch !== 'X' && ch !== 'E') { vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); }
        }
      }
      layers.push(grid);
    }
    if (!Number.isFinite(vmin)) { vmin = 0; vmax = 1; }
    const best = new Array(env.W * env.H).fill(null);
    for (let y = 0; y < env.H; y++) {
      for (let x = 0; x < env.W; x++) {
        const ch = t.maze.rows[y][x];
        if (ch === '#' || ch === 'X' || ch === 'E') continue;
        const b = algo.bestActions(env.encode(x, y, S.layer));
        if (b.length < 4) best[y * env.W + x] = b;
      }
    }
    S.heat = { layers, vmin, vmax, best };
    S.greedy = t.evaluate();
    renderStats();
    renderQPanel();
    S.lastRefresh = performance.now();
  }

  function renderStats() {
    const t = S.trainer;
    const g = S.greedy;
    statsBox.innerHTML = '';
    const items = [
      ['回合', t.episodes],
      ['本回合步数', t.active ? t.env.steps : (t.lengths.at(-1) ?? 0)],
      ['最近 100 回合成功率', `${fmt(t.recentSuccessRate(100) * 100, 0)}%`],
      ['最近 20 回合平均回报', t.episodes ? fmt(t.recentMeanReturn(20)) : '—'],
    ];
    for (const [k, v] of items) statsBox.append(el('div', {}, el('span', { class: 'muted', text: k }), el('strong', { class: 'mono', text: String(v) })));
    if (g) {
      const r = g.route;
      const K = t.env.K;
      const ok = r.outcome === 'exit' && r.treasures === K;
      let text = `贪婪策略路线：拿到 ${r.treasures}/${K} 个宝箱 → ${OUTCOME_TEXT[r.outcome]} · 回报 ${fmt(r.totalReturn)} · ${r.steps} 步`;
      if (t.maze.monsters.length) text += ` ｜ 评估成功率 ${fmt(g.successRate * 100, 0)}%（${20} 回合）`;
      greedyBox.textContent = t.episodes === 0 ? '贪婪策略路线：还没有训练' : text;
      greedyBox.classList.toggle('good', t.episodes > 0 && ok);
    }
  }

  function renderQPanel() {
    const t = S.trainer;
    const { env, algo } = t;
    const s = env.state;
    const { x, y, mask } = env.decode(s);
    document.getElementById('q-state').textContent = `位置 (${x}, ${y})，已收集 ${popcount(mask)}/${env.K} 个宝箱`;
    const values = algo.actionValues(s);
    const probs = algo.actionProbs(s);
    const bestA = algo.bestActions(s);
    qBody.innerHTML = '';
    for (let a = 0; a < 4; a++) {
      qBody.append(el('tr', { class: bestA.includes(a) && bestA.length < 4 ? 'best' : '' },
        el('td', { text: ACTION_NAMES[a] }),
        el('td', { class: 'mono', text: fmt(values[a], 2) }),
        el('td', {}, el('span', { class: 'bar' }, el('i', { style: `width:${Math.round(probs[a] * 100)}%` })), el('span', { class: 'mono', text: `${Math.round(probs[a] * 100)}%` }))));
    }
  }

  // ---------- 曲线 ----------
  function initChart() {
    if (!window.Chart) { chartCanvas.replaceWith(el('p', { class: 'muted', text: '图表库未加载' })); return; }
    S.chart = new window.Chart(chartCanvas, {
      type: 'line',
      data: { labels: [], datasets: [
        { label: '每回合回报', data: [], borderColor: 'rgba(154,154,176,0.45)', borderWidth: 1, pointRadius: 0, tension: 0 },
        { label: '滑动平均（20 回合）', data: [], borderColor: '#4ec9d4', borderWidth: 2, pointRadius: 0, tension: 0.2 },
      ] },
      options: {
        animation: false, responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        scales: {
          x: { title: { display: true, text: '回合', color: '#9a9ab0' }, ticks: { color: '#9a9ab0', maxTicksLimit: 8, maxRotation: 0 }, grid: { color: '#2e2e3e' } },
          y: { title: { display: true, text: '训练回报（含探索）', color: '#9a9ab0' }, ticks: { color: '#9a9ab0' }, grid: { color: '#2e2e3e' } },
        },
        plugins: { legend: { labels: { color: '#e8e8f0', boxWidth: 14 } } },
      },
    });
  }

  function updateChart() {
    if (!S.chart) return;
    const r = S.trainer.returns;
    const n = r.length;
    const maxPts = 500;
    const bucket = Math.max(1, Math.ceil(n / maxPts));
    const labels = [];
    const raw = [];
    const avg = [];
    for (let i = 0; i < n; i += bucket) {
      let sum = 0;
      let cnt = 0;
      for (let j = i; j < Math.min(n, i + bucket); j++) { sum += r[j]; cnt++; }
      const lo = Math.max(0, Math.min(n, i + bucket) - 20);
      let sa = 0;
      for (let j = lo; j < Math.min(n, i + bucket); j++) sa += r[j];
      labels.push(Math.min(n, i + bucket));
      raw.push(sum / cnt);
      avg.push(sa / (Math.min(n, i + bucket) - lo));
    }
    S.chart.data.labels = labels;
    S.chart.data.datasets[0].data = raw;
    S.chart.data.datasets[1].data = avg;
    S.chart.update('none');
  }

  // ---------- 绘制 ----------
  function render(now) {
    const t = S.trainer;
    const maze = t.maze;
    const hidden = (S.running && S.speed === 'turbo') || S.ff;
    const scene = {
      time: now,
      mask: S.displayMask,
      chestOpenAt: S.chestOpenAt,
      agent: null,
      monsters: [],
    };
    if (!hidden) {
      const p = S.agent.pos(now);
      scene.agent = { x: p.x, y: p.y, hero: hero(), moving: p.moving, flip: S.agent.flip };
      scene.monsters = S.monsterMovers.map((mv, i) => {
        const mp = mv.pos(now);
        return { x: mp.x, y: mp.y, def: maze.monsters[i], moving: mp.moving, flip: mv.flip };
      });
    }
    drawScene(ctx, sprites, maze, S.layout, scene);

    if (S.view === 'algorithm' && S.heat) {
      dimMap(ctx, S.layout);
      drawMonsterZones(ctx, S.layout, maze);
      const layer = S.heat.layers[S.layer];
      drawHeatmap(ctx, S.layout, maze, (x, y) => layer[y * maze.width + x], S.heat.vmin, S.heat.vmax, { numbers: S.scale >= 3 || maze.width <= 12 });
      drawPolicyArrows(ctx, S.layout, maze, (x, y) => S.heat.best[y * maze.width + x]);
      drawPath(ctx, S.layout, t.lastPath);
      if (!hidden) {
        const p = S.agent.pos(now);
        const o = cellOrigin(S.layout, p.x, p.y);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(o.x + S.layout.cell / 2, o.y + S.layout.cell / 2, S.layout.cell * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    S.effects = S.effects.filter((e) => now - e.t0 < 1000);
    drawEffects(ctx, S.layout, S.effects, now);
  }

  // ---------- 主循环 ----------
  function frame(now) {
    if (!S.alive) return;
    let analyticsDue = false;
    if (S.ff) {
      ffStep(performance.now());
      analyticsDue = performance.now() - S.lastRefresh > REFRESH_MS;
    } else if (S.running) {
      if (S.speed === 'observe') {
        if (now >= S.nextStepAt) observeStep(now);
        analyticsDue = performance.now() - S.lastRefresh > REFRESH_MS;
      } else if (S.speed === 'fast') {
        fastStep(now);
        analyticsDue = performance.now() - S.lastRefresh > REFRESH_MS;
      } else {
        turboStep(performance.now());
        analyticsDue = performance.now() - S.lastRefresh > REFRESH_MS;
      }
    }
    if (analyticsDue && S.alive) {
      computeAnalytics();
      updateChart();
    }
    render(now);
    S.raf = requestAnimationFrame(frame);
  }

  // ---------- 事件 ----------
  const persist = () => storage.saveSettings({
    mapId: S.mapId, algorithm: S.algorithm, config: S.config, heroes: S.heroes, speed: S.speed,
    fastSteps: S.fastSteps, view: S.view, seed: S.seed,
  }).catch((e) => toast(e.message, 'error'));

  mapSelect.addEventListener('change', () => { S.mapId = mapSelect.value; resetTrainer(); });
  algoSelect.addEventListener('change', () => { S.algorithm = algoSelect.value; resetTrainer(); buildHeroPicker(); });
  strategySelect.addEventListener('change', () => {
    S.config.explorationStrategy = strategySelect.value;
    S.trainer.algo.updateConfig({ explorationStrategy: strategySelect.value });
    buildParams();
    persist();
  });
  seedInput.addEventListener('change', () => resetTrainer());
  heroBtn.addEventListener('click', (e) => { e.stopPropagation(); heroPop.classList.toggle('hidden'); });
  const closePop = () => heroPop.classList.add('hidden');
  document.addEventListener('click', closePop);

  // ---------- 启动 ----------
  initChart();
  newTrainer();
  setupCanvas();
  buildLayerChips();
  buildParams();
  buildExplain();
  buildHeroPicker();
  fastSlider.root.classList.toggle('hidden', S.speed !== 'fast');
  syncButtons();
  computeAnalytics();
  S.raf = requestAnimationFrame(frame);

  // 供自动化截图 / 调试使用（不影响正常使用）
  root.__training = S;

  return {
    unmount() {
      S.alive = false;
      cancelAnimationFrame(S.raf);
      document.removeEventListener('click', closePop);
      if (S.chart) S.chart.destroy();
    },
  };
}
