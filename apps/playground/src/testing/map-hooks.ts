import type { AnyPlugin, IndoorMap } from '@indoorkit/core';
import { inspect } from '@indoorkit/core/testing';
import type { VenueModel } from '@indoorkit/imdf';
import type { ViviTestHooks } from './hooks';

/**
 * 每个地图页都有的测试钩子。它们要读 MapLibre 的样式和画出的要素，
 * 页面本身不碰底层地图，所以只在测试层通过 core 的 inspect 读取。
 */
export function installMapHooks(
  indoor: IndoorMap<readonly AnyPlugin[]>,
  venue: VenueModel,
  hooks: ViviTestHooks,
) {
  const view = inspect(indoor);
  hooks.renderedLevelIds = (layerId) =>
    [...new Set(view.rendered(layerId).map((f) => String(f.properties.level_id)))].sort();
  hooks.renderedCount = (layerId) => new Set(view.rendered(layerId).map((f) => String(f.properties.id))).size;
  hooks.labelLanguage = () => {
    const field = view.layout('indoor-labels', 'text-field') as [string, [string, string]];
    return field[1][1].replace('label_', '');
  };
  hooks.resourceLabels = () => indoor.resources.labels();
  hooks.styleLayerIds = view.styleLayerIds;
  hooks.mapBackground = () => String(view.paint('background', 'background-color'));
  hooks.zoom = view.zoom;
  hooks.setZoom = view.setZoom;
  hooks.venueScreenCenter = () => {
    const [[west, south], [east, north]] = venue.bounds;
    const point = indoor.project([(west + east) / 2, (south + north) / 2]);
    const box = view.container().getBoundingClientRect();
    return { x: box.left + point.x, y: box.top + point.y };
  };
}
