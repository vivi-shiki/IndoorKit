import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// maplibre-gl 6 按自身模块地址推算 worker 路径，打包后需要显式指定
setWorkerUrl(workerUrl);
