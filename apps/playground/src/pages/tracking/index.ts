import type { Person } from '@indoorkit/hospital';
import { floorPlugin, positionStreamPlugin, zonePlugin } from '@indoorkit/plugins';
import { createRoster, createSimProvider, PEOPLE_SEED, SIM_INTERVAL_MS } from '../../adapters/sim';
import { placesOf } from '../../adapters/venue';
import { i18n, translate } from '../../app-i18n';
import { ROLE_COLORS, ROLES, roleColor } from '../../presentation/colors';
import { personName, t } from '../../presentation/format';
import { mountPerfOverlay } from '../../presentation/perf';
import { chipGroup, throttle } from '../../presentation/ui';
import { floorName, mountMapPage, routeParam } from '../map-page';
import { controls, overlays, personCard, personGroups, searchResults, TAG_COUNTS } from './view';

/** 人员实时定位：按角色着色的实时位置、按科室分组的名单、搜索、跟随和点击回放 */
export async function mountTrackingPage(root: HTMLElement) {
  const tags = TAG_COUNTS.includes(Number(routeParam('tags'))) ? Number(routeParam('tags')) : 2000;
  let roles = new Map<string, Person>();
  const page = await mountMapPage(root, {
    demo: 'tracking',
    readyWhen: 'first-positions',
    title: 'page.tracking.title',
    controls: controls(tags),
    overlays,
    plugins: (venue) =>
      [
        floorPlugin,
        zonePlugin({ zones: placesOf(venue).hospital.zones() }),
        positionStreamPlugin({
          provider: createSimProvider(venue, { people: tags, seed: PEOPLE_SEED }),
          intervalMs: SIM_INTERVAL_MS,
          decorate: (id) => ({ role: roles.get(id)?.role ?? 'nurse' }),
          circleColor: roleColor,
        }),
      ] as const,
  });
  const { indoor, venue, index, hospital, floor, hooks, cleanups } = page;
  const stream = indoor.plugins['position-stream'];
  const roster = createRoster(venue, { people: tags, assets: 0 });
  roles = new Map(roster.people.map((p) => [p.id, p]));
  const $ = <E extends HTMLElement>(selector: string) => root.querySelector<E>(selector)!;

  // 换标签数量时重新进入页面，旧地图和 Worker 随之释放
  for (const input of root.querySelectorAll<HTMLInputElement>('input[name="tags"]')) {
    input.addEventListener('change', () => {
      location.hash = `#/tracking?tags=${input.value}`;
    });
  }

  const perfEl = $('[data-testid="perf"]');
  const perf = mountPerfOverlay(perfEl, () => stream.count());
  translate(perfEl);
  cleanups.push(() => perf.dispose());

  // 角色筛选
  const roleChips = chipGroup({
    container: $('[data-chips="role"]'),
    testId: 'role-chip',
    items: () => ROLES.map((r) => ({ value: r, text: t(`role.${r}`), color: ROLE_COLORS[r] })),
    onChange: (selected) => {
      stream.setFilter(selected.size === 0 ? null : (id) => selected.has(roles.get(id)!.role));
      renderGroups();
    },
  });
  const accepted = (p: Person) => roleChips.selected().size === 0 || roleChips.selected().has(p.role);

  const where = (id: string) => {
    const s = stream.latest(id);
    return s ? { sample: s, location: hospital.locate(s.levelId, s.coord) } : null;
  };
  const view = { venue, index, floor, where };

  // 选中并跟随一个人：切到他所在楼层并把地图移过去
  let selected: string | null = null;
  let follow = false;
  const select = (id: string | null, options: { follow: boolean }) => {
    selected = id;
    follow = options.follow;
    if (id && follow) {
      const w = where(id);
      if (w) {
        floor.set(w.sample.levelId);
        indoor.camera.focus(w.sample.coord);
      }
    }
    renderCard();
  };

  const renderCard = () => {
    const el = $('[data-testid="person-card"]');
    el.hidden = selected === null;
    if (selected === null) return;
    el.innerHTML = personCard(view, roles.get(selected)!, follow);
  };
  $('[data-testid="person-card"]').addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-testid="close-card"]')) {
      stream.clearReplay();
      select(null, { follow: false });
    } else if (target.closest('[data-testid="follow"]')) {
      select(selected, { follow: !follow });
    }
  });

  // 左侧：按科室分组的人员，展开时才列出名单
  const open = new Set<string>();
  const renderGroups = () => {
    const byDept = new Map<string, Person[]>();
    for (const p of roster.people) {
      if (!accepted(p) || !stream.latest(p.id)) continue;
      const list = byDept.get(p.departmentId) ?? [];
      list.push(p);
      byDept.set(p.departmentId, list);
    }
    $('[data-testid="person-groups"]').innerHTML = personGroups(view, hospital.departments, byDept, open);
  };
  const groupsEl = $('[data-testid="person-groups"]');
  groupsEl.addEventListener(
    'toggle',
    (e) => {
      const details = e.target as HTMLDetailsElement;
      const id = details.dataset.dept!;
      if (details.open === open.has(id)) return;
      if (details.open) open.add(id);
      else open.delete(id);
      renderGroups();
    },
    true,
  );
  groupsEl.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-person]');
    if (row) select(row.dataset.person!, { follow: true });
  });

  // 搜索：姓名（当前语言）或编号
  const search = $<HTMLInputElement>('[data-testid="person-search"]');
  const renderResults = () => {
    const q = search.value.trim().toLowerCase();
    const list = $('[data-testid="search-results"]');
    if (!q) {
      list.innerHTML = '';
      return;
    }
    const score = (p: Person) => (personName(p).toLowerCase() === q || p.id.toLowerCase() === q ? 0 : 1);
    const found = roster.people
      .filter((p) => personName(p).toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
      .sort((a, b) => score(a) - score(b))
      .slice(0, 8);
    list.innerHTML = searchResults(view, found);
  };
  search.addEventListener('input', renderResults);
  $('[data-testid="search-results"]').addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-person]');
    if (row) select(row.dataset.person!, { follow: true });
  });

  // 点击位置周围 10 px 内的标签：标签在移动，精确命中一个像素不现实
  indoor.events.on('map:click', ({ point }) => {
    const id = stream.pick(point, 10);
    if (id) {
      stream.replay(id);
      select(id, { follow: false });
    } else {
      stream.clearReplay();
      select(null, { follow: false });
    }
  });

  const refresh = throttle(() => {
    renderGroups();
    renderCard();
  }, 2000);
  indoor.events.on('positions:update', () => {
    // 跟随模式下人换了楼层，地图也跟着换
    if (selected && follow) {
      const s = stream.latest(selected);
      if (s && s.levelId !== floor.current().id) floor.set(s.levelId);
      if (s) indoor.camera.focus(s.coord, { durationMs: SIM_INTERVAL_MS });
    }
    refresh();
  });
  indoor.events.on('floor:change', () => refresh(true));

  const relabel = () => {
    roleChips.render();
    translate(root);
    refresh(true);
    renderResults();
  };
  cleanups.push(i18n.subscribe(relabel));
  relabel();

  hooks.perf = () => perf.snapshot();
  hooks.replaying = () => stream.replaying();
  hooks.selected = () => selected;
  hooks.renderedRoles = () =>
    [...new Set(stream.rendered().map((tag) => String(tag.properties.role)))].sort();
  hooks.personOnAnotherFloor = () => {
    // 选一个名字不重复的人，搜索结果第一条就是他
    const names = new Map<string, number>();
    for (const p of roster.people) names.set(personName(p), (names.get(personName(p)) ?? 0) + 1);
    const current = floor.current().id;
    const elsewhere = roster.people.filter((x) => {
      const s = stream.latest(x.id);
      return s && s.levelId !== current;
    });
    const p = elsewhere.find((x) => names.get(personName(x)) === 1) ?? elsewhere[0]!;
    return { id: p.id, name: personName(p), floor: floorName(floor, stream.latest(p.id)!.levelId) };
  };
  // 只从已经画出来的点里挑：数据更新后要等下一帧才能点到
  hooks.tagScreenPoint = () => {
    const best = stream
      .rendered()
      .sort((a, b) => stream.history(b.id).length - stream.history(a.id).length)[0];
    if (!best) return null;
    const { x, y } = indoor.project(best.coord);
    return { id: best.id, x, y, samples: stream.history(best.id).length };
  };

  return page.unmount;
}
