/* 商品・リンク */
(function () {
  const { store, ui } = window.PW;
  let personaFilter = '';

  const trackUrl = (pr) => `https://${store.state.site.domain}/go/${pr.id}`;

  function edit(pr) {
    const s = store.state;
    ui.modal({
      title: pr ? '商品・リンクを編集' : '商品・リンクを追加',
      body: `
        <label class="field"><span>商品名</span><input name="name" required value="${ui.esc(pr ? pr.name : '')}"></label>
        <label class="field"><span>リンク先URL（アフィリエイトURL）</span><input name="url" type="url" required value="${ui.esc(pr ? pr.url : 'https://')}"></label>
        <div class="field-row">
          <label class="field"><span>カテゴリ</span><input name="category" value="${ui.esc(pr ? pr.category : '')}" placeholder="書籍 / サブスク など"></label>
          <label class="field"><span>価格（円）</span><input name="price" type="number" min="0" value="${pr ? pr.price : 0}"></label>
        </div>
        <fieldset class="field"><span>表示するペルソナ</span>
          <div class="check-row">${s.personas.map((p) => `<label class="check"><input type="checkbox" name="persona_${p.id}" ${pr && pr.personaIds.includes(p.id) ? 'checked' : ''}> ${ui.esc(p.code + ' ' + p.name)}</label>`).join('')}</div>
        </fieldset>`,
      onSubmit: (v) => {
        if (!v.name.trim() || !/^https?:\/\/.+/.test(v.url)) { ui.toast('商品名と正しいURLを入力してください', 'warn'); return false; }
        const data = { name: v.name, url: v.url, category: v.category, price: Number(v.price), personaIds: s.personas.filter((p) => v['persona_' + p.id]).map((p) => p.id) };
        store.update((st) => {
          if (pr) Object.assign(st.products.find((x) => x.id === pr.id), data);
          else {
            st.products.push({ id: store.uid('pr'), clicks: 0, conversions: 0, active: true, ...data });
            store.log(`商品「${data.name}」を追加`);
          }
        });
        ui.toast('保存しました');
      },
    });
  }

  function render(root) {
    const s = store.state;
    const list = s.products.filter((pr) => !personaFilter || pr.personaIds.includes(personaFilter));
    const clicks = list.reduce((a, p) => a + p.clicks, 0);
    const cvs = list.reduce((a, p) => a + p.conversions, 0);

    root.innerHTML = `
      ${ui.pageHead('商品・リンク', '公開サイトと配信に差し込むアフィリエイト商品・リンクを管理します', `<button class="btn btn-primary" data-act="new">＋ 商品を追加</button>`)}

      <section class="kpis kpis-3">
        <div class="kpi"><span>登録リンク</span><strong>${list.length}</strong><small>有効 ${list.filter((p) => p.active).length}</small></div>
        <div class="kpi"><span>クリック</span><strong>${ui.num(clicks)}</strong><small>過去30日</small></div>
        <div class="kpi"><span>CVR</span><strong>${clicks ? ((cvs / clicks) * 100).toFixed(1) : '0.0'}%</strong><small>CV ${ui.num(cvs)} 件</small></div>
      </section>

      <div class="tabs">
        <button class="tab ${!personaFilter ? 'active' : ''}" data-act="filter" data-id="">すべて</button>
        ${s.personas.map((p) => `<button class="tab ${personaFilter === p.id ? 'active' : ''}" data-act="filter" data-id="${p.id}">${ui.esc(p.code + ' ' + p.name)}</button>`).join('')}
      </div>

      <section class="card table-card">
        <table class="table">
          <thead><tr><th>商品</th><th>ペルソナ</th><th class="num">価格</th><th class="num">クリック</th><th class="num">CV</th><th>計測リンク</th><th>有効</th><th></th></tr></thead>
          <tbody>
            ${list.map((pr) => `
              <tr class="${pr.active ? '' : 'row-off'}">
                <td><strong>${ui.esc(pr.name)}</strong><br><small class="muted">${ui.esc(pr.category)}</small></td>
                <td>${pr.personaIds.map((id) => ui.personaChip(store.persona(id))).join(' ') || ui.personaChip(null)}</td>
                <td class="num">${pr.price ? ui.yen(pr.price) : '—'}</td>
                <td class="num">${ui.num(pr.clicks)}</td>
                <td class="num">${ui.num(pr.conversions)}<br><small class="muted">${pr.clicks ? ((pr.conversions / pr.clicks) * 100).toFixed(1) : '0.0'}%</small></td>
                <td><code class="url">/go/${ui.esc(pr.id)}</code><button class="icon-btn" data-act="copy" data-id="${pr.id}" title="コピー">⧉</button></td>
                <td><label class="switch"><input type="checkbox" data-act="toggle" data-id="${pr.id}" ${pr.active ? 'checked' : ''}><span></span></label></td>
                <td class="row-gap">
                  <button class="btn btn-sm" data-act="edit" data-id="${pr.id}">編集</button>
                  <button class="icon-btn" data-act="delete" data-id="${pr.id}" title="削除">🗑</button>
                </td>
              </tr>`).join('') || '<tr><td colspan="8" class="empty">商品がありません</td></tr>'}
          </tbody>
        </table>
      </section>`;

    root.onclick = (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const pr = s.products.find((x) => x.id === el.dataset.id);
      const act = el.dataset.act;
      if (act === 'new') edit(null);
      else if (act === 'filter') { personaFilter = el.dataset.id; render(root); }
      else if (act === 'edit') edit(pr);
      else if (act === 'copy') ui.copy(trackUrl(pr));
      else if (act === 'delete') ui.confirmDialog('商品を削除', `「${pr.name}」を削除します。`, () => store.update((st) => { st.products = st.products.filter((x) => x.id !== pr.id); }), '削除する');
    };
    root.onchange = (e) => {
      if (e.target.dataset.act === 'toggle') store.update((st) => { st.products.find((x) => x.id === e.target.dataset.id).active = e.target.checked; });
    };
  }

  window.PW.views.products = { render };
})();
