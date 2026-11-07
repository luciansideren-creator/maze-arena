// hash 路由：#/workshop #/training #/arena #/about
const VIEWS = {
  '/workshop': () => import('./views/workshop.js'),
  '/training': () => import('./views/training.js'),
  '/arena': () => import('./views/arena.js'),
  '/about': () => import('./views/about.js'),
};
const DEFAULT_ROUTE = '/training';

const app = document.getElementById('app');
let current = null;
let token = 0;

async function navigate() {
  const route = location.hash.replace(/^#/, '') || DEFAULT_ROUTE;
  const loader = VIEWS[route] ?? VIEWS[DEFAULT_ROUTE];
  const activeRoute = VIEWS[route] ? route : DEFAULT_ROUTE;
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === activeRoute));
  const mine = ++token;
  if (current?.unmount) current.unmount();
  current = null;
  try {
    const mod = await loader();
    if (mine !== token) return;
    const view = await mod.mount(app);
    if (mine !== token) { view?.unmount?.(); return; }
    current = view;
  } catch (err) {
    console.error(err);
    app.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'view';
    box.innerHTML = '<section class="card"><h2>页面加载失败</h2><p class="muted"></p></section>';
    box.querySelector('p').textContent = err.message;
    app.append(box);
  }
}

window.addEventListener('hashchange', navigate);
navigate();
