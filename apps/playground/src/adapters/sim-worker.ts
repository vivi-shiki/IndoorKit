import { exposeSimulation } from '@indoorkit/rtls-simulator';
import type { Endpoint } from 'comlink';

// Worker 的全局对象就是 Comlink 端点
exposeSimulation(self as unknown as Endpoint);
