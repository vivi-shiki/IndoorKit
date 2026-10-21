import { languageFallbacks } from '@indoorkit/core';
import { pickLabel } from '@indoorkit/imdf';
import { floorPlugin, markerPlugin, routePlugin, unitStatePlugin } from '@indoorkit/plugins';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '../../../app-i18n';
import { parseClockParam } from '../../adapters/clock';
import { CROWD_STATES, type CrowdState, crowdStates, guideSteps } from '../../adapters/live';
import { useMuseumT } from '../../i18n';
import { codeOf, levelName, MuseumMapLayout, useMuseumMap, useTick } from '../../map';
import { CROWD_COLORS, GUIDE_COLORS } from '../../presentation/colors';
import { ChoiceChips, Legend } from '../../presentation/ui';
import type { MuseumPageProps } from '../../routes';
import { NearbyCard, TourRooms } from './view';

const HERE = 'guide:here';

/**
 * 来馆者导览：选一条推荐路线，地图画出跨楼层的路线；
 * 「你在这里」一步步走到路线上的展示柜前，靠近时（信标范围内）弹出藏品解说。
 */
export function GuidePage({ query }: MuseumPageProps) {
  const t = useMuseumT();
  const locale = useLocale();
  const stageRef = useRef<HTMLDivElement>(null);
  const [page, load] = useMuseumMap(stageRef, {
    page: 'guide',
    floor: '1F',
    startAt: query.has('t') ? parseClockParam(query.get('t')) : undefined,
    plugins: () =>
      [
        floorPlugin,
        unitStatePlugin({ colors: CROWD_COLORS, order: CROWD_STATES }),
        routePlugin(),
        markerPlugin,
      ] as const,
  });
  const tours = page?.ctx.museum.routes.filter((r) => r.kind === 'tour') ?? [];
  const [tour, setTour] = useState(query.get('tour') ?? 'TOUR-HIGHLIGHTS');
  const [index, setIndex] = useState(0);
  const [crowd, setCrowd] = useState<Map<string, CrowdState> | null>(null);
  const steps = useMemo(() => (page ? guideSteps(page.ctx.museum, tour) : []), [page, tour]);
  const step = steps[Math.min(index, steps.length - 1)];

  // 路线和「你在这里」
  useEffect(() => {
    if (!page || !step) return;
    const { ctx, hooks, indoor, floor } = page;
    const route = ctx.museum.route(tour);
    indoor.plugins.route.set(route.path.map((p) => ({ floor: p.levelId, coord: p.coord })));
    const here = ctx.museum.case(step.caseId);
    indoor.plugins.marker.remove(HERE);
    indoor.plugins.marker.add({
      id: HERE,
      coord: here.center,
      floor: here.levelId,
      label: t('guide.here'),
      color: GUIDE_COLORS.here,
    });
    floor.set(here.levelId);
    indoor.camera.focus(here.center);
    hooks.highlighted = () => indoor.plugins['unit-state'].highlighted().map((id) => codeOf(ctx, id));
    hooks.markerCount = () => indoor.plugins.marker.count();
    hooks.routeLevels = () => indoor.plugins.route.levels().map((id) => levelName(floor, id));
    hooks.routeMeters = () => indoor.plugins.route.length();
    hooks.guide = () => ({
      index,
      total: steps.length,
      caseCode: here.code,
      objects: ctx.museum.objectsAt(here.unitId).map((o) => o.code),
    });
  }, [page, tour, step, index, steps, t]);

  // 路线经过的展示室按混雑程度着色
  useTick(page, 2000, (at) => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    const rooms = new Set(ctx.museum.route(tour).stops.map((s) => s.unitId));
    const states = crowdStates(ctx.museum, ctx.day, at);
    const onRoute = [...states].filter(([id]) => rooms.has(id));
    indoor.plugins['unit-state'].setStates(onRoute);
    hooks.stateCounts = () =>
      Object.fromEntries(CROWD_STATES.map((s) => [s, onRoute.filter(([, v]) => v === s).length]));
    hooks.stateOf = (code) => onRoute.find(([id]) => codeOf(ctx, id) === code)?.[1] ?? null;
    if (!crowd) void indoor.rendered().then(() => (hooks.ready = true));
    setCrowd(states);
  });

  const go = (next: number) => setIndex(Math.max(0, Math.min(steps.length - 1, next)));

  return (
    <MuseumMapLayout
      title="page.guide.title"
      desc="page.guide.desc"
      stageRef={stageRef}
      page={page}
      load={load}
      publicOnly
      controls={
        <ChoiceChips
          testId="tour-chip"
          label={t('control.tour')}
          items={tours.map((r) => ({
            value: r.code,
            text: t('guide.tour', {
              name: pickLabel(r.name, languageFallbacks(locale)) ?? r.code,
              minutes: r.minutes,
            }),
          }))}
          selected={tour}
          onChange={(code) => {
            setTour(code);
            setIndex(0);
          }}
        />
      }
    >
      <aside className="panel guide-panel">
        <Legend items={CROWD_STATES.map((s) => ({ color: CROWD_COLORS[s], text: t(`crowd.${s}`) }))} />
        {page && crowd && step && (
          <TourRooms ctx={page.ctx} tour={tour} crowd={crowd} current={step.roomId} />
        )}
      </aside>
      {page && step && (
        <NearbyCard
          ctx={page.ctx}
          caseId={step.caseId}
          index={index}
          total={steps.length}
          onPrev={() => go(index - 1)}
          onNext={() => go(index + 1)}
        />
      )}
    </MuseumMapLayout>
  );
}
