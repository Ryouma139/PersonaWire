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

## 開発用のメモ

- 初期データに戻す: ブラウザのコンソールで `PW.store.reset()`
- 保存先: localStorage の `persona-wire:v2`。開発サーバーと JavaScript 版はブラウザ上の別のサイトとして扱われるため、保存データは共有されない。
