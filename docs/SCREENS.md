# Persona Wire 管理画面 — 画面とコードの対応、今後の改善

この文書は、管理画面の 7 画面がそれぞれどのコードで動いているかと、本番運用に向けて何を改善すべきかをまとめたものです。行番号は 2026-10-27 時点のコードに基づきます。

---

## 0. 全体の仕組み

ビルド不要の素の HTML / CSS / JavaScript で作っています。`index.html` を開くと、URL の `#` 以降（ハッシュ）で表示する画面が切り替わります。

| 役割 | ファイル | 要点 |
|---|---|---|
| 画面の骨組み | [index.html](../index.html) | サイドバー（運用／設定／確認）と、各画面を描画する `#view` |
| 画面切り替え | [app.js](../assets/js/app.js) | `route()` がハッシュから画面名を決め（[app.js:7](../assets/js/app.js#L7)）、`render()` が描画（[app.js:30](../assets/js/app.js#L30)） |
| データ | [store.js](../assets/js/store.js) | サンプルデータ `seed()`（[store.js:58](../assets/js/store.js#L58)）と、更新関数 `update()`（[store.js:169](../assets/js/store.js#L169)） |
| 共通部品 | [ui.js](../assets/js/ui.js) | HTML エスケープ、日付・金額の整形、バッジ、ペルソナのコードチップ、モーダル、トースト |
| 見た目 | [styles.css](../assets/styles.css) | 色などの変数（`:root`）、ダークモード、スマホ対応 |
| 各画面 | [views/](../assets/js/views/) | 1 画面 1 ファイル。どれも `render(root)` を持つ |

### データの流れ

1. 画面内の操作は `root.onclick` などでまとめて受けます。ボタンは `data-act` 属性で種類を区別します。
2. データを変えるときは必ず `store.update(fn)` を通します。
3. `update()` は localStorage（キー `persona-wire:v2`）に保存し、登録済みの関数に知らせます（[store.js:169-173](../assets/js/store.js#L169-L173)）。
4. [app.js:38](../assets/js/app.js#L38) が知らせを受け、いまの画面とサイドバーを描き直します。

サイドバーの「収集・AI判定」の件数バッジと「Notion 同期中／最終同期」は、`renderShell()`（[app.js:12](../assets/js/app.js#L12)）が描画のたびに更新します。

### 主なデータ

すべて `store.state` に入っています。

| キー | 中身 |
|---|---|
| `personas` | ペルソナ（P01〜P05）。コード、名前、色、関心キーワード、NG ワード、トーン、採用しきい値、有効フラグ |
| `items` | 収集した記事。ソース種別（`kind`）、ペルソナごとのスコア（`scores`）、判定理由（`reasons`）、主担当（`persona`）、AI 判定（`verdict`）、状態（`status`）、Notion 登録先（`notionDb`） |
| `deliveries` / `issues` | 有料配信のプランと、その配信号 |
| `products` | 商品・アフィリエイトリンク |
| `notion` | 接続状態、同期設定、データベースの対応、プロパティの対応、同期ログ |
| `daily` / `activity` | ダッシュボード用の日別集計とアクティビティ |

記事の状態（`status`）は次の 4 つです。「要確認」から始まり、画面上の操作で移ります。

| 値 | 表示名 | 意味 |
|---|---|---|
| `pending` | 要確認 | 収集直後。人の確認待ち |
| `approved` | 採用済み | 採用したが、まだ公開していない |
| `published` | 公開中 | 公開サイトに表示している |
| `rejected` | 却下 | 使わない |

---

## 1. ダッシュボード（`#dashboard`）

**ファイル:** [views/dashboard.js](../assets/js/views/dashboard.js)

**目的:** その日のキュレーションと配信の状況を一画面で把握する。

| 表示 | 計算しているコード | 内容 |
|---|---|---|
| 24時間の収集 | [dashboard.js:30-31](../assets/js/views/dashboard.js#L30-L31) | `collectedAt` が直近 24 時間の記事数。News / SNS の内訳付き |
| AI採用候補 | [dashboard.js:32-33](../assets/js/views/dashboard.js#L32-L33) | 要確認のうち AI 判定が「採用推奨」の件数 |
| 有料購読者・月間売上 | [dashboard.js:34-35](../assets/js/views/dashboard.js#L34-L35) | 配信中プランの購読者数の合計と、購読者数 × 月額の合計 |
| 商品クリック | [dashboard.js:36](../assets/js/views/dashboard.js#L36) | 全商品のクリック数の合計 |
| 直近7日のグラフ | `chart()`（[dashboard.js:5](../assets/js/views/dashboard.js#L5)） | SVG の積み上げ棒（News / SNS）と、採用数の折れ線。最終日だけ実データで上書き（[dashboard.js:39](../assets/js/views/dashboard.js#L39)） |
| ペルソナ別 | `render()` 内 | ペルソナごとの要確認数、公開数、平均スコア |
| 配信予定 | [dashboard.js:43](../assets/js/views/dashboard.js#L43) | 未配信の配信号を日時順に 4 件 |
| アクティビティ | `state.activity` | 操作ログの新しい順に 8 件 |

**現状の制約**

- グラフの過去 6 日分は `seed()` の固定値（[store.js:132](../assets/js/store.js#L132)）です。日付が変わっても更新されません。
- 開封率、クリック数、成約数は固定値で、計測の仕組みがありません。

---

## 2. 収集・AI判定（`#inbox`）

**ファイル:** [views/inbox.js](../assets/js/views/inbox.js)

**目的:** News と SNS から集めた記事を、ペルソナごとの適合度で振り分け、人が最終判断する。管理画面の中心となる画面です。

### 画面の構成

| 部分 | コード | 内容 |
|---|---|---|
| 絞り込み | 状態 `f`（[inbox.js:4](../assets/js/views/inbox.js#L4)）、`filtered()`（[inbox.js:10](../assets/js/views/inbox.js#L10)） | ペルソナ、状態、News / SNS、関連しきい値。ペルソナを選ぶと、その人のスコアで並べ替える |
| 一覧の各行 | `render()`（[inbox.js:105](../assets/js/views/inbox.js#L105)） | 種別タグ、ソース、日時、状態、主担当 |
| ミニ棒グラフ | `spark()`（[inbox.js:22](../assets/js/views/inbox.js#L22)） | 5 ペルソナのスコア。主担当だけ濃く表示 |
| 詳細 | `detail()`（[inbox.js:41](../assets/js/views/inbox.js#L41)） | 適合度のバー（しきい値の目盛り付き）、判定理由のタグ、主担当と Notion 登録先の選択、編集コメント、操作ボタン |
| 保存内容のプレビュー | `scoresBlock()`（[inbox.js:29](../assets/js/views/inbox.js#L29)） | Notion の `article_persona_scores` に保存する想定の内容 |

### 操作と処理

| 操作 | 関数 | 処理 |
|---|---|---|
| 収集を実行 | `collect()`（[inbox.js:190](../assets/js/views/inbox.js#L190)）→ `store.collect()`（[store.js:188](../assets/js/store.js#L188)） | サンプル記事（`ITEM_POOL`、[store.js:23](../assets/js/store.js#L23)）からランダムに 3〜5 件作り、スコアを揺らして AI 判定する |
| 採用、公開、却下など | `setStatus()`（[inbox.js:164](../assets/js/views/inbox.js#L164)） | 状態を変え、アクティビティに記録する |
| 再判定 | `rejudge()`（[inbox.js:173](../assets/js/views/inbox.js#L173)） | スコアを ±6 ほど揺らして判定し直す |
| 配信号に追加 | `addToIssue()`（[inbox.js:182](../assets/js/views/inbox.js#L182)） | 未配信の配信号に記事を追加する。重複は防ぐ |

### AI 判定のしくみ

`judge()`（[store.js:11](../assets/js/store.js#L11)）は、有効なペルソナの中で最もスコアが高い人を主担当にします。そのスコアで判定を決めます。

- しきい値以上: 採用推奨
- しきい値 −20 以上: 保留
- それ未満: 除外

**現状の制約**

- スコアと判定理由はサンプルの固定値です。ペルソナに設定した関心キーワードや NG ワードは、判定に使っていません。
- 収集で同じ記事が何度も入ります（URL での重複排除がない）。
- 一覧に件数の上限がないため、記事が増えると詳細が画面のかなり下になります。
- 一覧の行は `<article>` へのクリックだけで選ぶため、キーボードでは選択できません。

---

## 3. 有料配信（`#delivery`）

**ファイル:** [views/delivery.js](../assets/js/views/delivery.js)

**目的:** ペルソナ別の有料ニュースレターを、プラン単位で編集、予約、配信する。

| 部分 | コード | 内容 |
|---|---|---|
| 上部の数値 | [delivery.js:145-146](../assets/js/views/delivery.js#L145-L146) | 月間売上、購読者数、平均開封率 |
| プランのカード | `render()`（[delivery.js:134](../assets/js/views/delivery.js#L134)） | 対象ペルソナ、月額、購読者、開封率。編集と一時停止・再開 |
| プランの追加・編集 | `editPlan()`（[delivery.js:23](../assets/js/views/delivery.js#L23)）、`planForm()`（[delivery.js:9](../assets/js/views/delivery.js#L9)） | 名前、ペルソナ、月額、チャネル、頻度 |
| 配信号の新規作成 | `newIssue()`（[delivery.js:43](../assets/js/views/delivery.js#L43)） | 号数を採番し、対象ペルソナの採用済み記事を 3 本まで自動で選ぶ（[delivery.js:46](../assets/js/views/delivery.js#L46)） |
| 配信号の編集 | `editor()`（[delivery.js:81](../assets/js/views/delivery.js#L81)） | 件名、リード文、配信日時、記事の追加・並べ替え・削除。配信済みは編集不可（[delivery.js:83](../assets/js/views/delivery.js#L83)） |
| メールのプレビュー | `preview()`（[delivery.js:55](../assets/js/views/delivery.js#L55)） | 記事一覧と編集コメント。対象ペルソナの商品を PR 枠に 1 件差し込む（[delivery.js:58](../assets/js/views/delivery.js#L58)） |
| 予約・即時配信・削除 | `root.onclick`（[delivery.js:193](../assets/js/views/delivery.js#L193)） | 状態を `draft`（下書き）→ `scheduled`（予約済み）→ `sent`（配信済み）に進める。即時配信と削除は確認ダイアログを出す |

**現状の制約**

- 実際にはメールも LINE も送りません。状態が変わるだけです。
- 予約した日時が来ても自動では配信されません。
- 購読者の管理と決済の仕組みがありません。
- `scheduledAt` は `datetime-local` 形式の文字列、`sentAt` は ISO 形式で、形式が揃っていません。

---

## 4. ペルソナ（`#personas`）

**ファイル:** [views/personas.js](../assets/js/views/personas.js)

**目的:** 読者像ごとに、AI 判定の基準（関心キーワード、NG ワード、採用しきい値）を定める。

| 部分 | コード | 内容 |
|---|---|---|
| カード一覧 | `render()`（[personas.js:48](../assets/js/views/personas.js#L48)） | コード、名前、説明、キーワード、NG ワード、トーン、しきい値、記事数、紐づくプラン |
| 追加・編集 | `edit()`（[personas.js:9](../assets/js/views/personas.js#L9)） | 入力したキーワードを読点・カンマ・空白で分割（[personas.js:7](../assets/js/views/personas.js#L7)） |
| しきい値の反映 | `edit()` 内 | 編集後、要確認の記事を判定し直す |
| 新規追加 | [personas.js:37](../assets/js/views/personas.js#L37) | 既存の記事に、新しいペルソナ用のランダムなスコアを入れる |
| 有効・無効 | `root.onchange`（[personas.js:98](../assets/js/views/personas.js#L98)） | 無効にしたペルソナは AI 判定の対象から外れる |
| 削除 | `root.onclick`（[personas.js:81](../assets/js/views/personas.js#L81)） | 記事のスコアと主担当、商品の紐づけから外す |

**現状の制約**

- ペルソナを削除しても、そのペルソナを対象にしたプラン（`deliveries`）は残ります。カードには「—」が表示されます。
- 有効・無効を切り替えても、既存の記事は判定し直しません。しきい値を変えたときだけ判定し直します。
- 新しいペルソナのスコアはランダムです。

---

## 5. 商品・リンク（`#products`）

**ファイル:** [views/products.js](../assets/js/views/products.js)

**目的:** 公開サイトと配信に差し込むアフィリエイト商品・リンクを管理する。

| 部分 | コード | 内容 |
|---|---|---|
| 上部の数値 | [products.js:39-40](../assets/js/views/products.js#L39-L40) | 登録数、クリック数、成約率（表示中の商品で集計） |
| ペルソナで絞り込み | `personaFilter`（[products.js:4](../assets/js/views/products.js#L4)） | タブで切り替える |
| 一覧の表 | `render()`（[products.js:37](../assets/js/views/products.js#L37)） | 商品、ペルソナ、価格、クリック、成約、計測リンク、有効 |
| 追加・編集 | `edit()`（[products.js:8](../assets/js/views/products.js#L8)） | `http(s)://` で始まる URL だけを受け付ける |
| 計測リンクのコピー | `trackUrl()`（[products.js:6](../assets/js/views/products.js#L6)）、`ui.copy()` | `https://<公開ドメイン>/go/<商品ID>` をクリップボードへコピー |

**ほかの画面での使われ方:** 有効な商品は、公開サイトの「編集部のおすすめ」と、配信メールの PR 枠に出ます。

**現状の制約**

- `/go/<ID>` の転送先（リダイレクト）はまだありません。クリック数と成約数は増えません。
- 掲載期間、在庫、ASP（アフィリエイト事業者）との連携がありません。

---

## 6. Notion連携（`#notion`）

**ファイル:** [views/notion.js](../assets/js/views/notion.js)

**目的:** 記事、適合度スコア、ペルソナ、配信号を Notion のデータベースと同期する。

| 部分 | コード | 内容 |
|---|---|---|
| 接続カード | `render()`（[notion.js:34](../assets/js/views/notion.js#L34)） | ワークスペース名、伏せ字にしたトークン、最終同期、同期中の進捗バー |
| 今すぐ同期 | `sync()`（[notion.js:7](../assets/js/views/notion.js#L7)） | 0.4 秒ごとに進捗を進め、完了したら最終同期とログを更新する（[notion.js:12](../assets/js/views/notion.js#L12)） |
| 同期設定 | `root.onchange`（[notion.js:134](../assets/js/views/notion.js#L134)） | 自動同期の ON / OFF、同期間隔 |
| データベースの対応 | `state.notion.databases` | アプリのデータ ↔ Notion DB 名、同期方向（双方向 / アプリ→Notion / Notion→アプリ）、有効・無効 |
| プロパティの対応 | `state.notion.mapping` | 記事の各項目と Notion プロパティ名・型の対応 |
| 接続・接続解除 | `root.onclick`（[notion.js:107](../assets/js/views/notion.js#L107)） | 接続時は入力したトークンの先頭と末尾だけを残して保存する |

**画面同士のつながり:** 最終同期の時刻は、サイドバー下部の「Notion 同期中」にも出ます（[app.js:20-27](../assets/js/app.js#L20-L27)）。

**現状の制約**

- Notion API は呼んでいません。同期は画面上の動きだけです。
- 自動同期と同期間隔は設定値を保存するだけで、定期実行していません。
- 同期中に再読み込みすると「同期中」の状態は解除されます（[store.js:159](../assets/js/store.js#L159)）。

---

## 7. 公開サイト（`#site`）

**ファイル:** [views/site.js](../assets/js/views/site.js)

**目的:** 読者に見える公開ページを、管理画面の中でプレビューする。

| 部分 | コード | 内容 |
|---|---|---|
| 表示する記事 | [site.js:11-12](../assets/js/views/site.js#L11-L12) | 「公開中」の記事を新しい順に。ペルソナのタブで絞り込む |
| PC / スマホ切り替え | [site.js:21-22](../assets/js/views/site.js#L21-L22) | 枠の幅を 1080px / 390px に変える |
| ペルソナ別ページ | [site.js:31-32](../assets/js/views/site.js#L31-L32) | 有効なペルソナごとのタブ。URL 欄に `/<スラッグ>` を表示 |
| 購読の呼びかけ | [site.js:15](../assets/js/views/site.js#L15) | 対象ペルソナの配信中プラン |
| おすすめ商品 | [site.js:14](../assets/js/views/site.js#L14) | 対象ペルソナの有効な商品を 3 件 |
| 非公開にする | [site.js:49](../assets/js/views/site.js#L49)、`root.onclick`（[site.js:73](../assets/js/views/site.js#L73)） | 管理者向けのボタン。記事を「採用済み」に戻す |

**現状の制約**

- 管理画面の中のプレビューだけで、実際の公開サイトはありません。
- 記事の個別ページ、SEO 用の情報、OGP（SNS 共有時の画像やタイトル）、RSS がありません。

---

## 8. 今後の改善

### 8.1 優先度：高（本番運用に最低限必要）

| # | 改善 | 理由・方針 | 関係するコード |
|---|---|---|---|
| H1 | **サーバーとデータベースを用意する** | いまはデータがブラウザの中（localStorage）にしかありません。複数人で使えず、ブラウザを変えると消えます。API サーバーと DB を立て、`store.update()` を API 呼び出しに置き換えます。あとで作る公開サイト（M9）のために、記事にはスラッグ、公開日時（`published_at`）、OGP 用のタイトル・説明・画像を最初から持たせます | [store.js:155-173](../assets/js/store.js#L155-L173) |
| H2 | **ログインと権限** | 誰でも操作できる状態です。編集者と管理者を分け、公開・配信・接続解除は管理者だけにします | 全画面 |
| H3 | **実際の収集処理** | ニュースの RSS / API と、各 SNS の API（YouTube、note、X、Threads）から定期的に取得します。URL で重複を除きます | `collect()`（[store.js:188](../assets/js/store.js#L188)） |
| H4 | **実際の AI 判定** | LLM にペルソナの説明、関心キーワード、NG ワード、記事本文を渡し、スコアと判定理由を JSON で返させます。NG ワードは LLM に渡す前にルールで除外します | `judge()`（[store.js:11](../assets/js/store.js#L11)）、`rejudge()`（[inbox.js:173](../assets/js/views/inbox.js#L173)） |
| H5 | **Notion API と本当に同期する** | トークンはサーバー側だけで持ちます。`article_persona_scores` などに書き込み、レート制限（429）のときは待って再試行します | `sync()`（[notion.js:7](../assets/js/views/notion.js#L7)） |
| H6 | **外部 URL の安全確認** | `ui.esc()` は HTML の特殊文字を変えるだけで、`javascript:` で始まる URL は防げません。実データを入れる前に、`http(s)` だけを許可します | `detail()` の元記事リンク（[inbox.js:41](../assets/js/views/inbox.js#L41)） |

### 8.2 優先度：中（運用を回すために必要）

| # | 改善 | 内容 | 関係するコード |
|---|---|---|---|
| M1 | 配信を実際に送る | メール配信サービスや LINE の API と連携します。予約日時に自動で送る定期処理を作ります | [delivery.js:193](../assets/js/views/delivery.js#L193) |
| M2 | 購読と決済 | Stripe などで月額課金し、購読者数・解約・売上を実データで出します | `deliveries` |
| M3 | 計測 | `/go/<ID>` の転送でクリックを記録します。メールの開封も記録します | [products.js:6](../assets/js/views/products.js#L6) |
| M4 | 自動同期の定期実行 | 設定した間隔で、サーバー側から同期処理を動かします | `notion.interval` |
| M5 | ペルソナ削除の後始末 | 紐づくプランを停止するか、別のペルソナへ付け替えさせます。有効・無効を切り替えたときも判定し直します | [personas.js:81](../assets/js/views/personas.js#L81) |
| M6 | 一覧のページ分割 | 収集・AI判定の一覧に件数の上限とページ送りを付けます。広い画面では詳細を右側に並べます | `render()`（[inbox.js:105](../assets/js/views/inbox.js#L105)） |
| M7 | ダッシュボードを実データに | 日別集計を DB から作り、期間（7日 / 30日）を選べるようにします | `chart()`（[dashboard.js:5](../assets/js/views/dashboard.js#L5)） |
| M8 | 日時形式の統一 | 日時はすべてタイムゾーン付きの ISO 形式で保存し、表示するときだけ日本時間に直します | `newIssue()`（[delivery.js:43](../assets/js/views/delivery.js#L43)） |
| M9 | 公開サイトの本番化 | 管理画面とは別に、記事の個別ページ、ペルソナ別ページ、OGP、RSS、サイトマップを持つ公開サイトを作ります。購読（M2）とクリック計測（M3）の入口になります。元記事の本文は転載せず、要約・編集コメント・元記事へのリンクで紹介します | [site.js](../assets/js/views/site.js) |

### 8.3 優先度：低（使いやすさ・保守性）

| # | 改善 | 内容 |
|---|---|---|
| L1 | 部分的な再描画 | いまは変更のたびに画面全体を `innerHTML` で作り直しています。データや画面が増えたら、React / Vue / Svelte などへの移行を検討します。そのとき、各画面の `render()` をそのまま部品に分けられます |
| L2 | キーボード操作と読み上げ | 一覧の行やプランのカードを `<button>` などにし、Tab キーで選べるようにします。色だけに頼らない表示も加えます |
| L3 | 一括操作 | 収集・AI判定で、複数の記事をまとめて採用・却下できるようにします（以前の版にあった機能） |
| L4 | テスト | `judge()`、`filtered()`、MRR などの集計に単体テストを付けます。主な操作は、ヘッドレスブラウザで自動確認します |
| L5 | 操作履歴 | 誰がいつ何を採用・公開・配信したかを残し、元に戻せるようにします |
| L6 | 外部フォントへの依存 | Google Fonts を自前で配信するか、端末のフォントで表示が崩れないようにします |

### 8.4 進め方の目安

1. **第1段階（土台）:** H1、H2、H6。データを守り、複数人で使えるようにする。公開サイトで使う記事の項目も、ここで DB に入れておく。
2. **第2段階（中核）:** H3、H4。収集から AI 判定までを本物にする。この製品の価値の中心です。
3. **第3段階（外部連携）:** H5、M4。Notion と本当に同期する。
4. **第4段階（公開と収益化）:** M9、M1〜M3。公開サイトで読者を集め、配信・決済・計測につなぐ。売上を実データで見られるようにする。SEO は評価が上がるまで時間がかかるため、公開サイトはこの段階の最初に出す。
5. **第5段階（仕上げ）:** M5〜M8 と L 項目。運用しながら順に改善する。

---

## 付録：開発用のメモ

- **初期データに戻す:** ブラウザの開発者ツールのコンソールで `PW.store.reset()` を実行します。
- **画面を追加する:** `views/` に `render(root)` を持つファイルを作り、`window.PW.views.<名前>` に登録します。あわせて [index.html](../index.html) に `<script>` とメニューの `<a href="#名前" data-route="名前">` を追加します。
- **データの形を変える:** [store.js:3](../assets/js/store.js#L3) の `KEY` の番号を上げると、古い保存データを読まずに初期データから始まります。
