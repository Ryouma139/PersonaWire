/* 海外の旅行者向けの公開サイト（英語）。ページの組み立ては Persona Wire と共通（site/src/app.ts）。
 * サイトの名前・運営者情報は DB の sites（SITE_CODE = adoutor）、記事はこのサイトのペルソナ（P06〜）の分だけが出る */
import { createSite } from '../../site/src/app';
import { en } from './text';
import { theme } from './theme';

export default createSite({ text: en, theme });
