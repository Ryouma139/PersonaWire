/* 画面の文言。サイトの言語ごとに 1 つ用意する（日本語はここ、英語は site_adoutor/src/text.ts）。
 * 法律やASPの規約に関わる文（広告の表示・Amazon の定型文・プライバシーポリシー）もここに置く */
import type { Asp, Site } from './data';

export interface Text {
  /** <html lang> */
  lang: string;
  /** 日付・数値の書式（toLocaleDateString に渡す） */
  dateLocale: string;
  /** 本文の文字（font-family の先頭） */
  font: string;

  all: string;
  products: string;
  about: string;
  privacy: string;
  ad: string;
  /** 広告の枠に付ける小さな表示（「広告」） */
  adLabel: string;
  /** ページ上部の帯。広告を使っていることの表示（HTML） */
  notice: string;
  sourceRights: string;

  heroLead: string;
  noArticles: string;
  noPersonaArticles: string;
  homePicks: string;
  personaHero: (name: string) => string;
  personaPicks: (name: string) => string;

  articlePicks: string;
  editorNote: string;
  source: string;
  readOriginal: string;

  productsDescription: string;
  /** おすすめ商品のページの説明（HTML） */
  productsLead: string;
  noProducts: string;
  otherCategory: string;

  kind: Record<string, string>;
  aspButton: Record<Asp, string>;
  /** Amazon アソシエイトの規約で、サイトに載せることが求められている文 */
  amazonStatement: (siteName: string) => string;

  siteName: string;
  operator: string;
  preparing: string;
  operatorSite: string;
  operatorX: string;
  contact: string;
  /** 埋め込みフォームの上の説明（HTML）。href は、フォームを直接開く URL（エスケープ済み） */
  formLead: (href: string) => string;
  formTitle: string;
  loading: string;
  contactLink: string;
  aboutHeading: string;
  aboutBody: string;
  /** プライバシーポリシー・広告についての本文（HTML） */
  privacyBody: (site: Site, amazon: string) => string;
  adBody: (site: Site, amazon: string) => string;

  notFoundTitle: string;
  notFoundBody: string;
  toTop: string;
  error: string;
}

export const ja: Text = {
  lang: 'ja',
  dateLocale: 'ja-JP',
  font: '"Noto Sans JP", system-ui, -apple-system, "Hiragino Sans", sans-serif',

  all: 'すべて',
  products: 'おすすめ商品',
  about: '運営者情報',
  privacy: 'プライバシーポリシー',
  ad: '広告について',
  adLabel: '広告',
  notice: '当サイトはアフィリエイト広告（Amazonアソシエイト・楽天アフィリエイト・A8.net・もしもアフィリエイト）を利用しています。<a href="/ad">広告について</a>',
  sourceRights: '記事の要約・引用は各出典元に帰属します。全文は出典元でお読みください。',

  heroLead: 'ニュースとSNSの話題から、読者像ごとに読むべき記事を選び、編集部のひとことを添えてお届けします。',
  noArticles: '公開中の記事はまだありません。',
  noPersonaArticles: 'このテーマの公開記事はまだありません。',
  homePicks: '編集部のおすすめ',
  personaHero: (name) => `${name} のためのニュース`,
  personaPicks: (name) => `${name} のおすすめ`,

  articlePicks: 'この記事に関連するおすすめ',
  editorNote: '編集部のひとこと',
  source: '出典',
  readOriginal: '元の記事を読む',

  productsDescription: '編集部がおすすめする商品・サービスの一覧です（広告を含みます）。',
  productsLead: '読者像ごとに、編集部が選んだ商品・サービスです。このページのリンクはすべてアフィリエイト広告です。<a href="/ad">広告について</a>',
  noProducts: '掲載中の商品はまだありません。',
  otherCategory: 'その他',

  kind: { NEWS: 'ニュース', YOUTUBE: 'YouTube', NOTE: 'note', X: 'X', THREADS: 'Threads', MEDIUM: 'Medium' },
  aspButton: { amazon: 'Amazonで見る', rakuten: '楽天市場で見る', a8: '詳しく見る', moshimo: '詳しく見る', other: '詳しく見る' },
  amazonStatement: (siteName) => `Amazonのアソシエイトとして、${siteName}は適格販売により収入を得ています。`,

  siteName: 'サイト名',
  operator: '運営者',
  preparing: '準備中',
  operatorSite: '運営者のサイト',
  operatorX: 'X（旧Twitter）',
  contact: 'お問い合わせ',
  formLead: (href) => `下のフォームからお送りください。表示されない場合は<a href="${href}" target="_blank" rel="noopener">こちら</a>から。`,
  formTitle: 'お問い合わせフォーム',
  loading: '読み込んでいます…',
  contactLink: 'お問い合わせはこちら',
  aboutHeading: 'このサイトについて',
  aboutBody: 'ニュースやSNSで話題の記事から、読者像（ペルソナ）ごとに役立つものを編集部が選び、ひとことを添えて紹介しています。記事の本文は掲載せず、要約の引用と出典元へのリンクを載せています。',
  privacyBody: (_site, amazon) => `
    <h2>当サイトが記録する情報</h2>
    <p>おすすめ商品のリンクが押されたときに、「どの商品が」「どのページのどの枠で」「いつ」押されたかを記録し、掲載内容の改善に使います。IPアドレス、Cookie、端末の情報など、個人を特定できる情報は記録しません。</p>
    <h2>アクセスの記録</h2>
    <p>当サイトは Cloudflare のサービスで配信しており、障害対応や不正なアクセスへの対策のため、Cloudflare がアクセスの記録を一時的に保持することがあります。</p>
    <h2>アフィリエイトプログラムについて</h2>
    <p>当サイトは、Amazonアソシエイト・プログラム、楽天アフィリエイト、A8.net、もしもアフィリエイトに参加しています。商品のリンクを押して移動した先のサイト（各ショップ・各ASP）では、成果を計測するために Cookie などが使われることがあります。その取り扱いは、移動先の各社のプライバシーポリシーに従います。</p>
    <p>${amazon}</p>
    <h2>改定</h2>
    <p>この内容は、必要に応じて改定することがあります。</p>`,
  adBody: (_site, amazon) => `
    <p>当サイトは、アフィリエイト広告を利用しています。「PR」「広告」と表示した商品のリンクから商品が購入・申し込みされると、当サイトに報酬が支払われることがあります。</p>
    <p>参加しているプログラム: Amazonアソシエイト・プログラム、楽天アフィリエイト、A8.net、もしもアフィリエイト</p>
    <p>${amazon}</p>
    <p>記事の選定と編集部のひとことは、広告の有無にかかわらず編集部の判断で行っています。商品の価格や在庫などの最新の情報は、リンク先でご確認ください。</p>`,

  notFoundTitle: 'ページが見つかりません',
  notFoundBody: '記事が非公開になったか、URL が変わった可能性があります。',
  toTop: 'トップへ',
  error: '一時的にページを表示できません。しばらくしてから、もう一度お試しください。',
};
