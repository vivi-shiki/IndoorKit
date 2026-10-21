import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 四层边界（docs/adr/0002-sdk-and-domain-layers.md）：
 * 地图引擎 maplibre-gl 只由 core 封装；SDK（packages/*）不认识任何业务；
 * 医院业务（domains/hospital）不碰地图和 DOM；页面只用 SDK 的公开接口。
 * React 只出现在应用里：SDK 和业务层是不依赖框架的 TypeScript。
 */
const ROOT = join(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist') return [];
    const path = join(abs, name);
    if (statSync(path).isDirectory()) return sourceFiles(relative(ROOT, path));
    return /\.tsx?$/.test(name) ? [relative(ROOT, path)] : [];
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
const domains = sourceFiles('domains').filter((f) => f.includes('/src/'));
const pages = sourceFiles('apps/playground/src/pages');
const APP = 'apps/playground/src';
const parkingApp = sourceFiles(`${APP}/parking`);
const parkingPages = sourceFiles(`${APP}/parking/pages`);
const museumApp = sourceFiles(`${APP}/museum`);
const museumPages = sourceFiles(`${APP}/museum/pages`);

/** 相对导入解析成仓库里的路径（不带扩展名）；包名原样返回 */
const resolveImport = (file: string, module: string) =>
  module.startsWith('.') ? join(dirname(file), module).replace(/\.tsx?$/, '') : module;

describe('layer directories', () => {
  it.each([
    'domains/hospital/src',
    'packages/rtls/src',
    'apps/playground/src/engine',
    'apps/playground/src/adapters',
    'apps/playground/src/presentation',
    'apps/playground/src/app',
    'apps/playground/src/pages',
    'apps/playground/src/testing',
    'domains/parking/src',
    'apps/playground/src/parking',
    'docs/adr/0002-sdk-and-domain-layers.md',
    'docs/adr/0004-parking-scenario.md',
    'domains/museum/src',
    'apps/playground/src/museum',
    'docs/adr/0005-museum-scenario.md',
  ])('%s exists', (path) => {
    expect(existsSync(join(ROOT, path))).toBe(true);
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

  it('the app loads maplibre-gl only in engine/ and testing/', () => {
    const app = sourceFiles('apps/playground/src').filter(
      (f) => !f.startsWith('apps/playground/src/engine/') && !f.startsWith('apps/playground/src/testing/'),
    );
    expect(offending(app, (m) => m.startsWith('maplibre-gl'))).toEqual([]);
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

describe('business layer', () => {
  it('has source files', () => {
    expect(domains.length).toBeGreaterThan(0);
  });

  it('imports no map engine, no SDK runtime and no app code', () => {
    expect(
      offending(
        domains,
        (m) =>
          m.startsWith('maplibre-gl') ||
          m === '@indoorkit/core' ||
          m.startsWith('@indoorkit/core/') ||
          m.startsWith('@indoorkit/plugins') ||
          m.includes('apps/'),
      ),
    ).toEqual([]);
  });

  it('is plain TypeScript without React or a UI framework', () => {
    expect(domains.filter((f) => f.endsWith('.tsx'))).toEqual([]);
    expect(offending(domains, (m) => /^(react|react-dom|@mui\/|@emotion\/)/.test(m))).toEqual([]);
  });

  it('does not touch the DOM', () => {
    const hits = domains.filter((f) => /\b(document|window)\./.test(read(f)));
    expect(hits).toEqual([]);
  });
});

describe('page layer', () => {
  it('has a folder per page with its React component and view', () => {
    for (const page of ['home', 'assets', 'tracking', 'trail', 'alerts', 'occupancy']) {
      expect(pages).toContain(`apps/playground/src/pages/${page}/index.tsx`);
      expect(pages).toContain(`apps/playground/src/pages/${page}/view.tsx`);
    }
  });

  it('renders with React instead of writing HTML strings', () => {
    const hits = pages.filter((f) =>
      /innerHTML|insertAdjacentHTML|\bdocument\.createElement\(/.test(read(f)),
    );
    expect(hits).toEqual([]);
  });

  it('uses only SDK public APIs', () => {
    expect(offending(pages, (m) => m.startsWith('maplibre-gl') || m === '@indoorkit/core/testing')).toEqual(
      [],
    );
    const hits = pages.flatMap((f) => {
      const text = read(f);
      return [
        /['"`]indoor-[a-z-]+['"`]/.test(text) ? `${f}: layer id literal` : [],
        /\bindoor\.map\b|\bpage\.map\b|\{[^}]*\bmap\b[^}]*\}\s*=\s*page\b/.test(text) ? `${f}: raw map` : [],
        /as Record<string, unknown>/.test(text) ? `${f}: plugin cast` : [],
        /\bmap\.(easeTo|fitBounds|queryRenderedFeatures|setLayoutProperty|on|once|project)\(/.test(text)
          ? `${f}: MapLibre call`
          : [],
      ].flat();
    });
    expect(hits).toEqual([]);
  });
});

describe('parking scenario', () => {
  it('keeps the hospital and parking business packages apart', () => {
    const of = (name: string) => domains.filter((f) => f.startsWith(`domains/${name}/`));
    expect(of('parking').length).toBeGreaterThan(0);
    expect(offending(of('parking'), (m) => m.startsWith('@indoorkit/hospital'))).toEqual([]);
    expect(offending(of('hospital'), (m) => m.startsWith('@indoorkit/parking'))).toEqual([]);
  });

  it('has a folder per parking page with its React component and view', () => {
    for (const page of ['availability', 'vehicles', 'alerts', 'reserve', 'analytics']) {
      expect(parkingPages).toContain(`${APP}/parking/pages/${page}/index.tsx`);
      expect(parkingPages).toContain(`${APP}/parking/pages/${page}/view.tsx`);
    }
  });

  it('uses only the app shell outside its own folder, never the hospital demo or the home page', () => {
    // 外框：路由和布局、语言与主题的保存、地图的创建与统计
    const shell = [
      /^apps\/playground\/src\/app\/(scenario-layout|map|teardown|mui-theme)$/,
      /^apps\/playground\/src\/(app-i18n|app-theme|settings|theme)$/,
      /^apps\/playground\/src\/testing\/hooks$/,
    ];
    const bad = (module: string, file: string) => {
      if (/^@indoorkit\/(hospital|rtls-simulator)/.test(module)) return true;
      const target = resolveImport(file, module);
      if (!target.startsWith('apps/')) return false;
      if (target.startsWith(`${APP}/parking/`)) return false;
      return !shell.some((re) => re.test(target));
    };
    expect(offending(parkingApp, bad)).toEqual([]);
  });

  it('is unknown to the SDK, the hospital demo and the home page; only the router mounts it', () => {
    const others = sourceFiles(APP).filter(
      (f) => !f.startsWith(`${APP}/parking/`) && f !== `${APP}/app/routes.ts` && f !== `${APP}/app/App.tsx`,
    );
    const bad = (module: string, file: string) =>
      module.startsWith('@indoorkit/parking') || resolveImport(file, module).startsWith(`${APP}/parking`);
    expect(offending([...others, ...packages], bad)).toEqual([]);
    // 路由只认识停车场的入口和路由表
    const entry = (module: string, file: string) => {
      const target = resolveImport(file, module);
      return (
        target.startsWith(`${APP}/parking`) &&
        !/^apps\/playground\/src\/parking(\/routes|\/index)?$/.test(target)
      );
    };
    expect(offending([`${APP}/app/routes.ts`, `${APP}/app/App.tsx`], entry)).toEqual([]);
  });

  it('parking pages use only SDK public APIs', () => {
    expect(
      offending(parkingPages, (m) => m.startsWith('maplibre-gl') || m === '@indoorkit/core/testing'),
    ).toEqual([]);
    const hits = parkingPages.flatMap((f) => {
      const text = read(f);
      return [
        /['"`]indoor-[a-z-]+['"`]/.test(text) ? `${f}: layer id literal` : [],
        /\bindoor\.map\b|\bpage\.map\b/.test(text) ? `${f}: raw map` : [],
        /as Record<string, unknown>/.test(text) ? `${f}: plugin cast` : [],
        /innerHTML|insertAdjacentHTML|\bdocument\.createElement\(/.test(text) ? `${f}: HTML string` : [],
      ].flat();
    });
    expect(hits).toEqual([]);
  });
});

describe('museum scenario', () => {
  it('keeps the museum business package apart from the hospital and parking ones', () => {
    const of = (name: string) => domains.filter((f) => f.startsWith(`domains/${name}/`));
    expect(of('museum').length).toBeGreaterThan(0);
    expect(offending(of('museum'), (m) => /^@indoorkit\/(hospital|parking)/.test(m))).toEqual([]);
    for (const other of ['hospital', 'parking']) {
      expect(offending(of(other), (m) => m.startsWith('@indoorkit/museum'))).toEqual([]);
    }
  });

  it('has a folder per museum page with its React component and view', () => {
    for (const page of ['environment', 'collection', 'visitors', 'security', 'guide']) {
      expect(museumPages).toContain(`${APP}/museum/pages/${page}/index.tsx`);
      expect(museumPages).toContain(`${APP}/museum/pages/${page}/view.tsx`);
    }
  });

  it('uses only the app shell outside its own folder, never the other demos or the home page', () => {
    const shell = [
      /^apps\/playground\/src\/app\/(scenario-layout|map|teardown|mui-theme)$/,
      /^apps\/playground\/src\/(app-i18n|app-theme|settings|theme)$/,
    ];
    const bad = (module: string, file: string) => {
      if (/^@indoorkit\/(hospital|parking|rtls-simulator|parking-simulator)/.test(module)) return true;
      const target = resolveImport(file, module);
      if (!target.startsWith('apps/')) return false;
      if (target.startsWith(`${APP}/museum/`)) return false;
      return !shell.some((re) => re.test(target));
    };
    expect(offending(museumApp, bad)).toEqual([]);
  });

  it('is unknown to the SDK, the other demos and the home page; only the router mounts it', () => {
    const others = sourceFiles(APP).filter(
      (f) => !f.startsWith(`${APP}/museum/`) && f !== `${APP}/app/routes.ts` && f !== `${APP}/app/App.tsx`,
    );
    const bad = (module: string, file: string) =>
      module.startsWith('@indoorkit/museum') || resolveImport(file, module).startsWith(`${APP}/museum`);
    expect(offending([...others, ...packages], bad)).toEqual([]);
    const entry = (module: string, file: string) => {
      const target = resolveImport(file, module);
      return (
        target.startsWith(`${APP}/museum`) &&
        !/^apps\/playground\/src\/museum(\/routes|\/index)?$/.test(target)
      );
    };
    expect(offending([`${APP}/app/routes.ts`, `${APP}/app/App.tsx`], entry)).toEqual([]);
  });

  it('museum pages use only SDK public APIs', () => {
    expect(
      offending(museumPages, (m) => m.startsWith('maplibre-gl') || m === '@indoorkit/core/testing'),
    ).toEqual([]);
    const hits = museumPages.flatMap((f) => {
      const text = read(f);
      return [
        /['"`]indoor-[a-z-]+['"`]/.test(text) ? `${f}: layer id literal` : [],
        /\bindoor\.map\b|\bpage\.map\b/.test(text) ? `${f}: raw map` : [],
        /as Record<string, unknown>/.test(text) ? `${f}: plugin cast` : [],
        /innerHTML|insertAdjacentHTML|\bdocument\.createElement\(/.test(text) ? `${f}: HTML string` : [],
      ].flat();
    });
    expect(hits).toEqual([]);
  });
});
