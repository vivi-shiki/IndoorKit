import { departmentPlugin, floorPlugin, positionStreamPlugin } from '@indoorkit/plugins';
import { createRoster, type Person } from '@indoorkit/rtls-simulator';
import { i18n, translate } from '../app-i18n';
import { departmentName, label, personName, placeText, ROLE_COLORS, ROLES, roleColor, t } from '../business';
import { floorName, mountMapPage, radioGroup, routeParam } from '../map-page';
import { mountPerfOverlay } from '../perf';
import { createSimProvider, SIM_INTERVAL_MS } from '../sim';
import { chipGroup, escapeHtml, throttle } from '../ui';

const TAG_COUNTS = [500, 2000, 5000];
/** 和轨迹回放页用同一个种子，同一个编号就是同一个人 */
export const PEOPLE_SEED = 'playground';
const GROUP_LIMIT = 50;

export async function mountTrackingPage(root: HTMLElement) {
  const tags = TAG_COUNTS.includes(Number(routeParam('tags'))) ? Number(routeParam('tags')) : 2000;
  let roles = new Map<string, Person>();
  const page = await mountMapPage(root, {
    demo: 'tracking',
    readyWhen: 'first-positions',
    title: 'page.tracking.title',
    controls: `
      ${radioGroup(
        'tags',
        'control.tags',
        TAG_COUNTS.map((n) => ({ value: String(n), text: n.toLocaleString('en-US') })),
        String(tags),
      )}
      <span class="chips" data-chips="role"></span>
      <span class="hint" data-i18n="hint.replay"></span>`,
    overlays: `
      <aside class="panel" data-testid="person-panel">
        <input type="search" class="search" data-testid="person-search" data-i18n-placeholder="search.person" />
        <ul class="results" data-testid="search-results"></ul>
        <h2 data-i18n="panel.departments"></h2>
        <div class="groups" data-testid="person-groups"></div>
      </aside>
      <div class="perf" data-testid="perf"></div>
      <section class="drawer" data-testid="person-card" hidden></section>`,
    plugins: (venue) =>
      [
        floorPlugin,
        departmentPlugin,
        positionStreamPlugin({
          provider: createSimProvider(venue, { people: tags, seed: PEOPLE_SEED }),
          intervalMs: SIM_INTERVAL_MS,
          decorate: (id) => ({ role: roles.get(id)?.role ?? 'nurse' }),
          circleColor: roleColor,
        }),
      ] as const,
  });
  const { indoor, map, venue, index, floor, hooks, cleanups } = page;
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
    return s ? { sample: s, location: index.locate(s.levelId, s.coord) } : null;
  };

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
        map.easeTo({ center: w.sample.coord, duration: 500 });
      }
    }
    renderCard();
  };

  const renderCard = () => {
    const el = $('[data-testid="person-card"]');
    el.hidden = selected === null;
    if (selected === null) return;
    const person = roles.get(selected)!;
    const w = where(person.id);
    const own = w?.location?.departmentId === person.departmentId;
    el.innerHTML = `
      <header>
        <h2><span class="dot" style="background:${ROLE_COLORS[person.role]}"></span>${escapeHtml(personName(person))} <span class="muted">${person.id}</span></h2>
        <button type="button" class="close" data-testid="close-card" aria-label="${t('action.close')}">×</button>
      </header>
      <dl>
        <dt>${t('detail.role')}</dt><dd>${t(`role.${person.role}`)}</dd>
        <dt>${t('detail.department')}</dt><dd data-testid="person-department">${escapeHtml(departmentName(venue, person.departmentId))}</dd>
        <dt>${t('detail.location')}</dt><dd data-testid="person-location">${
          w
            ? `${floorName(floor, w.sample.levelId)} · ${escapeHtml(placeText(index, venue, w.location))} <span class="tag${own ? '' : ' warn'}">${t(own ? 'place.inOwn' : 'place.outsideOwn')}</span>`
            : '—'
        }</dd>
      </dl>
      <p class="actions">
        <a href="#/trail?tag=${person.id}">${t('action.trail')}</a>
        <button type="button" class="chip" data-testid="follow" aria-pressed="${follow}">${t('action.follow')}</button>
      </p>`;
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
    $('[data-testid="person-groups"]').innerHTML = venue.departments
      .filter((d) => byDept.has(d.id))
      .map((d) => {
        const people = byDept.get(d.id)!;
        const outside = people.filter((p) => where(p.id)?.location?.departmentId !== d.id).length;
        const rows = open.has(d.id)
          ? `<ul class="rows">${people
              .slice(0, GROUP_LIMIT)
              .map((p) => {
                const w = where(p.id)!;
                return `<li><button type="button" class="row" data-person="${p.id}">
                  <span class="name"><span class="dot" style="background:${ROLE_COLORS[p.role]}"></span>${escapeHtml(personName(p))}</span>
                  <span class="muted">${floorName(floor, w.sample.levelId)} · ${escapeHtml(placeText(index, venue, w.location))}</span>
                </button></li>`;
              })
              .join('')}</ul>`
          : '';
        return `<details data-testid="person-group" data-dept="${d.id}"${open.has(d.id) ? ' open' : ''}>
          <summary><span>${escapeHtml(label(d.name))}</span><span class="count">${people.length}${
            outside ? ` <em title="${t('place.outsideOwn')}">${outside}</em>` : ''
          }</span></summary>${rows}</details>`;
      })
      .join('');
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
    list.innerHTML = found.length
      ? found
          .map((p) => {
            const w = where(p.id);
            return `<li><button type="button" class="row" data-testid="search-result" data-person="${p.id}">
              <span class="name">${escapeHtml(personName(p))} <span class="muted">${p.id}</span></span>
              <span class="muted">${w ? `${floorName(floor, w.sample.levelId)} · ${escapeHtml(placeText(index, venue, w.location))}` : ''}</span></button></li>`;
          })
          .join('')
      : `<li class="muted">${t('search.none')}</li>`;
  };
  search.addEventListener('input', renderResults);
  $('[data-testid="search-results"]').addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-person]');
    if (row) select(row.dataset.person!, { follow: true });
  });

  // 点击位置周围 10 px 内的标签：标签在移动，精确命中一个像素不现实
  map.on('click', (e) => {
    const { x, y } = e.point;
    const hit = map.queryRenderedFeatures(
      [
        [x - 10, y - 10],
        [x + 10, y + 10],
      ],
      { layers: ['indoor-positions'] },
    )[0];
    if (hit) {
      const id = String(hit.properties.id);
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
      if (s) map.easeTo({ center: s.coord, duration: SIM_INTERVAL_MS });
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
    [
      ...new Set(
        map.queryRenderedFeatures({ layers: ['indoor-positions'] }).map((f) => String(f.properties.role)),
      ),
    ].sort();
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
    const best = map
      .queryRenderedFeatures({ layers: ['indoor-positions'] })
      .map((f) => ({
        id: String(f.properties.id),
        coord: (f.geometry as GeoJSON.Point).coordinates as [number, number],
      }))
      .sort((a, b) => stream.history(b.id).length - stream.history(a.id).length)[0];
    if (!best) return null;
    const { x, y } = map.project(best.coord);
    return { id: best.id, x, y, samples: stream.history(best.id).length };
  };

  return page.unmount;
}
