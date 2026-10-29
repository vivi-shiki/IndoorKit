export type TwinView = 'outdoor' | 'indoor';
export type RenderLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
export type Quality = 'auto' | RenderLevel;

export const RENDER_LEVELS: readonly RenderLevel[] = ['L0', 'L1', 'L2', 'L3', 'L4'];

/** 画质开关。L0–L4 沿用原 LocPard map-sdk 的分级渲染思路，每一档是一组开关 */
export interface RenderSettings {
  /** 像素比上限 */
  pixelRatio: number;
  antialias: boolean;
  /** 天空、地平线和雾 */
  sky: boolean;
  /** 外观：2.5D 挤出（不下载模型）、低模或高模 */
  model: 'extrusion' | 'low' | 'high';
  /** 室内楼层由 Three.js 生成，进入楼层时剖切 */
  floors: boolean;
  /** 树木、车辆等道具的比例，写在模型文件里 */
  props: 0 | 0.5 | 1;
  /** 铺装贴图，写在模型文件里 */
  groundTexture: boolean;
  /** 环境反射 */
  environment: boolean;
  /** 阴影贴图边长，0 为关闭 */
  shadows: 0 | 1024 | 2048;
  softShadows: boolean;
  /** 建筑轮廓描边 */
  outline: boolean;
}
export type RenderOverrides = Partial<RenderSettings>;

export const RENDER_PRESETS: Readonly<Record<RenderLevel, Readonly<RenderSettings>>> = {
  L0: {
    pixelRatio: 1,
    antialias: false,
    sky: false,
    model: 'extrusion',
    floors: false,
    props: 0,
    groundTexture: false,
    environment: false,
    shadows: 0,
    softShadows: false,
    outline: false,
  },
  L1: {
    pixelRatio: 1,
    antialias: true,
    sky: true,
    model: 'low',
    floors: false,
    props: 0.5,
    groundTexture: false,
    environment: false,
    shadows: 0,
    softShadows: false,
    outline: false,
  },
  L2: {
    pixelRatio: 1.25,
    antialias: true,
    sky: true,
    model: 'high',
    floors: false,
    props: 1,
    groundTexture: true,
    environment: true,
    shadows: 1024,
    softShadows: false,
    outline: false,
  },
  L3: {
    pixelRatio: 1.5,
    antialias: true,
    sky: true,
    model: 'high',
    floors: true,
    props: 1,
    groundTexture: true,
    environment: true,
    shadows: 2048,
    softShadows: false,
    outline: true,
  },
  L4: {
    pixelRatio: 2,
    antialias: true,
    sky: true,
    model: 'high',
    floors: true,
    props: 1,
    groundTexture: true,
    environment: true,
    shadows: 2048,
    softShadows: true,
    outline: true,
  },
};

const ALLOWED: { [K in keyof RenderSettings]: readonly RenderSettings[K][] | 'boolean' | 'number' } = {
  pixelRatio: 'number',
  antialias: 'boolean',
  sky: 'boolean',
  model: ['extrusion', 'low', 'high'],
  floors: 'boolean',
  props: [0, 0.5, 1],
  groundTexture: 'boolean',
  environment: 'boolean',
  shadows: [0, 1024, 2048],
  softShadows: 'boolean',
  outline: 'boolean',
};

/** 检查调用方给的覆盖项；未知开关或错误的值直接报错 */
export function validateOverrides(overrides: unknown): RenderOverrides {
  if (overrides === undefined) return {};
  if (typeof overrides !== 'object' || overrides === null)
    throw new Error('render overrides must be an object');
  for (const [key, value] of Object.entries(overrides)) {
    const allowed = ALLOWED[key as keyof RenderSettings];
    if (!allowed) throw new Error(`unknown render setting "${key}"`);
    const ok =
      allowed === 'boolean'
        ? typeof value === 'boolean'
        : allowed === 'number'
          ? typeof value === 'number' && value >= 0.5 && value <= 3
          : (allowed as readonly unknown[]).includes(value);
    if (!ok) throw new Error(`render setting "${key}" cannot be ${JSON.stringify(value)}`);
  }
  return overrides as RenderOverrides;
}

/** 三层合并：档位 < 场地默认值（模型清单）< 用户覆盖 */
export function resolveSettings(
  level: RenderLevel,
  site?: RenderOverrides,
  user?: RenderOverrides,
): RenderSettings {
  return { ...RENDER_PRESETS[level], ...validateOverrides(site), ...validateOverrides(user) };
}

export interface DeviceInfo {
  width: number;
  cores: number;
  /** navigator.deviceMemory，GB */
  memory?: number;
  saveData: boolean;
  /** WEBGL_debug_renderer_info 报告的显卡名 */
  gpu?: string;
}

const SOFTWARE_GPU = /swiftshader|llvmpipe|software|basic render/i;
const DISCRETE_GPU = /nvidia|geforce|rtx|quadro|radeon rx|radeon pro|apple m\d (pro|max|ultra)|arc a\d/i;

/** 按设备报告的能力选择初始档位 */
export function detectLevel(device: DeviceInfo): RenderLevel {
  if (device.saveData) return 'L0';
  if (device.width < 720 || device.cores <= 4) return 'L1';
  if (device.memory !== undefined && device.memory <= 2) return 'L1';
  if (device.gpu && SOFTWARE_GPU.test(device.gpu)) return 'L1';
  if (device.gpu && DISCRETE_GPU.test(device.gpu) && device.cores >= 8) return 'L3';
  return 'L2';
}

const SLOW_MS = 45;
const FAST_MS = 22;
/** 超过这个间隔的帧是交互之间的停顿，不计入 */
const GAP_MS = 300;
const DOWN_AFTER = 24;
const UP_AFTER = 300;

export interface FrameGovernor {
  readonly level: RenderLevel;
  /** 记录一帧的间隔；需要换档时返回新档位 */
  sample(frameMs: number): RenderLevel | null;
}

/**
 * 持续卡顿时降一档，持续流畅后升回一档，不超过 ceiling。
 * 不会自动降到 L0：那一档换成体块，拖动中模型会消失再出现。
 */
export function createFrameGovernor(start: RenderLevel, ceiling: RenderLevel): FrameGovernor {
  let index = RENDER_LEVELS.indexOf(start);
  const top = RENDER_LEVELS.indexOf(ceiling);
  const bottom = Math.min(index, 1);
  let slow = 0;
  let fast = 0;
  return {
    get level() {
      return RENDER_LEVELS[index]!;
    },
    sample(frameMs) {
      if (frameMs >= GAP_MS) return null;
      if (frameMs > SLOW_MS) {
        slow++;
        fast = 0;
      } else {
        slow = Math.max(0, slow - 1);
        fast = frameMs < FAST_MS ? fast + 1 : 0;
      }
      if (slow >= DOWN_AFTER && index > bottom) {
        index--;
        slow = 0;
        fast = 0;
        return RENDER_LEVELS[index]!;
      }
      if (fast >= UP_AFTER && index < top) {
        index++;
        slow = 0;
        fast = 0;
        return RENDER_LEVELS[index]!;
      }
      return null;
    },
  };
}

/** 哪个模型文件；props 和 groundTexture 跟着文件走 */
export const modelFile = (s: RenderSettings) =>
  s.model === 'extrusion'
    ? null
    : s.model === 'low' || s.props < 1 || !s.groundTexture
      ? 'scene-low.glb'
      : 'scene.glb';

/**
 * 自动降档时的设置：只改不用换模型文件的开关（像素比、阴影、反射、描边等），
 * 模型、道具和铺装保持当前的，抗锯齿属于上下文也不变。
 */
export const governedSettings = (current: RenderSettings, target: RenderSettings): RenderSettings => ({
  ...target,
  antialias: current.antialias,
  model: current.model,
  props: current.props,
  groundTexture: current.groundTexture,
});

/** 只有模型文件不同才需要重新下载，其余开关都能直接改 */
export const needsReload = (a: RenderSettings, b: RenderSettings) =>
  a.model !== b.model || a.props !== b.props || a.groundTexture !== b.groundTexture;

/** A dead band keeps a wheel gesture from flickering between the two representations. */
export const nextView = (current: TwinView, zoom: number): TwinView =>
  zoom > 18.85 ? 'indoor' : zoom < 18.5 ? 'outdoor' : current;

/** 阴影相机的半边长（米）：越近越小，阴影越锐利；原项目按缩放重算阴影范围 */
export function shadowExtent(zoom: number): number {
  return Math.min(400, Math.max(30, 220 * 2 ** (17 - zoom)));
}

export interface Sun {
  /** 高度角，度 */
  elevation: number;
  /** 方位角，从北顺时针，度 */
  azimuth: number;
  intensity: number;
  night: boolean;
}

/** 模拟时间对应的太阳；18 点到 6 点开灯 */
export function sunAt(hour: number): Sun {
  const h = ((hour % 24) + 24) % 24;
  const day = (h - 6) / 12;
  const elevation = Math.max(-10, 62 * Math.sin(Math.PI * day));
  const azimuth = 90 + 180 * Math.min(1, Math.max(0, day));
  const night = h < 6 || h >= 18;
  return {
    elevation,
    azimuth,
    intensity: night ? 0.35 : 0.9 + 1.9 * Math.max(0, Math.sin(Math.PI * day)),
    night,
  };
}

export type CutState = 'hidden' | 'solid' | 'ghost';

/** 剖切：选中楼层以上隐藏、本层实体、以下半透明；在室外时楼层都不画 */
export function sectionCut(ordinals: readonly number[], current: number | null): Record<number, CutState> {
  const cut: Record<number, CutState> = {};
  for (const o of ordinals)
    cut[o] = current === null || o > current ? 'hidden' : o === current ? 'solid' : 'ghost';
  return cut;
}

/** 聚焦一栋楼时，其他楼压矮变淡（原项目 0.4 高度） */
export const focusStyle = (focused: string | null, id: string) =>
  focused === null || focused === id ? { scaleY: 1, opacity: 1 } : { scaleY: 0.4, opacity: 0.35 };

export interface LabelBox {
  id: string;
  /** 锚点：标签底边中点，容器像素 */
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
}

/** 标签避让：按优先级放置，和已放的重叠或出了视口就不显示 */
export function placeLabels(labels: readonly LabelBox[], viewport: { width: number; height: number }) {
  const placed: { l: number; r: number; t: number; b: number }[] = [];
  const shown = new Set<string>();
  for (const label of [...labels].sort((a, b) => b.priority - a.priority)) {
    const box = {
      l: label.x - label.width / 2,
      r: label.x + label.width / 2,
      t: label.y - label.height,
      b: label.y,
    };
    if (box.l < 0 || box.t < 0 || box.r > viewport.width || box.b > viewport.height) continue;
    if (placed.some((p) => box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t)) continue;
    placed.push(box);
    shown.add(label.id);
  }
  return shown;
}

export const ORBIT_IDLE_MS = 20_000;

/** 空闲一段时间后在室外缓慢环绕；减少动态时不转 */
export const shouldOrbit = (s: { idleMs: number; reducedMotion: boolean; view: TwinView }) =>
  !s.reducedMotion && s.view === 'outdoor' && s.idleMs >= ORBIT_IDLE_MS;

export type TwinStatus = 'good' | 'warn' | 'critical';
/** 涂在模型上的业务状态：整层或单个房间 */
export type StatusPaint = { levelId: string; unitId?: string; status: TwinStatus };

/** 状态色只在这里定义；页面的图例读同一份 */
export const STATUS_COLORS: Readonly<Record<TwinStatus, string>> = {
  good: '#2f9e6e',
  warn: '#e0a100',
  critical: '#e5484d',
};
