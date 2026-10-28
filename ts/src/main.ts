/* Persona Wire — ルーター / シェル */
import './styles.css';
import { store } from './store';
import * as ui from './ui';
import { auth, authMessage, configError, ROLE_LABEL, type Member } from './auth';
import type { View } from './types';
import { dashboard } from './views/dashboard';
import { dateFilter, inbox, setDateFilter } from './views/inbox';
import { bindCalendar, renderCalendar } from './calendar';
import { delivery } from './views/delivery';
import { personas } from './views/personas';
import { products } from './views/products';
import { notion } from './views/notion';
import { site } from './views/site';

const views = { dashboard, inbox, delivery, personas, products, notion, site } satisfies Record<string, View>;
type RouteName = keyof typeof views;

const root = ui.byId('view');
let current: RouteName = 'dashboard';

const isRoute = (name: string): name is RouteName => name in views;

function route(): RouteName {
  const name = (location.hash || '#dashboard').slice(1).split('/')[0];
  return isRoute(name) ? name : 'dashboard';
}

function renderShell(): void {
  const s = store.state;
  document.querySelectorAll<HTMLAnchorElement>('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === current));

  const pending = s.items.filter((i) => i.status === 'pending').length;
  const badge = ui.byId('badge-inbox');
  badge.textContent = pending ? String(pending) : '';
  badge.hidden = !pending;

  const n = s.notion;
  const label = !n.connected ? '未接続' : n.syncing ? '同期中…' : 'Notion 同期中';
  ui.byId('sync-status').innerHTML = `
    <a href="#notion" class="sync ${n.connected ? '' : 'off'} ${n.syncing ? 'busy' : ''}">
      <span class="dot"></span>
      <span><strong>${ui.esc(label)}</strong><small>最終同期 ${ui.fmtDate(n.lastSync)}</small></span>
    </a>`;

  renderCalendar(ui.byId('calendar'), current === 'inbox' ? dateFilter() : '');
}

function render(): void {
  current = route();
  root.onclick = root.onchange = root.oninput = root.onsubmit = null;
  views[current].render(root);
  renderShell();
}

// ---------- ログインの関門 ----------
// 未ログイン → ログイン画面、未承認 → 承認待ち画面、管理者・編集者 → 管理画面
const gate = ui.byId('gate');
let started = false;

// メールのリンクから戻ったときに URL に付くエラー（例: リンクの期限切れ）。?error=… と #error=… の両方がある
const hashError = location.hash.startsWith('#error') ? new URLSearchParams(location.hash.slice(1)) : null;
const linkError = new URLSearchParams(location.search).get('error_description') ?? hashError?.get('error_description') ?? null;
if (hashError) history.replaceState(null, '', location.pathname + location.search);

function showGate(body: string): void {
  document.body.classList.add('gated');
  gate.hidden = false;
  gate.innerHTML = `
    <section class="gate-card">
      <div class="brand"><strong>Persona Wire</strong><small>NEWS × SNS CURATION</small></div>
      ${body}
    </section>`;
}

let lastEmail = '';

function loginScreen(message?: { text: string; kind: 'error' | 'info' }): void {
  showGate(`
    <form class="gate-form" novalidate>
      <label class="field"><span>メールアドレス</span><input name="email" type="email" autocomplete="email" required value="${ui.esc(lastEmail)}"></label>
      <label class="field"><span>パスワード</span><input name="password" type="password" autocomplete="current-password" minlength="8"></label>
      ${message ? `<p class="gate-${message.kind}">${ui.esc(message.text)}</p>` : ''}
      <button class="btn btn-primary" value="signin">ログイン</button>
      <button class="btn" value="signup">新規登録</button>
      <button class="btn btn-quiet" value="link">パスワードなしで、ログイン用のリンクをメールで受け取る</button>
    </form>`);
}

function pendingScreen(m: Member): void {
  showGate(`
    <p><strong>${ui.esc(m.name)}</strong>（${ui.esc(m.email)}）でログインしました。</p>
    <p>管理者の承認を待っています。承認されたら、このページを再読み込みしてください。</p>
    <button class="btn" data-act="signout">ログアウト</button>`);
}

function renderAccount(m: Member): void {
  ui.byId('account').innerHTML = `
    <div class="account-who"><strong>${ui.esc(m.name)}</strong><small>${m.role ? ROLE_LABEL[m.role] : ''}</small></div>
    <button class="btn btn-sm" data-act="signout">ログアウト</button>`;
}

function onAuth(m: Member | null, error?: unknown): void {
  // ログインの戻りで付いた ?code= などを URL から消す（# 以降の画面指定は残す）
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
  if (error) return loginScreen({ text: 'ログイン情報を読み込めませんでした: ' + authMessage(error), kind: 'error' });
  if (!m) return loginScreen(linkError ? { text: 'リンクからログインできませんでした: ' + linkError, kind: 'error' } : undefined);
  if (!m.role) return pendingScreen(m);
  renderAccount(m);
  if (started) return openApp();
  showGate('<p class="gate-loading">データを読み込み中…</p>');
  store.reload()
    .then(() => {
      started = true;
      openApp();
      render();
    })
    .catch((e: unknown) => showGate(`
      <p class="gate-error">データを読み込めませんでした: ${ui.esc(e instanceof Error ? e.message : String(e))}</p>
      <button class="btn" data-act="signout">ログアウト</button>`));
}

function openApp(): void {
  document.body.classList.remove('gated');
  gate.hidden = true;
}

// 別のタブ（Supabase の Table Editor など）から戻ったら、DB を読み直す
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && started && auth.member?.role) {
    store.reload().catch((e: unknown) => console.error('再読み込みに失敗しました', e));
  }
});

async function onSignOut(e: Event): Promise<void> {
  if (ui.actionTarget(e)?.dataset.act !== 'signout') return;
  try {
    await auth.signOut();
  } catch (err) {
    ui.toast('ログアウトできませんでした: ' + authMessage(err), 'warn');
  }
}
gate.addEventListener('click', onSignOut);
ui.byId('account').addEventListener('click', onSignOut);

// ログイン画面のフォーム。押したボタンの value で、ログイン・新規登録・リンク送信を分ける
gate.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const act = ((e as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
  const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
  const password = (form.elements.namedItem('password') as HTMLInputElement).value;
  lastEmail = email;
  if (!/^\S+@\S+\.\S+$/.test(email)) return loginScreen({ text: 'メールアドレスを入力してください', kind: 'error' });
  if (act !== 'link' && password.length < 8) return loginScreen({ text: 'パスワードを8文字以上で入力してください', kind: 'error' });
  form.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    if (act === 'signin') await auth.signIn(email, password); // 成功すると auth.start() の onAuth が呼ばれる
    else if (act === 'signup') {
      if (!(await auth.signUp(email, password))) loginScreen({ text: `${email} に確認メールを送りました。メールのリンクを、このブラウザで開いてください。`, kind: 'info' });
    } else if (act === 'link') {
      await auth.sendLink(email);
      loginScreen({ text: `${email} にログイン用のリンクを送りました。メールのリンクを、このブラウザで開いてください。`, kind: 'info' });
    }
  } catch (err) {
    loginScreen({ text: authMessage(err), kind: 'error' });
  }
});

// 状態変化時は現在のビューを再描画（スクロール位置は維持）
store.subscribe(() => {
  if (!started) return;
  const y = window.scrollY;
  views[current].render(root);
  renderShell();
  window.scrollTo(0, y);
});

window.addEventListener('hashchange', () => {
  if (!started) return;
  render();
  window.scrollTo(0, 0);
  document.body.classList.remove('nav-open');
});

// サイドバーのカレンダー: 日・月を選ぶと、収集・AI判定をその日・その月の記事に絞って開く
bindCalendar(ui.byId('calendar'), () => (current === 'inbox' ? dateFilter() : ''), (value) => {
  setDateFilter(value);
  document.body.classList.remove('nav-open');
  if (location.hash !== '#inbox') location.hash = '#inbox'; // 画面の切り替えで描き直される
  else render();
  window.scrollTo(0, 0);
});

ui.byId('menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
ui.byId('scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));

document.body.classList.add('gated');
if (configError) showGate(`<p class="gate-error">${ui.esc(configError)}</p>`);
else auth.start(onAuth);
