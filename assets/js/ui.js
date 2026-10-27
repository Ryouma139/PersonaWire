/* Persona Wire — UI ヘルパー */
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');

  function fmtDate(iso, withTime = true) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    const s = `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
    return withTime ? `${s} ${pad(d.getHours())}:${pad(d.getMinutes())}` : s;
  }

  function relTime(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'たった今';
    if (diff < 3600) return Math.floor(diff / 60) + '分前';
    if (diff < 86400) return Math.floor(diff / 3600) + '時間前';
    return fmtDate(iso);
  }

  const yen = (n) => '¥' + Number(n || 0).toLocaleString('ja-JP');
  const num = (n) => Number(n || 0).toLocaleString('ja-JP');

  const VERDICT = {
    adopt: { label: '採用推奨', cls: 'ok' },
    hold: { label: '保留', cls: 'warn' },
    reject: { label: '除外', cls: 'muted' },
  };
  const STATUS = {
    pending: { label: '要確認', cls: 'warn' },
    approved: { label: '採用済み', cls: 'ok' },
    rejected: { label: '却下', cls: 'muted' },
    published: { label: '公開中', cls: 'info' },
  };

  const badge = (map, key) => {
    const v = map[key] || { label: key, cls: 'muted' };
    return `<span class="badge badge-${v.cls}">${esc(v.label)}</span>`;
  };

  // ペルソナのコードチップ（P01 など）。withName で名前も併記
  function personaChip(p, withName = false, outline = false) {
    if (!p) return '<span class="pcode pcode-empty">—</span>';
    const code = `<span class="pcode ${outline ? 'pcode-outline' : ''}" style="--c:${esc(p.color)}" title="${esc(p.name)}">${esc(p.code)}</span>`;
    return withName ? `<span class="pname">${code}<span>${esc(p.name)}</span></span>` : code;
  }

  const kindTag = (kind) => `<span class="kind">${esc(kind)}</span>`;

  function toast(msg, kind = 'ok') {
    const host = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast toast-' + kind;
    el.textContent = msg;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 2600);
  }

  // フォームモーダル。onSubmit(data, form) が false を返すと閉じない
  function modal({ title, body, submitLabel = '保存', onSubmit, wide = false, danger = false }) {
    const host = document.getElementById('modal-root');
    host.innerHTML = `
      <div class="modal-backdrop" data-close>
        <form class="modal ${wide ? 'modal-wide' : ''}" novalidate>
          <header class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="閉じる">✕</button></header>
          <div class="modal-body">${body}</div>
          <footer class="modal-foot">
            <button type="button" class="btn" data-close>キャンセル</button>
            ${onSubmit ? `<button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(submitLabel)}</button>` : ''}
          </footer>
        </form>
      </div>`;
    const form = host.querySelector('form');
    const close = () => { host.innerHTML = ''; document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    host.querySelector('.modal-backdrop').addEventListener('click', (e) => {
      if (e.target.hasAttribute('data-close') || e.target.closest('button[data-close]')) close();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (onSubmit && onSubmit(data, form) === false) return;
      close();
    });
    const first = form.querySelector('input,textarea,select');
    if (first) first.focus();
    return { close, form };
  }

  function confirmDialog(title, message, onOk, label = '実行する') {
    modal({ title, body: `<p>${esc(message)}</p>`, submitLabel: label, danger: true, onSubmit: () => onOk() });
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('リンクをコピーしました');
    } catch (e) {
      toast('コピーできませんでした: ' + text, 'warn');
    }
  }

  window.PW.ui = { esc, fmtDate, relTime, yen, num, badge, VERDICT, STATUS, personaChip, kindTag, toast, modal, confirmDialog, copy };
})();
