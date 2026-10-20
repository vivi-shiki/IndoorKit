/**
 * 地图引擎层：应用里唯一加载 maplibre-gl 的地方。
 * 地图本身由 @indoorkit/core 创建，这里只准备引擎需要的静态资源（样式表、Worker 脚本）。
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// maplibre-gl 6 按自身模块地址推算 worker 路径，打包后需要显式指定
setWorkerUrl(workerUrl);
