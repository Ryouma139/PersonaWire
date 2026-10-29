# 公開サイト（site/）

読者向けの公開サイト。公開中の記事と掲載中の商品を Supabase から読み、Worker がページを組み立てて返す。

- ページ: トップ（`/`）、ペルソナ別（`/p/<handle>`）、記事（`/a/<no>`）、おすすめ商品（`/products`）、運営者情報（`/about`）、プライバシーポリシー（`/privacy`）、広告について（`/ad`）
- 商品のクリックは `/c` に知らせて数える。メール用のリンクは `/go/<商品ID>?s=email`（記録してから転送。Amazon は使えない）
- Supabase には公開用の鍵（Publishable key）でつなぎ、公開用のビュー（`public_*`）と `record_click` だけを使う。Secret key は置かない

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

接続先やサイト名、運営者情報は `wrangler.jsonc` の `vars` に書いている（どれも公開してよい値）。手元から公開するときは `npm run deploy`、手元で動かすときは `npm run dev`（http://localhost:8789）。
