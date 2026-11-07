// 通用小组件：创建元素、滑块、分段选择、提示条。

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c);
  return node;
}

/** 带数值显示的滑块。返回 { root, set(value) } */
export function slider({ label, min, max, step, value, format = (v) => String(v), onInput, hint }) {
  const out = el('output', { class: 'mono', text: format(value) });
  const input = el('input', { type: 'range', min, max, step, value });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = format(v);
    onInput(v);
  });
  const root = el('label', { class: 'slider', title: hint ?? '' }, el('span', { class: 'slider-head' }, el('span', { text: label }), out), input);
  return {
    root,
    set(v) {
      input.value = v;
      out.textContent = format(v);
    },
  };
}

/** 分段选择（单选按钮组）。options: [{value, label}] */
export function segmented({ options, value, onChange, label }) {
  const root = el('div', { class: 'segmented', role: 'group', 'aria-label': label ?? '' });
  const buttons = new Map();
  const set = (v) => {
    for (const [val, btn] of buttons) btn.classList.toggle('active', val === v);
  };
  for (const o of options) {
    const btn = el('button', { type: 'button', text: o.label, title: o.title ?? '', onclick: () => { set(o.value); onChange(o.value); } });
    buttons.set(o.value, btn);
    root.append(btn);
  }
  set(value);
  return { root, set };
}

let toastTimer = null;
/** 右下角提示条 */
export function toast(message, kind = 'info') {
  let box = document.getElementById('toast');
  if (!box) {
    box = el('div', { id: 'toast', role: 'status' });
    document.body.append(box);
  }
  box.textContent = message;
  box.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.className = ''; }, 3200);
}
