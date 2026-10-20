import { ASSET_TYPES, DAY_START_MS, dayTime } from '@indoorkit/hospital';
import { floorPlugin, positionStreamPlugin, unitClusterPlugin, zonePlugin } from '@indoorkit/plugins';
import type { TagPosition } from '@indoorkit/rtls';
import { createRoster, createSimProvider, SIM_INTERVAL_MS } from '../../adapters/sim';
import { placesOf } from '../../adapters/venue';
import { i18n, translate } from '../../app-i18n';
import { ASSET_STATUSES, STATUS_COLORS, STATUS_ORDER } from '../../presentation/colors';
import { formatClock, placeText, t } from '../../presentation/format';
import { chipGroup, escapeHtml, throttle } from '../../presentation/ui';
import { floorName, mountMapPage } from '../map-page';
import { assetDetail, controls, departmentList, overlays, searchResults, unitDrawer } from './view';

const ASSETS = 400;

/** 设备分布总览：按区块聚合设备，按科室、状态、类型筛选，查看区块和设备详情 */
export async function mountAssetsPage(root: HTMLElement) {
  const page = await mountMapPage(root, {
    demo: 'assets',
    title: 'page.assets.title',
    readyWhen: 'first-positions',
    controls,
    overlays,
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
  const { indoor, venue, index, hospital, floor, hooks, cleanups } = page;
  const clusters = indoor.plugins['unit-cluster'];
  const zones = indoor.plugins.zone;
  const stream = indoor.plugins['position-stream'];
  const view = { venue, index, floor, departmentOfUnit: hospital.departmentOfUnit };

  const roster = createRoster(venue, { people: 0, assets: ASSETS });
  const assets = new Map(roster.assets.map((a) => [a.id, a]));
  let now = DAY_START_MS;
  let latest: TagPosition[] = [];
  const $ = <E extends HTMLElement>(selector: string) => root.querySelector<E>(selector)!;

  // 筛选：科室（左侧列表）、状态和类型（chip）
  let department: string | null = null;
  let drawerUnit: string | null = null;
  let detailAsset: string | null = null;
  const statusChips = chipGroup({
    container: $('[data-chips="status"]'),
    testId: 'status-chip',
    items: () => ASSET_STATUSES.map((s) => ({ value: s, text: t(`status.${s}`), color: STATUS_COLORS[s] })),
    onChange: () => applyFilter(),
  });
  const typeChips = chipGroup({
    container: $('[data-chips="type"]'),
    testId: 'type-chip',
    items: () => ASSET_TYPES.map((x) => ({ value: x, text: t(`asset.${x}`) })),
    onChange: () => applyFilter(),
  });
  const accept = (p: TagPosition) => {
    const asset = assets.get(p.id)!;
    const statuses = statusChips.selected();
    const types = typeChips.selected();
    return (
      (department === null || asset.departmentId === department) &&
      (statuses.size === 0 || statuses.has(p.status ?? '')) &&
      (types.size === 0 || types.has(asset.type))
    );
  };
  const applyFilter = () => {
    clusters.setFilter(accept);
    renderAll();
  };

  const outsideOwn = (p: TagPosition) =>
    hospital.locate(p.levelId, p.coord)?.departmentId !== assets.get(p.id)!.departmentId;

  const renderDepartments = () => {
    const counts = new Map<string, { total: number; abnormal: number }>();
    for (const p of latest) {
      const d = assets.get(p.id)!.departmentId;
      const c = counts.get(d) ?? { total: 0, abnormal: 0 };
      c.total++;
      if (p.status === 'offline' || p.status === 'maintenance') c.abnormal++;
      counts.set(d, c);
    }
    $('[data-testid="dept-list"]').innerHTML = departmentList(
      view,
      hospital.departments,
      counts,
      department,
      (u) => clusters.members(u).length,
    );
  };
  $('[data-testid="dept-list"]').addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const unit = target.closest<HTMLElement>('[data-unit]');
    if (unit) {
      openUnit(unit.dataset.unit!);
      return;
    }
    const row = target.closest<HTMLElement>('[data-dept]');
    if (!row) return;
    const id = row.dataset.dept!;
    department = department === id ? null : id;
    zones.highlight(department);
    if (department) {
      // 切到该科室设备最多的楼层
      const levels = hospital.departmentLevels(department);
      const byLevel = (levelId: string) =>
        latest.filter((p) => p.levelId === levelId && assets.get(p.id)!.departmentId === department).length;
      const best = [...levels].sort((a, b) => byLevel(b) - byLevel(a))[0];
      if (best) floor.set(best);
    }
    applyFilter();
  });

  const openUnit = (unitId: string) => {
    drawerUnit = unitId;
    detailAsset = null;
    renderDrawer();
    renderDetail();
  };
  const renderDrawer = () => {
    const el = $('[data-testid="unit-drawer"]');
    el.hidden = drawerUnit === null || detailAsset !== null;
    if (drawerUnit === null) return;
    el.innerHTML = unitDrawer(view, drawerUnit, clusters.members(drawerUnit), assets, now);
  };
  $('[data-testid="unit-drawer"]').addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-testid="close-drawer"]')) {
      drawerUnit = null;
      renderDrawer();
      return;
    }
    const row = target.closest<HTMLElement>('[data-asset]');
    if (row) openAsset(row.dataset.asset!);
  });

  const openAsset = (id: string) => {
    detailAsset = id;
    renderDrawer();
    renderDetail();
  };
  /** 设备换区块的时刻和去向 */
  const moves = (id: string) => {
    const out: string[] = [];
    let previous: string | null = null;
    for (const sample of stream.history(id)) {
      const where = hospital.locate(sample.levelId, sample.coord);
      const unit = where?.unitId ?? null;
      if (previous !== null && unit !== previous)
        out.push(`${formatClock(dayTime(sample.time))} → ${escapeHtml(placeText(index, venue, where))}`);
      previous = unit;
    }
    return out;
  };
  const renderDetail = () => {
    const el = $('[data-testid="asset-detail"]');
    el.hidden = detailAsset === null;
    if (detailAsset === null) return;
    const asset = assets.get(detailAsset)!;
    const p = clusters.position(asset.id);
    const where = p ? hospital.locate(p.levelId, p.coord) : null;
    el.innerHTML = assetDetail(view, asset, p ?? undefined, where, now, moves(asset.id));
  };
  $('[data-testid="asset-detail"]').addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('[data-testid="close-detail"]')) return;
    detailAsset = null;
    renderDetail();
    renderDrawer();
  });

  // 搜索：编号或类型名
  const search = $<HTMLInputElement>('[data-testid="asset-search"]');
  const renderResults = () => {
    const q = search.value.trim().toLowerCase();
    const list = $('[data-testid="search-results"]');
    if (!q) {
      list.innerHTML = '';
      return;
    }
    const found = roster.assets
      .filter((a) => a.code.toLowerCase().includes(q) || t(`asset.${a.type}`).toLowerCase().includes(q))
      .slice(0, 8)
      .map((asset) => {
        const p = clusters.position(asset.id);
        return { asset, place: p ? placeText(index, venue, hospital.locate(p.levelId, p.coord)) : '' };
      });
    list.innerHTML = searchResults(found);
  };
  search.addEventListener('input', renderResults);
  $('[data-testid="search-results"]').addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-asset]');
    if (!row) return;
    const p = clusters.position(row.dataset.asset!);
    if (p) {
      floor.set(p.levelId);
      indoor.camera.focus(p.coord);
    }
    openAsset(row.dataset.asset!);
  });

  // 点击聚合点打开区块抽屉
  indoor.events.on('map:click', ({ point }) => {
    const unitId = clusters.pick(point, 12);
    if (unitId) openUnit(unitId);
  });

  // 标题栏指标
  const renderMetrics = () => {
    const levelId = floor.current().id;
    const onFloor = clusters.groups().reduce((sum, g) => sum + g.ids.length, 0);
    $('[data-testid="asset-count"]').textContent = String(onFloor);
    $('[data-testid="outside-count"]').textContent = String(
      latest.filter((p) => p.levelId === levelId && accept(p) && outsideOwn(p)).length,
    );
  };
  const renderAll = () => {
    renderMetrics();
    renderDepartments();
    renderDrawer();
    renderDetail();
  };
  const refresh = throttle(renderAll, 1000);
  indoor.events.on('positions:update', (batch) => {
    now = dayTime(batch.time);
    latest = batch.positions;
    refresh();
  });
  indoor.events.on('floor:change', () => refresh(true));

  const toggle = $('[data-testid="toggle-departments"]');
  toggle.addEventListener('click', () => {
    zones.setVisible(!zones.visible());
    toggle.setAttribute('aria-pressed', String(zones.visible()));
  });

  const relabel = () => {
    statusChips.render();
    typeChips.render();
    translate(root);
    renderAll();
    renderResults();
  };
  cleanups.push(i18n.subscribe(relabel));
  relabel();

  hooks.clusterCount = () => clusters.groups().length;
  hooks.groupDepartments = () =>
    [...new Set(clusters.groups().flatMap((g) => g.ids.map((id) => assets.get(id)!.departmentId)))].sort();
  hooks.groupStatuses = () => [...new Set(clusters.groups().flatMap((g) => Object.keys(g.statuses)))].sort();
  // 只给出已经画在地图上的聚合点：数据更新后要等下一帧才能点到
  hooks.clusterScreenPoint = () => {
    const drawn = new Set(clusters.rendered());
    const g = clusters.groups().find((x) => drawn.has(x.unitId));
    if (!g) return null;
    const { x, y } = indoor.project(g.center);
    return { unitId: g.unitId, x, y, count: g.ids.length };
  };
  hooks.drawerUnit = () => drawerUnit;
  hooks.detailAsset = () => detailAsset;
  hooks.assetOnAnotherFloor = () => {
    const current = floor.current().id;
    const p = latest.find((x) => x.levelId !== current)!;
    return { id: p.id, code: assets.get(p.id)!.code, floor: floorName(floor, p.levelId) };
  };

  return page.unmount;
}
