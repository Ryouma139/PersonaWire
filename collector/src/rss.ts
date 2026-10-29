/* RSS 2.0 / Atom を読む（ニュースサイト、note のマガジンなど） */
import { XMLParser } from 'fast-xml-parser';
import type { Fetch } from './budget';
import { kindOf, type Candidate, type Source } from './candidate';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });

type Node = string | number | { '#text'?: string; '@_href'?: string; '@_rel'?: string } | undefined;

const str = (n: Node): string => (typeof n === 'object' ? n['#text'] ?? '' : String(n ?? '')).trim();
const list = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** HTML のタグと文字参照を取り、空白を詰めて最大 200 文字にする */
export function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) =>
      e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/** Medium の記事 URL に付く追跡用のクエリ（?source=rss-...）を外す。同じ記事が別の URL として二重に入らないように */
function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === 'medium.com' || u.hostname.endsWith('.medium.com')) u.search = '';
    return u.href;
  } catch {
    return url;
  }
}

function iso(v: string, fallback: string): string {
  const t = Date.parse(v);
  return isNaN(t) ? fallback : new Date(t).toISOString();
}

export async function rssCandidates(source: Source, f: Fetch = fetch): Promise<Candidate[]> {
  const res = await f(source.target, { headers: { 'User-Agent': 'PersonaWireCollector/0.1 (+https://github.com/Ryouma139/PersonaWire)' } });
  if (!res.ok) throw new Error(`RSS ${source.target}: ${res.status}`);
  const xml = parser.parse(await res.text());
  const now = new Date().toISOString();
  const category = source.options.category ?? '';

  // RSS 2.0
  if (xml.rss?.channel) {
    const ch = xml.rss.channel;
    return list(ch.item).map((it: Record<string, Node>) => {
      const url = cleanUrl(str(it.link));
      return {
        title: str(it.title),
        url,
        sourceName: source.name || str(ch.title),
        category,
        // Medium の要約の末尾に付く「Continue reading on Medium »」は外す
        excerpt: plain(str(it.description).replace(/Continue reading on Medium »/, '')),
        collectedAt: iso(str(it.pubDate), now),
        kind: kindOf(url, source.kind),
      };
    });
  }
  // Atom
  if (xml.feed) {
    return list(xml.feed.entry).map((e: Record<string, Node | Node[]>) => {
      const links = list(e.link as Node | Node[]);
      const link = links.find((l) => typeof l === 'object' && (l['@_rel'] ?? 'alternate') === 'alternate') ?? links[0];
      const url = typeof link === 'object' ? link['@_href'] ?? '' : str(link);
      return {
        title: str(e.title as Node),
        url,
        sourceName: source.name || str(xml.feed.title),
        category,
        // YouTube のチャンネル RSS は、動画の説明文を media:group の中に入れている
        excerpt: plain(str((e.summary ?? e.content ?? (e['media:group'] as Record<string, Node> | undefined)?.['media:description']) as Node)),
        collectedAt: iso(str((e.published ?? e.updated) as Node), now),
        kind: kindOf(url, source.kind),
      };
    });
  }
  throw new Error(`RSS ${source.target}: RSS でも Atom でもありません`);
}
