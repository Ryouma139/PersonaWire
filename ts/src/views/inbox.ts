/* 収集・AI判定 */
import { store } from '../store';
import * as ui from '../ui';
import type { Item, ItemStatus, ItemType, NotionDbName, Persona, PersonaId, View } from '../types';

interface Filters {
  persona: PersonaId | '';
  status: ItemStatus | '';
  type: ItemType | '';
  threshold: number;
}

const f: Filters = { persona: '', status: '', type: '', threshold: 0 };
let selectedId: string | null = null;
let collecting = false;

const NOTION_DBS: NotionDbName[] = ['articles', 'sns_posts', 'ideas'];
const STATUS_KEYS = Object.keys(ui.STATUS) as ItemStatus[];

function filtered(items: Item[]): Item[] {
  return items
    .filter((i) => !f.status || i.status === f.status)
    .filter((i) => !f.type || i.type === f.type)
    .filter((i) => {
      const score = f.persona ? i.scores[f.persona] ?? 0 : Math.max(...Object.values(i.scores));
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
  const drafts = s.issues.filter((x) => x.status !== 'sent');
  return `
    <section class="card detail">
      <div class="detail-top">
        <span class="mono muted">#${it.no} · ${ui.esc(it.category)}</span>
        ${ui.badge(ui.STATUS, it.status)}
      </div>
      <h2 class="detail-title">${ui.esc(it.title)}</h2>
      <div class="meta">${ui.kindTag(it.kind)}<span>${ui.esc(it.source)} · ${ui.fmtDate(it.collectedAt)}</span><a class="link" href="${ui.esc(it.url)}" target="_blank" rel="noopener">元記事 ↗</a></div>
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
        <button class="btn btn-quiet" data-act="rejudge" data-id="${it.id}">再判定</button>
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
      `<span class="sample-tag">サンプルデータ</span><button class="btn" data-act="collect" ${collecting ? 'disabled' : ''}>${collecting ? '収集中…' : '収集を実行'}</button>`)}

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
            <div class="meta">${ui.kindTag(i.kind)}<span>${ui.esc(i.source)}</span><span class="mono">${ui.fmtDate(i.collectedAt)}</span>${ui.badge(ui.STATUS, i.status)}</div>
            <h3>${ui.esc(i.title)}</h3>
            <div class="meta"><span>主担当</span>${ui.personaChip(p)}</div>
          </div>
          ${spark(i, s.personas)}
        </article>`;
      }).join('') : '<p class="empty">条件に合う記事はありません</p>'}
    </section>

    ${detail(sel)}`;

  root.onclick = (e) => {
    const el = ui.actionTarget(e);
    if (!el) return;
    const act = el.dataset.act, id = el.dataset.id ?? '';
    if (act === 'select') { selectedId = id; history.replaceState(null, '', '#inbox/' + id); render(root); }
    else if (act === 'collect') collect();
    else if (act === 'status') setStatus(id, el.dataset.to as ItemStatus);
    else if (act === 'rejudge') rejudge(id);
    else if (act === 'to-issue') addToIssue(id, ui.byId<HTMLSelectElement>('issue-pick').value);
  };
  root.onchange = (e) => {
    const el = ui.fieldTarget(e);
    const it = store.item(el.dataset.id);
    if (el.dataset.act === 'assign' && it) store.update(() => { it.persona = el.value || null; });
    else if (el.dataset.act === 'notiondb' && it) store.update(() => { it.notionDb = el.value as NotionDbName; });
    else if (el.dataset.act === 'comment' && it) { store.update(() => { it.comment = el.value; }); ui.toast('コメントを保存しました'); }
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
  store.update(() => {
    it.status = to;
    store.log(`#${it.no} を「${ui.STATUS[to].label}」に変更`);
  });
  ui.toast(`「${ui.STATUS[to].label}」にしました`);
}

function rejudge(id: string): void {
  const it = store.item(id);
  if (!it) return;
  store.update(() => {
    for (const k of Object.keys(it.scores)) {
      it.scores[k] = Math.max(0, Math.min(100, it.scores[k] + Math.round((Math.random() - 0.5) * 12)));
    }
    Object.assign(it, store.judge(it));
  });
  ui.toast('AIが再判定しました');
}

function addToIssue(itemId: string, issueId: string): void {
  const x = store.state.issues.find((i) => i.id === issueId);
  if (!x) return;
  if (x.itemIds.includes(itemId)) { ui.toast('この配信号には追加済みです', 'warn'); return; }
  store.update(() => { x.itemIds.push(itemId); });
  ui.toast(`#${x.no} に追加しました`);
}

function collect(): void {
  collecting = true;
  store.update(() => {}); // ボタンを「収集中…」に切り替える
  setTimeout(() => {
    const added = store.collect(3 + Math.floor(Math.random() * 3));
    collecting = false;
    selectedId = added[0]?.id ?? selectedId;
    store.update((s) => {
      s.items.unshift(...added);
      store.log(`${added.length} 件を収集し、AIが判定（採用推奨 ${added.filter((a) => a.verdict === 'adopt').length} 件）`);
    });
    ui.toast(`${added.length} 件の新着を収集しました`);
  }, 1200);
}

export const inbox: View = { render };
