/* ペルソナ */
(function () {
  const { store, ui } = window.PW;
  const COLORS = ['#6f95d6', '#5cc489', '#9d84dc', '#e9ad62', '#dc6d88', '#5bb8c4', '#c9c26a'];

  const tags = (arr, cls = '') => arr.map((k) => `<span class="tag ${cls}">${ui.esc(k)}</span>`).join('');
  const splitWords = (v) => String(v || '').split(/[,、\s]+/).map((x) => x.trim()).filter(Boolean);

  function edit(p) {
    const color = p ? p.color : COLORS[store.state.personas.length % COLORS.length];
    ui.modal({
      title: p ? 'ペルソナを編集' : '新しいペルソナ',
      wide: true,
      body: `
        <div class="field-row">
          <label class="field field-xs"><span>コード</span><input name="code" maxlength="4" value="${ui.esc(p ? p.code : 'P' + String(store.state.personas.length + 1).padStart(2, '0'))}"></label>
          <label class="field"><span>名前</span><input name="name" required value="${ui.esc(p ? p.name : '')}" placeholder="例：仕事 × 孤独 × 日常改善"></label>
          <label class="field"><span>スラッグ（公開URL）</span><input name="handle" value="${ui.esc(p ? p.handle : '')}" placeholder="tech-investor"></label>
        </div>
        <label class="field"><span>人物像・ニーズ（AI判定のプロンプトに使用）</span><textarea name="description" rows="3">${ui.esc(p ? p.description : '')}</textarea></label>
        <label class="field"><span>関心キーワード（カンマ区切り）</span><input name="keywords" value="${ui.esc(p ? p.keywords.join(', ') : '')}"></label>
        <label class="field"><span>NGワード（含む記事は除外）</span><input name="ngWords" value="${ui.esc(p ? p.ngWords.join(', ') : '')}"></label>
        <div class="field-row">
          <label class="field"><span>文体・トーン</span><input name="tone" value="${ui.esc(p ? p.tone : '')}" placeholder="簡潔・データ重視"></label>
          <label class="field"><span>採用しきい値 <output id="th-out">${p ? p.threshold : 70}</output></span><input name="threshold" type="range" min="0" max="100" value="${p ? p.threshold : 70}" oninput="document.getElementById('th-out').textContent=this.value"></label>
          <label class="field field-xs"><span>カラー</span><input name="color" type="color" value="${ui.esc(color)}"></label>
        </div>`,
      onSubmit: (v) => {
        if (!v.name.trim()) { ui.toast('名前を入力してください', 'warn'); return false; }
        const data = { ...v, keywords: splitWords(v.keywords), ngWords: splitWords(v.ngWords), threshold: Number(v.threshold) };
        store.update((s) => {
          if (p) {
            Object.assign(store.persona(p.id), data);
            // しきい値変更を既存アイテムの判定に反映
            s.items.forEach((it) => { if (it.status === 'pending') Object.assign(it, store.judge(it)); });
          } else {
            const np = { id: store.uid('p'), active: true, ...data };
            s.personas.push(np);
            s.items.forEach((it) => { it.scores[np.id] = Math.floor(Math.random() * 60); });
            store.log(`ペルソナ「${np.name}」を追加`);
          }
        });
        ui.toast('保存しました');
      },
    });
  }

  function render(root) {
    const s = store.state;
    root.innerHTML = `
      ${ui.pageHead('ペルソナ', '読者像ごとに関心キーワードと採用しきい値を設定し、AI判定の基準にします', `<button class="btn btn-primary" data-act="new">＋ ペルソナを追加</button>`)}
      <div class="persona-grid">
        ${s.personas.map((p) => {
          const mine = s.items.filter((i) => i.persona === p.id);
          const plan = s.deliveries.find((d) => d.persona === p.id);
          return `
          <article class="persona-card ${p.active ? '' : 'inactive'}" style="--c:${ui.esc(p.color)}">
            <header>
              <span class="avatar mono">${ui.esc(p.code)}</span>
              <div><h3>${ui.esc(p.name)}</h3><small>/${ui.esc(p.handle)}</small></div>
              <label class="switch" title="AI判定で使用"><input type="checkbox" data-act="toggle" data-id="${p.id}" ${p.active ? 'checked' : ''}><span></span></label>
            </header>
            <p>${ui.esc(p.description)}</p>
            <dl>
              <dt>関心キーワード</dt><dd>${tags(p.keywords)}</dd>
              <dt>NGワード</dt><dd>${tags(p.ngWords, 'tag-ng') || '<span class="muted">なし</span>'}</dd>
              <dt>トーン</dt><dd>${ui.esc(p.tone || '—')}</dd>
              <dt>採用しきい値</dt><dd><div class="meter"><i style="width:${p.threshold}%;background:var(--c)"></i></div><b>${p.threshold}</b></dd>
            </dl>
            <footer>
              <span class="muted small">記事 ${mine.length} · 公開 ${mine.filter((i) => i.status === 'published').length}${plan ? ' · ' + ui.esc(plan.name) : ''}</span>
              <span class="row-gap">
                <button class="btn btn-sm" data-act="edit" data-id="${p.id}">編集</button>
                <button class="btn btn-sm btn-ghost-danger" data-act="delete" data-id="${p.id}">削除</button>
              </span>
            </footer>
          </article>`;
        }).join('')}
      </div>`;

    root.onclick = (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const p = store.persona(el.dataset.id);
      if (el.dataset.act === 'new') edit(null);
      else if (el.dataset.act === 'edit') edit(p);
      else if (el.dataset.act === 'delete') {
        ui.confirmDialog('ペルソナを削除', `「${p.name}」を削除します。割り当て済みの記事は未割当になります。`, () => {
          store.update((s) => {
            s.personas = s.personas.filter((x) => x.id !== p.id);
            s.items.forEach((it) => { delete it.scores[p.id]; if (it.persona === p.id) it.persona = null; });
            s.products.forEach((pr) => { pr.personaIds = pr.personaIds.filter((id) => id !== p.id); });
            store.log(`ペルソナ「${p.name}」を削除`);
          });
        }, '削除する');
      }
    };
    root.onchange = (e) => {
      if (e.target.dataset.act === 'toggle') {
        store.update(() => { store.persona(e.target.dataset.id).active = e.target.checked; });
        ui.toast(e.target.checked ? 'AI判定で使用します' : 'AI判定から外しました');
      }
    };
  }

  window.PW.views.personas = { render };
})();
