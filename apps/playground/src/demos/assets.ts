import type { TagPosition } from '@indoorkit/core';
import { departmentPlugin, floorPlugin, positionStreamPlugin, unitClusterPlugin } from '@indoorkit/plugins';
import {
  ASSET_TYPES,
  type Asset,
  createRoster,
  DAY_START_MS,
  dayTime,
  statusSummary,
} from '@indoorkit/rtls-simulator';
import { i18n, translate } from '../app-i18n';
import {
  ASSET_STATUSES,
  assetName,
  departmentName,
  formatClock,
  formatDuration,
  label,
  placeText,
  STATUS_COLORS,
  STATUS_ORDER,
  t,
  unitLabel,
} from '../business';
import { floorName, mountMapPage } from '../map-page';
import { createSimProvider, SIM_INTERVAL_MS } from '../sim';
import { chipGroup, escapeHtml, throttle } from '../ui';

const ASSETS = 400;
const DAY_MS = 24 * 3600_000;

export async function mountAssetsPage(root: HTMLElement) {
  const page = await mountMapPage(root, {
    demo: 'assets',
    title: 'page.assets.title',
    readyWhen: 'first-positions',
    controls: `
      <span class="metric"><span data-i18n="metric.assets"></span>: <b data-testid="asset-count">0</b></span>
      <span class="metric"><span data-i18n="metric.outside"></span>: <b data-testid="outside-count">0</b></span>
      <span class="chips" data-chips="status"></span>
      <button type="button" class="chip" data-testid="toggle-departments" aria-pressed="true" data-i18n="control.departments"></button>`,
    overlays: `
      <aside class="panel" data-testid="asset-panel">
        <input type="search" class="search" data-testid="asset-search" data-i18n-placeholder="search.asset" />
        <ul class="results" data-testid="search-results"></ul>
        <div class="chips" data-chips="type"></div>
        <h2 data-i18n="panel.departments"></h2>
        <ul class="rows" data-testid="dept-list"></ul>
      </aside>
      <section class="drawer" data-testid="unit-drawer" hidden></section>
      <section class="drawer" data-testid="asset-detail" hidden></section>`,
    plugins: (venue) =>
      [
        floorPlugin,
        departmentPlugin,
        unitClusterPlugin({ statusOrder: STATUS_ORDER, statusColors: STATUS_COLORS }),
        positionStreamPlugin({
          provider: createSimProvider(venue, { people: 0, assets: ASSETS, seed: 'assets' }),
          intervalMs: SIM_INTERVAL_MS,
        }),
      ] as const,
  });
  const { indoor, map, venue, index, floor, hooks, cleanups } = page;
  const clusters = indoor.plugins['unit-cluster'];
  const departments = indoor.plugins.department;
  const stream = indoor.plugins['position-stream'];
  // 设备用区块聚合点显示，不画逐个移动的圆点
  map.setLayoutProperty('indoor-positions', 'visibility', 'none');

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
    index.locate(p.levelId, p.coord)?.departmentId !== assets.get(p.id)!.departmentId;

  // 左侧：科室 → 区块
  const renderDepartments = () => {
    const counts = new Map<string, { total: number; abnormal: number }>();
    for (const p of latest) {
      const d = assets.get(p.id)!.departmentId;
      const c = counts.get(d) ?? { total: 0, abnormal: 0 };
      c.total++;
      if (p.status === 'offline' || p.status === 'maintenance') c.abnormal++;
      counts.set(d, c);
    }
    $('[data-testid="dept-list"]').innerHTML = venue.departments
      .map((d) => {
        const c = counts.get(d.id) ?? { total: 0, abnormal: 0 };
        const pressed = d.id === department;
        const units = pressed
          ? `<ul class="sub">${d.unitIds
              .map((u) => {
                const n = clusters.members(u).length;
                return n > 0
                  ? `<li data-testid="unit-row" data-unit="${u}"><span>${floorName(floor, index.unit(u).levelId)} ${escapeHtml(unitLabel(index, venue, u))}</span><b>${n}</b></li>`
                  : '';
              })
              .join('')}</ul>`
          : '';
        return `<li><button type="button" class="row" data-testid="dept-row" data-dept="${d.id}" aria-pressed="${pressed}">
            <span>${escapeHtml(label(d.name))}</span>
            <span class="count">${c.total}${c.abnormal ? ` <em>${c.abnormal}</em>` : ''}</span>
          </button>${units}</li>`;
      })
      .join('');
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
    departments.highlight(department);
    if (department) {
      // 切到该科室设备最多的楼层
      const levels = index.departmentLevels(department);
      const byLevel = (levelId: string) =>
        latest.filter((p) => p.levelId === levelId && assets.get(p.id)!.departmentId === department).length;
      const best = [...levels].sort((a, b) => byLevel(b) - byLevel(a))[0];
      if (best) floor.set(best);
    }
    applyFilter();
  });

  // 右侧：区块抽屉
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
    const unit = index.unit(drawerUnit);
    const members = clusters
      .members(drawerUnit)
      .sort((a, b) => STATUS_ORDER.indexOf(a.status as never) - STATUS_ORDER.indexOf(b.status as never));
    const abnormal = members.filter((p) => p.status === 'offline' || p.status === 'maintenance').length;
    el.innerHTML = `
      <header>
        <h2>${floorName(floor, unit.levelId)} ${escapeHtml(unitLabel(index, venue, unit.id))}</h2>
        <button type="button" class="close" data-testid="close-drawer" aria-label="${t('action.close')}">×</button>
      </header>
      <p class="muted">${escapeHtml(departmentName(venue, unit.departmentId))} · ${t('detail.devices', { value: members.length })}${
        abnormal ? ` · <em>${t('detail.abnormal', { value: abnormal })}</em>` : ''
      }</p>
      <ul class="rows">${members
        .map((p) => {
          const asset = assets.get(p.id)!;
          const summary = statusSummary(asset, now);
          const foreign =
            asset.departmentId !== unit.departmentId
              ? `<span class="tag">${escapeHtml(t('place.belongsTo', { value: departmentName(venue, asset.departmentId) }))}</span>`
              : '';
          return `<li><button type="button" class="row asset" data-testid="asset-row" data-asset="${asset.id}">
            <span class="status" style="--c:${STATUS_COLORS[summary.status]}">${t(`status.${summary.status}`)}</span>
            <span class="name">${escapeHtml(assetName(asset))}${foreign}</span>
            <span class="muted">${formatDuration(now - summary.since)} · ${t('detail.runToday')} ${formatDuration(summary.runMs)} · ${asset.battery}%</span>
          </button></li>`;
        })
        .join('')}</ul>`;
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

  // 右侧：设备详情
  const openAsset = (id: string) => {
    detailAsset = id;
    renderDrawer();
    renderDetail();
  };
  const timeline = (asset: Asset) => {
    const end = now % DAY_MS;
    return asset.schedule
      .filter((s) => s.from < end)
      .map((s) => {
        const width = ((Math.min(s.to, end) - s.from) / end) * 100;
        return `<span data-status="${s.status}" style="width:${width}%;background:${STATUS_COLORS[s.status]}" title="${formatClock(s.from)} ${t(`status.${s.status}`)}"></span>`;
      })
      .join('');
  };
  const moves = (id: string) => {
    const out: string[] = [];
    let previous: string | null = null;
    for (const sample of stream.history(id)) {
      const where = index.locate(sample.levelId, sample.coord);
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
    const summary = statusSummary(asset, now);
    const where = p ? index.locate(p.levelId, p.coord) : null;
    const moved = moves(asset.id);
    el.innerHTML = `
      <header>
        <h2>${escapeHtml(assetName(asset))}</h2>
        <button type="button" class="close" data-testid="close-detail" aria-label="${t('action.close')}">×</button>
      </header>
      <dl>
        <dt>${t('detail.department')}</dt><dd data-testid="asset-department">${escapeHtml(departmentName(venue, asset.departmentId))}</dd>
        <dt>${t('detail.location')}</dt><dd>${p ? `${floorName(floor, p.levelId)} · ` : ''}${escapeHtml(placeText(index, venue, where))}${
          p && outsideOwn(p) ? ` <span class="tag warn">${t('place.outsideOwn')}</span>` : ''
        }</dd>
        <dt>${t('detail.status')}</dt><dd data-testid="asset-status"><span class="status" style="--c:${STATUS_COLORS[summary.status]}">${t(`status.${summary.status}`)}</span> ${t('detail.since', { value: formatDuration(now - summary.since) })}</dd>
        <dt>${t('detail.runToday')}</dt><dd data-testid="asset-run-today">${formatDuration(summary.runMs)}</dd>
        <dt>${t('detail.battery')}</dt><dd>${asset.battery}%</dd>
      </dl>
      <h3>${t('detail.timeline')} <span class="muted">00:00 – ${formatClock(now)}</span></h3>
      <div class="timeline" data-testid="status-timeline">${timeline(asset)}</div>
      <h3>${t('detail.moves')}</h3>
      <ul class="moves">${moved.length ? moved.map((m) => `<li>${m}</li>`).join('') : `<li class="muted">${t('detail.noMoves')}</li>`}</ul>`;
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
      .slice(0, 8);
    list.innerHTML = found.length
      ? found
          .map((a) => {
            const p = clusters.position(a.id);
            const where = p ? placeText(index, venue, index.locate(p.levelId, p.coord)) : '';
            return `<li><button type="button" class="row" data-testid="search-result" data-asset="${a.id}">
              <span class="name">${escapeHtml(assetName(a))}</span><span class="muted">${escapeHtml(where)}</span></button></li>`;
          })
          .join('')
      : `<li class="muted">${t('search.none')}</li>`;
  };
  search.addEventListener('input', renderResults);
  $('[data-testid="search-results"]').addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-asset]');
    if (!row) return;
    const p = clusters.position(row.dataset.asset!);
    if (p) {
      floor.set(p.levelId);
      map.easeTo({ center: p.coord, duration: 500 });
    }
    openAsset(row.dataset.asset!);
  });

  // 点击聚合点打开区块抽屉
  const CLUSTER_LAYERS = ['indoor-unit-clusters', 'indoor-unit-points'];
  map.on('click', (e) => {
    const { x, y } = e.point;
    const hit = map.queryRenderedFeatures(
      [
        [x - 12, y - 12],
        [x + 12, y + 12],
      ],
      { layers: CLUSTER_LAYERS },
    )[0];
    if (hit) openUnit(String(hit.properties.unit_id));
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
    departments.setVisible(!departments.visible());
    toggle.setAttribute('aria-pressed', String(departments.visible()));
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
    const drawn = new Set(
      map.queryRenderedFeatures({ layers: CLUSTER_LAYERS }).map((f) => String(f.properties.unit_id)),
    );
    const g = clusters.groups().find((x) => drawn.has(x.unitId));
    if (!g) return null;
    const { x, y } = map.project(g.center);
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
