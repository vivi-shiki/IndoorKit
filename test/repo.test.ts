import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/** git ls-files --eol：索引里的换行、工作区里的换行、生效的属性，制表符后是路径 */
function eolInfo() {
  return execFileSync('git', ['ls-files', '--eol'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((line) => {
      const [info, path] = line.split('\t') as [string, string];
      const [index, worktree, ...attr] = info.trim().split(/\s+/);
      return { index, worktree, attr: attr.join(' '), path };
    });
}

describe('line endings', () => {
  // Windows 上 core.autocrlf=true 会把文件签出成 CRLF，biome 的格式检查随之失败
  it('every text file is declared LF, whatever core.autocrlf says', () => {
    const undeclared = eolInfo()
      .filter((f) => f.index !== 'i/-text' && !/eol=lf/.test(f.attr))
      .map((f) => f.path);
    expect(undeclared).toEqual([]);
  });

  it('no text file is checked out with CRLF', () => {
    const crlf = eolInfo()
      .filter((f) => f.worktree === 'w/crlf' || f.worktree === 'w/mixed')
      .map((f) => f.path);
    expect(crlf).toEqual([]);
  });
});
