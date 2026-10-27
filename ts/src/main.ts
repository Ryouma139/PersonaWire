/* Persona Wire — ルーター / シェル */
import './styles.css';
import { store } from './store';
import * as ui from './ui';
import type { View } from './types';
import { dashboard } from './views/dashboard';
import { inbox } from './views/inbox';
import { delivery } from './views/delivery';
import { personas } from './views/personas';
import { products } from './views/products';
import { notion } from './views/notion';
import { site } from './views/site';

const views = { dashboard, inbox, delivery, personas, products, notion, site } satisfies Record<string, View>;
type RouteName = keyof typeof views;

const root = ui.byId('view');
let current: RouteName = 'dashboard';

const isRoute = (name: string): name is RouteName => name in views;

function route(): RouteName {
  const name = (location.hash || '#dashboard').slice(1).split('/')[0];
  return isRoute(name) ? name : 'dashboard';
}

function renderShell(): void {
  const s = store.state;
  document.querySelectorAll<HTMLAnchorElement>('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === current));

  const pending = s.items.filter((i) => i.status === 'pending').length;
  const badge = ui.byId('badge-inbox');
  badge.textContent = pending ? String(pending) : '';
  badge.hidden = !pending;

  const n = s.notion;
  const label = !n.connected ? '未接続' : n.syncing ? '同期中…' : 'Notion 同期中';
  ui.byId('sync-status').innerHTML = `
    <a href="#notion" class="sync ${n.connected ? '' : 'off'} ${n.syncing ? 'busy' : ''}">
      <span class="dot"></span>
      <span><strong>${ui.esc(label)}</strong><small>最終同期 ${ui.fmtDate(n.lastSync)}</small></span>
    </a>`;
}

function render(): void {
  current = route();
  root.onclick = root.onchange = root.oninput = root.onsubmit = null;
  views[current].render(root);
  renderShell();
}

// 状態変化時は現在のビューを再描画（スクロール位置は維持）
store.subscribe(() => {
  const y = window.scrollY;
  views[current].render(root);
  renderShell();
  window.scrollTo(0, y);
});

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
  document.body.classList.remove('nav-open');
});

ui.byId('menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
ui.byId('scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));

render();
