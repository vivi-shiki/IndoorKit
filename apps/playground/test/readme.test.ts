import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DEMO = 'https://vivi-shiki.github.io/IndoorKit/';
const READMES = [
  { file: 'README.md', lang: 'en' },
  { file: 'README.zh-CN.md', lang: 'zh' },
  { file: 'README.ja.md', lang: 'ja' },
] as const;

const read = (file: string) => readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8');
const demoLinks = (text: string) =>
  text.match(/https:\/\/vivi-shiki\.github\.io\/IndoorKit\/[^\s>)\]]*/g) ?? [];

describe('README demo links', () => {
  for (const { file, lang } of READMES) {
    it(`${file} has one entry link that opens the demo in its own language`, () => {
      const links = demoLinks(read(file));
      expect(new Set(links)).toEqual(new Set([`${DEMO}?lang=${lang}`]));
    });

    it(`${file} no longer lists the four page links`, () => {
      expect(read(file)).not.toMatch(/IndoorKit\/[^\s]*#\/(tracking|assets|alerts|occupancy)/);
    });
  }
});
