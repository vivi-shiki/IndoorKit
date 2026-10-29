import type { CustomLayerInterface, Map as GLMap, SkySpecification } from 'maplibre-gl';
import { MercatorCoordinate } from 'maplibre-gl';
import {
  ACESFilmicToneMapping,
  Camera,
  DirectionalLight,
  Group,
  HemisphereLight,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  PCFShadowMap,
  PCFSoftShadowMap,
  PMREMGenerator,
  Ray,
  Scene,
  SRGBColorSpace,
  type Texture,
  Vector3,
  Vector4,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { definePlugin } from '../plugin';
import { themes } from '../style';
import type { ScreenPoint } from '../types';
import { download } from './download';
import { localMetres } from './floors';
import {
  type CutState,
  createFrameGovernor,
  type DeviceInfo,
  detectLevel,
  type FrameGovernor,
  modelFile,
  nextView,
  ORBIT_IDLE_MS,
  type Quality,
  type RenderLevel,
  type RenderOverrides,
  type RenderSettings,
  resolveSettings,
  type StatusPaint,
  sectionCut,
  shadowExtent,
  shouldOrbit,
  sunAt,
  type TwinView,
  validateOverrides,
} from './policy';
import {
  applyCut,
  applyFocus,
  applyNight,
  buildFloorStack,
  buildOutlines,
  buildStatusMarkers,
  disposeTree,
  type FloorStack,
  type PreparedBuilding,
  prepareModel,
  recolourFloors,
} from './scene';

export type {
  CutState,
  Quality,
  RenderLevel,
  RenderOverrides,
  RenderSettings,
  StatusPaint,
  TwinStatus,
  TwinView,
} from './policy';

export interface TwinSnapshot {
  /** 目标画质的模型（或 L0 的挤出体）已经就绪 */
  ready: boolean;
  /** 模型下载进度 0–1；先下低模再换高模时两段合计 */
  progress: number;
  view: TwinView;
  /** 用户的选择 */
  quality: Quality;
  /** 实际生效的档位；自动时由设备和帧率决定 */
  level: RenderLevel;
  settings: RenderSettings;
  renderer: { toneMapping: 'ACESFilmic'; environment: boolean };
  focused: string | null;
  /** 楼层 id → 剖切状态 */
  cut: Record<string, CutState>;
  hour: number;
  night: boolean;
  /** 当前涂在模型上的状态个数 */
  painted: number;
  meshes: number;
  triangles: number;
  fallback: boolean;
}

export interface TwinPerf {
  fps: number;
  drawCalls: number;
  triangles: number;
}

export interface TwinBuilding {
  id: string;
  node: string;
  center: [number, number];
  height: number;
}

export interface TwinLabel {
  id: string;
  /** 屋顶上方一点，容器像素 */
  x: number;
  y: number;
  /** 在镜头前方 */
  visible: boolean;
}

export interface TwinApi {
  snapshot(): TwinSnapshot;
  subscribe(listener: () => void): () => void;
  /** 每画完一帧调用；标签跟随镜头用 */
  onFrame(listener: () => void): () => void;
  perf(): TwinPerf;
  view(value: TwinView): void;
  quality(value: Quality, overrides?: RenderOverrides): Promise<void>;
  focus(buildingId: string | null): void;
  /** 容器像素处的楼栋 */
  pick(point: ScreenPoint): string | null;
  /** 模拟时间（0–24 时），决定太阳和夜间灯光 */
  time(hour: number): void;
  paint(items: readonly StatusPaint[]): void;
  /** 取消聚焦并回到园区全景 */
  resetView(): void;
  buildings(): readonly TwinBuilding[];
  labels(): TwinLabel[];
  zoom(value: number): void;
  idle(): Promise<void>;
  /** 测试和调试用的只读信息 */
  debug: {
    sky(): boolean;
    antialias(): boolean;
    floorMeshes(): number;
    extrusions(): number;
    camera(): { zoom: number; pitch: number; bearing: number };
    levelInView(levelId: string): boolean;
    /** 能点中的楼和它们地面中心的容器像素，按清单顺序 */
    buildingPoints(): { id: string; x: number; y: number }[];
  };
}

export interface TwinManifest {
  origin: [number, number];
  bounds: [[number, number], [number, number]];
  floorHeight: number;
  bearing?: number;
  buildings: TwinBuilding[];
  counts: { buildings: number; floors: number; trees: number; surfaces: number };
  /** 场地默认值，排在档位之后、用户覆盖之前 */
  render?: RenderOverrides;
}

export interface TwinOptions {
  url: string;
  quality?: Quality;
  overrides?: RenderOverrides;
  dark?: boolean;
  /** 空闲时缓慢环绕，默认开启 */
  orbit?: boolean;
  hour?: number;
}

const SKY: Record<'day' | 'night', SkySpecification> = {
  day: {
    'sky-color': '#9cc5ea',
    'horizon-color': '#e9eef1',
    'fog-color': '#e4e9ec',
    'sky-horizon-blend': 0.55,
    'horizon-fog-blend': 0.6,
    'fog-ground-blend': 0.45,
    'atmosphere-blend': 0,
  },
  night: {
    'sky-color': '#0c1524',
    'horizon-color': '#22304a',
    'fog-color': '#182233',
    'sky-horizon-blend': 0.55,
    'horizon-fog-blend': 0.6,
    'fog-ground-blend': 0.45,
    'atmosphere-blend': 0,
  },
};
/** 总平面的地面颜色；夜间和深色主题压暗，和模型的光照一致 */
const siteColors = (dark: boolean) => {
  const [grass, road, sidewalk, crossing, ground, other] = dark
    ? ['#2c3a30', '#20262c', '#3b3e43', '#585b5f', '#2b302c', '#36342f']
    : ['#7c9d73', '#4a5660', '#c9c6bd', '#e6e6e0', '#cdd2c6', '#d9d4c7'];
  return [
    'match',
    ['get', 'surface'],
    'grass',
    grass,
    'road',
    road,
    'sidewalk',
    sidewalk,
    'crossing',
    crossing,
    'ground',
    ground,
    other,
  ] as unknown as string;
};

/** Optional renderer entry point. Applications lazy-load it only when opening a 3D view. */
export function twinPlugin(options: TwinOptions) {
  return definePlugin({
    name: 'twin',
    async setup(ctx): Promise<TwinApi> {
      const map = ctx.map as unknown as GLMap;
      const container = map.getContainer();
      const abort = ctx.track(new AbortController(), (a) => a.abort(), 'twin requests');
      const base = options.url;
      const response = await fetch(`${base}/manifest.json`, { signal: abort.signal });
      if (!response.ok) throw new Error(`3D manifest: HTTP ${response.status}`);
      const manifest = (await response.json()) as TwinManifest;
      if (
        !Array.isArray(manifest.origin) ||
        manifest.origin.length !== 2 ||
        !manifest.origin.every(Number.isFinite)
      )
        throw new Error('3D manifest: invalid origin');
      if (!Array.isArray(manifest.buildings)) throw new Error('3D manifest: missing buildings');
      const site = validateOverrides(manifest.render);
      let overrides = validateOverrides(options.overrides);
      const toLocal = localMetres(manifest.origin);
      const bearing = manifest.bearing ?? -24;
      const heights = new Map(manifest.buildings.map((b) => [b.id, b.height]));

      const listeners = new Set<() => void>();
      const frameListeners = new Set<() => void>();
      const idleWaiters = ctx.track(
        new Set<() => void>(),
        (waiters) => {
          for (const resolve of waiters) resolve();
          waiters.clear();
        },
        'twin idle waiters',
      );
      ctx.onMap('idle', () => {
        for (const resolve of idleWaiters) resolve();
        idleWaiters.clear();
      });
      const notify = () => {
        for (const fn of listeners) fn();
      };

      // ---- 画质 ----
      const saveData =
        (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ?? false;
      let gpu: string | undefined;
      const device = (): DeviceInfo => ({
        width: container.clientWidth,
        cores: navigator.hardwareConcurrency || 4,
        memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
        saveData,
        gpu,
      });
      let requested: Quality = options.quality ?? 'auto';
      let detected = detectLevel(device());
      let level: RenderLevel = requested === 'auto' ? detected : requested;
      let governor: FrameGovernor | null = requested === 'auto' ? createFrameGovernor(level, detected) : null;
      let settings = resolveSettings(level, site, overrides);
      let dark = options.dark ?? false;
      let hour = options.hour ?? 14;
      let current = (ctx.venue.levels.find((l) => l.ordinal === 0) ?? ctx.venue.levels[0])!.id;
      const ordinalCut = (view: TwinView) =>
        sectionCut(
          ctx.venue.levels.map((l) => l.ordinal),
          view === 'indoor' ? ctx.venue.levels.find((l) => l.id === current)!.ordinal : null,
        );
      const cutFor = (view: TwinView) => {
        const byOrdinal = ordinalCut(view);
        return Object.fromEntries(ctx.venue.levels.map((l) => [l.id, byOrdinal[l.ordinal]!]));
      };
      let state: TwinSnapshot = {
        ready: false,
        progress: 0,
        view: 'outdoor',
        quality: requested,
        level,
        settings,
        renderer: { toneMapping: 'ACESFilmic', environment: false },
        focused: null,
        cut: cutFor('outdoor'),
        hour,
        night: sunAt(hour).night,
        painted: 0,
        meshes: 0,
        triangles: 0,
        fallback: false,
      };
      const update = (patch: Partial<TwinSnapshot>) => {
        state = { ...state, ...patch };
        notify();
        map.triggerRepaint();
      };

      // ---- Three.js 场景 ----
      const scene = new Scene();
      const camera = new Camera();
      const sun = new DirectionalLight(0xffedcf, 2.6);
      sun.castShadow = true;
      sun.shadow.bias = -0.0003;
      sun.shadow.normalBias = 0.25;
      const hemisphere = new HemisphereLight(0xe1f2ff, 0x7a8b6a, 1.9);
      const modelRoot = new Group();
      scene.add(sun, sun.target, hemisphere, modelRoot);
      let renderer: WebGLRenderer | undefined;
      let gl: WebGL2RenderingContext | WebGLRenderingContext | undefined;
      let model: Object3D | undefined;
      let prepared: ReturnType<typeof prepareModel> | undefined;
      let loadedFile: string | null = null;
      let outlines: ReturnType<typeof buildOutlines> | undefined;
      let floors: FloorStack | undefined;
      let markers: Group | undefined;
      let environment: Texture | undefined;
      let disposed = false;
      let revision = 0;
      const matrix = new Matrix4();
      let rendered = false;
      const perf: TwinPerf = { fps: 0, drawCalls: 0, triangles: 0 };
      let lastFrame = 0;

      const releaseModel = () => {
        outlines?.dispose();
        outlines = undefined;
        if (model) disposeTree(model, prepared?.unused);
        model = undefined;
        prepared = undefined;
        loadedFile = null;
      };
      const releaseFloors = () => {
        if (floors) disposeTree(floors.group);
        floors = undefined;
      };
      const releaseEnvironment = () => {
        environment?.dispose();
        environment = undefined;
        scene.environment = null;
      };
      ctx.track(
        scene,
        () => {
          disposed = true;
          revision++;
          listeners.clear();
          frameListeners.clear();
          releaseModel();
          releaseFloors();
          if (markers) disposeTree(markers);
          releaseEnvironment();
          sun.shadow.map?.dispose();
          renderer?.dispose();
          // Never lose the shared context: MapLibre owns it.
        },
        'twin scene',
      );

      // ---- MapLibre 图层：总平面和 L0 的挤出体 ----
      const siteResponse = await fetch(`${base}/site.geojson`, { signal: abort.signal });
      if (!siteResponse.ok) throw new Error(`3D site map: HTTP ${siteResponse.status}`);
      ctx.trackSource('indoor-twin-site', { type: 'geojson', data: await siteResponse.json() });
      ctx.trackLayer(
        {
          id: 'indoor-twin-site',
          type: 'fill',
          source: 'indoor-twin-site',
          paint: { 'fill-color': siteColors(false) },
        },
        ctx.indoorLayerIds[0],
      );
      const massing: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: ctx.venue.features.levels.features.flatMap((f) => {
          const level = ctx.venue.levels.find((l) => l.id === f.properties.level_id)!;
          if (level.ordinal < 0) return [];
          return [
            {
              ...f,
              properties: {
                base: level.ordinal * manifest.floorHeight,
                top: (level.ordinal + 1) * manifest.floorHeight - 0.3,
              },
            },
          ];
        }),
      };
      ctx.trackSource('indoor-twin-massing', { type: 'geojson', data: massing });
      ctx.trackLayer(
        {
          id: 'indoor-twin-massing',
          type: 'fill-extrusion',
          source: 'indoor-twin-massing',
          layout: { visibility: 'none' },
          paint: {
            'fill-extrusion-color': '#e4e7eb',
            'fill-extrusion-base': ['get', 'base'],
            'fill-extrusion-height': ['get', 'top'],
            'fill-extrusion-opacity': 0.94,
          },
        },
        ctx.indoorLayerIds[0],
      );

      const applyLayers = () => {
        for (const id of ctx.indoorLayerIds)
          map.setLayoutProperty(id, 'visibility', state.view === 'indoor' ? 'visible' : 'none');
        map.setLayoutProperty(
          'indoor-twin-site',
          'visibility',
          state.view === 'outdoor' ? 'visible' : 'none',
        );
        map.setLayoutProperty(
          'indoor-twin-massing',
          'visibility',
          state.view === 'outdoor' && settings.model === 'extrusion' ? 'visible' : 'none',
        );
        const dim = dark || sunAt(hour).night;
        map.setPaintProperty('indoor-twin-massing', 'fill-extrusion-color', dim ? '#3b4552' : '#e4e7eb');
        map.setPaintProperty('indoor-twin-site', 'fill-color', siteColors(dim));
        map.triggerRepaint();
      };
      const applySky = () => {
        const night = sunAt(hour).night || dark;
        // MapLibre 的声明不收 undefined，但运行时用它移除天空
        map.setSky((settings.sky ? SKY[night ? 'night' : 'day'] : undefined) as SkySpecification);
      };

      // ---- 光照：太阳随模拟时间，阴影范围随缩放 ----
      const sunDirection = new Vector3();
      const placeSun = () => {
        const s = sunAt(hour);
        // 夜里用一盏偏冷的高位月光代替地平线下的太阳
        const elevation = ((s.night ? 50 : Math.max(8, s.elevation)) * Math.PI) / 180;
        const azimuth = ((s.night ? 200 : s.azimuth) * Math.PI) / 180;
        sunDirection.set(
          Math.sin(azimuth) * Math.cos(elevation),
          Math.sin(elevation),
          -Math.cos(azimuth) * Math.cos(elevation),
        );
        const centre = map.getCenter();
        const [x, z] = toLocal([centre.lng, centre.lat]);
        const extent = shadowExtent(map.getZoom());
        Object.assign(sun.shadow.camera, {
          left: -extent,
          right: extent,
          top: extent,
          bottom: -extent,
          near: 1,
          far: 1200,
        });
        sun.shadow.camera.updateProjectionMatrix();
        sun.target.position.set(x, 0, z);
        sun.position.copy(sun.target.position).addScaledVector(sunDirection, 500);
        sun.color.set(s.night ? '#9fb4ff' : '#ffedcf');
        sun.intensity = (s.night ? 0.6 : s.intensity) * (dark ? 0.75 : 1);
        hemisphere.intensity = s.night ? 1.1 : dark ? 1.3 : 1.9;
        hemisphere.color.set(s.night ? '#8a9cc0' : '#e1f2ff');
        hemisphere.groundColor.set(s.night ? '#2c3340' : '#7a8b6a');
        if (renderer) renderer.shadowMap.needsUpdate = true;
      };
      const markMaterialsDirty = () =>
        scene.traverse((o) => {
          if (o instanceof Mesh) for (const m of [o.material].flat() as Material[]) m.needsUpdate = true;
        });
      const applyShadows = () => {
        if (!renderer) return;
        const size = settings.shadows;
        const type = settings.softShadows ? PCFSoftShadowMap : PCFShadowMap;
        if (renderer.shadowMap.enabled !== size > 0 || renderer.shadowMap.type !== type) markMaterialsDirty();
        renderer.shadowMap.enabled = size > 0;
        renderer.shadowMap.type = type;
        sun.castShadow = size > 0;
        if (size > 0 && sun.shadow.mapSize.x !== size) {
          sun.shadow.map?.dispose();
          sun.shadow.map = null;
          sun.shadow.mapSize.set(size, size);
        }
        renderer.shadowMap.needsUpdate = true;
      };
      const applyOutlines = () => {
        if (settings.outline && prepared && !outlines) outlines = buildOutlines(prepared.buildings, dark);
        if (!settings.outline && outlines) {
          outlines.dispose();
          outlines = undefined;
        }
      };
      const applyProps = () => {
        // 生成器给树木、车辆和周边白模这些道具组打了 props 标记
        for (const node of model?.children ?? []) if (node.userData.props) node.visible = settings.props > 0;
      };
      const applyFloors = () => {
        if (!settings.floors) {
          releaseFloors();
          return;
        }
        if (!floors) {
          floors = buildFloorStack(
            ctx.venue,
            manifest.origin,
            manifest.floorHeight,
            themes[dark ? 'dark' : 'light'],
          );
          scene.add(floors.group);
        }
        applyCut(floors, ordinalCut(state.view), current);
      };

      // ---- 模型：先低模后高模，按文件缓存 ----
      const loader = new GLTFLoader();
      const install = (root: Object3D, file: string) => {
        releaseModel();
        model = root;
        prepared = prepareModel(root);
        loadedFile = file;
        root.traverse((o) => {
          if (!(o instanceof Mesh)) return;
          o.castShadow = true;
          o.receiveShadow = true;
        });
        applyFocus(prepared.buildings, state.focused);
        applyNight(prepared.glow, sunAt(hour).night);
        applyProps();
        applyOutlines();
        modelRoot.add(root);
        if (renderer) renderer.shadowMap.needsUpdate = true;
        perf.triangles = prepared.triangles;
        update({ meshes: prepared.meshes, triangles: prepared.triangles, fallback: false });
      };
      const loadModel = async () => {
        const ticket = ++revision;
        const file = modelFile(settings);
        if (file === null) {
          releaseModel();
          perf.triangles = 0;
          update({ ready: false, meshes: 0, triangles: 0, fallback: false });
          // 体块图层刚显示，等 MapLibre 把它画出来再算就绪
          await new Promise<void>((resolve) => {
            idleWaiters.add(resolve);
            map.triggerRepaint();
          });
          if (ticket === revision && !disposed) update({ ready: true, progress: 1 });
          return;
        }
        if (file === loadedFile) {
          update({ ready: true, progress: 1 });
          return;
        }
        const stages = !model && file === 'scene.glb' ? ['scene-low.glb', file] : [file];
        update({ ready: false, progress: 0 });
        for (const [i, stage] of stages.entries()) {
          let reported = 0;
          const buffer = await download(`${base}/${stage}`, abort.signal, (p) => {
            const progress = (i + p) / stages.length;
            if (ticket === revision && progress - reported >= 0.05) {
              reported = progress;
              update({ progress: Math.min(progress, 0.99) });
            }
          });
          const gltf = await loader.parseAsync(buffer, `${base}/`);
          if (ticket !== revision || disposed) {
            disposeTree(gltf.scene);
            return;
          }
          install(gltf.scene, stage);
        }
        update({ ready: true, progress: 1 });
      };
      function fallback(error: unknown) {
        if (disposed) return;
        console.warn('[twin] model unavailable; showing the local site plan', error);
        releaseModel();
        update({ ready: true, progress: 1, fallback: true, meshes: 0, triangles: 0 });
      }
      const apply = async (next: RenderSettings) => {
        // 抗锯齿属于 WebGL 上下文，创建后改不了；设置里记的是请求值，由调用方决定是否重建地图
        settings = next;
        map.setPixelRatio(Math.min(devicePixelRatio, settings.pixelRatio));
        applySky();
        applyShadows();
        applyOutlines();
        applyProps();
        applyFloors();
        applyLayers();
        update({
          settings,
          level,
          quality: requested,
          renderer: { ...state.renderer, environment: settings.environment },
        });
        await loadModel().catch(fallback);
      };

      // ---- 渲染 ----
      const origin = MercatorCoordinate.fromLngLat(manifest.origin);
      const scale = origin.meterInMercatorCoordinateUnits();
      const transform = new Matrix4()
        .makeTranslation(origin.x, origin.y, origin.z)
        .scale(new Vector3(scale, -scale, scale))
        .multiply(new Matrix4().makeRotationX(Math.PI / 2));
      const layer: CustomLayerInterface = {
        id: 'indoor-twin-model',
        type: 'custom',
        renderingMode: '3d',
        onAdd(_map, context) {
          gl = context;
          const info = context.getExtension('WEBGL_debug_renderer_info');
          if (info) gpu = String(context.getParameter(info.UNMASKED_RENDERER_WEBGL));
          renderer = new WebGLRenderer({ canvas: map.getCanvas(), context });
          renderer.autoClear = false;
          renderer.outputColorSpace = SRGBColorSpace;
          renderer.toneMapping = ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1;
          renderer.shadowMap.autoUpdate = false;
          renderer.shadowMap.needsUpdate = true;
        },
        render(_gl, input) {
          if (!renderer || document.hidden) return;
          matrix.fromArray(input.defaultProjectionData.mainMatrix).multiply(transform);
          camera.projectionMatrix.copy(matrix);
          camera.projectionMatrixInverse.copy(matrix).invert();
          rendered = true;
          const outdoor = state.view === 'outdoor';
          modelRoot.visible = outdoor;
          if (markers) markers.visible = outdoor;
          if (floors) floors.group.visible = !outdoor;
          renderer.resetState();
          if (settings.environment && !environment) {
            const pmrem = new PMREMGenerator(renderer);
            const room = new RoomEnvironment();
            environment = pmrem.fromScene(room, 0.04).texture;
            room.dispose();
            pmrem.dispose();
            scene.environment = environment;
            scene.environmentIntensity = 0.55;
          } else if (!settings.environment && environment) releaseEnvironment();
          renderer.render(scene, camera);
          renderer.resetState();
          perf.drawCalls = renderer.info.render.calls;
          const now = performance.now();
          const elapsed = now - lastFrame;
          lastFrame = now;
          if (elapsed > 0 && elapsed < 300)
            perf.fps = perf.fps === 0 ? 1000 / elapsed : perf.fps * 0.9 + (1000 / elapsed) * 0.1;
          const stepped = governor?.sample(elapsed);
          if (stepped && !disposed) {
            level = stepped;
            queueMicrotask(() => {
              if (!disposed) void apply(resolveSettings(level, site, overrides));
            });
          }
          for (const fn of frameListeners) fn();
        },
      };
      map.addLayer(layer);
      ctx.track(layer.id, (id) => map.removeLayer(id), 'layer:indoor-twin-model');

      // 加图层后才知道显卡，再判断一次
      detected = detectLevel(device());
      if (requested === 'auto') {
        level = detected;
        governor = createFrameGovernor(level, detected);
      }

      // ---- 相机 ----
      /** 我们自己发起的镜头动画期间不按缩放切换室内外 */
      let steering = false;
      const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
      const padding = () => {
        const width = container.clientWidth;
        return width > 1100
          ? { top: 80, bottom: 115, left: 245, right: 230 }
          : width > 650
            ? { top: 50, bottom: 115, left: 210, right: 65 }
            : { top: 80, bottom: 130, left: 20, right: 55 };
      };
      const fitOutside = (duration: number) => {
        steering = true;
        map.fitBounds(manifest.bounds, { padding: padding(), maxZoom: 18.2, pitch: 52, bearing, duration });
        if (duration === 0) steering = false;
      };
      const levelBounds = (id: string): [[number, number], [number, number]] => {
        const b = [Infinity, Infinity, -Infinity, -Infinity];
        for (const f of ctx.venue.features.levels.features) {
          if (f.properties.level_id !== id) continue;
          const rings =
            f.geometry.type === 'Polygon'
              ? [f.geometry.coordinates[0]!]
              : f.geometry.coordinates.map((p) => p[0]!);
          for (const ring of rings)
            for (const [x, y] of ring) {
              b[0] = Math.min(b[0]!, x!);
              b[1] = Math.min(b[1]!, y!);
              b[2] = Math.max(b[2]!, x!);
              b[3] = Math.max(b[3]!, y!);
            }
        }
        if (!Number.isFinite(b[0])) throw new Error(`level ${id} has no outline`);
        return [
          [b[0]!, b[1]!],
          [b[2]!, b[3]!],
        ];
      };
      /** 斜看整层：按俯视算出的缩放再退一点，给透视留出近处的余量 */
      const fitLevel = (duration: number) => {
        const fit = map.cameraForBounds(levelBounds(current), { padding: padding(), bearing });
        if (!fit?.center || fit.zoom === undefined) throw new Error('cannot fit the current level');
        steering = true;
        map.easeTo({
          center: fit.center,
          zoom: Math.max(18.9, fit.zoom - 0.35),
          pitch: 50,
          bearing,
          duration,
        });
        if (duration === 0) steering = false;
      };
      ctx.onMap('moveend', () => {
        steering = false;
        placeSun();
        scheduleOrbit();
      });
      ctx.onMap('zoom', () => {
        if (steering) return;
        const next = nextView(state.view, map.getZoom());
        if (next !== state.view) setView(next);
      });
      const setView = (view: TwinView) => {
        state = { ...state, view, cut: cutFor(view) };
        if (view === 'indoor') stopOrbit();
        applyFloors();
        applyLayers();
        update({});
      };
      ctx.on('floor:change', ({ levelId }) => {
        current = levelId;
        applyFloors();
        update({ cut: cutFor(state.view) });
      });

      // ---- 空闲环绕 ----
      const orbit = { timer: 0, active: false, lastInput: performance.now() };
      ctx.track(orbit, (o) => clearTimeout(o.timer), 'twin orbit timer');
      const stopOrbit = () => {
        clearTimeout(orbit.timer);
        if (orbit.active) map.stop();
        orbit.active = false;
      };
      function scheduleOrbit() {
        if (options.orbit === false || disposed) return;
        clearTimeout(orbit.timer);
        if (orbit.active) {
          map.easeTo({ bearing: map.getBearing() + 60, duration: 24000, easing: (t) => t });
          return;
        }
        const idleMs = performance.now() - orbit.lastInput;
        const wait = Math.max(0, ORBIT_IDLE_MS - idleMs);
        orbit.timer = window.setTimeout(() => {
          if (
            !shouldOrbit({
              idleMs: performance.now() - orbit.lastInput,
              reducedMotion: reduced(),
              view: state.view,
            })
          )
            return;
          orbit.active = true;
          map.easeTo({ bearing: map.getBearing() + 60, duration: 24000, easing: (t) => t });
        }, wait);
      }
      for (const type of ['mousedown', 'touchstart', 'wheel'])
        ctx.onMap(type, () => {
          orbit.lastInput = performance.now();
          stopOrbit();
        });

      // ---- 点选 ----
      const pick = (point: ScreenPoint): string | null => {
        if (!prepared || !rendered) {
          // L0 没有模型：取屏幕上最近的楼栋中心
          let best: { id: string; d: number } | null = null;
          for (const b of manifest.buildings) {
            const p = map.project(b.center);
            const d = Math.hypot(p.x - point.x, p.y - point.y);
            if (d < 80 && (!best || d < best.d)) best = { id: b.id, d };
          }
          return best?.id ?? null;
        }
        const inverse = matrix.clone().invert();
        const nx = (point.x / container.clientWidth) * 2 - 1;
        const ny = 1 - (point.y / container.clientHeight) * 2;
        const near = new Vector4(nx, ny, -1, 1).applyMatrix4(inverse);
        const far = new Vector4(nx, ny, 1, 1).applyMatrix4(inverse);
        const a = new Vector3(near.x, near.y, near.z).divideScalar(near.w);
        const b = new Vector3(far.x, far.y, far.z).divideScalar(far.w);
        const ray = new Ray(a, b.sub(a).normalize());
        let hit: { b: PreparedBuilding; d: number } | null = null;
        const at = new Vector3();
        for (const building of prepared.buildings) {
          if (!ray.intersectBox(building.box, at)) continue;
          const d = at.distanceTo(a);
          if (!hit || d < hit.d) hit = { b: building, d };
        }
        return hit?.b.id ?? null;
      };
      const focus = (id: string | null) => {
        if (id !== null && !heights.has(id)) throw new Error(`unknown building ${id}`);
        if (prepared) applyFocus(prepared.buildings, id);
        if (renderer) renderer.shadowMap.needsUpdate = true;
        update({ focused: id });
      };
      ctx.on('map:click', ({ point }) => {
        if (state.view === 'outdoor') focus(pick(point));
      });

      const theme = (isDark: boolean) => {
        dark = isDark;
        placeSun();
        applySky();
        if (floors) recolourFloors(floors, themes[dark ? 'dark' : 'light']);
        if (outlines) {
          outlines.dispose();
          outlines = undefined;
          applyOutlines();
        }
        applyLayers();
      };
      ctx.on('theme:change', ({ name }) => theme(name === 'dark'));
      ctx.onMap('resize', () => {
        if (state.view === 'outdoor') fitOutside(0);
        if (requested !== 'auto') return;
        const next = detectLevel(device());
        if (next === detected) return;
        detected = next;
        level = next;
        governor = createFrameGovernor(level, detected);
        void apply(resolveSettings(level, site, overrides));
      });

      map.setMaxZoom(22);
      map.setMinZoom(15);
      fitOutside(0);
      theme(dark);
      await apply(resolveSettings(level, site, overrides));
      scheduleOrbit();

      const project = (x: number, y: number, z: number) => {
        const v = new Vector4(x, y, z, 1).applyMatrix4(matrix);
        return {
          x: ((v.x / v.w + 1) / 2) * container.clientWidth,
          y: ((1 - v.y / v.w) / 2) * container.clientHeight,
          visible: v.w > 0,
        };
      };
      return {
        snapshot: () => state,
        subscribe(fn) {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        onFrame(fn) {
          frameListeners.add(fn);
          return () => frameListeners.delete(fn);
        },
        perf: () => ({ ...perf, fps: Math.round(perf.fps) }),
        view(value) {
          setView(value);
          if (value === 'outdoor') fitOutside(reduced() ? 0 : 500);
          else fitLevel(reduced() ? 0 : 500);
        },
        async quality(value, next = {}) {
          overrides = validateOverrides(next);
          requested = value;
          detected = detectLevel(device());
          level = value === 'auto' ? detected : value;
          governor = value === 'auto' ? createFrameGovernor(level, detected) : null;
          await apply(resolveSettings(level, site, overrides));
        },
        focus,
        pick,
        time(value) {
          if (!Number.isFinite(value) || value < 0 || value > 24)
            throw new Error('hour must be between 0 and 24');
          hour = value;
          placeSun();
          applySky();
          applyLayers();
          if (prepared) applyNight(prepared.glow, sunAt(hour).night);
          update({ hour, night: sunAt(hour).night });
        },
        paint(items) {
          if (markers) disposeTree(markers);
          markers = buildStatusMarkers(ctx.venue, manifest.origin, manifest.floorHeight, heights, items);
          scene.add(markers);
          update({ painted: items.length });
        },
        resetView() {
          focus(null);
          if (state.view !== 'outdoor') setView('outdoor');
          fitOutside(reduced() ? 0 : 500);
        },
        buildings: () => manifest.buildings,
        labels: () =>
          manifest.buildings.map((b) => {
            const [x, z] = toLocal(b.center);
            const squash = state.focused === null || state.focused === b.id ? 1 : 0.4;
            const p = project(x, Math.max(b.height, 4) * squash + 3, z);
            return { id: b.id, x: p.x, y: p.y, visible: rendered && p.visible && state.view === 'outdoor' };
          }),
        zoom(value) {
          if (!Number.isFinite(value) || value < 15 || value > 22)
            throw new Error('zoom must be between 15 and 22');
          map.jumpTo({ zoom: value });
        },
        idle: () =>
          new Promise<void>((resolve) => {
            map.triggerRepaint();
            if (map.loaded() && !map.isMoving()) resolve();
            else idleWaiters.add(resolve);
          }),
        debug: {
          sky: () => map.getSky() !== undefined,
          antialias: () => gl?.getContextAttributes()?.antialias ?? false,
          floorMeshes: () => {
            let n = 0;
            floors?.group.traverse((o) => {
              if (o instanceof Mesh && o.visible) n++;
            });
            return floors?.group.visible ? n : 0;
          },
          extrusions: () => ctx.queryRendered(['indoor-twin-massing']).length,
          camera: () => ({ zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }),
          levelInView(id) {
            const [[w, s], [e, n]] = levelBounds(id);
            return [
              [w, s],
              [w, n],
              [e, s],
              [e, n],
            ].every(([lng, lat]) => {
              const p = map.project([lng!, lat!]);
              return p.x >= 0 && p.y >= 0 && p.x <= container.clientWidth && p.y <= container.clientHeight;
            });
          },
          buildingPoints() {
            // 楼栋中心和屋顶四角内侧的点，界面挡住中心时调用方可以换一个
            return manifest.buildings.flatMap((b) => {
              const box = prepared?.buildings.find((p) => p.id === b.id)?.box;
              const candidates = box
                ? [0.5, 0.25, 0.75].flatMap((u) =>
                    [0.5, 0.25, 0.75].map((v) =>
                      project(
                        box.min.x + (box.max.x - box.min.x) * u,
                        box.max.y,
                        box.min.z + (box.max.z - box.min.z) * v,
                      ),
                    ),
                  )
                : [map.project(b.center)];
              return candidates.flatMap((p) => {
                const inside =
                  p.x > 0 && p.y > 0 && p.x < container.clientWidth && p.y < container.clientHeight;
                return inside && pick(p) === b.id ? [{ id: b.id, x: p.x, y: p.y }] : [];
              });
            });
          },
        },
      };
    },
  });
}
