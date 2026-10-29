import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SDK 的边界（docs/adr/0002-sdk-and-domain-layers.md）：
 * 地图引擎 maplibre-gl 只由 core 封装；SDK（packages/*）不认识任何业务，
 * 是不依赖框架的 TypeScript。业务、页面和它们的边界检查在 indoorkit-demo 仓库
 * （docs/adr/0007-sdk-and-demo-repositories.md）。
 */
const ROOT = join(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist') return [];
    const path = join(abs, name);
    if (statSync(path).isDirectory()) return sourceFiles(relative(ROOT, path));
    return /\.tsx?$/.test(name) ? [relative(ROOT, path).replaceAll('\\', '/')] : [];
  });
}

const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

/** 文件里所有 import / export ... from 的模块名 */
function imports(file: string): string[] {
  const text = read(file);
  return [...text.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g)].map(
    (m) => (m[1] ?? m[2])!,
  );
}

/** 违反规则的「文件: 模块」列表，方便失败时直接看到位置 */
function offending(files: string[], bad: (module: string, file: string) => boolean) {
  return files.flatMap((f) =>
    imports(f)
      .filter((m) => bad(m, f))
      .map((m) => `${f}: ${m}`),
  );
}

const packages = sourceFiles('packages').filter((f) => f.includes('/src/'));
describe('repository', () => {
  it.each(['packages/imdf/src', 'packages/rtls/src', 'packages/core/src', 'packages/plugins/src'])(
    '%s exists',
    (path) => {
      expect(existsSync(join(ROOT, path))).toBe(true);
    },
  );

  it.each(['apps', 'domains', 'tools'])('holds no %s; they live in indoorkit-demo', (dir) => {
    expect(sourceFiles(dir)).toEqual([]);
  });
});

describe('map engine layer', () => {
  it('only @indoorkit/core imports maplibre-gl inside the SDK', () => {
    expect(
      offending(
        packages.filter((f) => !f.startsWith('packages/core/')),
        (m) => m === 'maplibre-gl' || m.startsWith('maplibre-gl/'),
      ),
    ).toEqual([]);
  });
});

describe('SDK layer', () => {
  it('imports nothing from the domain, tools or the app', () => {
    expect(
      offending(
        packages,
        (m) =>
          m.startsWith('@indoorkit/hospital') ||
          m.startsWith('@indoorkit/parking') ||
          m.startsWith('@indoorkit/museum') ||
          m.startsWith('@indoorkit/rtls-simulator') ||
          m.startsWith('@indoorkit/venue-gen') ||
          m.includes('domains/') ||
          m.includes('apps/') ||
          m.includes('tools/'),
      ),
    ).toEqual([]);
  });

  it('contains no hospital words', () => {
    const words =
      /department|patient|nurse|doctor|visitor|caregiver|hospital|\bsos\b|offline|maintenance|infusion|科室|患者|医院|医护|病房|人员/i;
    const hits = packages.flatMap((f) =>
      read(f)
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => words.test(line))
        .map(({ line, i }) => `${f}:${i + 1}: ${line.trim()}`),
    );
    expect(hits).toEqual([]);
  });

  it('contains no parking words', () => {
    // IMDF 自带的区块类别 parking 不算停车场业务
    const words = /vehicle|\bplates?\b|tariff|garage|monthly|车位|停车|駐車|車室/i;
    const hits = packages.flatMap((f) =>
      read(f)
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => words.test(line))
        .map(({ line, i }) => `${f}:${i + 1}: ${line.trim()}`),
    );
    expect(hits).toEqual([]);
  });

  it('contains no museum words', () => {
    const words =
      /museum|gallery|curator|artwork|exhibit|conservation|patrol|展示|藏品|展柜|展厅|博物|美術|学芸|巡回|巡逻/i;
    const hits = packages.flatMap((f) =>
      read(f)
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => words.test(line))
        .map(({ line, i }) => `${f}:${i + 1}: ${line.trim()}`),
    );
    expect(hits).toEqual([]);
  });

  it('is plain TypeScript without React or a UI framework', () => {
    expect(packages.filter((f) => f.endsWith('.tsx'))).toEqual([]);
    expect(offending(packages, (m) => /^(react|react-dom|@mui\/|@emotion\/)/.test(m))).toEqual([]);
  });

  it('core declares no positioning types or events', () => {
    const types = read('packages/core/src/types.ts');
    expect(types).not.toMatch(/TagPosition|PositionBatch|DataProvider|positions:update|geofence/);
  });
});
