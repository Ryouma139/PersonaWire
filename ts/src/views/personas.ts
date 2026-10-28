/* ペルソナ */
import { hasScores, store } from '../store';
import { db, dbMessage } from '../db';
import * as ui from '../ui';
import type { Persona, View } from '../types';

const COLORS = ['#6f95d6', '#5cc489', '#9d84dc', '#e9ad62', '#dc6d88', '#5bb8c4', '#c9c26a'];

const tags = (arr: string[], cls = ''): string => arr.map((k) => `<span class="tag ${cls}">${ui.esc(k)}</span>`).join('');

function edit(p?: Persona): void {
  const count = store.state.personas.length;
  const color = p ? p.color : COLORS[count % COLORS.length];
  const threshold = p ? p.threshold : 70;
  const { form } = ui.modal({
    title: p ? 'ペルソナを編集' : '新しいペルソナ',
    wide: true,
    body: `
      <div class="field-row">
        <label class="field field-xs"><span>コード</span><input name="code" maxlength="4" value="${ui.esc(p ? p.code : 'P' + String(count + 1).padStart(2, '0'))}"></label>
        <label class="field"><span>名前</span><input name="name" required value="${ui.esc(p?.name ?? '')}" placeholder="例：仕事 × 孤独 × 日常改善"></label>
        <label class="field"><span>スラッグ（公開URL）</span><input name="handle" value="${ui.esc(p?.handle ?? '')}" placeholder="tech-investor"></label>
      </div>
      <label class="field"><span>人物像・ニーズ（AI判定のプロンプトに使用）</span><textarea name="description" rows="3">${ui.esc(p?.description ?? '')}</textarea></label>
      <label class="field"><span>関心キーワード（カンマ区切り）</span><input name="keywords" value="${ui.esc(p ? p.keywords.join(', ') : '')}"></label>
      <label class="field"><span>NGワード（含む記事は除外）</span><input name="ngWords" value="${ui.esc(p ? p.ngWords.join(', ') : '')}"></label>
      <div class="field-row">
        <label class="field"><span>文体・トーン</span><input name="tone" value="${ui.esc(p?.tone ?? '')}" placeholder="簡潔・データ重視"></label>
        <label class="field"><span>採用しきい値 <output id="th-out">${threshold}</output></span><input name="threshold" type="range" min="0" max="100" value="${threshold}"></label>
        <label class="field field-xs"><span>カラー</span><input name="color" type="color" value="${ui.esc(color)}"></label>
      </div>`,
    onSubmit: (v) => {
      if (!v.name.trim()) { ui.toast('名前を入力してください', 'warn'); return false; }
      const data = {
        code: v.code, name: v.name, handle: v.handle, description: v.description, tone: v.tone, color: v.color,
        keywords: ui.splitWords(v.keywords), ngWords: ui.splitWords(v.ngWords), threshold: Number(v.threshold),
      };
      if (p) void save(p, data);
      else {
        db.insertPersona({ active: true, ...data })
          .then((np) => {
            store.update((s) => { s.personas.push(np); });
            store.log(`ペルソナ「${np.name}」を追加`, 'persona.create');
            ui.toast('保存しました');
          })
          .catch((e: unknown) => ui.toast('保存できませんでした: ' + dbMessage(e), 'warn'));
      }
    },
  });
  const range = form.querySelector<HTMLInputElement>('input[name="threshold"]');
  range?.addEventListener('input', () => { ui.byId('th-out').textContent = range.value; });
}

/** 既存のペルソナを保存し、しきい値などの変更を要確認の記事の判定に反映する */
async function save(edited: Persona, data: Partial<Persona>): Promise<void> {
  // 編集中に DB を読み直していても、今のペルソナに反映する
  const p = store.persona(edited.id) ?? edited;
  store.update(() => { Object.assign(p, data); });
  if (!(await store.commit(db.updatePersona(p), '保存しました'))) return;
  store.log(`ペルソナ「${p.name}」を編集`, 'persona.update');
  const changed = store.state.items.filter((it) => {
    if (it.status !== 'pending' || !hasScores(it)) return false;
    const j = store.judge(it);
    return j.verdict !== it.verdict || j.persona !== it.persona;
  });
  if (!changed.length) return;
  store.update(() => { for (const it of changed) Object.assign(it, store.judge(it)); });
  await store.commit(Promise.all(changed.map((it) => db.updateArticle(it.id, { verdict: it.verdict, persona: it.persona }))),
    `要確認の記事 ${changed.length} 件を判定し直しました`);
}

function remove(p: Persona): void {
  ui.confirmDialog('ペルソナを削除', `「${p.name}」を削除します。割り当て済みの記事は未割当になり、この人のスコアも消えます。`, () => {
    store.update((s) => {
      s.personas = s.personas.filter((x) => x.id !== p.id);
      s.items.forEach((it) => { delete it.scores[p.id]; if (it.persona === p.id) it.persona = null; });
      s.products.forEach((pr) => { pr.personaIds = pr.personaIds.filter((id) => id !== p.id); });
    });
    void store.commit(db.deletePersona(p.id), '削除しました').then((ok) => {
      if (ok) store.log(`ペルソナ「${p.name}」を削除`, 'persona.delete');
    });
  }, '削除する');
}

function render(root: HTMLElement): void {
  const s = store.state;
  root.innerHTML = `
    ${ui.pageHead('ペルソナ', '読者像ごとに関心キーワードと採用しきい値を設定し、AI判定の基準にします', `<button class="btn btn-primary" data-act="new">＋ ペルソナを追加</button>`)}
    ${s.personas.length ? '' : '<p class="empty">ペルソナはまだありません。「＋ ペルソナを追加」か、Supabase の personas 表に追加してください</p>'}
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
    const el = ui.actionTarget(e);
    if (!el) return;
    const p = store.persona(el.dataset.id);
    if (el.dataset.act === 'new') edit();
    else if (el.dataset.act === 'edit' && p) edit(p);
    else if (el.dataset.act === 'delete' && p) remove(p);
  };
  root.onchange = (e) => {
    const el = ui.fieldTarget(e);
    const p = store.persona(el.dataset.id);
    if (el.dataset.act === 'toggle' && p) {
      const on = ui.isChecked(el);
      store.update(() => { p.active = on; });
      void store.commit(db.updatePersona(p), on ? 'AI判定で使用します' : 'AI判定から外しました');
    }
  };
}

export const personas: View = { render };
