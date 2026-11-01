/* 売上（手入力）。月ごとに、購読と ASP ごとのアフィリエイト報酬を入れる。入れる・直すのは管理者だけ */
import { store } from '../store';
import { db } from '../db';
import { auth } from '../auth';
import * as ui from '../ui';
import { ASPS } from './products';
import type { Asp, RevenueSource, View } from '../types';

const AFFILIATES = Object.keys(ASPS) as Asp[];
const SOURCES: RevenueSource[] = ['subscription', ...AFFILIATES];
const LABEL: Record<RevenueSource, string> = { subscription: '購読', ...ASPS };

/** 今月（YYYY-MM、ブラウザの時刻で） */
export const thisMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export interface RevenueTotal {
  subscription: number;
  affiliate: number;
  total: number;
}

/** 売上の合計。month を渡すとその月だけ */
export function revenueTotal(month?: string): RevenueTotal {
  const rows = store.state.revenues.filter((r) => !month || r.month === month);
  const subscription = rows.filter((r) => r.source === 'subscription').reduce((a, r) => a + r.amount, 0);
  const affiliate = rows.filter((r) => r.source !== 'subscription').reduce((a, r) => a + r.amount, 0);
  return { subscription, affiliate, total: subscription + affiliate };
}

/** 月ごとの金額の表（新しい月から） */
function months(): Array<{ month: string; amounts: Record<RevenueSource, number> }> {
  const byMonth = new Map<string, Record<RevenueSource, number>>();
  for (const r of store.state.revenues) {
    const m = byMonth.get(r.month) ?? (Object.fromEntries(SOURCES.map((s) => [s, 0])) as Record<RevenueSource, number>);
    m[r.source] = r.amount;
    byMonth.set(r.month, m);
  }
  return [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, amounts]) => ({ month, amounts }));
}

const monthLabel = (m: string): string => `${m.slice(0, 4)}年${Number(m.slice(5))}月`;

function edit(month?: string): void {
  const current = months().find((x) => x.month === month)?.amounts;
  const field = (s: RevenueSource): string =>
    `<label class="field"><span>${ui.esc(LABEL[s])}（円）</span><input name="${s}" type="number" min="0" step="1" value="${current?.[s] ?? 0}"></label>`;
  ui.modal({
    title: month ? `${monthLabel(month)}の売上を編集` : '売上を入力',
    body: `
      <label class="field"><span>月</span><input name="month" type="month" required value="${month ?? thisMonth()}" ${month ? 'readonly' : ''}></label>
      ${field('subscription')}
      <fieldset class="field"><legend>アフィリエイト報酬（ASP の管理画面で、その月の確定報酬を見て入れる）</legend>
        <div class="field-row">${AFFILIATES.map(field).join('')}</div>
      </fieldset>`,
    onSubmit: (v) => {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v.month)) { ui.toast('月を選んでください', 'warn'); return false; }
      if (!month && months().some((x) => x.month === v.month)) { ui.toast(`${monthLabel(v.month)}はもうあります。一覧の「編集」から直してください`, 'warn'); return false; }
      const amounts = Object.fromEntries(SOURCES.map((s) => [s, Math.max(0, Math.round(Number(v[s]) || 0))])) as Record<RevenueSource, number>;
      store.update((st) => {
        st.revenues = [...st.revenues.filter((r) => r.month !== v.month), ...SOURCES.map((source) => ({ month: v.month, source, amount: amounts[source] }))];
      });
      void store.commit(db.saveRevenues(v.month, amounts), '保存しました').then((ok) => { if (ok) store.log(`${monthLabel(v.month)}の売上を保存`, 'revenue.save'); });
    },
  });
}

function render(root: HTMLElement): void {
  const admin = auth.isAdmin();
  const now = revenueTotal(thisMonth());
  const all = revenueTotal();
  const list = months();

  root.innerHTML = `
    ${ui.pageHead('売上', '購読とアフィリエイトの売上を、月ごとに手で入力します', admin ? `<button class="btn btn-primary" data-act="new">＋ 売上を入力</button>` : '')}

    <section class="kpis kpis-3">
      <div class="kpi"><span>今月の売上</span><strong>${ui.yen(now.total)}</strong><small>購読 ${ui.yen(now.subscription)} / アフィリ ${ui.yen(now.affiliate)}</small></div>
      <div class="kpi"><span>購読（累計）</span><strong>${ui.yen(all.subscription)}</strong><small>${list.length} か月分</small></div>
      <div class="kpi"><span>アフィリエイト（累計）</span><strong>${ui.yen(all.affiliate)}</strong><small>合計 ${ui.yen(all.total)}</small></div>
    </section>

    <section class="card table-card">
      <table class="table">
        <thead><tr><th>月</th>${SOURCES.map((s) => `<th class="num">${ui.esc(LABEL[s])}</th>`).join('')}<th class="num">アフィリ計</th><th class="num">合計</th><th></th></tr></thead>
        <tbody>
          ${list.map(({ month, amounts }) => {
            const aff = AFFILIATES.reduce((a, s) => a + amounts[s], 0);
            return `<tr>
              <td><strong>${monthLabel(month)}</strong></td>
              ${SOURCES.map((s) => `<td class="num">${amounts[s] ? ui.yen(amounts[s]) : '<span class="muted">—</span>'}</td>`).join('')}
              <td class="num">${ui.yen(aff)}</td>
              <td class="num"><strong>${ui.yen(amounts.subscription + aff)}</strong></td>
              <td class="row-gap">${admin ? `
                <button class="btn btn-sm" data-act="edit" data-month="${month}">編集</button>
                <button class="icon-btn" data-act="delete" data-month="${month}" title="削除">🗑</button>` : ''}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="${SOURCES.length + 4}" class="empty">まだ入力されていません。${admin ? '「＋ 売上を入力」から、月ごとの金額を入れてください' : ''}</td></tr>`}
        </tbody>
      </table>
    </section>
    <p class="muted small">金額は手入力です。アフィリエイトは、各 ASP の管理画面でその月の確定報酬を見て入れてください。購読は note などの売上（手数料を引く前か後かは、毎月そろえてください）。入れる・直すのは管理者だけです。</p>`;

  root.onclick = (e) => {
    const el = ui.actionTarget(e);
    if (!el) return;
    const month = el.dataset.month;
    if (el.dataset.act === 'new') edit();
    else if (el.dataset.act === 'edit' && month) edit(month);
    else if (el.dataset.act === 'delete' && month) {
      ui.confirmDialog('売上を削除', `${monthLabel(month)}の売上をすべて削除します。`, () => {
        store.update((st) => { st.revenues = st.revenues.filter((r) => r.month !== month); });
        void store.commit(db.deleteRevenues(month), '削除しました').then((ok) => { if (ok) store.log(`${monthLabel(month)}の売上を削除`, 'revenue.delete'); });
      }, '削除する');
    }
  };
}

export const revenue: View = { render };
