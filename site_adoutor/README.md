# 海外の旅行者向け公開サイト（site_adoutor/）

海外から日本に来る旅行者向けの公開サイト（英語）。ペルソナは P06 Outdoors in Japan・P07 Food in Japan・P08 Culture & Landmarks。

ページの組み立て・クリックの記録・広告の表示などは、Persona Wire（`site/`）と共通のコード（`site/src/app.ts` ほか）を使う。このフォルダに置くのは、このサイトだけのものだけ。

| ファイル | 中身 |
|---|---|
| `src/index.ts` | 共通の `createSite()` に、英語の文言と見た目を渡す |
| `src/text.ts` | 画面の文言（英語）。広告の表示・プライバシーポリシーもここ |
| `src/theme.ts` | 色などの上書き |
| `public/` | ロゴ・ファビコン（今は Persona Wire と同じ。差し替える） |
| `wrangler.jsonc` | Worker の設定。`SITE_CODE` は `adoutor` |

サイト名・キャッチコピー・運営者情報・問い合わせ先は、DB の `sites`（`code = 'adoutor'`）の行にある。書き換えれば、デプロイし直さずに変わる。

表示される記事は、主担当ペルソナが P06〜P08 の公開中の記事。商品は、`product_links` にこのサイト用のリンクがあるものだけ。

## 公開と自動デプロイ

Cloudflare の Worker `persona-wire-adoutor`。GitHub の `main` にプッシュすると、Workers Builds が自動で公開する。

| 設定 | 値 |
|---|---|
| Root directory | `site_adoutor` |
| Build command | なし |
| Deploy command | `npx wrangler deploy` |
| Build watch paths | `site_adoutor/*`、`site/src/*`（共通のコードを変えたときも公開し直す） |
| Build variables | 不要 |

手元で動かすときは `npm run dev`（http://localhost:8790）、手元から公開するときは `npm run deploy`。
