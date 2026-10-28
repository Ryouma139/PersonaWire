/* 収集・AI判定 */
import { isUsable, store } from '../store';
import { db, dbMessage, type ArticleFields } from '../db';
import { auth } from '../auth';
import * as ui from '../ui';
import type { Issue, Item, ItemStatus, ItemType, NotionDbName, Persona, PersonaId, SourceKind, View } from '../types';

interface Filters {
  persona: PersonaId | '';
  status: ItemStatus | '';
  type: ItemType | '';
  threshold: number;
}

const f: Filters = { persona: '', status: '', type: '', threshold: 0 };
let selectedId: string | null = null;
let reloading = false;

const NOTION_DBS: NotionDbName[] = ['articles', 'sns_posts', 'ideas'];
const KINDS: SourceKind[] = ['NEWS', 'YOUTUBE', 'NOTE', 'X', 'THREADS'];
const STATUS_KEYS = Object.keys(ui.STATUS) as ItemStatus[];

function filtered(items: Item[]): Item[] {
  return items
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
  return `
    <section class="card detail">
      <div class="detail-top">
        <span class="mono muted">#${it.no} · ${ui.esc(it.category)}</span>
        ${ui.badge(ui.STATUS, it.status)}
      </div>
      <h2 class="detail-title">${ui.esc(it.title)}</h2>
      <div class="meta">${ui.kindTag(it.kind)}<span>${ui.esc(it.source)} · ${ui.fmtDate(it.collectedAt)}</span>${href ? `<a class="link" href="${ui.esc(href)}" target="_blank" rel="noopener noreferrer">元記事 ↗</a>` : '<span class="muted">元記事のURLが不正です</span>'}</div>
      <p class="detail-excerpt">${ui.esc(it.excerpt)}</p>

      <h3 class="label">ペルソナ適合度と判定理由</h3>
      <ul class="fit">
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

      <h3 class="label">article_persona_scores に保存される内容</h3>
      <pre class="code">${ui.esc(scoresBlock(it))}</pre>

      <label class="field"><span>編集コメント（公開サイト・配信に表示）</span>
        <textarea rows="2" data-act="comment" data-id="${it.id}" placeholder="読者に向けたひとこと">${ui.esc(it.comment)}</textarea>
      </label>

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
  if (!store.item(selectedId)) selectedId = list[0]?.id ?? null;
  const sel = store.item(selectedId);

  root.innerHTML = `
    ${ui.pageHead('収集・AI判定', `NewsとSNSから集めた記事を、${s.personas.length}つのペルソナとの適合度で振り分けます`,
      `<button class="btn" data-act="reload" ${reloading ? 'disabled' : ''}>${reloading ? '読み込み中…' : '再読み込み'}</button><button class="btn btn-primary" data-act="new">＋ 記事を追加</button>`)}

    <div class="filters">
      <select data-filter="persona"><option value="">すべてのペルソナ</option>${s.personas.map((p) => `<option value="${p.id}" ${f.persona === p.id ? 'selected' : ''}>${ui.esc(p.code)} ${ui.esc(p.name)}</option>`).join('')}</select>
      <select data-filter="status"><option value="">すべての状態</option>${STATUS_KEYS.map((k) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${ui.STATUS[k].label}</option>`).join('')}</select>
      <select data-filter="type"><option value="">News + SNS</option><option value="news" ${f.type === 'news' ? 'selected' : ''}>News</option><option value="sns" ${f.type === 'sns' ? 'selected' : ''}>SNS</option></select>
      <label class="range"><span>関連しきい値</span><input type="range" min="0" max="100" step="5" value="${f.threshold}" data-filter="threshold"><b class="mono" id="th-val">${f.threshold}</b></label>
    </div>

    <section class="card list-card">
      ${list.length ? list.map((i) => {
        const p = store.persona(i.persona);
        return `
        <article class="row ${i.id === selectedId ? 'selected' : ''}" data-act="select" data-id="${i.id}">
          <div class="row-body">
            <div class="meta">${ui.kindTag(i.kind)}<span>${ui.esc(i.source)}</span><span class="mono">${ui.fmtDate(i.collectedAt)}</span>${ui.badge(ui.STATUS, i.status)}${i.verdict ? '' : '<span class="badge badge-muted">AI判定待ち</span>'}</div>
            <h3>${ui.esc(i.title)}</h3>
            <div class="meta"><span>主担当</span>${ui.personaChip(p)}</div>
          </div>
          ${spark(i, s.personas)}
        </article>`;
      }).join('') : `<p class="empty">${s.items.length ? '条件に合う記事はありません' : '記事はまだありません。Supabase の articles 表に追加すると、ここに表示されます'}</p>`}
    </section>

    ${detail(sel)}`;

  root.onclick = (e) => {
    const el = ui.actionTarget(e);
    if (!el) return;
    const act = el.dataset.act, id = el.dataset.id ?? '';
    if (act === 'select') { selectedId = id; history.replaceState(null, '', '#inbox/' + id); render(root); }
    else if (act === 'reload') reload();
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

export const inbox: View = { render };
