/* Persona Wire — UI ヘルパー */
import type { CollectRun, ItemStatus, Persona, SourceKind, Verdict } from './types';

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const pad = (n: number): string => String(n).padStart(2, '0');

/** 外部 URL を href に入れてよい形にする。http(s) 以外（javascript: など）や不正な URL は null */
export function safeUrl(url: string | null | undefined): string | null {
  try {
    const u = new URL(String(url ?? ''));
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

export function fmtDate(iso: string | null | undefined, withTime = true): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const s = `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  return withTime ? `${s} ${pad(d.getHours())}:${pad(d.getMinutes())}` : s;
}

export function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'たった今';
  if (diff < 3600) return Math.floor(diff / 60) + '分前';
  if (diff < 86400) return Math.floor(diff / 3600) + '時間前';
  return fmtDate(iso);
}

/** 「a, b、c d」のような入力を、読点・カンマ・空白で区切って配列にする */
export const splitWords = (v: string | undefined): string[] => String(v ?? '').split(/[,、\s]+/).map((x) => x.trim()).filter(Boolean);

export const yen =(n: number | null | undefined): string => '¥' + Number(n || 0).toLocaleString('ja-JP');
export const num = (n: number | null | undefined): string => Number(n || 0).toLocaleString('ja-JP');

export interface BadgeDef {
  label: string;
  cls: 'ok' | 'warn' | 'muted' | 'info';
}

export const VERDICT: Record<Verdict, BadgeDef> = {
  adopt: { label: '採用推奨', cls: 'ok' },
  hold: { label: '保留', cls: 'warn' },
  reject: { label: '除外', cls: 'muted' },
};

export const STATUS: Record<ItemStatus, BadgeDef> = {
  pending: { label: '要確認', cls: 'warn' },
  approved: { label: '採用済み', cls: 'ok' },
  rejected: { label: '却下', cls: 'muted' },
  published: { label: '公開中', cls: 'info' },
};

/** 収集バッチの実行 1 回分の成否バッジと、きっかけ（自動・手動） */
export const runBadge = (r: CollectRun): string =>
  r.ok === null ? '<span class="badge badge-info">実行中</span>' : r.ok ? '<span class="badge badge-ok">正常</span>' : '<span class="badge badge-warn">エラーあり</span>';
export const runTrigger = (r: CollectRun): string => (r.trigger === 'cron' ? '自動' : '手動');

export function badge<K extends string>(map: Record<K, BadgeDef>, key: K): string {
  const v = map[key] ?? { label: key, cls: 'muted' };
  return `<span class="badge badge-${v.cls}">${esc(v.label)}</span>`;
}

// ペルソナのコードチップ（P01 など）。withName で名前も併記
export function personaChip(p: Persona | undefined, withName = false, outline = false): string {
  if (!p) return '<span class="pcode pcode-empty">—</span>';
  const code = `<span class="pcode ${outline ? 'pcode-outline' : ''}" style="--c:${esc(p.color)}" title="${esc(p.name)}">${esc(p.code)}</span>`;
  return withName ? `<span class="pname">${code}<span>${esc(p.name)}</span></span>` : code;
}

export const kindTag = (kind: SourceKind): string => `<span class="kind">${esc(kind)}</span>`;

export const pageHead = (title: string, sub: string, actions = ''): string => `
  <header class="page-head">
    <div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
    <div class="page-actions">${actions}</div>
  </header>`;

/** id で要素を取得する。見つからなければ例外（index.html の構造が前提） */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} が見つかりません`);
  return el as T;
}

/** クリックされた要素から、最も近い data-act 付き要素を返す */
export function actionTarget(e: Event): HTMLElement | null {
  return e.target instanceof Element ? e.target.closest<HTMLElement>('[data-act]') : null;
}

/** change / input イベントの対象。input・select・textarea はどれも value と dataset を持つ */
export type FieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
export const fieldTarget = (e: Event): FieldElement => e.target as FieldElement;
export const isChecked = (el: FieldElement): boolean => el instanceof HTMLInputElement && el.checked;

export function toast(msg: string, kind: 'ok' | 'warn' = 'ok'): void {
  const host = byId('toasts');
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

export type FormValues = Record<string, string>;

interface ModalOptions {
  title: string;
  body: string;
  submitLabel?: string;
  /** false を返すとモーダルを閉じない */
  onSubmit?: (data: FormValues, form: HTMLFormElement) => boolean | void;
  wide?: boolean;
  danger?: boolean;
}

export function modal({ title, body, submitLabel = '保存', onSubmit, wide = false, danger = false }: ModalOptions): { close: () => void; form: HTMLFormElement } {
  const host = byId('modal-root');
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
  const form = host.querySelector('form') as HTMLFormElement;
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  const close = (): void => {
    host.innerHTML = '';
    document.removeEventListener('keydown', onKey);
  };
  document.addEventListener('keydown', onKey);
  host.querySelector('.modal-backdrop')?.addEventListener('click', (e) => {
    const t = e.target;
    if (t instanceof Element && (t.hasAttribute('data-close') || t.closest('button[data-close]'))) close();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data: FormValues = {};
    new FormData(form).forEach((v, k) => {
      data[k] = String(v);
    });
    if (onSubmit && onSubmit(data, form) === false) return;
    close();
  });
  form.querySelector<HTMLElement>('input,textarea,select')?.focus();
  return { close, form };
}

export function confirmDialog(title: string, message: string, onOk: () => void, label = '実行する'): void {
  modal({ title, body: `<p>${esc(message)}</p>`, submitLabel: label, danger: true, onSubmit: () => onOk() });
}

export async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('リンクをコピーしました');
  } catch {
    toast('コピーできませんでした: ' + text, 'warn');
  }
}
