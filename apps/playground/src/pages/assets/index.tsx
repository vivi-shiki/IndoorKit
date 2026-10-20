import { ASSET_TYPES, DAY_START_MS, dayTime } from '@indoorkit/hospital';
import { floorPlugin, positionStreamPlugin, unitClusterPlugin, zonePlugin } from '@indoorkit/plugins';
import type { TagPosition } from '@indoorkit/rtls';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoster, createSimProvider, SIM_INTERVAL_MS } from '../../adapters/sim';
import { placesOf } from '../../adapters/venue';
import { useT } from '../../app-i18n';
import { ASSET_STATUSES, STATUS_COLORS, STATUS_ORDER } from '../../presentation/colors';
import { placeText } from '../../presentation/format';
import { ChipGroup } from '../../presentation/ui';
import { floorName, MapPageLayout, useMapEvent, useMapPage, useRefresh } from '../map-page';
import { AssetDetail, DepartmentList, SearchResults, UnitDrawer } from './view';

const ASSETS = 400;
const NONE: ReadonlySet<string> = new Set();

/** 设备分布总览：按区块聚合设备，按科室、状态、类型筛选，查看区块和设备详情 */
export function AssetsPage() {
  const t = useT();
  const stageRef = useRef<HTMLDivElement>(null);
  const page = useMapPage(stageRef, {
    demo: 'assets',
    readyWhen: 'first-positions',
    plugins: (venue) =>
      [
        floorPlugin,
        zonePlugin({ zones: placesOf(venue).hospital.zones() }),
        unitClusterPlugin({ statusOrder: STATUS_ORDER, statusColors: STATUS_COLORS }),
        // 设备用区块聚合点显示，不画逐个移动的圆点
        positionStreamPlugin({
          provider: createSimProvider(venue, { people: 0, assets: ASSETS, seed: 'assets' }),
          intervalMs: SIM_INTERVAL_MS,
          visible: false,
        }),
      ] as const,
  });
  const assets = useMemo(
    () =>
      page
        ? new Map(createRoster(page.venue, { people: 0, assets: ASSETS }).assets.map((a) => [a.id, a]))
        : null,
    [page],
  );

  // 最新一批位置和模拟时刻；列表按 useRefresh 限频重画时读取
  const latest = useRef<TagPosition[]>([]);
  const now = useRef(DAY_START_MS);
  const [, refresh] = useRefresh(1000);
  useMapEvent(page, 'positions:update', (batch) => {
    now.current = dayTime(batch.time);
    latest.current = batch.positions;
    refresh();
  });
  useMapEvent(page, 'floor:change', () => refresh(true));

  // 筛选：科室（左侧列表）、状态和类型（chip）
  const [department, setDepartment] = useState<string | null>(null);
  const [statuses, setStatuses] = useState(NONE);
  const [types, setTypes] = useState(NONE);
  const [drawerUnit, setDrawerUnit] = useState<string | null>(null);
  const [detailAsset, setDetailAsset] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [zonesVisible, setZonesVisible] = useState(true);

  const accept = useCallback(
    (p: TagPosition) => {
      const asset = assets!.get(p.id)!;
      return (
        (department === null || asset.departmentId === department) &&
        (statuses.size === 0 || statuses.has(p.status ?? '')) &&
        (types.size === 0 || types.has(asset.type))
      );
    },
    [assets, department, statuses, types],
  );
  useEffect(() => {
    page?.indoor.plugins['unit-cluster'].setFilter(accept);
  }, [page, accept]);

  useEffect(() => {
    page?.indoor.plugins.zone.highlight(department);
  }, [page, department]);

  useEffect(() => {
    page?.indoor.plugins.zone.setVisible(zonesVisible);
  }, [page, zonesVisible]);

  const openUnit = (unitId: string) => {
    setDrawerUnit(unitId);
    setDetailAsset(null);
  };
  useMapEvent(page, 'map:click', ({ point }) => {
    const unitId = page!.indoor.plugins['unit-cluster'].pick(point, 12);
    if (unitId) openUnit(unitId);
  });

  // 测试钩子：钩子读取的是最新的选择
  useEffect(() => {
    if (!page || !assets) return;
    const { hooks, indoor, floor } = page;
    const clusters = indoor.plugins['unit-cluster'];
    hooks.clusterCount = () => clusters.groups().length;
    hooks.groupDepartments = () =>
      [...new Set(clusters.groups().flatMap((g) => g.ids.map((id) => assets.get(id)!.departmentId)))].sort();
    hooks.groupStatuses = () =>
      [...new Set(clusters.groups().flatMap((g) => Object.keys(g.statuses)))].sort();
    // 只给出已经画在地图上的聚合点：数据更新后要等下一帧才能点到
    hooks.clusterScreenPoint = () => {
      const drawn = new Set(clusters.rendered());
      const g = clusters.groups().find((x) => drawn.has(x.unitId));
      if (!g) return null;
      const { x, y } = indoor.project(g.center);
      return { unitId: g.unitId, x, y, count: g.ids.length };
    };
    hooks.assetOnAnotherFloor = () => {
      const current = floor.current().id;
      const p = latest.current.find((x) => x.levelId !== current)!;
      return { id: p.id, code: assets.get(p.id)!.code, floor: floorName(floor, p.levelId) };
    };
  }, [page, assets]);
  useEffect(() => {
    if (!page) return;
    page.hooks.drawerUnit = () => drawerUnit;
    page.hooks.detailAsset = () => detailAsset;
  }, [page, drawerUnit, detailAsset]);

  const statusChips = (
    <ChipGroup
      testId="status-chip"
      items={ASSET_STATUSES.map((s) => ({ value: s, text: t(`status.${s}`), color: STATUS_COLORS[s] }))}
      selected={statuses}
      onChange={setStatuses}
    />
  );
  const typeChips = (
    <ChipGroup
      testId="type-chip"
      items={ASSET_TYPES.map((x) => ({ value: x, text: t(`asset.${x}`) }))}
      selected={types}
      onChange={setTypes}
    />
  );

  let body = null;
  let metrics = { assets: 0, outside: 0 };
  if (page && assets) {
    const { indoor, venue, index, hospital, floor } = page;
    const clusters = indoor.plugins['unit-cluster'];
    const stream = indoor.plugins['position-stream'];
    const ctx = { venue, index, floor, departmentOfUnit: hospital.departmentOfUnit };
    const positions = latest.current;
    const levelId = floor.current().id;
    const outsideOwn = (p: TagPosition) =>
      hospital.locate(p.levelId, p.coord)?.departmentId !== assets.get(p.id)!.departmentId;
    metrics = {
      assets: clusters.groups().reduce((sum, g) => sum + g.ids.length, 0),
      outside: positions.filter((p) => p.levelId === levelId && accept(p) && outsideOwn(p)).length,
    };

    const counts = new Map<string, { total: number; abnormal: number }>();
    for (const p of positions) {
      const d = assets.get(p.id)!.departmentId;
      const c = counts.get(d) ?? { total: 0, abnormal: 0 };
      c.total++;
      if (p.status === 'offline' || p.status === 'maintenance') c.abnormal++;
      counts.set(d, c);
    }
    const chooseDepartment = (id: string) => {
      const next = department === id ? null : id;
      setDepartment(next);
      if (next) {
        // 切到该科室设备最多的楼层
        const byLevel = (l: string) =>
          positions.filter((p) => p.levelId === l && assets.get(p.id)!.departmentId === next).length;
        const best = [...hospital.departmentLevels(next)].sort((a, b) => byLevel(b) - byLevel(a))[0];
        if (best) floor.set(best);
      }
    };

    const openAsset = (id: string) => setDetailAsset(id);
    // 搜索：编号或类型名
    const q = query.trim().toLowerCase();
    const found = q
      ? [...assets.values()]
          .filter((a) => a.code.toLowerCase().includes(q) || t(`asset.${a.type}`).toLowerCase().includes(q))
          .slice(0, 8)
          .map((asset) => {
            const p = clusters.position(asset.id);
            return { asset, place: p ? placeText(index, venue, hospital.locate(p.levelId, p.coord)) : '' };
          })
      : null;
    const pickResult = (id: string) => {
      const p = clusters.position(id);
      if (p) {
        floor.set(p.levelId);
        indoor.camera.focus(p.coord);
      }
      openAsset(id);
    };

    /** 设备换区块的时刻和去向 */
    const moves = (id: string) => {
      const out: { time: number; place: string }[] = [];
      let previous: string | null = null;
      for (const sample of stream.history(id)) {
        const where = hospital.locate(sample.levelId, sample.coord);
        const unit = where?.unitId ?? null;
        if (previous !== null && unit !== previous)
          out.push({ time: dayTime(sample.time), place: placeText(index, venue, where) });
        previous = unit;
      }
      return out;
    };
    const detail = detailAsset === null ? null : assets.get(detailAsset)!;
    const detailPosition = detail ? clusters.position(detail.id) : null;

    body = {
      departments: (
        <DepartmentList
          ctx={ctx}
          departments={hospital.departments}
          counts={counts}
          selected={department}
          membersOf={(u) => clusters.members(u).length}
          onDepartment={chooseDepartment}
          onUnit={openUnit}
        />
      ),
      results: found ? (
        <SearchResults found={found} onAsset={pickResult} />
      ) : (
        <ul className="results" data-testid="search-results" />
      ),
      drawer: drawerUnit !== null && detailAsset === null && (
        <UnitDrawer
          ctx={ctx}
          unitId={drawerUnit}
          members={clusters.members(drawerUnit)}
          assets={assets}
          now={now.current}
          onClose={() => setDrawerUnit(null)}
          onAsset={openAsset}
        />
      ),
      detail: detail && (
        <AssetDetail
          ctx={ctx}
          asset={detail}
          position={detailPosition ?? undefined}
          where={detailPosition ? hospital.locate(detailPosition.levelId, detailPosition.coord) : null}
          now={now.current}
          moves={moves(detail.id)}
          onClose={() => setDetailAsset(null)}
        />
      ),
    };
  }

  return (
    <MapPageLayout
      title="page.assets.title"
      stageRef={stageRef}
      page={page}
      controls={
        <>
          <span className="metric">
            {t('metric.assets')}: <b data-testid="asset-count">{metrics.assets}</b>
          </span>
          <span className="metric">
            {t('metric.outside')}: <b data-testid="outside-count">{metrics.outside}</b>
          </span>
          {statusChips}
          <button
            type="button"
            className="chip"
            data-testid="toggle-departments"
            aria-pressed={zonesVisible}
            onClick={() => setZonesVisible(!zonesVisible)}
          >
            {t('control.departments')}
          </button>
        </>
      }
    >
      <aside className="panel" data-testid="asset-panel">
        <input
          type="search"
          className="search"
          data-testid="asset-search"
          placeholder={t('search.asset')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {body?.results ?? <ul className="results" data-testid="search-results" />}
        {typeChips}
        <h2>{t('panel.departments')}</h2>
        {body?.departments ?? <ul className="rows" data-testid="dept-list" />}
      </aside>
      <section className="drawer" data-testid="unit-drawer" hidden={!body?.drawer}>
        {body?.drawer}
      </section>
      <section className="drawer" data-testid="asset-detail" hidden={!body?.detail}>
        {body?.detail}
      </section>
    </MapPageLayout>
  );
}
