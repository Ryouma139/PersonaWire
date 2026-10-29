# 公開サイト（site/）

読者向けの公開サイト Persona Wire（日本語）。公開中の記事と掲載中の商品を Supabase から読み、Worker がページを組み立てて返す。

`src/` のうち、ページの組み立て・クリックの記録・広告の表示などは、海外向けの `site_adoutor/` と共通。直すと両方のサイトに効く。

| ファイル | 中身 |
|---|---|
| `src/app.ts` | 共通の Worker（`createSite()`）。URL ごとの振り分け、クリックの記録、`/go/` の転送 |
| `src/pages.ts`・`src/html.ts` | 共通のページと部品 |
| `src/data.ts` | 公開用のビューを、このサイトのコード（`SITE_CODE`）で絞り込んで読む |
| `src/text.ts` | 文言の型（`Text`）と、日本語の文言 |
| `src/index.ts` | Persona Wire の入口。`createSite({ text: ja })` |

- ページ: トップ（`/`）、ペルソナ別（`/p/<handle>`）、記事（`/a/<no>`）、おすすめ商品（`/products`）、運営者情報（`/about`）、プライバシーポリシー（`/privacy`）、広告について（`/ad`）
- 商品のクリックは `/c` に知らせて数える。メール用のリンクは `/go/<商品ID>?s=email`（記録してから転送。Amazon は使えない）
- Supabase には公開用の鍵（Publishable key）でつなぎ、公開用のビュー（`public_*`）と `record_click` だけを使う。Secret key は置かない
- サイト名・キャッチコピー・運営者情報・問い合わせ先は、DB の `sites`（`code = 'persona-wire'`）の行にある。書き換えれば、デプロイし直さずに変わる

## 公開と自動デプロイ

公開先: https://persona-wire-site.tryoma0227.workers.dev（Cloudflare の Worker `persona-wire-site`）

GitHub の `main` に、`site/` の変更をプッシュすると、Cloudflare の Workers Builds が自動で公開する。

| 設定 | 値 |
|---|---|
| Root directory | `site` |
| Build command | なし |
| Deploy command | `npx wrangler deploy` |
| Build watch paths | `site/*` |
| Build variables | 不要 |

手元から公開するときは `npm run deploy`、手元で動かすときは `npm run dev`（http://localhost:8789）。
