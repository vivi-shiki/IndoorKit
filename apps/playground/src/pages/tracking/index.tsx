import type { Person } from '@indoorkit/hospital';
import { floorPlugin, positionStreamPlugin, zonePlugin } from '@indoorkit/plugins';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoster, createSimProvider, PEOPLE_SEED, SIM_INTERVAL_MS } from '../../adapters/sim';
import { placesOf } from '../../adapters/venue';
import { type HospitalPageProps, hospitalHref } from '../../app/routes';
import { useT } from '../../app-i18n';
import { ROLE_COLORS, ROLES, roleColor } from '../../presentation/colors';
import { personName } from '../../presentation/format';
import { PerfOverlay, type PerfSnapshot } from '../../presentation/perf';
import { ChipGroup, RadioGroup } from '../../presentation/ui';
import { floorName, MapPageLayout, useMapEvent, useMapPage, useRefresh } from '../map-page';
import { PersonCard, PersonGroups, SearchResults, TAG_COUNTS } from './view';

const NONE: ReadonlySet<string> = new Set();

/** 人员实时定位：按角色着色的实时位置、按科室分组的名单、搜索、跟随和点击回放 */
export function TrackingPage({ query }: HospitalPageProps) {
  const t = useT();
  const requested = Number(query.get('tags'));
  const tags = TAG_COUNTS.includes(requested) ? requested : 2000;
  // 选中的数量立即显示，随后换地址重新进入页面
  const [tagChoice, setTagChoice] = useState(String(tags));
  // 插件给标签着色时要查角色，名册在场馆加载后才有
  const people = useRef(new Map<string, Person>());
  const stageRef = useRef<HTMLDivElement>(null);
  const [page, load] = useMapPage(stageRef, {
    demo: 'tracking',
    readyWhen: 'first-positions',
    plugins: (venue) => {
      people.current = new Map(createRoster(venue, { people: tags, assets: 0 }).people.map((p) => [p.id, p]));
      return [
        floorPlugin,
        zonePlugin({ zones: placesOf(venue).hospital.zones() }),
        positionStreamPlugin({
          provider: createSimProvider(venue, { people: tags, seed: PEOPLE_SEED }),
          intervalMs: SIM_INTERVAL_MS,
          decorate: (id) => ({ role: people.current.get(id)?.role ?? 'nurse' }),
          circleColor: roleColor,
        }),
      ] as const;
    },
  });
  const roster = useMemo(() => (page ? [...people.current.values()] : []), [page]);
  const stream = page?.indoor.plugins['position-stream'];

  // 角色筛选
  const [roles, setRoles] = useState(NONE);
  useEffect(() => {
    stream?.setFilter(roles.size === 0 ? null : (id) => roles.has(people.current.get(id)!.role));
  }, [stream, roles]);

  // 选中并跟随一个人：切到他所在楼层并把地图移过去
  const [selected, setSelected] = useState<string | null>(null);
  const [follow, setFollow] = useState(false);
  const select = (id: string | null, options: { follow: boolean }) => {
    setSelected(id);
    setFollow(options.follow);
    const s = id && options.follow ? stream?.latest(id) : null;
    if (page && s) {
      page.floor.set(s.levelId);
      page.indoor.camera.focus(s.coord);
    }
  };

  // 点击位置周围 10 px 内的标签：标签在移动，精确命中一个像素不现实
  useMapEvent(page, 'map:click', ({ point }) => {
    const id = stream!.pick(point, 10);
    if (id) {
      stream!.replay(id);
      select(id, { follow: false });
    } else {
      stream!.clearReplay();
      select(null, { follow: false });
    }
  });

  const [, refresh] = useRefresh(2000);
  useMapEvent(page, 'positions:update', () => {
    // 跟随模式下人换了楼层，地图也跟着换
    if (page && selected && follow) {
      const s = stream!.latest(selected);
      if (s && s.levelId !== page.floor.current().id) page.floor.set(s.levelId);
      if (s) page.indoor.camera.focus(s.coord, { durationMs: SIM_INTERVAL_MS });
    }
    refresh();
  });
  useMapEvent(page, 'floor:change', () => refresh(true));

  const [open, setOpen] = useState(NONE);
  const [search, setSearch] = useState('');

  // 性能浮层和测试钩子读同一个快照
  const tagCount = useCallback(() => stream?.count() ?? 0, [stream]);
  const onSnapshot = useCallback(
    (read: () => PerfSnapshot) => {
      if (page) page.hooks.perf = read;
    },
    [page],
  );

  useEffect(() => {
    if (!page || !stream) return;
    const { hooks, floor, indoor } = page;
    hooks.replaying = () => stream.replaying();
    hooks.renderedRoles = () =>
      [...new Set(stream.rendered().map((tag) => String(tag.properties.role)))].sort();
    hooks.personOnAnotherFloor = () => {
      // 选一个名字不重复的人，搜索结果第一条就是他
      const names = new Map<string, number>();
      for (const p of roster) names.set(personName(p), (names.get(personName(p)) ?? 0) + 1);
      const current = floor.current().id;
      const elsewhere = roster.filter((x) => {
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
  }, [page, stream, roster]);
  useEffect(() => {
    if (page) page.hooks.selected = () => selected;
  }, [page, selected]);

  let panel = null;
  let card = null;
  let results = null;
  if (page && stream) {
    const { venue, index, hospital, floor } = page;
    const where = (id: string) => {
      const s = stream.latest(id);
      return s ? { sample: s, location: hospital.locate(s.levelId, s.coord) } : null;
    };
    const ctx = { venue, index, floor, where };
    const accepted = (p: Person) => roles.size === 0 || roles.has(p.role);

    // 左侧：按科室分组的人员，展开时才列出名单
    const byDept = new Map<string, Person[]>();
    for (const p of roster) {
      if (!accepted(p) || !stream.latest(p.id)) continue;
      const list = byDept.get(p.departmentId) ?? [];
      list.push(p);
      byDept.set(p.departmentId, list);
    }
    const pick = (id: string) => select(id, { follow: true });
    panel = (
      <PersonGroups
        ctx={ctx}
        departments={hospital.departments}
        byDept={byDept}
        open={open}
        onToggle={(id, isOpen) => {
          const next = new Set(open);
          if (isOpen) next.add(id);
          else next.delete(id);
          setOpen(next);
        }}
        onPerson={pick}
      />
    );

    // 搜索：姓名（当前语言）或编号
    const q = search.trim().toLowerCase();
    if (q) {
      const score = (p: Person) => (personName(p).toLowerCase() === q || p.id.toLowerCase() === q ? 0 : 1);
      const found = roster
        .filter((p) => personName(p).toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
        .sort((a, b) => score(a) - score(b))
        .slice(0, 8);
      results = <SearchResults ctx={ctx} found={found} onPerson={pick} />;
    }

    if (selected) {
      card = (
        <PersonCard
          ctx={ctx}
          person={people.current.get(selected)!}
          follow={follow}
          onClose={() => {
            stream.clearReplay();
            select(null, { follow: false });
          }}
          onFollow={() => select(selected, { follow: !follow })}
        />
      );
    }
  }

  return (
    <MapPageLayout
      title="page.tracking.title"
      desc="page.tracking.desc"
      stageRef={stageRef}
      page={page}
      load={load}
      controls={
        <>
          <RadioGroup
            name="tags"
            label="control.tags"
            values={TAG_COUNTS.map((n) => ({ value: String(n), text: n.toLocaleString('en-US') }))}
            selected={tagChoice}
            // 换标签数量时重新进入页面，旧地图和 Worker 随之释放
            onChange={(value) => {
              setTagChoice(value);
              location.hash = hospitalHref('tracking', `tags=${value}`);
            }}
          />
          <ChipGroup
            testId="role-chip"
            items={ROLES.map((r) => ({ value: r, text: t(`role.${r}`), color: ROLE_COLORS[r] }))}
            selected={roles}
            onChange={setRoles}
          />
          <span className="hint">{t('hint.replay')}</span>
        </>
      }
    >
      <aside className="panel" data-testid="person-panel">
        <input
          type="search"
          className="search"
          data-testid="person-search"
          placeholder={t('search.person')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {results ?? <ul className="results" data-testid="search-results" />}
        <h2>{t('panel.departments')}</h2>
        {panel ?? <div className="groups" data-testid="person-groups" />}
      </aside>
      {stream ? (
        <PerfOverlay tagCount={tagCount} onSnapshot={onSnapshot} />
      ) : (
        <div className="perf" data-testid="perf" />
      )}
      <section className="drawer" data-testid="person-card" hidden={!card}>
        {card}
      </section>
    </MapPageLayout>
  );
}
