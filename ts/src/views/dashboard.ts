/* ダッシュボード */
import { store } from '../store';
import * as ui from '../ui';
import type { DailyStat, View } from '../types';

function chart(daily: DailyStat[]): string {
  const W = 640, H = 200, P = 28;
  const max = Math.max(...daily.map((d) => d.news + d.sns), 10);
  const bw = (W - P * 2) / daily.length;
  const y = (v: number): number => H - P - (v / max) * (H - P * 2);
  const bars = daily.map((d, i) => {
    const x = P + i * bw + bw * 0.2, w = bw * 0.6;
    return `
      <rect x="${x}" y="${y(d.news)}" width="${w}" height="${H - P - y(d.news)}" class="bar-news"><title>${d.d} ニュース ${d.news}</title></rect>
      <rect x="${x}" y="${y(d.news + d.sns)}" width="${w}" height="${y(d.news) - y(d.news + d.sns)}" class="bar-sns"><title>${d.d} SNS ${d.sns}</title></rect>
      <text x="${x + w / 2}" y="${H - 8}" class="axis">${d.d}</text>`;
  }).join('');
  const line = daily.map((d, i) => `${P + i * bw + bw / 2},${y(d.adopted)}`).join(' ');
  return `
    <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="直近7日の収集件数">
      <line x1="${P}" x2="${W - P}" y1="${H - P}" y2="${H - P}" class="grid"/>
      ${bars}
      <polyline points="${line}" class="line-adopt"/>
      ${daily.map((d, i) => `<circle cx="${P + i * bw + bw / 2}" cy="${y(d.adopted)}" r="3.5" class="dot-adopt"><title>${d.d} 採用 ${d.adopted}</title></circle>`).join('')}
    </svg>
    <div class="legend"><span class="lg lg-news">ニュース</span><span class="lg lg-sns">SNS</span><span class="lg lg-adopt">採用</span></div>`;
}

function render(root: HTMLElement): void {
  const s = store.state;
  const since = Date.now() - 864e5;
  const recent = s.items.filter((i) => new Date(i.collectedAt).getTime() >= since);
  const pending = s.items.filter((i) => i.status === 'pending');
  const candidates = pending.filter((i) => i.verdict === 'adopt');
  const activePlans = s.deliveries.filter((d) => d.status === 'active');
  const subs = activePlans.reduce((a, d) => a + d.subscribers, 0);
  const mrr = activePlans.reduce((a, d) => a + d.subscribers * d.price, 0);
  const clicks = s.products.reduce((a, p) => a + p.clicks, 0);

  // 直近7日（今日を含む）を、記事の収集日ごとに数える
  const daily: DailyStat[] = Array.from({ length: 7 }, (_, k) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (6 - k));
    const next = day.getTime() + 864e5;
    const inDay = s.items.filter((i) => { const t = new Date(i.collectedAt).getTime(); return t >= day.getTime() && t < next; });
    return {
      d: ui.fmtDate(day.toISOString(), false),
      news: inDay.filter((x) => x.type === 'news').length,
      sns: inDay.filter((x) => x.type === 'sns').length,
      adopted: inDay.filter((x) => x.verdict === 'adopt').length,
    };
  });

  const upcoming = s.issues.filter((x) => x.status !== 'sent').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).slice(0, 4);

  root.innerHTML = `
    ${ui.pageHead('ダッシュボード', '今日のキュレーション状況と配信の概要', `<a class="btn btn-primary" href="#inbox">要確認を見る (${pending.length})</a>`)}

    <section class="kpis">
      <div class="kpi"><span>24時間の収集</span><strong>${ui.num(recent.length)}</strong><small>ニュース ${recent.filter((x) => x.type === 'news').length} / SNS ${recent.filter((x) => x.type === 'sns').length}</small></div>
      <div class="kpi"><span>AI採用候補</span><strong>${candidates.length}</strong><small>要確認 ${pending.length} 件中</small></div>
      <div class="kpi"><span>有料購読者</span><strong>${ui.num(subs)}</strong><small>配信中 ${activePlans.length} プラン</small></div>
      <div class="kpi"><span>月間売上 (MRR)</span><strong>${ui.yen(mrr)}</strong><small>有料配信の合計</small></div>
      <div class="kpi"><span>商品クリック</span><strong>${ui.num(clicks)}</strong><small>CV ${ui.num(s.products.reduce((a, p) => a + p.conversions, 0))}</small></div>
    </section>

    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>直近7日の収集とAI採用</h2></div>
        ${chart(daily)}
      </section>

      <section class="card">
        <div class="card-head"><h2>ペルソナ別</h2><a href="#personas" class="link">管理 →</a></div>
        <ul class="persona-stats">
          ${s.personas.map((p) => {
            const mine = s.items.filter((i) => i.persona === p.id);
            const pend = mine.filter((i) => i.status === 'pending').length;
            const pub = mine.filter((i) => i.status === 'published').length;
            const avg = mine.length ? Math.round(mine.reduce((a, i) => a + (i.scores[p.id] || 0), 0) / mine.length) : 0;
            return `<li>
              ${ui.personaChip(p, true)}
              <div class="ps-nums"><span><b>${pend}</b>要確認</span><span><b>${pub}</b>公開中</span><span><b>${avg}</b>平均スコア</span></div>
              <div class="meter"><i style="width:${avg}%;background:${ui.esc(p.color)}"></i></div>
            </li>`;
          }).join('')}
        </ul>
      </section>
    </div>

    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>AI採用候補</h2><a href="#inbox" class="link">すべて →</a></div>
        ${candidates.length ? `<ul class="mini-list">${candidates.slice(0, 5).map((i) => `
          <li>
            <span class="score">${i.persona ? i.scores[i.persona] ?? 0 : 0}</span>
            <div><a href="#inbox/${i.id}" class="title">${ui.esc(i.title)}</a><small>${ui.esc(i.source)} · ${ui.relTime(i.collectedAt)}</small></div>
            ${ui.personaChip(store.persona(i.persona))}
          </li>`).join('')}</ul>` : '<p class="empty">採用候補はありません</p>'}
      </section>

      <section class="card">
        <div class="card-head"><h2>配信予定</h2><a href="#delivery" class="link">有料配信 →</a></div>
        ${upcoming.length ? `<ul class="mini-list">${upcoming.map((x) => {
          const d = store.delivery(x.deliveryId);
          return `<li>
            <span class="date">${ui.fmtDate(x.scheduledAt)}</span>
            <div><a href="#delivery/${x.id}" class="title">#${x.no} ${ui.esc(x.title)}</a><small>${ui.esc(d ? d.name : '')} · ${x.itemIds.length} 本</small></div>
            ${x.status === 'scheduled' ? '<span class="badge badge-ok">予約済み</span>' : '<span class="badge badge-warn">下書き</span>'}
          </li>`;
        }).join('')}</ul>` : '<p class="empty">予定された配信はありません</p>'}
      </section>
    </div>

    <section class="card">
      <div class="card-head"><h2>収集バッチ</h2><a href="#inbox" class="link">収集・AI判定 →</a></div>
      ${s.runs.length ? `<ul class="timeline">${s.runs.slice(0, 6).map((r) => `<li><time>${ui.fmtDate(r.startedAt)}</time><span>${ui.runBadge(r)} ${ui.runTrigger(r)} · 登録 ${r.inserted} 件 · 対象外 ${r.skipped} 件${r.purged ? ` · 却下から削除 ${r.purged} 件` : ''}${r.message ? `<small class="run-msg">${ui.esc(r.message)}</small>` : ''}</span></li>`).join('')}</ul>` : '<p class="empty">まだ実行されていません</p>'}
    </section>

    <section class="card">
      <div class="card-head"><h2>アクティビティ</h2></div>
      ${s.activity.length ? `<ul class="timeline">${s.activity.slice(0, 8).map((a) => `<li><time>${ui.fmtDate(a.at)}</time><span>${a.who ? `<b>${ui.esc(a.who)}</b> ` : ''}${ui.esc(a.text)}</span></li>`).join('')}</ul>` : '<p class="empty">まだ操作の記録はありません</p>'}
    </section>`;
}

export const dashboard: View = { render };
