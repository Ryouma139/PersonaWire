/* 左サイドバーのカレンダー。記事がある日には件数を出し、日・月を押すと収集・AI判定をその日・その月の記事に絞る */
import { store } from './store';
import * as ui from './ui';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

// 表示中の月（0 = 1 月）。最初は今月
const today = new Date();
let year = today.getFullYear();
let month = today.getMonth();

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * カレンダーを描く。selected は今の絞り込み（'YYYY-MM' か 'YYYY-MM-DD'、無ければ ''）。
 * 押されたときの動きは bindCalendar() で決める
 */
export function renderCalendar(el: HTMLElement, selected: string): void {
  // 日ごとの記事数（収集日時。一覧の日付と同じ基準）
  const counts = new Map<string, number>();
  for (const it of store.state.items) {
    const key = ui.localDay(it.collectedAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ym = `${year}-${pad(month + 1)}`;
  const monthTotal = [...counts].filter(([k]) => k.startsWith(ym)).reduce((a, [, n]) => a + n, 0);
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const todayKey = ui.localDay(new Date());

  const cells: string[] = DOW.map((d, i) => `<span class="cal-dow ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${d}</span>`);
  for (let i = 0; i < first; i++) cells.push('<span></span>');
  for (let d = 1; d <= days; d++) {
    const key = `${ym}-${pad(d)}`;
    const n = counts.get(key) ?? 0;
    const cls = ['cal-day', n ? 'has' : '', key === todayKey ? 'today' : '', key === selected ? 'on' : ''].filter(Boolean).join(' ');
    cells.push(`<button class="${cls}" data-cal="day" data-v="${key}" title="${month + 1}月${d}日 ${n} 件">${d}${n ? `<i>${n}</i>` : ''}</button>`);
  }

  el.innerHTML = `
    <div class="cal-head">
      <button class="icon-btn" data-cal="prev" aria-label="前の月">‹</button>
      <button class="cal-title ${selected === ym ? 'on' : ''}" data-cal="month" data-v="${ym}" title="${year}年${month + 1}月の記事を見る">${year}年${month + 1}月 <small>${monthTotal}件</small></button>
      <button class="icon-btn" data-cal="next" aria-label="次の月">›</button>
    </div>
    <div class="cal-grid">${cells.join('')}</div>`;
}

/** 月の移動はカレンダーの中で、日・月を選んだときは onPick（同じものをもう一度押すと解除 = ''）を呼ぶ */
export function bindCalendar(el: HTMLElement, current: () => string, onPick: (value: string) => void): void {
  el.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-cal]') : null;
    if (!b) return;
    const act = b.dataset.cal;
    if (act === 'prev' || act === 'next') {
      month += act === 'prev' ? -1 : 1;
      if (month < 0) { month = 11; year--; }
      if (month > 11) { month = 0; year++; }
      renderCalendar(el, current());
    } else {
      const v = b.dataset.v ?? '';
      onPick(v === current() ? '' : v);
    }
  });
}
