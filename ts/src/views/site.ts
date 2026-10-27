/* 公開サイト（プレビュー） */
import { store } from '../store';
import * as ui from '../ui';
import type { PersonaId, View } from '../types';

type Device = 'desktop' | 'mobile';
let device: Device = 'desktop';
let tab: PersonaId = '';

function render(root: HTMLElement): void {
  const s = store.state;
  const personas = s.personas.filter((p) => p.active);
  if (tab && !personas.some((p) => p.id === tab)) tab = '';
  const published = s.items.filter((i) => i.status === 'published').sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
  const shown = published.filter((i) => !tab || i.persona === tab);
  const p = store.persona(tab);
  const products = s.products.filter((pr) => pr.active && (!tab || pr.personaIds.includes(tab))).slice(0, 3);
  const plan = s.deliveries.find((d) => d.status === 'active' && (!tab || d.persona === tab));
  const path = p ? '/' + p.handle : '/';

  root.innerHTML = `
    ${ui.pageHead('公開サイト', '読者に表示される公開ページを確認します',
      `<div class="seg">
        <button class="${device === 'desktop' ? 'active' : ''}" data-act="device" data-v="desktop">PC</button>
        <button class="${device === 'mobile' ? 'active' : ''}" data-act="device" data-v="mobile">スマホ</button>
      </div>`)}

    <div class="browser ${device}">
      <div class="browser-bar"><span class="dots"><i></i><i></i><i></i></span><span class="addr">https://${ui.esc(s.site.domain)}${ui.esc(path)}</span></div>
      <div class="site" style="--c:${p ? ui.esc(p.color) : '#3d6fe0'}">
        <header class="site-head">
          <strong>${ui.esc(s.site.title)}</strong>
          <nav>
            <button class="${!tab ? 'on' : ''}" data-act="tab" data-v="">すべて</button>
            ${personas.map((x) => `<button class="${tab === x.id ? 'on' : ''}" data-act="tab" data-v="${x.id}">${ui.esc(x.code)}</button>`).join('')}
          </nav>
        </header>
        <div class="site-hero">
          <h2>${p ? ui.esc(p.name) + ' のための厳選ニュース' : 'あなたのためのニュースを、AIと編集者が厳選。'}</h2>
          <p>${p ? ui.esc(p.description) : 'ニュースとSNSの話題から、読者像ごとに本当に読むべき記事だけをお届けします。'}</p>
        </div>
        <div class="site-body">
          <div class="site-feed">
            ${shown.map((it) => {
              const ip = store.persona(it.persona);
              return `
              <article class="site-article">
                <div class="sa-meta">${ip ? `<span style="color:${ui.esc(ip.color)}">${ui.esc(ip.code + ' ' + ip.name)}</span>` : ''}<span>${ui.esc(it.source)}</span><span>${ui.fmtDate(it.collectedAt, false)}</span></div>
                <h3>${ui.esc(it.title)}</h3>
                <p>${ui.esc(it.excerpt)}</p>
                ${it.comment ? `<blockquote>💬 ${ui.esc(it.comment)}</blockquote>` : ''}
                <button class="sa-unpub" data-act="unpublish" data-id="${it.id}" title="管理者のみ表示">非公開にする</button>
              </article>`;
            }).join('') || '<p class="empty">公開中の記事はありません。<a href="#inbox" class="link">収集・AI判定</a>から公開できます。</p>'}
          </div>
          <aside class="site-side">
            ${plan ? `
            <div class="site-cta">
              <small>有料メンバー限定</small>
              <strong>${ui.esc(plan.name)}</strong>
              <p>${ui.esc(plan.cadence)} に${ui.esc(plan.channel)}でお届け</p>
              <span class="cta-btn">月額 ${ui.yen(plan.price)} で購読する</span>
            </div>` : ''}
            ${products.length ? `
            <div class="site-products">
              <h4>編集部のおすすめ <small>PR</small></h4>
              ${products.map((pr) => `<div class="sp"><strong>${ui.esc(pr.name)}</strong><small>${ui.esc(pr.category)}${pr.price ? ' · ' + ui.yen(pr.price) : ''}</small></div>`).join('')}
            </div>` : ''}
          </aside>
        </div>
        <footer class="site-foot">© ${ui.esc(s.site.title)} — NEWS × SNS CURATION</footer>
      </div>
    </div>
    <p class="muted small center">公開中 ${published.length} 件 · 「非公開にする」ボタンは管理画面のプレビューにのみ表示されます</p>`;

  root.onclick = (e) => {
    const el = ui.actionTarget(e);
    if (!el) return;
    if (el.dataset.act === 'device') { device = el.dataset.v === 'mobile' ? 'mobile' : 'desktop'; render(root); }
    else if (el.dataset.act === 'tab') { tab = el.dataset.v ?? ''; render(root); }
    else if (el.dataset.act === 'unpublish') {
      const it = store.item(el.dataset.id);
      if (!it) return;
      store.update(() => { it.status = 'approved'; store.log('記事を非公開に戻しました'); });
      ui.toast('非公開にしました（採用済みに戻しました）');
    }
  };
}

export const site: View = { render };
