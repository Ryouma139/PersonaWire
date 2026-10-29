/* 収集・AI判定 */
import { hasScores, isUsable, store } from '../store';
import { db, dbMessage, type ArticleFields } from '../db';
import { auth } from '../auth';
import * as ui from '../ui';
import { ASPS } from './products';
import type { Issue, Item, ItemStatus, ItemType, NotionDbName, Persona, PersonaId, SourceKind, View } from '../types';

interface Filters {
  persona: PersonaId | '';
  status: ItemStatus | '';
  type: ItemType | '';
  threshold: number;
  /** 収集日で絞る。'YYYY-MM'（月）か 'YYYY-MM-DD'（日）。サイドバーのカレンダーから決める */
  date: string;
}

const f: Filters = { persona: '', status: '', type: '', threshold: 0, date: '' };

/**
 * サイドバーのカレンダーから、収集日の絞り込みを決める（'' で解除）。
 * カレンダーの件数と一覧の件数が合うよう、ほかの絞り込み（ペルソナ・状態・種別・しきい値）は外す
 */
export function setDateFilter(value: string): void {
  Object.assign(f, { persona: '', status: '', type: '', threshold: 0, date: value });
}
export const dateFilter = (): string => f.date;
/** 公開に必要な編集コメントの字数（DB の articles_before_update と同じ） */
const MIN_COMMENT = 20;
const commentLength = (s: string): number => [...s.trim()].length;

let selectedId: string | null = null;
let reloading = false;
let collecting = false;

const NOTION_DBS: NotionDbName[] = ['articles', 'sns_posts', 'ideas'];
const KINDS: SourceKind[] = ['NEWS', 'YOUTUBE', 'NOTE', 'X', 'THREADS'];
// 却下した記事を自動で削除するまでの日数（collector/wrangler.jsonc の PURGE_REJECTED_DAYS と合わせる）
const PURGE_DAYS = 5;
const STATUS_KEYS = Object.keys(ui.STATUS) as ItemStatus[];

function filtered(items: Item[]): Item[] {
  return items
    .filter((i) => !f.date || ui.localDay(i.collectedAt).startsWith(f.date))
    .filter((i) => !f.status || i.status === f.status)
    .filter((i) => !f.type || i.type === f.type)
    .filter((i) => {
      const score = f.persona ? i.scores[f.persona] ?? 0 : Math.max(0, ...Object.values(i.scores));
      return score >= f.threshold;
    })
    .sort((a, b) => (f.persona ? (b.scores[f.persona] ?? 0) - (a.scores[f.persona] ?? 0) : 0) || b.collectedAt.localeCompare(a.collectedAt));
}

// 一覧の右側に出す 5 ペルソナのミニ棒グラフ
function spark(it: Item, personas: Persona[]): string {
  return `<div class="spark" aria-hidden="true">${personas.map((p) => {
    const v = it.scores[p.id] ?? 0;
    return `<div class="spark-col ${p.id === it.persona ? 'is-main' : ''}" style="--c:${ui.esc(p.color)}" title="${ui.esc(p.code)}: ${v}"><span><i style="height:${Math.max(2, Math.round(v * 0.32))}px"></i></span><small>${ui.esc(p.code.slice(1))}</small></div>`;
  }).join('')}</div>`;
}

function scoresBlock(it: Item): string {
  const main = store.persona(it.persona);
  const reasons = (it.persona && it.reasons[it.persona]) || [];
  return [
    `article_id: ${it.no}`,
    `persona_id: ${main ? main.code : 'null'}`,
    `relevance_score: ${main ? it.scores[main.id] ?? 0 : 0}`,
    'reason:',
    ...(reasons.length ? reasons.map((r) => `  - ${r}`) : ['  - (該当なし)']),
  ].join('\n');
}

function detail(it: Item | undefined): string {
  if (!it) return '';
  const s = store.state;
  const sorted = [...s.personas].sort((a, b) => (it.scores[b.id] ?? 0) - (it.scores[a.id] ?? 0));
  const drafts = isUsable(it.status) ? s.issues.filter((x) => x.status !== 'sent') : [];
  const href = ui.safeUrl(it.url);
  // 紐づけ済みの商品は、無効になっていても外せるように出す
  const products = s.products.filter((pr) => pr.active || it.productIds.includes(pr.id));
  return `
    <section class="card detail" id="detail">
      <button class="btn btn-quiet btn-sm detail-back" data-act="back">↑ 一覧に戻る</button>
      <div class="detail-top">
        <span class="mono muted">#${it.no} · ${ui.esc(it.category)}</span>
        ${ui.badge(ui.STATUS, it.status)}
      </div>
      <h2 class="detail-title">${ui.esc(it.title)}</h2>
      <div class="meta">${ui.kindTag(it.kind)}<span>${ui.esc(it.source)} · 収集 ${ui.fmtDate(it.collectedAt)}${it.sourceId ? ` · 取得 ${ui.fmtDate(it.fetchedAt)}` : ` · 登録 ${ui.fmtDate(it.fetchedAt)}`}</span>${href ? `<a class="link" href="${ui.esc(href)}" target="_blank" rel="noopener noreferrer">元記事 ↗</a>` : '<span class="muted">元記事のURLが不正です</span>'}</div>
      <p class="detail-excerpt">${ui.esc(it.excerpt)}</p>

      <h3 class="label">ペルソナ適合度と判定理由</h3>
      ${hasScores(it) ? '' : '<p class="muted small">AI 判定待ちです。スコアはまだありません（「編集」から手で入れることもできます）</p>'}
      <ul class="fit" ${hasScores(it) ? '' : 'hidden'}>
        ${sorted.map((p) => {
          const v = it.scores[p.id] ?? 0;
          const rs = it.reasons[p.id] ?? [];
          return `<li style="--c:${ui.esc(p.color)}">
            ${ui.personaChip(p, false, p.id !== it.persona)}
            <span class="fit-track"><i style="width:${v}%" class="${p.id === it.persona ? '' : 'dim'}"></i><em style="left:${p.threshold}%" title="しきい値 ${p.threshold}"></em></span>
            <b class="mono">${v}</b>
            ${rs.length ? `<div class="fit-reasons">${rs.map((r) => `<span>${ui.esc(r)}</span>`).join('')}</div>` : ''}
          </li>`;
        }).join('')}
      </ul>

      <div class="field-row">
        <label class="field"><span>主担当ペルソナ</span>
          <select data-act="assign" data-id="${it.id}">
            <option value="">未割当</option>
            ${s.personas.map((p) => `<option value="${p.id}" ${p.id === it.persona ? 'selected' : ''}>${ui.esc(p.code)}　${ui.esc(p.name)}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>Notion 登録先</span>
          <select data-act="notiondb" data-id="${it.id}">${NOTION_DBS.map((d) => `<option ${d === it.notionDb ? 'selected' : ''}>${d}</option>`).join('')}</select>
        </label>
      </div>

      ${hasScores(it) ? `<h3 class="label">article_persona_scores に保存される内容</h3>
      <pre class="code">${ui.esc(scoresBlock(it))}</pre>` : ''}

      <label class="field"><span>編集コメント（公開サイト・配信に表示。公開するには ${MIN_COMMENT} 字以上）</span>
        <textarea rows="2" data-act="comment" data-id="${it.id}" placeholder="読者に向けたひとこと">${ui.esc(it.comment)}</textarea>
        <small class="muted">${commentLength(it.comment)} 字</small>
      </label>

      <h3 class="label">関連商品（記事ページに PR として表示）</h3>
      ${products.length ? `<div class="check-row">${products.map((pr) => `
        <label class="check"><input type="checkbox" data-act="product" data-id="${it.id}" value="${pr.id}" ${it.productIds.includes(pr.id) ? 'checked' : ''}>${ui.esc(pr.name)}<small class="muted">${ASPS[pr.asp]}${pr.active ? '' : '・無効'}</small></label>`).join('')}</div>`
        : '<p class="muted small">商品がまだありません。<a href="#products" class="link">商品・リンク</a>で登録できます</p>'}
      <p class="muted small">記事ページには 3 件まで出ます。足りない分は、主担当ペルソナ向けの商品で自動で埋めます</p>

      ${it.status === 'rejected' ? `<p class="muted small">却下した記事は、最後の更新から ${PURGE_DAYS} 日たつと自動で削除されます（${ui.fmtDate(new Date(Date.parse(it.updatedAt) + PURGE_DAYS * 864e5).toISOString())} 以降の収集時）。残したい場合は「要確認に戻す」か「採用する」を押してください</p>` : ''}
      <div class="detail-actions">
        ${it.status !== 'approved' && it.status !== 'published' ? `<button class="btn btn-primary" data-act="status" data-to="approved" data-id="${it.id}">採用する</button>` : ''}
        ${it.status === 'approved' ? `<button class="btn btn-primary" data-act="status" data-to="published" data-id="${it.id}">公開サイトへ公開</button>` : ''}
        ${it.status === 'published' ? `<button class="btn" data-act="status" data-to="approved" data-id="${it.id}">非公開に戻す</button>` : ''}
        ${it.status !== 'pending' ? `<button class="btn" data-act="status" data-to="pending" data-id="${it.id}">要確認に戻す</button>` : ''}
        ${it.status !== 'rejected' ? `<button class="btn btn-ghost-danger" data-act="status" data-to="rejected" data-id="${it.id}">却下</button>` : ''}
        <button class="btn btn-quiet" data-act="edit" data-id="${it.id}">編集</button>
        ${auth.isAdmin() ? `<button class="btn btn-quiet" data-act="delete" data-id="${it.id}">削除</button>` : ''}
        ${drafts.length ? `
        <span class="add-issue">
          <select id="issue-pick">${drafts.map((x) => `<option value="${x.id}">${ui.esc(store.delivery(x.deliveryId)?.name ?? '')} #${x.no}${x.itemIds.includes(it.id) ? '（追加済み）' : ''}</option>`).join('')}</select>
          <button class="btn" data-act="to-issue" data-id="${it.id}">配信号に追加</button>
        </span>` : ''}
      </div>
    </section>`;
}

function render(root: HTMLElement): void {
  const s = store.state;
  const hashId = location.hash.split('/')[1];
  if (hashId && store.item(hashId) && selectedId !== hashId) selectedId = hashId;
  if (f.persona && !store.persona(f.persona)) f.persona = '';
  const list = filtered(s.items);
  // カレンダーで選んだ日・月の記事の総数（ほかの絞り込みをかける前。カレンダーの件数と同じ）
  const dateTotal = f.date ? s.items.filter((i) => ui.localDay(i.collectedAt).startsWith(f.date)).length : 0;
  // 選んでいた記事が絞り込みで見えなくなったら、一覧の先頭を選ぶ
  if (!list.some((i) => i.id === selectedId)) selectedId = list[0]?.id ?? null;
  const sel = store.item(selectedId);
  const lastRun = s.runs[0];
  // 最新 = 記事を登録した直近のバッチ 1 回分（その実行が始まった後に登録された、バッチ由来の記事）
  const newRun = s.runs.find((r) => r.inserted > 0);
  const newSince = newRun ? Date.parse(newRun.startedAt) : Infinity;
  const isNew = (i: Item): boolean => i.sourceId !== null && Date.parse(i.fetchedAt) >= newSince;

  root.innerHTML = `
    ${ui.pageHead('収集・AI判定', `NewsとSNSから集めた記事を、${s.personas.length}つのペルソナとの適合度で振り分けます`,
      `<button class="btn" data-act="reload" ${reloading ? 'disabled' : ''}>${reloading ? '読み込み中…' : '再読み込み'}</button>`
      + `<button class="btn" data-act="collect" ${collecting ? 'disabled' : ''}>${collecting ? '収集中…' : '今すぐ収集'}</button>`
      + '<button class="btn btn-primary" data-act="new">＋ 記事を追加</button>')}
    ${lastRun ? `<p class="run-line">${ui.runBadge(lastRun)}<span>最終収集 ${ui.fmtDate(lastRun.startedAt)}（${ui.runTrigger(lastRun)}）</span><span>${ui.esc(lastRun.message || `${lastRun.inserted} 件を登録`)}</span><a href="#dashboard" class="link">履歴 →</a></p>` : ''}

    <div class="filters">
      <select data-filter="persona"><option value="">すべてのペルソナ</option>${s.personas.map((p) => `<option value="${p.id}" ${f.persona === p.id ? 'selected' : ''}>${ui.esc(p.code)} ${ui.esc(p.name)}</option>`).join('')}</select>
      <select data-filter="status"><option value="">すべての状態</option>${STATUS_KEYS.map((k) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${ui.STATUS[k].label}</option>`).join('')}</select>
      <select data-filter="type"><option value="">News + SNS</option><option value="news" ${f.type === 'news' ? 'selected' : ''}>News</option><option value="sns" ${f.type === 'sns' ? 'selected' : ''}>SNS</option></select>
      ${f.date ? `<span class="date-chip">${ui.esc(ui.dayLabel(f.date))}の記事 ${list.length === dateTotal ? `${dateTotal} 件` : `${list.length} / ${dateTotal} 件`}<button class="icon-btn" data-act="clear-date" aria-label="日付の絞り込みを解除">✕</button></span>` : ''}
      <label class="range"><span>関連しきい値</span><input type="range" min="0" max="100" step="5" value="${f.threshold}" data-filter="threshold"><b class="mono" id="th-val">${f.threshold}</b></label>
    </div>

    <section class="card list-card">
      ${list.length ? list.map((i) => {
        const p = store.persona(i.persona);
        return `
        <article class="row ${i.id === selectedId ? 'selected' : ''} ${isNew(i) ? 'is-new' : ''}" data-act="select" data-id="${i.id}">
          <div class="row-body">
            <div class="meta">${isNew(i) ? '<span class="badge badge-new">NEW</span>' : ''}${ui.kindTag(i.kind)}<span>${ui.esc(i.source)}</span><span class="mono" title="収集日時（記事が出た・Notion に入った日時）">${ui.fmtDate(i.collectedAt)}</span>${i.sourceId ? `<span class="mono" title="バッチで DB に取り込んだ日時">取得 ${ui.fmtDate(i.fetchedAt)}</span>` : ''}${ui.badge(ui.STATUS, i.status)}${i.verdict ? '' : '<span class="badge badge-muted">AI判定待ち</span>'}</div>
            <h3>${ui.esc(i.title)}</h3>
            <div class="meta"><span>主担当</span>${ui.personaChip(p)}</div>
          </div>
          ${spark(i, s.personas)}
        </article>`;
      }).join('') : `<p class="empty">${s.items.length ? '条件に合う記事はありません' : '記事はまだありません。Supabase の articles 表に追加すると、ここに表示されます'}</p>`}
    </section>

    ${detail(sel)}

    <div class="to-top"><button class="btn btn-quiet" data-act="top">↑ TOPへ</button></div>`;

  root.onclick = (e) => {
    const el = ui.actionTarget(e);
    if (!el) return;
    const act = el.dataset.act, id = el.dataset.id ?? '';
    if (act === 'select') {
      selectedId = id;
      history.replaceState(null, '', '#inbox/' + id);
      render(root);
      ui.byId('detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); // 一覧の下にある詳細まで移動する
    } else if (act === 'clear-date') {
      f.date = '';
      store.update(() => {}); // 一覧とサイドバーのカレンダーを描き直す
    } else if (act === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (act === 'back') {
      root.querySelector(`.row[data-id="${selectedId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    else if (act === 'reload') reload();
    else if (act === 'collect') collectNow();
    else if (act === 'new') edit();
    else if (act === 'edit') edit(store.item(id));
    else if (act === 'delete') { const it = store.item(id); if (it) remove(it); }
    else if (act === 'status') setStatus(id, el.dataset.to as ItemStatus);
    else if (act === 'to-issue') addToIssue(id, ui.byId<HTMLSelectElement>('issue-pick').value);
  };
  root.onchange = (e) => {
    const el = ui.fieldTarget(e);
    const it = store.item(el.dataset.id);
    if (el.dataset.act === 'assign' && it) {
      const persona = el.value || null;
      store.update(() => { it.persona = persona; });
      void store.commit(db.updateArticle(it.id, { persona }));
    } else if (el.dataset.act === 'notiondb' && it) {
      const notionDb = el.value as NotionDbName;
      store.update(() => { it.notionDb = notionDb; });
      void store.commit(db.updateArticle(it.id, { notionDb }));
    } else if (el.dataset.act === 'comment' && it) {
      const comment = el.value;
      store.update(() => { it.comment = comment; });
      void store.commit(db.updateArticle(it.id, { comment }), 'コメントを保存しました');
    } else if (el.dataset.act === 'product' && it) {
      const checked = (el as HTMLInputElement).checked;
      const productIds = checked ? [...it.productIds, el.value] : it.productIds.filter((x) => x !== el.value);
      store.update(() => { it.productIds = productIds; });
      void store.commit(db.setArticleProducts(it.id, productIds), '関連商品を保存しました');
    }
    else if (el.dataset.filter) { setFilter(el.dataset.filter, el.value); render(root); }
  };
  root.oninput = (e) => {
    const el = ui.fieldTarget(e);
    if (el.dataset.filter === 'threshold') ui.byId('th-val').textContent = el.value;
  };
}

function setFilter(key: string, value: string): void {
  if (key === 'threshold') f.threshold = Number(value);
  else if (key === 'persona') f.persona = value;
  else if (key === 'status') f.status = value as Filters['status'];
  else if (key === 'type') f.type = value as Filters['type'];
}

function setStatus(id: string, to: ItemStatus): void {
  const it = store.item(id);
  if (!it) return;
  if (to === 'published' && commentLength(it.comment) < MIN_COMMENT) {
    ui.toast(`公開するには、編集コメントを ${MIN_COMMENT} 字以上書いてください（今 ${commentLength(it.comment)} 字）`, 'warn');
    return;
  }
  const label = ui.STATUS[to].label;
  let removed: Issue[] = [];
  store.update(() => { removed = store.setItemStatus(it, to); });
  void store.commit(db.updateArticle(it.id, { status: to })).then((ok) => {
    if (!ok) return;
    store.log(`#${it.no} を「${label}」に変更`, 'article.' + to);
    if (removed.length) ui.toast(`「${label}」にし、未配信の配信号 ${removed.map((x) => '#' + x.no).join('、')} から外しました`, 'warn');
    else ui.toast(`「${label}」にしました`);
  });
}

function addToIssue(itemId: string, issueId: string): void {
  const it = store.item(itemId);
  const x = store.state.issues.find((i) => i.id === issueId);
  if (!it || !x) return;
  if (!isUsable(it.status)) { ui.toast('配信号に追加できるのは、採用済みか公開中の記事だけです', 'warn'); return; }
  if (x.itemIds.includes(itemId)) { ui.toast('この配信号には追加済みです', 'warn'); return; }
  store.update(() => { x.itemIds.push(itemId); });
  ui.toast(`#${x.no} に追加しました`);
}

// ---------- 記事の追加・編集・削除 ----------

function edit(it?: Item): void {
  const s = store.state;
  const kind = it?.kind ?? 'NEWS';
  ui.modal({
    title: it ? `記事 #${it.no} を編集` : '記事を追加',
    wide: true,
    body: `
      <label class="field"><span>見出し</span><input name="title" required value="${ui.esc(it?.title ?? '')}"></label>
      <div class="field-row">
        <label class="field field-xs"><span>種別</span><select name="kind">${KINDS.map((k) => `<option ${k === kind ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label class="field"><span>媒体名・アカウント</span><input name="source" required value="${ui.esc(it?.source ?? '')}" placeholder="例：テック経済ニュース、@account"></label>
        <label class="field"><span>カテゴリ</span><input name="category" value="${ui.esc(it?.category ?? '')}" placeholder="例：テック"></label>
      </div>
      <label class="field"><span>元記事の URL</span><input name="url" type="url" required value="${ui.esc(it?.url ?? 'https://')}"></label>
      <label class="field"><span>要約</span><textarea name="excerpt" rows="2">${ui.esc(it?.excerpt ?? '')}</textarea></label>
      <h3 class="label">ペルソナ別の適合度（0〜100）と判定理由</h3>
      ${s.personas.map((p) => `
      <div class="field-row">
        <label class="field field-xs"><span>${ui.esc(p.code)}</span><input name="score_${p.id}" type="number" min="0" max="100" value="${it?.scores[p.id] ?? 0}"></label>
        <label class="field"><span>${ui.esc(p.name)} の判定理由（カンマ区切り）</span><input name="reasons_${p.id}" value="${ui.esc((it?.reasons[p.id] ?? []).join(', '))}"></label>
      </div>`).join('') || '<p class="muted">ペルソナがまだありません。スコアはペルソナを追加してから入れられます</p>'}`,
    onSubmit: (v) => {
      const fields: ArticleFields = {
        title: v.title.trim(), kind: v.kind as SourceKind, source: v.source.trim(), category: v.category.trim(), url: v.url.trim(), excerpt: v.excerpt.trim(),
      };
      if (!fields.title || !fields.source) { ui.toast('見出しと媒体名を入力してください', 'warn'); return false; }
      if (!ui.safeUrl(fields.url)) { ui.toast('URL は http:// か https:// で始めてください', 'warn'); return false; }
      const scores: Record<PersonaId, number> = {};
      const reasons: Record<PersonaId, string[]> = {};
      for (const p of s.personas) {
        const n = Number(v['score_' + p.id]);
        if (!Number.isInteger(n) || n < 0 || n > 100) { ui.toast(`${p.code} のスコアは 0〜100 の整数で入力してください`, 'warn'); return false; }
        scores[p.id] = n;
        const r = ui.splitWords(v['reasons_' + p.id]);
        if (r.length) reasons[p.id] = r;
      }
      if (it) saveEdit(it, fields, scores, reasons);
      else void create(fields, scores, reasons);
    },
  });
}

async function create(fields: ArticleFields, scores: Record<PersonaId, number>, reasons: Record<PersonaId, string[]>): Promise<void> {
  const j = store.judge({ scores });
  try {
    const id = await db.insertArticle({ ...fields, verdict: j.verdict, persona: j.persona });
    await db.saveScores(id, scores, reasons);
    selectedId = id;
    await store.reload();
    store.log(`記事「${fields.title}」を追加`, 'article.create');
    ui.toast('追加しました');
  } catch (e) {
    ui.toast('追加できませんでした: ' + dbMessage(e), 'warn');
    await store.reload().catch(() => {});
  }
}

// スコアから判定し直す。主担当は、手で決めてあればそのまま
function saveEdit(it: Item, fields: ArticleFields, scores: Record<PersonaId, number>, reasons: Record<PersonaId, string[]>): void {
  const j = store.judge({ scores });
  const persona = it.persona ?? j.persona;
  store.update(() => {
    Object.assign(it, fields, { type: fields.kind === 'NEWS' ? 'news' : 'sns', scores, reasons, verdict: j.verdict, persona });
  });
  void store.commit(Promise.all([
    db.updateArticle(it.id, { ...fields, verdict: j.verdict, persona }),
    db.saveScores(it.id, scores, reasons),
  ]), '保存しました').then((ok) => {
    if (ok) store.log(`記事 #${it.no} を編集`, 'article.update');
  });
}

function remove(it: Item): void {
  ui.confirmDialog('記事を削除', `#${it.no}「${it.title}」を削除します。ペルソナ別のスコアも一緒に消えます。`, () => {
    if (selectedId === it.id) selectedId = null;
    store.update((s) => {
      s.items = s.items.filter((x) => x.id !== it.id);
      for (const x of s.issues) x.itemIds = x.itemIds.filter((id) => id !== it.id);
    });
    void store.commit(db.deleteArticle(it.id), '削除しました').then((ok) => {
      if (ok) store.log(`記事 #${it.no}「${it.title}」を削除`, 'article.delete');
    });
  }, '削除する');
}

// DB から読み直す（Supabase の Table Editor で追加・変更した記事を反映する）
function reload(): void {
  reloading = true;
  store.update(() => {}); // ボタンを「読み込み中…」に切り替える
  store.reload()
    .then(() => ui.toast('最新の内容を読み込みました'))
    .catch((e: unknown) => ui.toast('読み込めませんでした: ' + (e instanceof Error ? e.message : String(e)), 'warn'))
    .finally(() => { reloading = false; store.update(() => {}); });
}

// 収集バッチ（collector/）を今すぐ動かし、終わったら DB を読み直す
function collectNow(): void {
  collecting = true;
  store.update(() => {}); // ボタンを「収集中…」に切り替える
  db.runCollector()
    .then((r) => ui.toast(r.message || `${r.inserted} 件を登録しました`))
    .catch((e: unknown) => ui.toast('収集できませんでした: ' + (e instanceof Error ? e.message : String(e)), 'warn'))
    .finally(async () => {
      collecting = false;
      await store.reload().catch(() => store.update(() => {}));
    });
}

export const inbox: View = { render };
