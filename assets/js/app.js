/* Persona Wire — ルーター / シェル */
(function () {
  const { store, ui, views } = window.PW;
  const root = document.getElementById('view');
  let current = null;

  function route() {
    const name = (location.hash || '#dashboard').slice(1).split('/')[0];
    return views[name] ? name : 'dashboard';
  }

  function renderShell() {
    const s = store.state;
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === current));

    const pending = s.items.filter((i) => i.status === 'pending').length;
    const badge = document.getElementById('badge-inbox');
    badge.textContent = pending || '';
    badge.hidden = !pending;

    const n = s.notion;
    const label = !n.connected ? '未接続' : n.syncing ? '同期中…' : 'Notion 同期中';
    document.getElementById('sync-status').innerHTML = `
      <a href="#notion" class="sync ${n.connected ? '' : 'off'} ${n.syncing ? 'busy' : ''}">
        <span class="dot"></span>
        <span><strong>${ui.esc(label)}</strong><small>最終同期 ${ui.fmtDate(n.lastSync)}</small></span>
      </a>`;
  }

  function render() {
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

  document.getElementById('menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  document.getElementById('scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));

  // 共通ページヘッダー
  ui.pageHead = (title, sub, actions = '') => `
    <header class="page-head">
      <div><h1>${ui.esc(title)}</h1>${sub ? `<p>${ui.esc(sub)}</p>` : ''}</div>
      <div class="page-actions">${actions}</div>
    </header>`;

  render();
})();
