import {
  type Alarm,
  createAlarmEngine,
  DEPARTMENT_RULES,
  dayTime,
  type Person,
  subjectsOf,
} from '@indoorkit/hospital';
import { floorPlugin, type Sample, trailPlugin, zonePlugin } from '@indoorkit/plugins';
import type { PositionBatch } from '@indoorkit/rtls';
import { createRoster, createSimulation, PEOPLE_SEED } from '../../adapters/sim';
import { placesOf } from '../../adapters/venue';
import { i18n, translate } from '../../app-i18n';
import { formatClock, t } from '../../presentation/format';
import { floorName, mountMapPage, routeParam } from '../map-page';
import { alarmList, controls, overlays, personCard, personOptions, stopList } from './view';

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
export async function mountTrailPage(root: HTMLElement) {
  const page = await mountMapPage(root, {
    demo: 'trail',
    title: 'page.trail.title',
    // 轨迹要先在页面里算出来，算完才算就绪
    readyWhen: 'manual',
    controls,
    overlays,
    plugins: (venue) =>
      [
        floorPlugin,
        zonePlugin({ zones: placesOf(venue).hospital.zones() }),
        trailPlugin({ stopRadiusMeters: 4, stopMinMs: 60_000 }),
      ] as const,
  });
  const { indoor, venue, index, hospital, floor, hooks, cleanups } = page;
  const view = { venue, index, floor, locate: hospital.locate };
  const trail = indoor.plugins.trail;
  const roster = createRoster(venue, { people: LISTED, assets: 0 });
  const listed = roster.people;
  const people = new Map(listed.map((p) => [p.id, p]));
  const $ = <E extends HTMLElement>(selector: string) => root.querySelector<E>(selector)!;

  let disposed = false;
  let frame = 0;
  cleanups.push(() => {
    disposed = true;
    cancelAnimationFrame(frame);
  });

  // 在主线程分批模拟，每批之间让出主线程，页面不会卡住
  const histories = new Map<string, Sample[]>(listed.map((p) => [p.id, []]));
  const sim = createSimulation(venue, { seed: PEOPLE_SEED, tags: LISTED, assets: 0 });
  const record = (time: number, positions: ReturnType<typeof sim.positions>) => {
    for (const p of positions) histories.get(p.id)?.push({ coord: p.coord, levelId: p.levelId, time });
  };
  record(0, sim.positions());
  while (sim.time < HISTORY_MS) {
    for (let i = 0; i < CHUNK && sim.time < HISTORY_MS; i++) record(sim.time + STEP_MS, sim.step(STEP_MS));
    await new Promise((resolve) => setTimeout(resolve));
    if (disposed) return page.unmount;
  }
  $('[data-testid="trail-loading"]').hidden = true;

  // 途中报警：把这个人的轨迹交给两层报警引擎重放一遍
  const alarmsOf = (person: Person, samples: readonly Sample[]): Alarm[] => {
    const engine = createAlarmEngine({
      hospital,
      subjects: subjectsOf({ people: [person], assets: [] }),
      departmentRules: DEPARTMENT_RULES,
    });
    return samples.flatMap((s) => {
      const batch: PositionBatch = {
        time: s.time,
        positions: [{ id: person.id, coord: s.coord, levelId: s.levelId }],
      };
      return engine.check(batch);
    });
  };

  const initial = routeParam('tag');
  let personId = initial && people.has(initial) ? initial : listed[0]!.id;
  let range = 60;
  let speed = 4;
  let playing = false;
  let alarms: Alarm[] = [];

  const select = $<HTMLSelectElement>('[data-testid="trail-person"]');
  const renderOptions = () => {
    select.innerHTML = personOptions(listed, personId);
  };

  const load = () => {
    const person = people.get(personId)!;
    const all = histories.get(personId)!;
    const from = HISTORY_MS - range * 60_000;
    const samples = all.filter((s) => s.time >= from);
    trail.set(samples);
    alarms = alarmsOf(person, all).filter((a) => a.time >= from);
    const [start, end] = trail.range();
    const seek = $<HTMLInputElement>('[data-testid="trail-seek"]');
    seek.min = String(start);
    seek.max = String(end);
    trail.seek(start);
    followHead();
    renderPanel();
    renderPlayer();
  };

  /** 播放头换楼层时地图跟着换 */
  const followHead = () => {
    const head = trail.position();
    if (head && head.levelId !== floor.current().id) floor.set(head.levelId);
  };

  const renderPanel = () => {
    const person = people.get(personId)!;
    $('[data-testid="trail-person-card"]').innerHTML = personCard(view, person);
    $('[data-testid="stop-list"]').innerHTML = stopList(view, person, trail.stops());
    $('[data-testid="trail-alarms"]').innerHTML = alarmList(view, alarms);
  };

  const renderPlayer = () => {
    const play = $('[data-testid="trail-play"]');
    play.textContent = t(playing ? 'trail.pause' : 'trail.play');
    play.setAttribute('aria-pressed', String(playing));
    $<HTMLInputElement>('[data-testid="trail-seek"]').value = String(trail.time());
    $('[data-testid="trail-clock"]').textContent = formatClock(dayTime(trail.time()), true);
  };

  const seekTo = (time: number) => {
    trail.seek(time);
    followHead();
    renderPlayer();
  };

  // 播放：每帧按倍速推进播放头
  let last = 0;
  const tick = (now: number) => {
    if (!playing) return;
    const [, end] = trail.range();
    const next = trail.time() + (now - last) * speed;
    last = now;
    seekTo(Math.min(next, end));
    if (next >= end) {
      playing = false;
      renderPlayer();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  $('[data-testid="trail-play"]').addEventListener('click', () => {
    playing = !playing;
    cancelAnimationFrame(frame);
    if (playing) {
      const [start, end] = trail.range();
      if (trail.time() >= end) seekTo(start);
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
    renderPlayer();
  });
  $('[data-testid="trail-seek"]').addEventListener('input', (e) =>
    seekTo(Number((e.target as HTMLInputElement).value)),
  );
  for (const input of root.querySelectorAll<HTMLInputElement>('input[name="speed"]')) {
    input.addEventListener('change', () => {
      speed = Number(input.value);
    });
  }
  for (const input of root.querySelectorAll<HTMLInputElement>('input[name="range"]')) {
    input.addEventListener('change', () => {
      range = Number(input.value);
      load();
    });
  }
  select.addEventListener('change', () => {
    personId = select.value;
    history.replaceState(history.state, '', `#/trail?tag=${personId}`);
    load();
  });
  $('[data-testid="trail-panel"]').addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const stop = target.closest<HTMLElement>('[data-stop]');
    const alarm = target.closest<HTMLElement>('[data-time]');
    const time = stop
      ? trail.stops()[Number(stop.dataset.stop)]!.start
      : alarm
        ? Number(alarm.dataset.time)
        : null;
    if (time === null) return;
    seekTo(time);
    const head = trail.position();
    if (head) indoor.camera.focus(head.coord);
  });

  const labelMinutes = () => {
    for (const el of root.querySelectorAll<HTMLElement>('[data-minutes]')) {
      el.textContent = i18n.t('control.minutes', { value: el.dataset.minutes! });
    }
  };
  const relabel = () => {
    labelMinutes();
    renderOptions();
    translate(root);
    renderPanel();
    renderPlayer();
  };
  cleanups.push(i18n.subscribe(relabel));
  renderOptions();
  load();
  relabel();

  hooks.trailPerson = () => personId;
  hooks.trailRange = () => trail.range();
  hooks.trailTime = () => trail.time();
  hooks.trailStops = () => trail.stops().map((s) => ({ start: s.start, floor: floorName(floor, s.levelId) }));
  hooks.trailHeadFloor = () => floorName(floor, trail.position()!.levelId);
  void indoor.idle().then(() => {
    hooks.ready = true;
  });

  return page.unmount;
}
