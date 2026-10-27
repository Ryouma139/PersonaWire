/* 有料配信 */
import { store, uid } from '../store';
import * as ui from '../ui';
import type { Delivery, Issue, IssueStatus, View } from '../types';

let planId: string | null = null;
let issueId: string | null = null;

const ISSUE_STATUS: Record<IssueStatus, ui.BadgeDef> = {
  draft: { label: '下書き', cls: 'warn' },
  scheduled: { label: '予約済み', cls: 'ok' },
  sent: { label: '配信済み', cls: 'muted' },
};
const CHANNELS = ['メール', 'LINE', 'Discord', 'note メンバーシップ'];

/** 配信号に入れられる記事（採用済み・公開中） */
const isUsable = (status: string): boolean => status === 'approved' || status === 'published';

function planForm(d?: Delivery): string {
  const s = store.state;
  return `
    <label class="field"><span>プラン名</span><input name="name" required value="${ui.esc(d?.name ?? '')}"></label>
    <div class="field-row">
      <label class="field"><span>対象ペルソナ</span><select name="persona">${s.personas.map((p) => `<option value="${p.id}" ${p.id === d?.persona ? 'selected' : ''}>${ui.esc(p.code + ' ' + p.name)}</option>`).join('')}</select></label>
      <label class="field"><span>月額（円）</span><input name="price" type="number" min="0" value="${d?.price ?? 500}"></label>
    </div>
    <div class="field-row">
      <label class="field"><span>チャネル</span><select name="channel">${CHANNELS.map((c) => `<option ${c === d?.channel ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field"><span>配信頻度</span><input name="cadence" value="${ui.esc(d?.cadence ?? '毎週月曜 7:00')}"></label>
    </div>`;
}

function editPlan(d?: Delivery): void {
  ui.modal({
    title: d ? 'プランを編集' : '新しい有料プラン',
    body: planForm(d),
    onSubmit: (v) => {
      if (!v.name.trim()) { ui.toast('プラン名を入力してください', 'warn'); return false; }
      const fields = { name: v.name, persona: v.persona, price: Number(v.price), channel: v.channel, cadence: v.cadence };
      store.update((s) => {
        if (d) Object.assign(d, fields);
        else {
          const nd: Delivery = { id: uid('d'), ...fields, subscribers: 0, openRate: 0, status: 'active' };
          s.deliveries.push(nd);
          planId = nd.id;
          store.log(`有料プラン「${v.name}」を作成`);
        }
      });
      ui.toast('保存しました');
    },
  });
}

function newIssue(d: Delivery): void {
  const s = store.state;
  const last = s.issues.filter((x) => x.deliveryId === d.id).reduce((m, x) => Math.max(m, x.no), 0);
  const candidates = s.items.filter((i) => i.persona === d.persona && isUsable(i.status)).slice(0, 3).map((i) => i.id);
  const dt = new Date(Date.now() + 3 * 864e5);
  const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 6e4).toISOString().slice(0, 11) + '07:00';
  const x: Issue = { id: uid('is'), deliveryId: d.id, no: last + 1, title: '新しい配信号', intro: '', status: 'draft', scheduledAt: local, itemIds: candidates, sentAt: null, opens: null };
  issueId = x.id;
  store.update(() => { s.issues.push(x); });
  ui.toast(`#${x.no} を作成しました（採用済み記事 ${candidates.length} 本を自動選定）`);
}

function preview(x: Issue, d: Delivery): string {
  const p = store.persona(d.persona);
  const items = x.itemIds.map((id) => store.item(id)).filter((it) => it !== undefined);
  const mailProducts = store.state.products.filter((pr) => pr.active && pr.personaIds.includes(d.persona)).slice(0, 1);
  return `
    <div class="mail">
      <div class="mail-head" style="--c:${p ? ui.esc(p.color) : '#333'}">
        <small>${ui.esc(d.name)} · #${x.no}</small>
        <h3>${ui.esc(x.title)}</h3>
      </div>
      <div class="mail-body">
        ${x.intro ? `<p>${ui.esc(x.intro)}</p>` : ''}
        ${items.map((it, n) => `
          <div class="mail-item">
            <span class="mail-no">${n + 1}</span>
            <div>
              <strong>${ui.esc(it.title)}</strong>
              <small>${ui.esc(it.source)}</small>
              ${it.comment ? `<p class="mail-comment">💬 ${ui.esc(it.comment)}</p>` : `<p>${ui.esc(it.excerpt)}</p>`}
            </div>
          </div>`).join('') || '<p class="muted">記事が選択されていません</p>'}
        ${mailProducts.map((pr) => `<div class="mail-pr"><small>PR</small><strong>${ui.esc(pr.name)}</strong><span>詳しく見る →</span></div>`).join('')}
      </div>
    </div>`;
}

function editor(x: Issue, d: Delivery): string {
  const s = store.state;
  const locked = x.status === 'sent';
  const pool = s.items.filter((i) => isUsable(i.status) && !x.itemIds.includes(i.id))
    .sort((a, b) => Number(b.persona === d.persona) - Number(a.persona === d.persona));
  return `
    <section class="card issue-editor">
      <div class="card-head">
        <h2>#${x.no} ${ui.badge(ISSUE_STATUS, x.status)}</h2>
        <div class="row-gap">
          ${!locked && x.status === 'draft' ? `<button class="btn" data-act="schedule">予約する</button>` : ''}
          ${x.status === 'scheduled' ? `<button class="btn" data-act="unschedule">予約を取り消す</button>` : ''}
          ${!locked ? `<button class="btn btn-accent" data-act="send">今すぐ配信</button>` : ''}
          ${!locked ? `<button class="btn btn-ghost-danger" data-act="del-issue">削除</button>` : ''}
        </div>
      </div>
      ${locked ? `<p class="notice">${ui.fmtDate(x.sentAt)} に ${ui.num(d.subscribers)} 名へ配信済み（開封 ${ui.num(x.opens)}）</p>` : ''}
      <div class="editor-grid">
        <div>
          <label class="field"><span>件名</span><input data-field="title" value="${ui.esc(x.title)}" ${locked ? 'disabled' : ''}></label>
          <label class="field"><span>リード文</span><textarea rows="3" data-field="intro" ${locked ? 'disabled' : ''}>${ui.esc(x.intro)}</textarea></label>
          <label class="field"><span>配信日時</span><input type="datetime-local" data-field="scheduledAt" value="${ui.esc(x.scheduledAt)}" ${locked ? 'disabled' : ''}></label>

          <h3 class="sub">掲載記事 <small>${x.itemIds.length} 本</small></h3>
          <ol class="issue-items">
            ${x.itemIds.map((id, n) => {
              const it = store.item(id);
              if (!it) return '';
              return `<li>
                <span>${ui.esc(it.title)}</span>
                ${locked ? '' : `<span class="row-gap">
                  <button class="icon-btn" data-act="up" data-i="${n}" ${n === 0 ? 'disabled' : ''} aria-label="上へ">↑</button>
                  <button class="icon-btn" data-act="down" data-i="${n}" ${n === x.itemIds.length - 1 ? 'disabled' : ''} aria-label="下へ">↓</button>
                  <button class="icon-btn" data-act="remove" data-i="${n}" aria-label="外す">✕</button>
                </span>`}
              </li>`;
            }).join('')}
          </ol>
          ${!locked && pool.length ? `
            <div class="add-issue">
              <select id="add-item">${pool.map((i) => `<option value="${i.id}">${i.persona === d.persona ? '★ ' : ''}${ui.esc(i.title.slice(0, 40))}</option>`).join('')}</select>
              <button class="btn" data-act="add-item">追加</button>
            </div>
            <p class="muted small">★ はこのプランの対象ペルソナに割り当てられた採用済み記事です</p>` : ''}
        </div>
        <div>
          <h3 class="sub">プレビュー</h3>
          ${preview(x, d)}
        </div>
      </div>
    </section>`;
}

/** 配信号の編集操作（記事の並べ替え・予約・配信・削除） */
function onIssueAction(act: string, el: HTMLElement, x: Issue, d: Delivery): void {
  if (act === 'up' || act === 'down') {
    const i = Number(el.dataset.i), j = act === 'up' ? i - 1 : i + 1;
    store.update(() => { [x.itemIds[i], x.itemIds[j]] = [x.itemIds[j], x.itemIds[i]]; });
  } else if (act === 'remove') {
    store.update(() => { x.itemIds.splice(Number(el.dataset.i), 1); });
  } else if (act === 'add-item') {
    const value = ui.byId<HTMLSelectElement>('add-item').value;
    store.update(() => { x.itemIds.push(value); });
  } else if (act === 'schedule') {
    if (!x.itemIds.length) { ui.toast('記事を1本以上追加してください', 'warn'); return; }
    store.update(() => { x.status = 'scheduled'; store.log(`「${d.name}」#${x.no} を ${ui.fmtDate(x.scheduledAt)} に予約`); });
    ui.toast('予約しました');
  } else if (act === 'unschedule') {
    store.update(() => { x.status = 'draft'; });
  } else if (act === 'send') {
    if (!x.itemIds.length) { ui.toast('記事を1本以上追加してください', 'warn'); return; }
    ui.confirmDialog('今すぐ配信', `「${d.name}」#${x.no} を ${d.subscribers} 名の購読者に配信します。よろしいですか？`, () => {
      store.update(() => {
        x.status = 'sent';
        x.sentAt = new Date().toISOString();
        x.opens = 0;
        store.log(`「${d.name}」#${x.no} を配信`);
      });
      ui.toast('配信しました');
    }, '配信する');
  } else if (act === 'del-issue') {
    ui.confirmDialog('配信号を削除', `#${x.no}「${x.title}」を削除します。`, () => {
      issueId = null;
      store.update((s) => { s.issues = s.issues.filter((i) => i.id !== x.id); });
    }, '削除する');
  }
}

function render(root: HTMLElement): void {
  const s = store.state;
  const hashId = location.hash.split('/')[1];
  const fromHash = hashId ? s.issues.find((x) => x.id === hashId) : undefined;
  if (fromHash && issueId !== hashId) { issueId = hashId; planId = fromHash.deliveryId; }
  if (!store.delivery(planId)) planId = s.deliveries[0]?.id ?? null;
  const d = store.delivery(planId);
  const issues = d ? s.issues.filter((x) => x.deliveryId === d.id).sort((a, b) => b.no - a.no) : [];
  if (!issues.some((x) => x.id === issueId)) issueId = (issues.find((x) => x.status !== 'sent') ?? issues[0])?.id ?? null;
  const x = issues.find((i) => i.id === issueId);

  const active = s.deliveries.filter((p) => p.status === 'active');
  const mrr = active.reduce((a, p) => a + p.price * p.subscribers, 0);

  root.innerHTML = `
    ${ui.pageHead('有料配信', 'ペルソナ別の有料ニュースレターを編集・予約・配信します', `<button class="btn btn-primary" data-act="new-plan">＋ プランを追加</button>`)}

    <section class="kpis kpis-3">
      <div class="kpi"><span>月間売上 (MRR)</span><strong>${ui.yen(mrr)}</strong><small>配信中 ${active.length} プラン</small></div>
      <div class="kpi"><span>有料購読者</span><strong>${ui.num(active.reduce((a, p) => a + p.subscribers, 0))}</strong><small>全プラン合計</small></div>
      <div class="kpi"><span>平均開封率</span><strong>${active.length ? Math.round(active.reduce((a, p) => a + p.openRate, 0) / active.length) : 0}%</strong><small>直近4号</small></div>
    </section>

    <div class="plans">
      ${s.deliveries.map((p) => {
        const per = store.persona(p.persona);
        return `
        <article class="plan ${p.id === planId ? 'selected' : ''}" data-act="plan" data-id="${p.id}" style="--c:${per ? ui.esc(per.color) : '#888'}">
          <div class="plan-top">${ui.personaChip(per, true)}<span class="badge badge-${p.status === 'active' ? 'ok' : 'muted'}">${p.status === 'active' ? '配信中' : '停止中'}</span></div>
          <h3>${ui.esc(p.name)}</h3>
          <p class="muted small">${ui.esc(p.channel)} · ${ui.esc(p.cadence)}</p>
          <div class="plan-nums">
            <span><b>${ui.yen(p.price)}</b>/月</span>
            <span><b>${ui.num(p.subscribers)}</b>名</span>
            <span><b>${p.openRate}%</b>開封</span>
          </div>
          <div class="plan-actions">
            <button class="btn btn-sm" data-act="edit-plan" data-id="${p.id}">編集</button>
            <button class="btn btn-sm" data-act="toggle-plan" data-id="${p.id}">${p.status === 'active' ? '一時停止' : '再開'}</button>
          </div>
        </article>`;
      }).join('')}
    </div>

    ${d ? `
    <div class="issues-layout">
      <section class="card issue-list">
        <div class="card-head"><h2>配信号</h2><button class="btn btn-sm btn-primary" data-act="new-issue">＋ 新規</button></div>
        <ul>
          ${issues.map((i) => `
            <li class="${i.id === issueId ? 'selected' : ''}" data-act="issue" data-id="${i.id}">
              <div><b>#${i.no}</b> ${ui.esc(i.title)}</div>
              <small>${ui.badge(ISSUE_STATUS, i.status)} ${ui.fmtDate(i.sentAt ?? i.scheduledAt)}</small>
            </li>`).join('') || '<li class="empty">配信号はまだありません</li>'}
        </ul>
      </section>
      ${x ? editor(x, d) : '<section class="card"><p class="empty">配信号を作成してください</p></section>'}
    </div>` : ''}`;

  root.onclick = (e) => {
    const el = ui.actionTarget(e);
    if (!el) return;
    const act = el.dataset.act ?? '';
    const target = store.delivery(el.dataset.id);
    if (act === 'plan') { planId = el.dataset.id ?? null; issueId = null; render(root); }
    else if (act === 'new-plan') editPlan();
    else if (act === 'edit-plan') { e.stopPropagation(); editPlan(target); }
    else if (act === 'toggle-plan' && target) {
      e.stopPropagation();
      store.update(() => { target.status = target.status === 'active' ? 'paused' : 'active'; });
    }
    else if (act === 'issue') { issueId = el.dataset.id ?? null; history.replaceState(null, '', '#delivery/' + issueId); render(root); }
    else if (act === 'new-issue' && d) newIssue(d);
    else if (x && d) onIssueAction(act, el, x, d);
  };
  root.onchange = (e) => {
    const el = ui.fieldTarget(e);
    const k = el.dataset.field;
    if (x && (k === 'title' || k === 'intro' || k === 'scheduledAt')) store.update(() => { x[k] = el.value; });
  };
}

export const delivery: View = { render };
