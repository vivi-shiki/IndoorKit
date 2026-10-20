import {
  type Alarm,
  createAlarmEngine,
  DEPARTMENT_RULES,
  dayTime,
  type Person,
  subjectsOf,
} from '@indoorkit/hospital';
import { floorPlugin, type Sample, type Stop, trailPlugin, zonePlugin } from '@indoorkit/plugins';
import type { PositionBatch } from '@indoorkit/rtls';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoster, createSimulation, PEOPLE_SEED } from '../../adapters/sim';
import { placesOf } from '../../adapters/venue';
import { type HospitalPageProps, hospitalHref } from '../../app/routes';
import { useT } from '../../app-i18n';
import { formatClock } from '../../presentation/format';
import { RadioGroup } from '../../presentation/ui';
import { floorName, MapPageLayout, useMapPage } from '../map-page';
import { AlarmList, PersonCard, PersonSelect, RANGES, SPEEDS, StopList } from './view';

/**
 * 名册和实时定位页相同（同一编号是同一个人），回放模拟出的前 60 分钟。
 * 只模拟可选的前 200 人，页面打开更快。
 */
const LISTED = 200;
const STEP_MS = 2000;
const HISTORY_MS = 60 * 60_000;
/** 每次让出主线程前推进的步数 */
const CHUNK = 60;

/** 轨迹回放：一个人前 60 分钟的轨迹、停留点和途中报警 */
export function TrailPage({ query }: HospitalPageProps) {
  const t = useT();
  const stageRef = useRef<HTMLDivElement>(null);
  const page = useMapPage(stageRef, {
    demo: 'trail',
    // 轨迹要先在页面里算出来，算完才算就绪
    readyWhen: 'manual',
    plugins: (venue) =>
      [
        floorPlugin,
        zonePlugin({ zones: placesOf(venue).hospital.zones() }),
        trailPlugin({ stopRadiusMeters: 4, stopMinMs: 60_000 }),
      ] as const,
  });
  const listed = useMemo(
    () => (page ? createRoster(page.venue, { people: LISTED, assets: 0 }).people : []),
    [page],
  );
  const people = useMemo(() => new Map(listed.map((p) => [p.id, p])), [listed]);
  const trail = page?.indoor.plugins.trail;

  // 在主线程分批模拟，每批之间让出主线程，页面不会卡住
  const [histories, setHistories] = useState<Map<string, Sample[]> | null>(null);
  useEffect(() => {
    if (!page) return;
    let disposed = false;
    void (async () => {
      const all = new Map<string, Sample[]>(listed.map((p) => [p.id, []]));
      const sim = createSimulation(page.venue, { seed: PEOPLE_SEED, tags: LISTED, assets: 0 });
      const record = (time: number, positions: ReturnType<typeof sim.positions>) => {
        for (const p of positions) all.get(p.id)?.push({ coord: p.coord, levelId: p.levelId, time });
      };
      record(0, sim.positions());
      while (sim.time < HISTORY_MS) {
        for (let i = 0; i < CHUNK && sim.time < HISTORY_MS; i++)
          record(sim.time + STEP_MS, sim.step(STEP_MS));
        await new Promise((resolve) => setTimeout(resolve));
        if (disposed) return;
      }
      setHistories(all);
    })();
    return () => {
      disposed = true;
    };
  }, [page, listed]);

  const initial = query.get('tag');
  const [personId, setPersonId] = useState(initial);
  const person: Person | undefined = people.get(personId ?? '') ?? listed[0];
  const [range, setRange] = useState(60);
  const [speed, setSpeed] = useState(4);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [alarms, setAlarms] = useState<Alarm[]>([]);

  /** 移动播放头；播放头换楼层时地图跟着换 */
  const seekTo = (to: number) => {
    if (!page || !trail) return;
    trail.seek(to);
    const head = trail.position();
    if (head && head.levelId !== page.floor.current().id) page.floor.set(head.levelId);
    setTime(trail.time());
  };

  // 换人或换时间范围时重新装入轨迹，并把这个人的轨迹交给两层报警引擎重放一遍
  useEffect(() => {
    if (!page || !trail || !histories || !person) return;
    const all = histories.get(person.id)!;
    const from = HISTORY_MS - range * 60_000;
    trail.set(all.filter((s) => s.time >= from));
    const engine = createAlarmEngine({
      hospital: page.hospital,
      subjects: subjectsOf({ people: [person], assets: [] }),
      departmentRules: DEPARTMENT_RULES,
    });
    const raised = all.flatMap((s) => {
      const batch: PositionBatch = {
        time: s.time,
        positions: [{ id: person.id, coord: s.coord, levelId: s.levelId }],
      };
      return engine.check(batch);
    });
    setAlarms(raised.filter((a) => a.time >= from));
    trail.seek(trail.range()[0]);
    const head = trail.position();
    if (head && head.levelId !== page.floor.current().id) page.floor.set(head.levelId);
    setTime(trail.time());
  }, [page, trail, histories, person, range]);

  // 轨迹装入后才算就绪
  useEffect(() => {
    if (!page || !histories) return;
    void page.indoor.idle().then(() => {
      page.hooks.ready = true;
    });
  }, [page, histories]);

  // 播放：每帧按倍速推进播放头
  const seekRef = useRef(seekTo);
  seekRef.current = seekTo;
  useEffect(() => {
    if (!playing || !trail) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const [, end] = trail.range();
      const next = trail.time() + (now - last) * speed;
      last = now;
      seekRef.current(Math.min(next, end));
      if (next >= end) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, trail]);

  useEffect(() => {
    if (!page || !trail || !person) return;
    const { hooks, floor } = page;
    hooks.trailPerson = () => person.id;
    hooks.trailRange = () => trail.range();
    hooks.trailTime = () => trail.time();
    hooks.trailStops = () =>
      trail.stops().map((s) => ({ start: s.start, floor: floorName(floor, s.levelId) }));
    hooks.trailHeadFloor = () => floorName(floor, trail.position()!.levelId);
  }, [page, trail, person]);

  const loaded = Boolean(page && trail && histories && person);
  const [start, end] = loaded ? trail!.range() : [0, 0];
  const ctx = page && {
    venue: page.venue,
    index: page.index,
    floor: page.floor,
    locate: page.hospital.locate,
  };
  const jump = (to: number) => {
    seekTo(to);
    const head = trail?.position();
    if (head) page?.indoor.camera.focus(head.coord);
  };

  return (
    <MapPageLayout
      title="page.trail.title"
      stageRef={stageRef}
      page={page}
      controls={
        <>
          <PersonSelect
            people={listed}
            selected={person?.id ?? ''}
            onChange={(id) => {
              setPersonId(id);
              history.replaceState(history.state, '', hospitalHref('trail', `tag=${id}`));
            }}
          />
          <RadioGroup
            name="range"
            label="trail.range"
            values={RANGES.map((m) => ({ value: String(m), text: t('control.minutes', { value: m }) }))}
            selected={String(range)}
            onChange={(v) => setRange(Number(v))}
          />
          <RadioGroup
            name="speed"
            label="trail.speed"
            values={SPEEDS.map((s) => ({ value: String(s), text: `${s}×` }))}
            selected={String(speed)}
            onChange={(v) => setSpeed(Number(v))}
          />
        </>
      }
    >
      <aside className="panel" data-testid="trail-panel">
        <p className="muted" data-testid="trail-loading" hidden={Boolean(histories)}>
          {t('trail.loading')}
        </p>
        {loaded && ctx && person ? (
          <>
            <PersonCard ctx={ctx} person={person} />
            <h2>{t('trail.stops')}</h2>
            <StopList ctx={ctx} person={person} stops={trail!.stops()} onStop={(s: Stop) => jump(s.start)} />
            <h2>{t('trail.alarms')}</h2>
            <AlarmList ctx={ctx} alarms={alarms} onAlarm={(a) => jump(a.time)} />
          </>
        ) : (
          <>
            <div data-testid="trail-person-card" />
            <h2>{t('trail.stops')}</h2>
            <ul className="rows" data-testid="stop-list" />
            <h2>{t('trail.alarms')}</h2>
            <ul className="rows" data-testid="trail-alarms" />
          </>
        )}
      </aside>
      <div className="player">
        <button
          type="button"
          className="chip"
          data-testid="trail-play"
          aria-pressed={playing}
          onClick={() => {
            if (!playing && trail && trail.time() >= end) seekTo(start);
            setPlaying(!playing);
          }}
        >
          {t(playing ? 'trail.pause' : 'trail.play')}
        </button>
        <input
          type="range"
          data-testid="trail-seek"
          min={start}
          max={end}
          step={1000}
          value={time}
          onChange={(e) => seekTo(Number(e.target.value))}
        />
        <span className="clock" data-testid="trail-clock">
          {loaded ? formatClock(dayTime(time), true) : ''}
        </span>
      </div>
    </MapPageLayout>
  );
}
