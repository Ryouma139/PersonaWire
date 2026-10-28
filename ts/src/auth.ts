/* Persona Wire — ログイン（Supabase Auth） */
import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** 接続先が無いままビルドされたとき、画面に出す説明。ここで止めると「読み込み中…」のまま固まるので、main.ts で表示する */
export const configError = url && key ? null
  : '接続先の設定（VITE_SUPABASE_URL と VITE_SUPABASE_PUBLISHABLE_KEY）がありません。開発中は ts/.env.local、公開版は ts/.env.production を確認してください';

// PKCE: メールのリンクから戻るとき、トークンを URL の # ではなく ?code= で受け取る（# はハッシュルーターが使うため）。
// そのため、リンクは送信を頼んだのと同じブラウザで開く必要がある
export const supabase = createClient(url || 'https://invalid.localhost', key || 'missing', { auth: { flowType: 'pkce' } });

// メールのリンクを押したあとの戻り先（Supabase の Redirect URLs に登録が必要）
const returnUrl = (): string => location.origin + location.pathname;

// Supabase のよくあるエラーを日本語にする
const MESSAGES: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'メールアドレスかパスワードが違います'],
  [/email not confirmed/i, 'メールアドレスの確認が済んでいません。確認メールのリンクを押してください'],
  [/already registered/i, 'このメールアドレスは登録済みです。ログインしてください'],
  [/rate limit|for security purposes/i, 'メールの送信回数の上限に達しました。しばらく待ってから試してください'],
  [/password should be at least/i, 'パスワードが短すぎます'],
];
export function authMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return MESSAGES.find(([re]) => re.test(raw))?.[1] ?? raw;
}

export type Role = 'admin' | 'editor';

/** public.users の行。role が null の人は未承認 */
export interface Member {
  id: string;
  email: string;
  name: string;
  role: Role | null;
}

export const ROLE_LABEL: Record<Role, string> = { admin: '管理者', editor: '編集者' };

let member: Member | null = null;

async function loadMember(session: Session | null): Promise<Member | null> {
  if (!session) return null;
  const { data, error } = await supabase.from('users').select('id, email, name, role').eq('id', session.user.id).maybeSingle();
  if (error) throw error;
  // 行が見つからなければ未承認として扱う
  return (data as Member | null) ?? { id: session.user.id, email: session.user.email ?? '', name: session.user.email ?? '', role: null };
}

export const auth = {
  get member(): Member | null {
    return member;
  },
  isAdmin: (): boolean => member?.role === 'admin',
  /** ログイン状態が決まるたび（起動時・ログイン・ログアウト）に onChange を呼ぶ */
  start(onChange: (m: Member | null, error?: unknown) => void): void {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
      // このコールバックの中で Supabase を直接呼ぶと止まることがあるため、次の順番に回す
      setTimeout(async () => {
        try {
          member = await loadMember(session);
          onChange(member);
        } catch (e) {
          member = null;
          onChange(null, e);
        }
      }, 0);
    });
  },
  async signIn(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  /** 新規登録。確認メールのリンクを押すと登録が完了する。すぐログインできた場合は true */
  async signUp(email: string, password: string): Promise<boolean> {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: returnUrl() } });
    if (error) throw error;
    return data.session !== null;
  },
  /** ログイン用のリンクをメールで送る。初めての人は、この操作で登録される */
  async sendLink(email: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: returnUrl() } });
    if (error) throw error;
  },
  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  },
};
