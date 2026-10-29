/* Persona Wire 公開サイト（日本語）。ページの組み立ては共通の app.ts、サイトの名前・運営者情報は DB の sites（SITE_CODE） */
import { createSite } from './app';
import { ja } from './text';

export default createSite({ text: ja });
