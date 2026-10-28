# Persona Wire 管理画面（TypeScript 版）

親フォルダの JavaScript 版（`../index.html`）と同じ画面・動きを、Vite + TypeScript（strict）で書き直したものです。JavaScript 版はそのまま残してあります。

## 使い方

```
cd ts
npm install
npm run dev        # 開発サーバー（http://localhost:5173）
npm run typecheck  # 型チェックのみ
npm run build      # 型チェック → dist/ に本番用ファイルを出力
npm run preview    # build した結果を確認
```

`index.html` を直接ダブルクリックしても動きません。`npm run dev` で開いてください。

## 構成

```
ts/
  index.html            画面の骨組み（main.ts を読み込む）
  src/
    types.ts            データの型（Persona, Item, Delivery, Issue, Product, NotionState …）
    store.ts            サンプルデータ・状態管理・AI判定ロジック
    ui.ts               共通部品（エスケープ、バッジ、モーダル、イベント用ヘルパー）
    main.ts             ハッシュルーター
    styles.css          スタイル（JavaScript 版と同じ）
    views/*.ts          各画面（render(root) を持つ View）
```

## JavaScript 版からの主な変更

- グローバル変数 `window.PW` の代わりに、ES モジュールの `import` / `export` でつなぐ。
- 記事の状態や同期方向などを文字列の型（`'pending' | 'approved' | …`）で限定し、打ち間違いを型チェックで防ぐ。
- イベント処理は `ui.actionTarget()` と `ui.fieldTarget()` で、対象の要素を型付きで取り出す。
- 移行中に型チェックで見つかった不具合を直した。
  - Notion連携の「適合度スコア」の件数が常に 0 だった。`counts()` に `scores` の場合を足した。
  - ダッシュボードの一部に旧表記「承認待ち」が残っていたので、「要確認」に揃えた。
- ペルソナ編集のしきい値表示は、HTML の `oninput` 属性をやめ、イベントリスナーで更新する。
- 外部 URL は `ui.safeUrl()` を通し、`http(s)` 以外（`javascript:` など）はリンクにしない（改善計画 H6）。商品 URL の入力チェックも同じ関数を使う。
- 記事の状態変更は `store.setItemStatus()` にまとめた。要確認・却下にすると未配信の配信号から外す（配信済みの号は残す）。予約済みの号が空になったら下書きに戻す。
- 収集・AI判定の画面から配信号に追加できるのは、採用済み・公開中の記事だけにした。
- 上のルールに合わせて初期データの状態を直し、保存キーを `persona-wire:v3` に上げた（以前の保存データは読まずに初期データから始まる）。

## Supabase との接続（第1段階）

- `ts/.env.local` に接続先を書く（`.env.example` を参照）。DB の定義は [../supabase/](../supabase/README.md)。
- メールアドレス（パスワード、またはメールのリンク）でログインする（`src/auth.ts`）。役割が付いていない人は「承認待ち」の画面になる。
- **ペルソナ・記事・スコア・操作ログ**は Supabase の表から読み、画面の操作は表に書き込む（`src/db.ts`）。権限ルールで拒否されたら、エラーを出して DB の内容に戻す（`store.commit()`）。
- **有料配信・商品・Notion** はまだサンプルデータで、ブラウザに保存する（保存キー `persona-wire:v4`）。サンプルのペルソナ参照（`p1`〜`p5`）は、同じコード（`P01`〜`P05`）の DB のペルソナに付け替える。
- 乱数で偽の記事・スコアを作っていた「収集を実行」と「再判定」は削除した。本物は第2段階（H3・H4）で作る。
- 別のタブから戻ったとき、または「再読み込み」ボタンで、DB を読み直す。

## 開発用のメモ

- 初期データに戻す: ブラウザのコンソールで `PW.store.reset()`
- 保存先: localStorage の `persona-wire:v2`。開発サーバーと JavaScript 版はブラウザ上の別のサイトとして扱われるため、保存データは共有されない。
