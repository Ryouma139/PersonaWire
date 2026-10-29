/* 画面の文言（英語）。項目は site/src/text.ts の Text と同じ。
 * 広告の表示は、海外の読者向けに米国 FTC の考え方（リンクの近くと、サイト全体で分かるように示す）に合わせている */
import type { Text } from '../../site/src/text';

export const en: Text = {
  lang: 'en',
  dateLocale: 'en-US',
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans JP", sans-serif',

  all: 'All',
  products: 'Recommended',
  about: 'About',
  privacy: 'Privacy Policy',
  ad: 'Affiliate Disclosure',
  adLabel: 'Ad',
  notice: 'This site contains affiliate links. We may earn a commission when you book or buy through them, at no extra cost to you. <a href="/ad">Learn more</a>',
  sourceRights: 'Summaries and quotes belong to their original publishers. Please read the full stories at the source.',

  heroLead: 'Hand-picked stories and videos about Japan — the outdoors, food and culture — each with a short note from our editors.',
  noArticles: 'No stories published yet.',
  noPersonaArticles: 'No stories on this topic yet.',
  homePicks: 'Editor’s picks',
  personaHero: (name) => name,
  personaPicks: (name) => `Picks for ${name}`,

  articlePicks: 'Related picks',
  editorNote: 'Editor’s note',
  source: 'Source',
  readOriginal: 'Read the original',

  productsDescription: 'Tours, passes and gear for your trip to Japan, picked by our editors (contains affiliate links).',
  productsLead: 'Tours, passes and gear for your trip to Japan, picked by our editors. All links on this page are affiliate links. <a href="/ad">Learn more</a>',
  noProducts: 'No recommendations yet.',
  otherCategory: 'Other',

  kind: { NEWS: 'News', YOUTUBE: 'YouTube', NOTE: 'note', X: 'X', THREADS: 'Threads' },
  aspButton: { amazon: 'View on Amazon', rakuten: 'View on Rakuten', a8: 'Learn more', moshimo: 'Learn more', other: 'Learn more' },
  amazonStatement: () => 'As an Amazon Associate, we earn from qualifying purchases.',

  siteName: 'Site name',
  operator: 'Run by',
  preparing: 'Coming soon',
  operatorSite: 'Operator’s website',
  operatorX: 'X (Twitter)',
  contact: 'Contact',
  formLead: (href) => `Please use the form below. If it doesn’t load, <a href="${href}" target="_blank" rel="noopener">open it here</a>.`,
  formTitle: 'Contact form',
  loading: 'Loading…',
  contactLink: 'Contact us',
  aboutHeading: 'About this site',
  aboutBody: 'We pick useful stories and videos about traveling in Japan — outdoors, food and culture — and add a short note from our editors. We don’t republish full articles; we quote a short summary and link to the original source.',
  privacyBody: () => `
    <h2>What we record</h2>
    <p>When a recommended link is clicked, we record which item was clicked, on which page and section, and when. We use this only to improve our recommendations. We do not record IP addresses, cookies, device information or anything else that identifies you.</p>
    <h2>Server logs</h2>
    <p>This site is served by Cloudflare. Cloudflare may keep access logs for a short time for troubleshooting and security.</p>
    <h2>Affiliate partners</h2>
    <p>Links marked “Ad” go to our affiliate partners. Those sites may use cookies to track bookings and purchases. Their handling of your data is governed by their own privacy policies.</p>
    <h2>Changes</h2>
    <p>We may update this policy from time to time.</p>`,
  adBody: (_site, amazon) => `
    <p>This site contains affiliate links. If you click a link marked “Ad” and then book or buy something, we may earn a commission, at no extra cost to you.</p>
    <p>${amazon}</p>
    <p>Our editors choose the stories and write their notes independently, whether or not a recommendation earns us a commission. Please check the latest prices and availability on the linked site.</p>`,

  notFoundTitle: 'Page not found',
  notFoundBody: 'The story may have been unpublished, or the URL may have changed.',
  toTop: 'Back to home',
  error: 'Sorry, this page is temporarily unavailable. Please try again later.',
};
