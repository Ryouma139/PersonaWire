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
- すべての応答にセキュリティヘッダーを付ける（`src/app.ts` の `securityHeaders()`）。ページで動くスクリプトはクリックを数える `CLICK_SCRIPT` だけで、CSP にそのハッシュを入れている。ページにスクリプトや外部の読み込みを足すときは、CSP も直す（直さないとブラウザが止める）
- サイト名・キャッチコピー・運営者情報・問い合わせ先は、DB の `sites`（`code = 'persona-wire'`）の行にある。書き換えれば、デプロイし直さずに変わる

## クリックの数え方

- 同じ人・同じ商品のクリックは、1 日（日本時間）に 1 回だけ数える。人の見分けは、IP アドレス・ブラウザの種類・日付・合言葉から作るハッシュ（`src/app.ts` の `visitorOf()`）。元の IP アドレスには戻せず、日が変わると別の値になる
- 数えないもの: ロボット（User-Agent で判断）、`/go/` への HEAD（リンクの下見）、`/no-count` を開いたブラウザ（運営者の確認用。`/no-count?off` で元に戻す。サイトごとに必要）
- DB の `record_click` は、合言葉が合うときだけ記録する。公開用の鍵で外から直接呼んでも数は増えない

### クリックの合言葉

合言葉（`CLICK_TOKEN`）は Worker の Secret に置く。Git や `wrangler.jsonc` には書かない。入れていないと、クリックは数えない（転送は動く）。

1. Supabase の SQL Editor で、合言葉を表示する。

   ```sql
   select value from public.app_secrets where name = 'click_token';
   ```

2. 公開サイト 2 つに、同じ値を入れる（どちらも、聞かれたら値を貼り付ける）。

   ```sh
   cd site && npx wrangler secret put CLICK_TOKEN
   cd ../site_adoutor && npx wrangler secret put CLICK_TOKEN
   ```

   Cloudflare のダッシュボードの Worker → Settings → Variables and Secrets から、種類を Secret にして入れてもよい。

合言葉を変えるときは、`app_secrets` の値を書き換えてから、2 つの Secret も同じ値に入れ直す。

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
