import { type CustomLayerInterface, type Map as GLMap, MercatorCoordinate } from 'maplibre-gl';
import {
  Camera,
  DirectionalLight,
  HemisphereLight,
  Matrix4,
  Mesh,
  PCFSoftShadowMap,
  Scene,
  SRGBColorSpace,
  type Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { definePlugin } from '../plugin';
import { chooseQuality, nextView, type Quality, type TwinView } from './policy';

export type { Quality, TwinView } from './policy';
export interface TwinSnapshot {
  ready: boolean;
  view: TwinView;
  quality: 'low' | 'high';
  shadows: boolean;
  meshes: number;
  triangles: number;
  fallback: boolean;
}
export interface TwinApi {
  snapshot(): TwinSnapshot;
  view(value: TwinView): void;
  quality(value: Quality): Promise<void>;
  exportUrl(): string;
  zoom(value: number): void;
  idle(): Promise<void>;
  subscribe(listener: () => void): () => void;
}
export interface TwinManifest {
  origin: [number, number];
  bounds: [[number, number], [number, number]];
  floorHeight: number;
  bearing?: number;
  counts: { buildings: number; floors: number; trees: number; surfaces: number };
}

/** Optional renderer entry point. Applications lazy-load it only when opening a 3D view. */
export function twinPlugin(options: { url: string; quality?: Quality; dark?: boolean }) {
  return definePlugin({
    name: 'twin',
    async setup(ctx): Promise<TwinApi> {
      const map = ctx.map as unknown as GLMap;
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
      const listeners = new Set<() => void>();
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
      const saveData =
        (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ?? false;
      let requested = options.quality ?? 'auto';
      let quality = chooseQuality(
        requested,
        map.getContainer().clientWidth,
        navigator.hardwareConcurrency || 4,
        saveData,
      );
      let state: TwinSnapshot = {
        ready: false,
        view: 'outdoor',
        quality,
        shadows: quality === 'high',
        meshes: 0,
        triangles: 0,
        fallback: false,
      };
      const notify = () => {
        for (const fn of listeners) fn();
      };
      const scene = new Scene();
      const camera = new Camera();
      const sun = new DirectionalLight(0xffedcf, 2.6);
      sun.position.set(-70, 110, 50);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 120, bottom: -120, near: 1, far: 350 });
      sun.shadow.bias = -0.0003;
      sun.shadow.normalBias = 0.2;
      const sky = new HemisphereLight(0xe1f2ff, 0x7a8b6a, 2.1);
      scene.add(sun, sun.target, sky);
      let renderer: WebGLRenderer | undefined;
      let model: Scene | import('three').Group | undefined;
      let disposed = false;
      let revision = 0;
      let lastFrame = 0;
      let slowFrames = 0;
      let autoReduced = false;
      const disposeModel = (object: import('three').Object3D) => {
        const textures = new Set<Texture>();
        object.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          object.geometry.dispose();
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            for (const value of Object.values(material))
              if (value && typeof value === 'object' && 'isTexture' in value) textures.add(value as Texture);
            material.dispose();
          }
        });
        for (const texture of textures) {
          texture.dispose();
          if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap)
            texture.image.close();
        }
        scene.remove(object);
      };
      const releaseModel = () => {
        if (model) disposeModel(model);
        model = undefined;
      };
      ctx.track(
        scene,
        () => {
          disposed = true;
          revision++;
          listeners.clear();
          releaseModel();
          sun.shadow.map?.dispose();
          renderer?.dispose();
          // Never lose the shared context: MapLibre owns it.
        },
        'twin scene',
      );

      const siteResponse = await fetch(`${base}/site.geojson`, { signal: abort.signal });
      if (!siteResponse.ok) throw new Error(`3D site map: HTTP ${siteResponse.status}`);
      const site = await siteResponse.json();
      ctx.trackSource('indoor-twin-site', { type: 'geojson', data: site });
      ctx.trackLayer(
        {
          id: 'indoor-twin-site',
          type: 'fill',
          source: 'indoor-twin-site',
          paint: {
            'fill-color': ['match', ['get', 'surface'], 'grass', '#7c9d73', 'road', '#414e58', '#d9d4c7'],
          },
        },
        ctx.indoorLayerIds[0],
      );

      const applyView = () => {
        for (const id of ctx.indoorLayerIds)
          map.setLayoutProperty(id, 'visibility', state.view === 'indoor' ? 'visible' : 'none');
        map.setLayoutProperty(
          'indoor-twin-site',
          'visibility',
          state.view === 'outdoor' ? 'visible' : 'none',
        );
        map.triggerRepaint();
      };
      const loader = new GLTFLoader();
      const loadModel = async () => {
        const ticket = ++revision;
        const file = quality === 'low' ? 'scene-low.glb' : 'scene.glb';
        const r = await fetch(`${base}/${file}`, { signal: abort.signal });
        if (!r.ok) throw new Error(`3D model: HTTP ${r.status}`);
        const gltf = await loader.parseAsync(await r.arrayBuffer(), `${base}/`);
        if (ticket !== revision || disposed) {
          disposeModel(gltf.scene);
          return;
        }
        releaseModel();
        model = gltf.scene;
        let meshes = 0;
        let triangles = 0;
        model.traverse((o) => {
          if (!(o instanceof Mesh)) return;
          o.castShadow = quality === 'high';
          o.receiveShadow = quality === 'high';
          meshes++;
          triangles += (o.geometry.index?.count ?? o.geometry.attributes.position!.count) / 3;
        });
        scene.add(model);
        if (renderer) {
          renderer.shadowMap.enabled = quality === 'high';
          renderer.shadowMap.needsUpdate = true;
        }
        state = {
          ...state,
          ready: true,
          quality,
          shadows: quality === 'high',
          meshes,
          triangles,
          fallback: false,
        };
        notify();
        map.triggerRepaint();
      };
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
        onAdd(_map, gl) {
          renderer = new WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: false });
          renderer.autoClear = false;
          renderer.outputColorSpace = SRGBColorSpace;
          renderer.shadowMap.enabled = quality === 'high';
          renderer.shadowMap.type = PCFSoftShadowMap;
          renderer.shadowMap.autoUpdate = false;
          renderer.shadowMap.needsUpdate = true;
        },
        render(_gl, input) {
          if (!renderer || !model || state.view !== 'outdoor' || document.hidden) return;
          camera.projectionMatrix.fromArray(input.defaultProjectionData.mainMatrix).multiply(transform);
          renderer.resetState();
          renderer.render(scene, camera);
          renderer.resetState();
          const now = performance.now();
          const elapsed = now - lastFrame;
          lastFrame = now;
          if (requested === 'auto' && quality === 'high' && elapsed < 300) {
            slowFrames = elapsed > 45 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
            if (slowFrames >= 24) {
              autoReduced = true;
              quality = 'low';
              queueMicrotask(() => {
                if (!disposed) {
                  map.setPixelRatio(1);
                  void loadModel().catch(fallback);
                }
              });
            }
          }
        },
      };
      map.addLayer(layer);
      ctx.track(layer.id, (id) => map.removeLayer(id), 'layer:indoor-twin-model');
      const theme = (dark: boolean) => {
        sky.intensity = dark ? 1.4 : 2.1;
        sun.intensity = dark ? 1.6 : 2.6;
        if (renderer) renderer.shadowMap.needsUpdate = true;
        map.triggerRepaint();
      };
      theme(options.dark ?? false);
      ctx.on('theme:change', ({ name }) => theme(name === 'dark'));
      ctx.onMap('zoom', () => {
        const next = nextView(state.view, map.getZoom());
        if (next !== state.view) {
          state = { ...state, view: next };
          applyView();
          notify();
        }
      });
      ctx.onMap('resize', () => {
        if (state.view === 'outdoor') fitOutside(0);
        if (requested !== 'auto') return;
        const next = autoReduced
          ? 'low'
          : chooseQuality(
              'auto',
              map.getContainer().clientWidth,
              navigator.hardwareConcurrency || 4,
              saveData,
            );
        if (next !== quality) {
          quality = next;
          map.setPixelRatio(quality === 'low' ? 1 : Math.min(devicePixelRatio, 1.5));
          void loadModel().catch(fallback);
        }
      });
      function fallback(error: unknown) {
        if (disposed) return;
        console.warn('[twin] model unavailable; showing the local site plan', error);
        releaseModel();
        state = {
          ...state,
          ready: true,
          fallback: true,
          quality: 'low',
          shadows: false,
          meshes: 0,
          triangles: 0,
        };
        notify();
      }
      function fitOutside(duration: number) {
        const width = map.getContainer().clientWidth;
        map.fitBounds(manifest.bounds, {
          padding:
            width > 1100
              ? { top: 80, bottom: 115, left: 245, right: 230 }
              : width > 650
                ? { top: 50, bottom: 115, left: 210, right: 65 }
                : { top: 80, bottom: 130, left: 20, right: 55 },
          maxZoom: 18.2,
          pitch: 52,
          bearing: manifest.bearing ?? -24,
          duration,
        });
      }
      // Keep a readable local site plan if the optional model cannot be decoded.
      await loadModel().catch(fallback);
      map.setMaxZoom(22);
      map.setMinZoom(15);
      map.setPixelRatio(quality === 'low' ? 1 : Math.min(devicePixelRatio, 1.5));
      fitOutside(0);
      applyView();
      return {
        snapshot: () => state,
        subscribe(fn) {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        view(value) {
          state = { ...state, view: value };
          applyView();
          notify();
          if (value === 'outdoor') {
            fitOutside(matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500);
            return;
          }
          map.easeTo({
            center: manifest.origin,
            zoom: 19.2,
            pitch: 15,
            bearing: 0,
            duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500,
          });
        },
        async quality(value) {
          requested = value;
          autoReduced = false;
          slowFrames = 0;
          quality = chooseQuality(
            value,
            map.getContainer().clientWidth,
            navigator.hardwareConcurrency || 4,
            saveData,
          );
          map.setPixelRatio(quality === 'low' ? 1 : Math.min(devicePixelRatio, 1.5));
          await loadModel().catch(fallback);
        },
        exportUrl: () => `${base}/scene.glb`,
        zoom(value) {
          if (!Number.isFinite(value) || value < 15 || value > 22)
            throw new Error('zoom must be between 15 and 22');
          map.jumpTo({ zoom: value });
        },
        idle: () =>
          new Promise<void>((resolve) => {
            if (map.loaded() && !map.isMoving()) resolve();
            else idleWaiters.add(resolve);
          }),
      };
    },
  });
}
