import type { Role } from '@indoorkit/hospital';
import { floorPlugin, heatmapPlugin, positionStreamPlugin } from '@indoorkit/plugins';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoster, createSimProvider, PEOPLE_SEED, SIM_INTERVAL_MS } from '../../adapters/sim';
import { useT } from '../../app-i18n';
import { ROLE_COLORS, ROLES } from '../../presentation/colors';
import { ChipGroup, RadioGroup } from '../../presentation/ui';
import { MapPageLayout, useMapEvent, useMapPage, useRefresh } from '../map-page';
import { BusyList, DEFAULT_WINDOW, HEAT_WINDOWS } from './view';

const PEOPLE = 2000;
const BUSIEST = 3;
const NONE: ReadonlySet<string> = new Set();

/** 人流密度分析：按时间窗口和角色统计的热力图，以及最忙的区块 */
export function OccupancyPage() {
  const t = useT();
  const stageRef = useRef<HTMLDivElement>(null);
  // 热力图按角色分组；名册在场馆加载后才有
  const roles = useRef(new Map<string, Role>());
  const page = useMapPage(stageRef, {
    demo: 'occupancy',
    readyWhen: 'first-positions',
    plugins: (venue) => {
      roles.current = new Map(
        createRoster(venue, { people: PEOPLE, assets: 0 }).people.map((p) => [p.id, p.role]),
      );
      return [
        floorPlugin,
        heatmapPlugin({
          cellMeters: 2,
          windowsMinutes: HEAT_WINDOWS,
          window: DEFAULT_WINDOW,
          groupOf: (p) => roles.current.get(p.id)!,
        }),
        positionStreamPlugin({
          provider: createSimProvider(venue, { people: PEOPLE, seed: PEOPLE_SEED }),
          intervalMs: SIM_INTERVAL_MS,
          // 热力图页只看密度，不画单个标签
          visible: false,
        }),
      ] as const;
    },
  });
  const heat = page?.indoor.plugins.heatmap;

  const [windowMinutes, setWindowMinutes] = useState(DEFAULT_WINDOW);
  const [groups, setGroups] = useState(NONE);
  const [pointCount, setPointCount] = useState(0);
  const [busyVersion, busy] = useRefresh(2000);
  useEffect(() => {
    heat?.setWindow(windowMinutes);
    busy(true);
  }, [heat, windowMinutes, busy]);
  useEffect(() => {
    heat?.setGroups(groups.size === 0 ? null : [...groups]);
    busy(true);
  }, [heat, groups, busy]);
  useMapEvent(page, 'positions:update', () => {
    setPointCount(heat!.pointCount());
    busy();
  });
  useMapEvent(page, 'floor:change', () => busy(true));

  useEffect(() => {
    if (!page || !heat) return;
    const { hooks } = page;
    hooks.heatWindow = () => heat.window();
    hooks.heatPointCount = () => heat.pointCount();
    hooks.heatGroups = () => (heat.groups() ? [...heat.groups()!] : null);
    hooks.heatLevelIds = () => [...new Set(heat.data().map((f) => String(f.properties!.level_id)))].sort();
  }, [page, heat]);

  // 当前楼层、当前窗口里上报最多的区块（不含走廊等公共通道）；最多每 2 秒重算一次
  // biome-ignore lint/correctness/useExhaustiveDependencies: busyVersion 是限频重算的触发条件
  const rows = useMemo(() => {
    if (!page || !heat) return null;
    const { index } = page;
    const counts = new Map<string, number>();
    for (const f of heat.data()) {
      const coord = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      const where = index.locate(String(f.properties!.level_id), coord);
      if (!where || index.unit(where.unitId).category === 'walkway') continue;
      counts.set(where.unitId, (counts.get(where.unitId) ?? 0) + Number(f.properties!.weight));
    }
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, BUSIEST);
  }, [page, heat, busyVersion]);

  return (
    <MapPageLayout
      title="page.occupancy.title"
      stageRef={stageRef}
      page={page}
      controls={
        <>
          <RadioGroup
            name="window"
            label="control.window"
            values={HEAT_WINDOWS.map((m) => ({ value: String(m), text: t('control.minutes', { value: m }) }))}
            selected={String(windowMinutes)}
            onChange={(v) => setWindowMinutes(Number(v))}
          />
          <span className="metric">
            {t('metric.heatPoints')}: <b data-testid="heat-points">{pointCount}</b>
          </span>
          <ChipGroup
            testId="role-chip"
            items={ROLES.map((r) => ({ value: r, text: t(`role.${r}`), color: ROLE_COLORS[r] }))}
            selected={groups}
            onChange={setGroups}
          />
        </>
      }
    >
      <aside className="panel">
        <h2>{t('busy.title')}</h2>
        {page && rows ? (
          <BusyList
            ctx={{ venue: page.venue, index: page.index, departmentOfUnit: page.hospital.departmentOfUnit }}
            rows={rows}
          />
        ) : (
          <ol className="rows" data-testid="busy-list" />
        )}
      </aside>
    </MapPageLayout>
  );
}
