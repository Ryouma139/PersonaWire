/* Notion連携 */
(function () {
  const { store, ui } = window.PW;
  const DIR = { both: '⇄ 双方向', push: '→ アプリ → Notion', pull: '← Notion → アプリ' };
  let progress = 0;

  function sync() {
    const n = store.state.notion;
    if (!n.connected || n.syncing) return;
    progress = 0;
    store.update(() => { n.syncing = true; });
    const timer = setInterval(() => {
      progress += 20;
      if (progress < 100) { store.update(() => {}); return; }
      clearInterval(timer);
      const s = store.state;
      const enabled = n.databases.filter((d) => d.enabled).map((d) => d.label);
      store.update(() => {
        n.syncing = false;
        n.lastSync = new Date().toISOString();
        n.logs.unshift({ at: n.lastSync, ok: true, text: `同期完了：${enabled.join('・')}（記事 ${s.items.length} / 配信号 ${s.issues.length}）` });
        n.logs = n.logs.slice(0, 20);
        store.log('Notion と同期しました');
      });
      ui.toast('Notion と同期しました');
    }, 400);
  }

  function counts(key) {
    const s = store.state;
    return { items: s.items.length, personas: s.personas.length, issues: s.issues.length, products: s.products.length }[key] ?? 0;
  }

  function render(root) {
    const n = store.state.notion;

    root.innerHTML = `
      ${ui.pageHead('Notion連携', '収集記事・ペルソナ・配信号を Notion データベースと同期します',
        n.connected ? `<button class="btn btn-primary" data-act="sync" ${n.syncing ? 'disabled' : ''}>${n.syncing ? '同期中…' : '⟳ 今すぐ同期'}</button>` : '')}

      <section class="card notion-conn">
        <div class="nc-logo">N</div>
        <div class="nc-info">
          ${n.connected ? `
            <h2>${ui.esc(n.workspace)} <span class="badge badge-ok">接続済み</span></h2>
            <p class="muted small">インテグレーショントークン <code>${ui.esc(n.token)}</code> · 最終同期 ${ui.fmtDate(n.lastSync)}</p>
            ${n.syncing ? `<div class="progress"><i style="width:${progress}%"></i></div>` : ''}
          ` : `
            <h2>Notion に接続されていません</h2>
            <p class="muted small">インテグレーションを作成し、対象データベースを共有してからトークンを入力してください。</p>`}
        </div>
        <div>${n.connected ? '<button class="btn btn-ghost-danger" data-act="disconnect">接続解除</button>' : '<button class="btn btn-primary" data-act="connect">Notion に接続</button>'}</div>
      </section>

      ${n.connected ? `
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h2>同期設定</h2></div>
          <div class="setting">
            <div><strong>自動同期</strong><p class="muted small">一定間隔でアプリと Notion を同期します</p></div>
            <label class="switch"><input type="checkbox" data-act="auto" ${n.autoSync ? 'checked' : ''}><span></span></label>
          </div>
          <div class="setting">
            <div><strong>同期間隔</strong><p class="muted small">API のレート制限に注意してください</p></div>
            <select data-act="interval" ${n.autoSync ? '' : 'disabled'}>${[10, 30, 60, 180].map((m) => `<option value="${m}" ${n.interval === m ? 'selected' : ''}>${m} 分ごと</option>`).join('')}</select>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>同期ログ</h2></div>
          <ul class="timeline">${n.logs.slice(0, 6).map((l) => `<li class="${l.ok ? '' : 'err'}"><time>${ui.fmtDate(l.at)}</time><span>${l.ok ? '' : '⚠ '}${ui.esc(l.text)}</span></li>`).join('')}</ul>
        </section>
      </div>

      <section class="card table-card">
        <div class="card-head"><h2>データベース</h2></div>
        <table class="table">
          <thead><tr><th>アプリのデータ</th><th>Notion データベース</th><th>同期方向</th><th class="num">件数</th><th>同期</th></tr></thead>
          <tbody>
            ${n.databases.map((d, i) => `
              <tr class="${d.enabled ? '' : 'row-off'}">
                <td><strong>${ui.esc(d.label)}</strong></td>
                <td><input class="inline-input" data-act="dbname" data-i="${i}" value="${ui.esc(d.dbName)}"></td>
                <td><select data-act="dir" data-i="${i}">${Object.entries(DIR).map(([k, v]) => `<option value="${k}" ${d.direction === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
                <td class="num">${counts(d.key)}</td>
                <td><label class="switch"><input type="checkbox" data-act="db" data-i="${i}" ${d.enabled ? 'checked' : ''}><span></span></label></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </section>

      <section class="card table-card">
        <div class="card-head"><h2>プロパティ対応（収集記事）</h2></div>
        <table class="table">
          <thead><tr><th>アプリの項目</th><th></th><th>Notion プロパティ</th><th>型</th></tr></thead>
          <tbody>
            ${n.mapping.map((m, i) => `
              <tr>
                <td>${ui.esc(m.field)}</td><td class="muted">→</td>
                <td><input class="inline-input" data-act="prop" data-i="${i}" value="${ui.esc(m.prop)}"></td>
                <td><code>${ui.esc(m.type)}</code></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </section>` : ''}`;

    root.onclick = (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      if (el.dataset.act === 'sync') sync();
      else if (el.dataset.act === 'disconnect') {
        ui.confirmDialog('接続解除', 'Notion との接続を解除します。Notion 側のデータは削除されません。', () => {
          store.update(() => { n.connected = false; store.log('Notion との接続を解除'); });
        }, '解除する');
      } else if (el.dataset.act === 'connect') {
        ui.modal({
          title: 'Notion に接続',
          body: `
            <label class="field"><span>ワークスペース名</span><input name="workspace" value="${ui.esc(n.workspace)}"></label>
            <label class="field"><span>インテグレーショントークン</span><input name="token" placeholder="secret_xxxxxxxx" autocomplete="off"></label>`,
          submitLabel: '接続',
          onSubmit: (v) => {
            if (v.token.trim().length < 8) { ui.toast('トークンを入力してください', 'warn'); return false; }
            const t = v.token.trim();
            store.update(() => {
              Object.assign(n, { connected: true, workspace: v.workspace || 'Workspace', token: t.slice(0, 11) + '…' + t.slice(-4) });
              store.log('Notion に接続');
            });
            sync();
          },
        });
      }
    };
    root.onchange = (e) => {
      const el = e.target, i = Number(el.dataset.i);
      const act = el.dataset.act;
      store.update(() => {
        if (act === 'auto') n.autoSync = el.checked;
        else if (act === 'interval') n.interval = Number(el.value);
        else if (act === 'db') n.databases[i].enabled = el.checked;
        else if (act === 'dir') n.databases[i].direction = el.value;
        else if (act === 'dbname') n.databases[i].dbName = el.value;
        else if (act === 'prop') n.mapping[i].prop = el.value;
      });
    };
  }

  window.PW.views.notion = { render };
})();
