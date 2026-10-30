import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/** 旧演示地址 /IndoorKit/ 跳到 indoorkit-demo（docs/adr/0007-sdk-and-demo-repositories.md） */
const PAGES = join(import.meta.dirname, '..', 'pages');
const NEW = 'https://vivi-shiki.github.io/indoorkit-demo/';

/** 在假的 location 上运行页面里的脚本，返回跳转目标 */
function redirect(file: string, href: string) {
  const html = readFileSync(join(PAGES, file), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!;
  const url = new URL(href);
  let target = '';
  const location = {
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    replace: (to: string) => {
      target = to;
    },
  };
  runInNewContext(script, { location });
  return target;
}

describe('old GitHub Pages address', () => {
  for (const file of ['index.html', '404.html']) {
    it(`${file} keeps the language and the page when it sends visitors to the demo`, () => {
      expect(redirect(file, 'https://vivi-shiki.github.io/IndoorKit/?lang=ja#/parking/twin')).toBe(
        `${NEW}?lang=ja#/parking/twin`,
      );
      expect(redirect(file, 'https://vivi-shiki.github.io/IndoorKit/')).toBe(NEW);
    });

    it(`${file} keeps a deeper path`, () => {
      expect(redirect(file, 'https://vivi-shiki.github.io/IndoorKit/data/hospital/venue.geojson')).toBe(
        `${NEW}data/hospital/venue.geojson`,
      );
    });

    it(`${file} still works without JavaScript`, () => {
      const html = readFileSync(join(PAGES, file), 'utf8');
      expect(html).toContain(`<meta http-equiv="refresh" content="0; url=${NEW}">`);
      expect(html).toContain(`<a href="${NEW}">`);
    });
  }
});
