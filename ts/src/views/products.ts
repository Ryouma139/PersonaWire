/* 商品・リンク（アフィリエイト）。Supabase の products 表と同期する。追加・編集・削除は管理者だけ */
import { store } from '../store';
import { db, type ProductFields } from '../db';
import { auth } from '../auth';
import * as ui from '../ui';
import type { Asp, PersonaId, Product, View } from '../types';

let personaFilter: PersonaId = '';

export const ASPS: Record<Asp, string> = { amazon: 'Amazon', rakuten: '楽天', a8: 'A8.net', moshimo: 'もしも', other: 'その他' };

/** メールなど、スクリプトが動かない場所で使う計測リンク。Amazon は規約上使えない（メール内のリンク・転送の禁止） */
export const mailLink = (pr: Product): string | null => (pr.asp === 'amazon' ? null : `${store.state.site.url}/go/${pr.id}?s=email`);

const rate = (cv: number, clicks: number): string => (clicks ? ((cv / clicks) * 100).toFixed(1) : '0.0');
const dateOnly = (iso: string | null): string => (iso ? ui.localDay(iso) : '');
/** 日付の入力（YYYY-MM-DD、日本時間）を、その日の始まり（期限なら翌日の始まり）にする */
const fromDate = (v: string, end = false): string | null => {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00+09:00`);
  if (end) d.setDate(d.getDate() + 1);
  return d.toISOString();
};

/** 掲載中か（有効で、掲載期間の中） */
export function isLive(pr: Product, now = Date.now()): boolean {
  return pr.active && (!pr.startsAt || Date.parse(pr.startsAt) <= now) && (!pr.endsAt || Date.parse(pr.endsAt) > now);
}

function edit(pr?: Product): void {
  const s = store.state;
  const asp = pr?.asp ?? 'amazon';
  ui.modal({
    title: pr ? '商品・リンクを編集' : '商品・リンクを追加',
    wide: true,
    body: `
      <label class="field"><span>商品名</span><input name="name" required value="${ui.esc(pr?.name ?? '')}"></label>
      <div class="field-row">
        <label class="field"><span>ASP</span>
          <select name="asp">${(Object.keys(ASPS) as Asp[]).map((k) => `<option value="${k}" ${k === asp ? 'selected' : ''}>${ASPS[k]}</option>`).join('')}</select>
        </label>
        <label class="field"><span>カテゴリ</span><input name="category" value="${ui.esc(pr?.category ?? '')}" placeholder="書籍 / 家電 / サブスク など"></label>
        <label class="field field-xs"><span>価格（円）</span><input name="price" type="number" min="0" value="${pr?.price ?? 0}"></label>
      </div>
      <label class="field"><span>アフィリエイトリンク（ASP の管理画面で発行した URL をそのまま貼る）</span><input name="url" type="url" required value="${ui.esc(pr?.url ?? '')}" placeholder="https://"></label>
      <p class="muted small">Amazon のリンクは、規約によりメール配信には使えません。公開サイトでは、どの ASP のリンクも短縮・転送せずにそのまま載せます。</p>
      <label class="field"><span>画像の URL（任意。ASP が発行した画像のみ）</span><input name="imageUrl" type="url" value="${ui.esc(pr?.imageUrl ?? '')}" placeholder="https://"></label>
      <div class="field-row">
        <label class="field"><span>掲載開始日（任意）</span><input name="startsAt" type="date" value="${dateOnly(pr?.startsAt ?? null)}"></label>
        <label class="field"><span>掲載終了日（任意。この日まで）</span><input name="endsAt" type="date" value="${pr?.endsAt ? ui.localDay(new Date(Date.parse(pr.endsAt) - 864e5)) : ''}"></label>
      </div>
      <fieldset class="field"><span>表示するペルソナ（どれも選ばないと、すべてのペルソナに出ます）</span>
        <div class="check-row">${s.personas.map((p) => `<label class="check"><input type="checkbox" name="persona_${p.id}" ${pr?.personaIds.includes(p.id) ? 'checked' : ''}> ${ui.esc(p.code + ' ' + p.name)}</label>`).join('')}</div>
      </fieldset>
      <div class="field-row">
        <label class="field"><span>成果（件・累計）</span><input name="conversions" type="number" min="0" value="${pr?.conversions ?? 0}"></label>
        <label class="field"><span>報酬（円・累計）</span><input name="revenue" type="number" min="0" value="${pr?.revenue ?? 0}"></label>
      </div>
      <p class="muted small">成果と報酬は ASP から自動では届きません。各 ASP の管理画面の数字を見て入力してください。</p>
      <label class="field"><span>社内メモ（公開されません）</span><textarea name="note" rows="2">${ui.esc(pr?.note ?? '')}</textarea></label>`,
    onSubmit: (v) => {
      const url = ui.safeUrl(v.url);
      if (!v.name.trim() || !url || !url.startsWith('https://')) { ui.toast('商品名と、https:// で始まるリンクを入力してください', 'warn'); return false; }
      const image = v.imageUrl.trim() ? ui.safeUrl(v.imageUrl) : null;
      if (v.imageUrl.trim() && (!image || !image.startsWith('https://'))) { ui.toast('画像の URL は https:// で始めてください', 'warn'); return false; }
      const startsAt = fromDate(v.startsAt), endsAt = fromDate(v.endsAt, true);
      if (startsAt && endsAt && startsAt >= endsAt) { ui.toast('掲載終了日は、開始日より後にしてください', 'warn'); return false; }
      const data: ProductFields = {
        name: v.name.trim(), asp: v.asp as Asp, category: v.category.trim(), price: Math.max(0, Number(v.price) || 0), url, imageUrl: image,
        startsAt, endsAt, note: v.note, conversions: Math.max(0, Number(v.conversions) || 0), revenue: Math.max(0, Number(v.revenue) || 0),
        personaIds: s.personas.filter((p) => v['persona_' + p.id]).map((p) => p.id), active: pr?.active ?? true,
      };
      if (pr) {
        store.update(() => { Object.assign(pr, data); });
        void store.commit(db.updateProduct(pr.id, data), '保存しました').then((ok) => { if (ok) store.log(`商品「${data.name}」を編集`, 'product.update'); });
      } else {
        void store.commit(db.insertProduct(data).then(() => store.reload()), '追加しました').then((ok) => { if (ok) store.log(`商品「${data.name}」を追加`, 'product.create'); });
      }
    },
  });
}

function render(root: HTMLElement): void {
  const s = store.state;
  const admin = auth.isAdmin();
  const list = s.products.filter((pr) => !personaFilter || !pr.personaIds.length || pr.personaIds.includes(personaFilter));
  const clicks = list.reduce((a, p) => a + p.clicks30, 0);
  const clicksAll = list.reduce((a, p) => a + p.clicksTotal, 0);
  const cvs = list.reduce((a, p) => a + p.conversions, 0);
  const revenue = list.reduce((a, p) => a + p.revenue, 0);

  root.innerHTML = `
    ${ui.pageHead('商品・リンク', '公開サイトと配信に差し込むアフィリエイト商品を管理します', admin ? `<button class="btn btn-primary" data-act="new">＋ 商品を追加</button>` : '')}

    <section class="kpis">
      <div class="kpi"><span>登録商品</span><strong>${list.length}</strong><small>掲載中 ${list.filter((p) => isLive(p)).length}</small></div>
      <div class="kpi"><span>クリック</span><strong>${ui.num(clicks)}</strong><small>過去30日（累計 ${ui.num(clicksAll)}）</small></div>
      <div class="kpi"><span>成果</span><strong>${ui.num(cvs)}</strong><small>累計クリックの ${rate(cvs, clicksAll)}%</small></div>
      <div class="kpi"><span>報酬</span><strong>${ui.yen(revenue)}</strong><small>手入力の累計</small></div>
    </section>

    <div class="tabs">
      <button class="tab ${!personaFilter ? 'active' : ''}" data-act="filter" data-id="">すべて</button>
      ${s.personas.map((p) => `<button class="tab ${personaFilter === p.id ? 'active' : ''}" data-act="filter" data-id="${p.id}">${ui.esc(p.code + ' ' + p.name)}</button>`).join('')}
    </div>

    <section class="card table-card">
      <table class="table">
        <thead><tr><th>商品</th><th>ペルソナ</th><th class="num">価格</th><th class="num">クリック<br><small>30日 / 累計</small></th><th class="num">成果 / 報酬</th><th>メール用リンク</th><th>有効</th><th></th></tr></thead>
        <tbody>
          ${list.map((pr) => {
            const mail = mailLink(pr);
            const href = ui.safeUrl(pr.url);
            return `
            <tr class="${isLive(pr) ? '' : 'row-off'}">
              <td><strong>${ui.esc(pr.name)}</strong><br><small class="muted">${ASPS[pr.asp]}${pr.category ? ' · ' + ui.esc(pr.category) : ''}${pr.endsAt ? ` · 〜${ui.esc(ui.localDay(new Date(Date.parse(pr.endsAt) - 864e5)))}` : ''}${pr.active && !isLive(pr) ? ' · 掲載期間外' : ''}</small>
                ${href ? `<br><a class="link" href="${ui.esc(href)}" target="_blank" rel="noopener noreferrer">リンク先を確認 ↗</a>` : ''}</td>
              <td>${pr.personaIds.map((id) => ui.personaChip(store.persona(id))).join(' ') || '<small class="muted">すべて</small>'}</td>
              <td class="num">${pr.price ? ui.yen(pr.price) : '—'}</td>
              <td class="num">${ui.num(pr.clicks30)} / ${ui.num(pr.clicksTotal)}</td>
              <td class="num">${ui.num(pr.conversions)} 件<br><small class="muted">${ui.yen(pr.revenue)}</small></td>
              <td>${mail ? `<button class="btn btn-sm" data-act="copy" data-id="${pr.id}" title="${ui.esc(mail)}">コピー</button>` : '<small class="muted">使用不可（Amazon）</small>'}</td>
              <td><label class="switch"><input type="checkbox" data-act="toggle" data-id="${pr.id}" ${pr.active ? 'checked' : ''} ${admin ? '' : 'disabled'}><span></span></label></td>
              <td class="row-gap">${admin ? `
                <button class="btn btn-sm" data-act="edit" data-id="${pr.id}">編集</button>
                <button class="icon-btn" data-act="delete" data-id="${pr.id}" title="削除">🗑</button>` : ''}
              </td>
            </tr>`;
          }).join('') || `<tr><td colspan="8" class="empty">商品はまだありません。${admin ? '「＋ 商品を追加」から、ASP で発行したリンクを登録してください' : ''}</td></tr>`}
        </tbody>
      </table>
    </section>
    <p class="muted small">公開サイトでは、商品の枠に「PR」と表示し、リンクに rel="sponsored" を付けています。クリックは個人を特定しない形で記録しています。</p>`;

  root.onclick = (e) => {
    const el = ui.actionTarget(e);
    if (!el) return;
    const pr = store.product(el.dataset.id);
    const act = el.dataset.act;
    if (act === 'new') edit();
    else if (act === 'filter') { personaFilter = el.dataset.id ?? ''; render(root); }
    else if (act === 'edit' && pr) edit(pr);
    else if (act === 'copy' && pr) { const m = mailLink(pr); if (m) void ui.copy(m); }
    else if (act === 'delete' && pr) {
      ui.confirmDialog('商品を削除', `「${pr.name}」を削除します。クリックの記録と、記事との紐づけも消えます。`, () => {
        store.update((st) => { st.products = st.products.filter((x) => x.id !== pr.id); });
        void store.commit(db.deleteProduct(pr.id), '削除しました').then((ok) => { if (ok) store.log(`商品「${pr.name}」を削除`, 'product.delete'); });
      }, '削除する');
    }
  };
  root.onchange = (e) => {
    const el = ui.fieldTarget(e);
    const pr = store.product(el.dataset.id);
    if (el.dataset.act === 'toggle' && pr) {
      const active = ui.isChecked(el);
      store.update(() => { pr.active = active; });
      void store.commit(db.updateProduct(pr.id, { active }), active ? '有効にしました' : '無効にしました');
    }
  };
}

export const products: View = { render };
