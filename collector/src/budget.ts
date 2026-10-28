/* 1 回の実行で外部（Supabase・Notion・RSS・元記事のサイト）に通信した回数を数える。
 * Workers の無料プランは 1 回の実行の外部通信（サブリクエスト）が 50 回まで。超えると、それ以降の通信がすべて失敗する。
 * 通信はすべて budget.fetch を通し、余った分だけ概要の取得などに使う
 */
/** fetch と同じ形の関数。数える fetch（Budget.fetch）と、ふつうの fetch のどちらも渡せる */
export type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class Budget {
  used = 0;

  constructor(readonly limit: number) {}

  /** あと何回通信できるか */
  get left(): number {
    return this.limit - this.used;
  }

  /** fetch と同じ使い方。呼ぶたびに 1 回と数える（失敗しても、やり直しても 1 回ずつ） */
  fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    this.used++;
    return fetch(input, init);
  };
}

/** 最後に必ず行う処理（却下記事の削除・操作ログ 2 回・実行履歴の更新）のために残しておく回数 */
export const RESERVED_FOR_FINISH = 4;
